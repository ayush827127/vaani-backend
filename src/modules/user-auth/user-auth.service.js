const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { signUserToken } = require('../../utils/jwt');

// Only ACTIVE memberships are ever offered for login/selection — a REMOVED
// or INACTIVE ShopUser row must not resurrect access just because the user
// still knows the phone number that used to work.
async function activeMembershipsForUser(userId) {
  return prisma.shopUser.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { shop: { select: { id: true, name: true, status: true } } },
  });
}

function membershipView(m) {
  return { shopId: m.shopId, shopName: m.shop.name, role: m.role, status: m.shop.status };
}

// Always succeeds — auto-creates the User on first login, mirroring what
// shop-auth.service.js's register() already does for the owner case. Zero
// active memberships is a normal, valid state (a freshly-invited person who
// hasn't accepted yet), not an error: they still need a User-token to see
// and accept their invitation via /api/shop/invitations, which requireUser
// alone gates — this used to 404/403 exactly the caller who needed it most.
// A phone that already has memberships behaves identically to before; this
// is a widening, not a behavior change for any existing success case.
async function login(phone) {
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone },
    update: {}, // never overwrite an existing User's name/phone
  });

  const memberships = await activeMembershipsForUser(user.id);
  const activeShopId = memberships.length === 1 ? memberships[0].shopId : null;
  const token = signUserToken(user, activeShopId);
  return { token, user, activeShopId, memberships: memberships.map(membershipView) };
}

// Used both for the first selection (activeShopId was null) and for
// switching later (activeShopId was already set to something else) — the
// membership/shop-status checks are identical either way, so one endpoint
// covers both per the plan.
async function selectShop(userId, shopId) {
  const membership = await prisma.shopUser.findFirst({
    where: { shopId, userId, status: 'ACTIVE' },
    include: { shop: true },
  });
  if (!membership) {
    throw new AppError('You are not an active member of this business', 403);
  }
  if (membership.shop.status === 'SUSPENDED' || membership.shop.status === 'CANCELLED') {
    throw new AppError('This business account is not active — contact support', 403);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const token = signUserToken(user, shopId);
  return { token, activeShopId: shopId };
}

async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  const memberships = await activeMembershipsForUser(userId);
  return { user, memberships: memberships.map(membershipView) };
}

// The bridge a *legacy* Shop-token request can use to attribute an action to
// a real userId (Phase 5's audit log, Phase 6's user-aware sync) without
// this device ever having gone through the new login flow. Not called from
// anywhere yet in this phase. Returns null if the shop somehow has no OWNER
// membership (shouldn't happen post-Phase-1-backfill, but this must never
// throw — attribution is best-effort, not a hard requirement).
async function resolveOwnerUserId(shopId) {
  const owner = await prisma.shopUser.findFirst({
    where: { shopId, role: 'OWNER', userId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  return owner ? owner.userId : null;
}

module.exports = { login, selectShop, me, resolveOwnerUserId };
