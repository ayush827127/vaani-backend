// Phase 1 backfill — creates the corresponding User + OWNER ShopUser
// membership for every existing Shop, so the new User/ShopUser/Shop
// membership model has a starting point that matches today's reality
// (Shop.phone has always been the login identity, so that same phone
// becomes the owner's User identity). See the Phase 1 plan doc for the full
// design and the staged approval workflow this script is one step of.
//
// Never wired into render.yaml/buildCommand/npm start — manual only:
//   node scripts/backfill-shop-owners.js --dry-run   (review first, zero writes)
//   node scripts/backfill-shop-owners.js             (real run, only after
//                                                      the dry-run output is
//                                                      explicitly approved)
//
// Never touches createdByUserId on any synced business table — historical
// attribution stays NULL unconditionally; this script only creates User and
// ShopUser rows.

/* eslint-disable no-console */

const normalizePhone = (phone) => (phone || '').replace(/\D/g, '').slice(-10);

// Decides what to do for one shop, given data already fetched from the DB.
// Pure — no DB calls — so it's directly unit-testable without a real or
// fake Prisma client. See backfill-shop-owners.test.js.
//
// existingUser: the User row already matching shop.phone exactly, or null.
// shopUsersForShop: every existing ShopUser row on this shop.
function planForShop(shop, shopUsersForShop, existingUser) {
  const user = existingUser
    ? { action: 'MATCH', id: existingUser.id }
    : { action: 'CREATE', phone: shop.phone, name: shop.ownerName };

  const existingUserId = existingUser ? existingUser.id : null;

  // Already fully migrated — a ShopUser on this shop is already linked to
  // this exact user.
  if (existingUserId && shopUsersForShop.some((su) => su.userId === existingUserId)) {
    return { user, membership: { action: 'SKIP' } };
  }

  const shopPhoneNorm = normalizePhone(shop.phone);
  const exactCandidates = shopUsersForShop.filter((su) => su.phone === shop.phone);
  const normalizedCandidates = shopUsersForShop.filter(
    (su) => su.phone !== shop.phone && normalizePhone(su.phone) === shopPhoneNorm
  );
  const allCandidates = [...exactCandidates, ...normalizedCandidates];

  // Any candidate already linked to a *different* user than the one we're
  // about to use is a data anomaly, not something to guess about.
  const linkedToSomeoneElse = allCandidates.filter(
    (su) => su.userId != null && su.userId !== existingUserId
  );
  if (linkedToSomeoneElse.length > 0) {
    return {
      user,
      membership: {
        action: 'CONFLICT',
        reason: 'existing ShopUser row already linked to a different user',
        candidateIds: linkedToSomeoneElse.map((su) => su.id),
      },
    };
  }

  const unlinked = allCandidates.filter((su) => su.userId == null);

  if (unlinked.length > 1) {
    return {
      user,
      membership: {
        action: 'CONFLICT',
        reason: 'multiple unlinked ShopUser rows match this phone ambiguously',
        candidateIds: unlinked.map((su) => su.id),
      },
    };
  }

  if (unlinked.length === 1) {
    const target = unlinked[0];
    const warnings = [];
    if (target.phone !== shop.phone) {
      warnings.push(
        `phone normalization mismatch: shop.phone="${shop.phone}" matched ShopUser.phone="${target.phone}"`
      );
    }
    return {
      user,
      membership: { action: 'LINK', targetShopUserId: target.id, warnings },
    };
  }

  return {
    user,
    membership: {
      action: 'CREATE',
      data: { name: shop.ownerName, phone: shop.phone, role: 'OWNER', status: 'ACTIVE' },
    },
  };
}

