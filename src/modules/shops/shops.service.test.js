const mockPrisma = {
  shop: { findUnique: jest.fn(), update: jest.fn() },
  subscription: { deleteMany: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
jest.mock('../../config/prisma', () => mockPrisma);

const service = require('./shops.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1', subscriptions: [], moduleOverrides: [], shopUsers: [] });
});

describe('resetTrial', () => {
  test('rejects when the shop does not exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);

    await expect(service.resetTrial('shop-missing')).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.subscription.deleteMany).not.toHaveBeenCalled();
  });

  test('deletes any TRIAL-status subscription rows and clears trialUsed, in that order', async () => {
    mockPrisma.shop.update.mockResolvedValue({ id: 'shop-1', trialUsed: false });

    const result = await service.resetTrial('shop-1');

    expect(mockPrisma.subscription.deleteMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', status: 'TRIAL' },
    });
    expect(mockPrisma.shop.update).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      data: { trialUsed: false },
    });
    expect(result).toEqual({ id: 'shop-1', trialUsed: false });
  });

  test('never touches ACTIVE/EXPIRED/CANCELLED subscription rows — only TRIAL-status ones', async () => {
    mockPrisma.shop.update.mockResolvedValue({ id: 'shop-1', trialUsed: false });

    await service.resetTrial('shop-1');

    const where = mockPrisma.subscription.deleteMany.mock.calls[0][0].where;
    expect(where.status).toBe('TRIAL');
  });
});
