const mockPrisma = {
  user: { findUnique: jest.fn() },
  shopUser: { findMany: jest.fn(), findFirst: jest.fn() },
};

// Both user-auth.service.js (../../config/prisma) and userAuth.middleware.js
// (../config/prisma) resolve to the same file on disk — jest.mock() here
// intercepts both, since it's keyed by resolved module identity, not the
// literal require string.
jest.mock('../../config/prisma', () => mockPrisma);

const service = require('./user-auth.service');
const { requireActiveMembership } = require('../../middleware/userAuth.middleware');

function mockRes() {
  return {};
}
function mockNext() {
  const fn = jest.fn();
  return fn;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('user-auth.service.login', () => {
  test('unknown phone: 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('9999999999')).rejects.toMatchObject({ status: 404 });
  });

  test('zero active memberships: 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });
    mockPrisma.shopUser.findMany.mockResolvedValue([]);
    await expect(service.login('9876543210')).rejects.toMatchObject({ status: 403 });
  });

  test('exactly one membership: auto-selects activeShopId', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });
    mockPrisma.shopUser.findMany.mockResolvedValue([
      { shopId: 'shop-1', role: 'OWNER', shop: { id: 'shop-1', name: 'ABC Store', status: 'ACTIVE' } },
    ]);

    const result = await service.login('9876543210');
    expect(result.activeShopId).toBe('shop-1');
    expect(result.memberships).toEqual([
      { shopId: 'shop-1', shopName: 'ABC Store', role: 'OWNER', status: 'ACTIVE' },
    ]);
  });

  test('multiple memberships: activeShopId null, all memberships listed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });
    mockPrisma.shopUser.findMany.mockResolvedValue([
      { shopId: 'shop-1', role: 'OWNER', shop: { id: 'shop-1', name: 'ABC Store', status: 'ACTIVE' } },
      { shopId: 'shop-2', role: 'CASHIER', shop: { id: 'shop-2', name: 'XYZ Wholesale', status: 'ACTIVE' } },
    ]);

    const result = await service.login('9876543210');
    expect(result.activeShopId).toBeNull();
    expect(result.memberships).toHaveLength(2);
  });
});

describe('user-auth.service.selectShop', () => {
  test('rejects a shop the user has no active membership on', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    await expect(service.selectShop('user-1', 'shop-99')).rejects.toMatchObject({ status: 403 });
  });

  test('rejects a suspended shop even with a valid membership', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({
      shopId: 'shop-1',
      shop: { status: 'SUSPENDED' },
    });
    await expect(service.selectShop('user-1', 'shop-1')).rejects.toMatchObject({ status: 403 });
  });

  test('succeeds for an active membership on an active shop, issuing a fresh token', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({
      shopId: 'shop-1',
      shop: { status: 'ACTIVE' },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });

    const result = await service.selectShop('user-1', 'shop-1');
    expect(result.activeShopId).toBe('shop-1');
    expect(typeof result.token).toBe('string');
  });

  test('switching between two valid memberships both succeed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '9876543210' });

    mockPrisma.shopUser.findFirst.mockResolvedValueOnce({ shopId: 'shop-1', shop: { status: 'ACTIVE' } });
    const first = await service.selectShop('user-1', 'shop-1');
    expect(first.activeShopId).toBe('shop-1');

    mockPrisma.shopUser.findFirst.mockResolvedValueOnce({ shopId: 'shop-2', shop: { status: 'ACTIVE' } });
    const second = await service.selectShop('user-1', 'shop-2');
    expect(second.activeShopId).toBe('shop-2');
  });
});

describe('user-auth.service.resolveOwnerUserId', () => {
  test('returns the OWNER membership\'s userId', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({ userId: 'user-owner-1' });
    const result = await service.resolveOwnerUserId('shop-1');
    expect(result).toBe('user-owner-1');
    expect(mockPrisma.shopUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-1', role: 'OWNER' }) })
    );
  });

  test('returns null (never throws) when a shop has no OWNER membership', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null);
    await expect(service.resolveOwnerUserId('shop-orphaned')).resolves.toBeNull();
  });
});

describe('requireActiveMembership middleware', () => {
  test('rejects a token with no activeShopId selected yet', async () => {
    const req = { user: { userId: 'user-1', activeShopId: null } };
    const next = mockNext();
    await requireActiveMembership(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  test('rejects if the membership was removed after the token was issued', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue(null); // no longer exists
    const req = { user: { userId: 'user-1', activeShopId: 'shop-1' } };
    const next = mockNext();
    await requireActiveMembership(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  test('rejects an INACTIVE membership even if the row still exists', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({
      id: 'su-1',
      shopId: 'shop-1',
      role: 'CASHIER',
      status: 'REMOVED',
      shop: { status: 'ACTIVE' },
    });
    const req = { user: { userId: 'user-1', activeShopId: 'shop-1' } };
    const next = mockNext();
    await requireActiveMembership(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  test('rejects a suspended shop even with a valid membership', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({
      id: 'su-1',
      shopId: 'shop-1',
      role: 'OWNER',
      status: 'ACTIVE',
      shop: { status: 'SUSPENDED' },
    });
    const req = { user: { userId: 'user-1', activeShopId: 'shop-1' } };
    const next = mockNext();
    await requireActiveMembership(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  test('passes through and attaches req.membership for a valid active membership', async () => {
    mockPrisma.shopUser.findFirst.mockResolvedValue({
      id: 'su-1',
      shopId: 'shop-1',
      role: 'OWNER',
      status: 'ACTIVE',
      shop: { status: 'ACTIVE' },
    });
    const req = { user: { userId: 'user-1', activeShopId: 'shop-1' } };
    const next = mockNext();
    await requireActiveMembership(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.membership).toEqual({ shopId: 'shop-1', shopUserId: 'su-1', role: 'OWNER' });
  });
});
