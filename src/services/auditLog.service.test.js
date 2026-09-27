const mockPrisma = { auditLog: { create: jest.fn() } };
jest.mock('../config/prisma', () => mockPrisma);

const { record } = require('./auditLog.service');

beforeEach(() => {
  jest.clearAllMocks();
});

test('writes with the exact shape given', async () => {
  await record({
    shopId: 'shop-1',
    userId: 'user-1',
    action: 'CREATE_ITEM',
    module: 'item',
    entityType: 'Item',
    entityId: 'item-1',
    metadata: { foo: 'bar' },
  });

  expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
    data: {
      shopId: 'shop-1',
      userId: 'user-1',
      action: 'CREATE_ITEM',
      module: 'item',
      entityType: 'Item',
      entityId: 'item-1',
      metadata: { foo: 'bar' },
    },
  });
});

test('userId/entityId/metadata default to null when omitted', async () => {
  await record({ shopId: 'shop-1', action: 'CREATE_ITEM', module: 'item', entityType: 'Item' });

  expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
    data: {
      shopId: 'shop-1',
      userId: null,
      action: 'CREATE_ITEM',
      module: 'item',
      entityType: 'Item',
      entityId: null,
      metadata: null,
    },
  });
});

test('a thrown Prisma error is swallowed, never propagates', async () => {
  mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'));

  await expect(
    record({ shopId: 'shop-1', action: 'CREATE_ITEM', module: 'item', entityType: 'Item' })
  ).resolves.toBeUndefined();
});
