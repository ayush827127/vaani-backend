const mockPrisma = {
  syncedInvoice: { count: jest.fn() },
};
jest.mock('../config/prisma', () => mockPrisma);

const mockGetEffectivePlan = jest.fn();
jest.mock('../modules/shop-status/shop-status.service', () => ({ getEffectivePlan: mockGetEffectivePlan }));

const { countInvoicesThisMonth, checkInvoiceQuota } = require('./invoiceQuota');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('countInvoicesThisMonth', () => {
  test('counts non-deleted invoices from this calendar month only, regardless of voice/manual origin', async () => {
    mockPrisma.syncedInvoice.count.mockResolvedValue(7);

    const count = await countInvoicesThisMonth('shop-1');

    expect(count).toBe(7);
    const where = mockPrisma.syncedInvoice.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ shopId: 'shop-1', deletedAt: null });
    // No isVoiceCreated filter at all — voice and manual invoices are
    // counted together against the one combined cap.
    expect(where).not.toHaveProperty('isVoiceCreated');
    expect(where.localCreatedAt.gte).toBeInstanceOf(Date);
  });
});

describe('checkInvoiceQuota', () => {
  test('a plan with no invoiceMonthlyLimit (null) is never blocked, however many invoices exist', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Pro', invoiceMonthlyLimit: null } });
    mockPrisma.syncedInvoice.count.mockResolvedValue(10000);

    await expect(checkInvoiceQuota('shop-1')).resolves.toBeUndefined();
  });

  test('a shop with no effective plan at all (locked out) is never blocked here', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: null });

    await expect(checkInvoiceQuota('shop-1')).resolves.toBeUndefined();
    expect(mockPrisma.syncedInvoice.count).not.toHaveBeenCalled();
  });

  test('usage below the limit is allowed', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Basic', invoiceMonthlyLimit: 50 } });
    mockPrisma.syncedInvoice.count.mockResolvedValue(49);

    await expect(checkInvoiceQuota('shop-1')).resolves.toBeUndefined();
  });

  test('usage at the limit is rejected with a 403 carrying a structured code', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Basic', invoiceMonthlyLimit: 50 } });
    mockPrisma.syncedInvoice.count.mockResolvedValue(50);

    await expect(checkInvoiceQuota('shop-1')).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Basic plan is limited to 50 invoices this month'),
      details: { code: 'MONTHLY_INVOICE_LIMIT_REACHED', limit: 50, used: 50, plan: 'Basic' },
    });
  });

  test('a plan with invoiceMonthlyLimit of 0 blocks even a shop with zero invoices so far', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Trial', invoiceMonthlyLimit: 0 } });
    mockPrisma.syncedInvoice.count.mockResolvedValue(0);

    await expect(checkInvoiceQuota('shop-1')).rejects.toMatchObject({ status: 403 });
  });
});
