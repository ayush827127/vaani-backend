const mockPrisma = {
  plan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  planModule: { deleteMany: jest.fn(), createMany: jest.fn() },
  subscription: { count: jest.fn() },
  paymentClaim: { count: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
jest.mock('../../config/prisma', () => mockPrisma);

const service = require('./plans.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('create', () => {
  test('passes the resource-limit fields straight through to prisma.plan.create', async () => {
    mockPrisma.plan.create.mockResolvedValue({ id: 'plan-1' });

    await service.create({
      name: 'Starter',
      price: 49,
      invoiceMonthlyLimit: 100,
      staffLimit: 1,
    });

    expect(mockPrisma.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Starter',
          price: 49,
          invoiceMonthlyLimit: 100,
          staffLimit: 1,
        }),
      })
    );
  });

  test('omitted limit fields are simply absent, not forced to a default — Prisma leaves the column null', async () => {
    mockPrisma.plan.create.mockResolvedValue({ id: 'plan-1' });

    await service.create({ name: 'Unlimited', price: 299 });

    const data = mockPrisma.plan.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('invoiceMonthlyLimit');
    expect(data).not.toHaveProperty('staffLimit');
  });
});

describe('update', () => {
  test('passes the resource-limit fields straight through to prisma.plan.update, including an explicit null', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Basic' });
    mockPrisma.plan.update.mockResolvedValue({ id: 'plan-1' });

    await service.update('plan-1', { staffLimit: null, invoiceMonthlyLimit: 25 });

    expect(mockPrisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-1' },
        data: expect.objectContaining({ staffLimit: null, invoiceMonthlyLimit: 25 }),
      })
    );
  });
});

describe('removePermanently', () => {
  test('refuses with a 409 when a subscription still references the plan', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Free' });
    mockPrisma.subscription.count.mockResolvedValue(3);
    mockPrisma.paymentClaim.count.mockResolvedValue(0);

    await expect(service.removePermanently('plan-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.plan.delete).not.toHaveBeenCalled();
  });

  test('refuses with a 409 when a payment claim still references the plan', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Free' });
    mockPrisma.subscription.count.mockResolvedValue(0);
    mockPrisma.paymentClaim.count.mockResolvedValue(1);

    await expect(service.removePermanently('plan-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.plan.delete).not.toHaveBeenCalled();
  });

  test('hard-deletes a plan with zero references', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Unused' });
    mockPrisma.subscription.count.mockResolvedValue(0);
    mockPrisma.paymentClaim.count.mockResolvedValue(0);

    await service.removePermanently('plan-1');

    expect(mockPrisma.plan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
  });

  test('rejects when the plan does not exist', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(service.removePermanently('plan-missing')).rejects.toMatchObject({ status: 404 });
  });
});
