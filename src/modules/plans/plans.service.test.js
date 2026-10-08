const mockPrisma = {
  plan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  planModule: { deleteMany: jest.fn(), createMany: jest.fn() },
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
      voiceInvoiceLimit: 100,
      staffLimit: 1,
      manualInvoiceMonthlyLimit: 80,
    });

    expect(mockPrisma.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Starter',
          price: 49,
          voiceInvoiceLimit: 100,
          staffLimit: 1,
          manualInvoiceMonthlyLimit: 80,
        }),
      })
    );
  });

  test('omitted limit fields are simply absent, not forced to a default — Prisma leaves the column null', async () => {
    mockPrisma.plan.create.mockResolvedValue({ id: 'plan-1' });

    await service.create({ name: 'Unlimited', price: 299 });

    const data = mockPrisma.plan.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('voiceInvoiceLimit');
    expect(data).not.toHaveProperty('staffLimit');
    expect(data).not.toHaveProperty('manualInvoiceMonthlyLimit');
  });
});

describe('update', () => {
  test('passes the resource-limit fields straight through to prisma.plan.update, including an explicit null', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-1', name: 'Basic' });
    mockPrisma.plan.update.mockResolvedValue({ id: 'plan-1' });

    await service.update('plan-1', { staffLimit: null, manualInvoiceMonthlyLimit: 25 });

    expect(mockPrisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-1' },
        data: expect.objectContaining({ staffLimit: null, manualInvoiceMonthlyLimit: 25 }),
      })
    );
  });
});
