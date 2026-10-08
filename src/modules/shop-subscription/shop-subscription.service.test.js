const mockPrisma = {
  plan: { findMany: jest.fn(), findUnique: jest.fn() },
  subscription: { create: jest.fn() },
  paymentClaim: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const mockGetEffectivePlan = jest.fn();
jest.mock('../shop-status/shop-status.service', () => ({ getEffectivePlan: mockGetEffectivePlan }));

const mockCountInvoicesThisMonth = jest.fn();
jest.mock('../../utils/invoiceQuota', () => ({ countInvoicesThisMonth: mockCountInvoicesThisMonth }));

const service = require('./shop-subscription.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listPlans', () => {
  test('maps each plan with its resource limits straight through, null or not', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([
      {
        id: 'plan-basic',
        name: 'Basic',
        price: 0,
        billingCycle: 'MONTHLY',
        modules: [{ module: { key: 'billing' } }],
        invoiceMonthlyLimit: 50,
        staffLimit: 0,
      },
      {
        id: 'plan-pro',
        name: 'Pro',
        price: 99,
        billingCycle: 'MONTHLY',
        modules: [{ module: { key: 'billing' } }, { module: { key: 'reports' } }],
        invoiceMonthlyLimit: null,
        staffLimit: null,
      },
    ]);

    const plans = await service.listPlans();

    expect(plans).toEqual([
      expect.objectContaining({ name: 'Basic', invoiceMonthlyLimit: 50, staffLimit: 0 }),
      expect.objectContaining({ name: 'Pro', invoiceMonthlyLimit: null, staffLimit: null }),
    ]);
  });
});

describe('getInvoiceUsage', () => {
  test('reports the real combined limit and this-month usage for a capped plan', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Basic', invoiceMonthlyLimit: 50 } });
    mockCountInvoicesThisMonth.mockResolvedValue(12);

    await expect(service.getInvoiceUsage('shop-1')).resolves.toEqual({ used: 12, limit: 50, unlimited: false });
  });

  test('reports unlimited when the plan has no invoiceMonthlyLimit', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Pro', invoiceMonthlyLimit: null } });
    mockCountInvoicesThisMonth.mockResolvedValue(500);

    await expect(service.getInvoiceUsage('shop-1')).resolves.toEqual({ used: 500, limit: null, unlimited: true });
  });

  test('a locked-out shop (no effective plan) reports unlimited rather than throwing', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: null });
    mockCountInvoicesThisMonth.mockResolvedValue(0);

    await expect(service.getInvoiceUsage('shop-1')).resolves.toEqual({ used: 0, limit: null, unlimited: true });
  });
});

describe('switchToFreePlan', () => {
  test('rejects a paid plan — must go through the payment-claim flow instead', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', isActive: true, price: 99 });

    await expect(service.switchToFreePlan('shop-1', 'plan-pro')).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
  });

  test('accepts a genuinely free plan', async () => {
    mockPrisma.plan.findUnique.mockResolvedValue({ id: 'plan-basic', isActive: true, price: 0 });
    mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-1' });

    await expect(service.switchToFreePlan('shop-1', 'plan-basic')).resolves.toMatchObject({ id: 'sub-1' });
  });
});
