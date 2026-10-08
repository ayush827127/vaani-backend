const mockPrisma = {
  shop: { findUnique: jest.fn() },
  plan: { findUnique: jest.fn() },
  subscription: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const service = require('./subscriptions.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('create', () => {
  test('rejects when the shop does not exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1' });

    await expect(
      service.create({ shopId: 'shop-missing', planId: 'plan-1' })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('rejects when the plan does not exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1' });
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ shopId: 'shop-1', planId: 'plan-missing' })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('creates a subscription when both shop and plan exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1' });
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1' });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-1' });

    await expect(
      service.create({ shopId: 'shop-1', planId: 'plan-1', status: 'ACTIVE' })
    ).resolves.toMatchObject({ id: 'sub-1' });
  });
});

describe('update', () => {
  test('rejects when the subscription does not exist', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    await expect(service.update('sub-missing', { status: 'CANCELLED' })).rejects.toMatchObject({
      status: 404,
    });
  });

  test('updates an existing subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1' });
    mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'CANCELLED' });

    await expect(service.update('sub-1', { status: 'CANCELLED' })).resolves.toMatchObject({
      status: 'CANCELLED',
    });
  });
});

describe('remove', () => {
  test('rejects when the subscription does not exist', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    await expect(service.remove('sub-missing')).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.subscription.delete).not.toHaveBeenCalled();
  });

  test('hard-deletes an existing subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub-1' });

    await service.remove('sub-1');

    expect(mockPrisma.subscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });
});
