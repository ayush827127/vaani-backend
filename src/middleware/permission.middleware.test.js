const mockPrisma = {
  shopUserPermission: { findMany: jest.fn() },
};

jest.mock('../config/prisma', () => mockPrisma);

const { requirePermission } = require('./permission.middleware');

function mockNext() {
  return jest.fn();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requirePermission', () => {
  test('granted (role default): calls next() with no error', async () => {
    mockPrisma.shopUserPermission.findMany.mockResolvedValue([]);
    const req = { membership: { shopId: 'shop-1', shopUserId: 'su-1', role: 'OWNER' } };
    const next = mockNext();

    await requirePermission('settings.update')(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('not granted (role default lacks it, no override): 403 naming the permission', async () => {
    mockPrisma.shopUserPermission.findMany.mockResolvedValue([]);
    const req = { membership: { shopId: 'shop-1', shopUserId: 'su-1', role: 'CASHIER' } };
    const next = mockNext();

    await requirePermission('bill.delete')(req, {}, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, message: expect.stringContaining('bill.delete') })
    );
  });

  test('an override revoking a role-default permission is honored (re-reads overrides, not just role)', async () => {
    mockPrisma.shopUserPermission.findMany.mockResolvedValue([
      { permission: 'item.delete', granted: false },
    ]);
    const req = { membership: { shopId: 'shop-1', shopUserId: 'su-1', role: 'MANAGER' } };
    const next = mockNext();

    await requirePermission('item.delete')(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  test('an override granting a permission the role lacks by default is honored', async () => {
    mockPrisma.shopUserPermission.findMany.mockResolvedValue([
      { permission: 'bill.delete', granted: true },
    ]);
    const req = { membership: { shopId: 'shop-1', shopUserId: 'su-1', role: 'CASHIER' } };
    const next = mockNext();

    await requirePermission('bill.delete')(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