// Applies one shop's plan via Prisma. Every write is wrapped to catch a
// P2002 unique-constraint race (another process created a conflicting row
// between our read and our write) and reconcile by re-fetching rather than
// crashing the whole run — this script is not assumed to be the only writer
// touching these tables.
async function applyPlan(prisma, shop, plan) {
  let user;
  if (plan.user.action === 'MATCH') {
    user = { id: plan.user.id };
  } else {
    try {
      user = await prisma.user.create({
        data: { phone: plan.user.phone, name: plan.user.name },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      user = await prisma.user.findUnique({ where: { phone: plan.user.phone } });
    }
  }

  const m = plan.membership;
  if (m.action === 'SKIP' || m.action === 'CONFLICT') {
    return { user, membership: m };
  }
  if (m.action === 'LINK') {
    try {
      await prisma.shopUser.update({
        where: { id: m.targetShopUserId },
        data: { userId: user.id, role: 'OWNER', status: 'ACTIVE' },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // Another process already linked/changed this row — leave it; the
      // next run will re-evaluate it from scratch.
    }
    return { user, membership: m };
  }
  if (m.action === 'CREATE') {
    try {
      await prisma.shopUser.create({
        data: { shopId: shop.id, userId: user.id, ...m.data },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // Someone else created a conflicting (shopId, phone) row first — not
      // this script's job to resolve; leave it for a future run/manual look.
    }
    return { user, membership: m };
  }
  throw new Error(`Unknown membership action: ${m.action}`);
}

function summarize(results) {
  const summary = {
    shopsProcessed: results.length,
    usersCreated: 0,
    usersMatched: 0,
    membershipsCreated: 0,
    membershipsLinked: 0,
    membershipsAlreadyMigrated: 0,
    conflicts: 0,
    warnings: [],
  };
  for (const r of results) {
    if (r.plan.user.action === 'CREATE') summary.usersCreated += 1;
    else summary.usersMatched += 1;

    const m = r.plan.membership;
    if (m.action === 'CREATE') summary.membershipsCreated += 1;
    else if (m.action === 'LINK') summary.membershipsLinked += 1;
    else if (m.action === 'SKIP') summary.membershipsAlreadyMigrated += 1;
    else if (m.action === 'CONFLICT') {
      summary.conflicts += 1;
      summary.warnings.push(
        `CONFLICT shop=${r.shop.id} (${r.shop.name}): ${m.reason} [${(m.candidateIds || []).join(', ')}]`
      );
    }
    if (m.warnings) summary.warnings.push(...m.warnings.map((w) => `shop=${r.shop.id}: ${w}`));
  }
  return summary;
}

async function run({ dryRun }) {
  const prisma = new (require('@prisma/client').PrismaClient)();

  const [shopCount, shopUserCount, shopUsersByRole, syncedItem, syncedCustomer, syncedInvoice, syncedPayment, syncedInvTx] =
    await Promise.all([
      prisma.shop.count(),
      prisma.shopUser.count(),
      prisma.shopUser.groupBy({ by: ['role'], _count: true }),
      prisma.syncedItem.count(),
      prisma.syncedCustomer.count(),
      prisma.syncedInvoice.count(),
      prisma.syncedPaymentTransaction.count(),
      prisma.syncedInventoryTransaction.count(),
    ]);

  console.log('=== Inspection (read-only) ===');
  console.log('Shop:', shopCount);
  console.log('ShopUser:', shopUserCount, '—', shopUsersByRole.map((r) => `${r.role}=${r._count}`).join(', '));
  console.log('SyncedItem:', syncedItem);
  console.log('SyncedCustomer:', syncedCustomer);
  console.log('SyncedInvoice:', syncedInvoice);
  console.log('SyncedPaymentTransaction:', syncedPayment);
  console.log('SyncedInventoryTransaction:', syncedInvTx);
  console.log('');

  const shops = await prisma.shop.findMany();
  const results = [];

  for (const shop of shops) {
    const [existingUser, shopUsersForShop] = await Promise.all([
      prisma.user.findUnique({ where: { phone: shop.phone } }),
      prisma.shopUser.findMany({ where: { shopId: shop.id } }),
    ]);
    const plan = planForShop(shop, shopUsersForShop, existingUser);

    console.log(
      `shop=${shop.id} (${shop.name}) user=${plan.user.action} membership=${plan.membership.action}` +
        (plan.membership.reason ? ` reason="${plan.membership.reason}"` : '')
    );
    if (plan.membership.warnings) {
      for (const w of plan.membership.warnings) console.log(`  WARNING: ${w}`);
    }

    if (!dryRun) {
      await applyPlan(prisma, shop, plan);
    }
    results.push({ shop, plan });
  }

  const summary = summarize(results);
  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(dryRun ? '\n(dry run — zero writes were made)' : '\n(real run — writes applied as shown above)');

  await prisma.$disconnect();
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { normalizePhone, planForShop, applyPlan, summarize };
