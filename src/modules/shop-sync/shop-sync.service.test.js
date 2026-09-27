const mockResolveOwnerUserId = jest.fn();
jest.mock('../user-auth/user-auth.service', () => ({ resolveOwnerUserId: mockResolveOwnerUserId }));

const mockTx = {
  syncedItem: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  $executeRaw: jest.fn(),
};
const mockPrisma = {
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../config/prisma', () => mockPrisma);

const { syncData } = require('./shop-sync.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.syncedItem.findMany.mockResolvedValue([]); // nothing pre-existing, by default
});

const baseItem = {
  localId: 1,
  name: 'Dosa',
  costPrice: 10,
  sellingPrice: 20,
  gstRate: 5,
  stockQuantity: 10,
  reorderLevel: 2,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('a brand-new item gets createdByUserId set from the resolved owner', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');

  await syncData('shop-1', { items: [baseItem] });

  expect(mockTx.syncedItem.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ localId: 1, createdByUserId: 'user-owner-1' })],
  });
});

test('an existing item going through update() never has createdByUserId touched', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');
  mockTx.syncedItem.findMany.mockResolvedValue([{ localId: 1 }]); // already exists

  await syncData('shop-1', { items: [baseItem] });

  expect(mockTx.syncedItem.createMany).not.toHaveBeenCalled();
  expect(mockTx.syncedItem.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { shopId_localId: { shopId: 'shop-1', localId: 1 } },
      data: expect.not.objectContaining({ createdByUserId: expect.anything() }),
    })
  );
});

test('resolveOwnerUserId returning null leaves createdByUserId unset, not an error', async () => {
  mockResolveOwnerUserId.mockResolvedValue(null);

  await syncData('shop-1', { items: [baseItem] });

  const created = mockTx.syncedItem.createMany.mock.calls[0][0].data[0];
  expect(created).not.toHaveProperty('createdByUserId');
});

test('resolveOwnerUserId is called exactly once per sync call, not once per record', async () => {
  mockResolveOwnerUserId.mockResolvedValue('user-owner-1');

  await syncData('shop-1', { items: [baseItem, { ...baseItem, localId: 2 }] });

  expect(mockResolveOwnerUserId).toHaveBeenCalledTimes(1);
});

test('an explicit attributed user id (User-token path) is used verbatim, and resolveOwnerUserId is not called at all', async () => {
  await syncData('shop-1', { items: [baseItem] }, 'user-invited-cashier');

  expect(mockResolveOwnerUserId).not.toHaveBeenCalled();
  expect(mockTx.syncedItem.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ createdByUserId: 'user-invited-cashier' })],
  });
});
