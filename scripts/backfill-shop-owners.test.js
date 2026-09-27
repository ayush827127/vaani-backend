const { planForShop, applyPlan } = require('./backfill-shop-owners');

// Minimal in-memory fake Prisma client — no real/shadow database. Enough to
// exercise applyPlan()'s create/link/skip paths and the P2002-race retry.
function makeFakePrisma(seed = {}) {
  const users = seed.users ? [...seed.users] : [];
  const shopUsers = seed.shopUsers ? [...seed.shopUsers] : [];
  let nextId = 1;
  const genId = (prefix) => `${prefix}-${nextId++}`;

  const p2002 = () => {
    const err = new Error('Unique constraint failed');
    err.code = 'P2002';
    return err;
  };

  return {
    _users: users,
    _shopUsers: shopUsers,
    user: {
      findUnique: async ({ where: { phone } }) => users.find((u) => u.phone === phone) || null,
      create: async ({ data }) => {
        if (users.some((u) => u.phone === data.phone)) throw p2002();
        const row = { id: genId('user'), ...data };
        users.push(row);
        return row;
      },
    },
    shopUser: {
      findMany: async ({ where: { shopId } }) => shopUsers.filter((su) => su.shopId === shopId),
      create: async ({ data }) => {
        if (shopUsers.some((su) => su.shopId === data.shopId && su.phone === data.phone)) throw p2002();
        const row = { id: genId('su'), userId: null, ...data };
        shopUsers.push(row);
        return row;
      },
      update: async ({ where: { id }, data }) => {
        const row = shopUsers.find((su) => su.id === id);
        Object.assign(row, data);
        return row;
      },
    },
  };
}

async function backfillOnce(prisma, shops) {
  const results = [];
  for (const shop of shops) {
    const existingUser = await prisma.user.findUnique({ where: { phone: shop.phone } });
    const shopUsersForShop = await prisma.shopUser.findMany({ where: { shopId: shop.id } });
    const plan = planForShop(shop, shopUsersForShop, existingUser);
    await applyPlan(prisma, shop, plan);
    results.push(plan);
  }
  return results;
}

describe('backfill-shop-owners', () => {
  const shop = { id: 'shop-1', name: 'ABC Store', phone: '9876543210', ownerName: 'Ramesh' };

  test('1. no User + no ShopUser: creates User and OWNER membership', async () => {
    const prisma = makeFakePrisma();
    await backfillOnce(prisma, [shop]);

    expect(prisma._users).toHaveLength(1);
    expect(prisma._users[0]).toMatchObject({ phone: '9876543210', name: 'Ramesh' });
    expect(prisma._shopUsers).toHaveLength(1);
    expect(prisma._shopUsers[0]).toMatchObject({
      shopId: 'shop-1',
      userId: prisma._users[0].id,
      role: 'OWNER',
      status: 'ACTIVE',
    });
  });

  test('2. User already exists for this phone: no duplicate User, membership created against it', async () => {
    const existing = { id: 'user-existing', phone: '9876543210', name: 'Original Name' };
    const prisma = makeFakePrisma({ users: [existing] });

    await backfillOnce(prisma, [shop]);

    expect(prisma._users).toHaveLength(1);
    expect(prisma._users[0].name).toBe('Original Name'); // never overwritten
    expect(prisma._shopUsers).toHaveLength(1);
    expect(prisma._shopUsers[0].userId).toBe('user-existing');
  });

  test('3. existing ShopUser already has a matching phone: links it, no duplicate membership row', async () => {
    const preexisting = {
      id: 'su-preexisting',
      shopId: 'shop-1',
      userId: null,
      name: 'Ramesh',
      phone: '9876543210',
      role: 'CASHIER', // was created some other way before this migration
      status: 'ACTIVE',
    };
    const prisma = makeFakePrisma({ shopUsers: [preexisting] });

    const plans = await backfillOnce(prisma, [shop]);

    expect(plans[0].membership.action).toBe('LINK');
    expect(prisma._shopUsers).toHaveLength(1); // no duplicate created
    expect(prisma._shopUsers[0]).toMatchObject({
      id: 'su-preexisting',
      userId: prisma._users[0].id,
      role: 'OWNER', // promoted per the spec
      status: 'ACTIVE',
    });
  });

  test('4. already fully linked: no-op, existing User untouched, no duplicates', async () => {
    const existingUser = { id: 'user-1', phone: '9876543210', name: 'Ramesh' };
    const linkedMembership = {
      id: 'su-1',
      shopId: 'shop-1',
      userId: 'user-1',
      name: 'Ramesh',
      phone: '9876543210',
      role: 'OWNER',
      status: 'ACTIVE',
    };
    const prisma = makeFakePrisma({ users: [existingUser], shopUsers: [linkedMembership] });

    const plans = await backfillOnce(prisma, [shop]);

    expect(plans[0].membership.action).toBe('SKIP');
    expect(prisma._users).toHaveLength(1);
    expect(prisma._users[0]).toEqual(existingUser); // untouched
    expect(prisma._shopUsers).toHaveLength(1);
  });

  test('5. running the whole backfill twice creates zero additional rows the second time', async () => {
    const prisma = makeFakePrisma();
    await backfillOnce(prisma, [shop]);
    expect(prisma._users).toHaveLength(1);
    expect(prisma._shopUsers).toHaveLength(1);

    await backfillOnce(prisma, [shop]);
    expect(prisma._users).toHaveLength(1);
    expect(prisma._shopUsers).toHaveLength(1);
  });

  test('6. phone normalization mismatch: still links, but reports a warning', () => {
    const shopUsersForShop = [
      { id: 'su-1', shopId: 'shop-1', userId: null, phone: '+919876543210', role: 'CASHIER' },
    ];
    const plan = planForShop(shop, shopUsersForShop, null);

    expect(plan.membership.action).toBe('LINK');
    expect(plan.membership.targetShopUserId).toBe('su-1');
    expect(plan.membership.warnings).toEqual([
      expect.stringContaining('phone normalization mismatch'),
    ]);
  });

  test('7. ambiguous match: multiple unlinked ShopUser rows normalize-match — reports CONFLICT, no guess', () => {
    const shopUsersForShop = [
      { id: 'su-1', shopId: 'shop-1', userId: null, phone: '9876543210', role: 'CASHIER' },
      { id: 'su-2', shopId: 'shop-1', userId: null, phone: '+91 98765 43210', role: 'MANAGER' },
    ];
    const plan = planForShop(shop, shopUsersForShop, null);

    expect(plan.membership.action).toBe('CONFLICT');
    expect(plan.membership.candidateIds.sort()).toEqual(['su-1', 'su-2']);
  });

  test('P2002 race: another process creates the User between our read and our write', async () => {
    const prisma = makeFakePrisma();
    // applyPlan's own findUnique (used only inside its P2002 catch block)
    // stays the normal fake — it will find whatever "create" below inserts.
    // Only "create" is overridden, to simulate another process winning the
    // insert race a moment after our own read-before-plan found nothing.
    prisma.user.create = async (args) => {
      prisma._users.push({ id: 'user-raced-in', phone: args.data.phone, name: 'Raced Owner' });
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    };

    const plan = planForShop(shop, [], null); // plan built as if no user existed yet
    const result = await applyPlan(prisma, shop, plan);

    expect(result.user.id).toBe('user-raced-in');
    expect(prisma._users).toHaveLength(1); // no duplicate
    expect(prisma._shopUsers).toHaveLength(1);
    expect(prisma._shopUsers[0].userId).toBe('user-raced-in');
  });
});
