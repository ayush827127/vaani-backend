const mockPrisma = {
  shop: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { upsert: jest.fn() },
  shopUser: { create: jest.fn() },
};

jest.mock('../../config/prisma', () => mockPrisma);

const { register } = require('./shop-auth.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.shop.findUnique.mockResolvedValue(null); // no existing shop, by default
  mockPrisma.shop.create.mockResolvedValue({ id: 'shop-1', phone: '9876543210' });
  // Sane default so tests that don't care about the User/ShopUser bridge
  // (e.g. the trial-related ones below) don't trip its own swallowed-error
  // logging just because this mock was left returning undefined.
  mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', phone: '9876543210' });
});

describe('register — no automatic trial subscription', () => {
  test('a brand-new shop is created ACTIVE, with no Subscription row at all — trials are opt-in via trial.service.js', async () => {
    await register({ name: 'ABC Store', ownerName: 'Ramesh', phone: '9876543210' });

    expect(mockPrisma.shop.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) })
    );
    // No subscription-related calls exist on mockPrisma at all any more —
    // if register() ever reached for prisma.subscription or prisma.plan,
    // this test file wouldn't even need updating to catch it: the mock
    // object has no such keys, so a real call would throw "not a function".
  });
});

describe('register — User/ShopUser bridge for new shops', () => {
  test('a brand-new shop also gets a User + OWNER ShopUser', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', phone: '9876543210' });

    await register({ name: 'ABC Store', ownerName: 'Ramesh', phone: '9876543210' });

    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: '9876543210' },
        create: { phone: '9876543210', name: 'Ramesh' },
        update: {},
      })
    );
    expect(mockPrisma.shopUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 'shop-1',
          userId: 'user-1',
          role: 'OWNER',
          status: 'ACTIVE',
        }),
      })
    );
  });

  test('re-registering an existing shop (update path) never touches User/ShopUser', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1', phone: '9876543210' });
    mockPrisma.shop.update.mockResolvedValue({ id: 'shop-1', phone: '9876543210' });

    await register({ name: 'ABC Store', ownerName: 'Ramesh', phone: '9876543210' });

    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.shopUser.create).not.toHaveBeenCalled();
  });

  test('a User already existing for this phone is reused, never overwritten', async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-existing', phone: '9876543210' });

    await register({ name: 'ABC Store', ownerName: 'Ramesh', phone: '9876543210' });

    // update: {} is what guarantees an existing User's name/phone are never
    // touched — asserted directly in the previous test; here we just check
    // the returned (possibly pre-existing) user id is what gets linked.
    expect(mockPrisma.shopUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-existing' }) })
    );
  });

  test('a failure creating User/ShopUser is swallowed — registration still succeeds', async () => {
    mockPrisma.user.upsert.mockRejectedValue(new Error('boom'));

    const result = await register({ name: 'ABC Store', ownerName: 'Ramesh', phone: '9876543210' });

    expect(result.shop).toEqual({ id: 'shop-1', phone: '9876543210' });
    expect(typeof result.token).toBe('string');
    expect(mockPrisma.shopUser.create).not.toHaveBeenCalled();
  });
});
