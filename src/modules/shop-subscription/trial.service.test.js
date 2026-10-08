const mockPrisma = {
  shop: { findUnique: jest.fn(), update: jest.fn() },
  subscription: { findFirst: jest.fn(), create: jest.fn() },
  plan: { findFirst: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
jest.mock('../../config/prisma', () => mockPrisma);

const mockGetEffectivePlan = jest.fn();
jest.mock('../shop-status/shop-status.service', () => ({ getEffectivePlan: mockGetEffectivePlan }));

const { canStartTrial, startTrial } = require('./trial.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1', trialUsed: false });
  mockPrisma.subscription.findFirst.mockResolvedValue(null); // no subscription at all, by default
  mockPrisma.plan.findFirst.mockResolvedValue({ id: 'plan-pro', name: 'Pro' });
  mockPrisma.subscription.create.mockResolvedValue({ id: 'sub-new', status: 'TRIAL' });
});

describe('canStartTrial', () => {
  test('a fresh shop with nothing on record is eligible', async () => {
    mockGetEffectivePlan.mockResolvedValue({
      shop: { trialUsed: false },
      subscription: null,
      isSubscriptionInForce: false,
    });

    await expect(canStartTrial('shop-1')).resolves.toEqual({ eligible: true });
  });

  test('a shop that already used its trial is rejected', async () => {
    mockGetEffectivePlan.mockResolvedValue({
      shop: { trialUsed: true },
      subscription: null,
      isSubscriptionInForce: false,
    });

    await expect(canStartTrial('shop-1')).resolves.toEqual({ eligible: false, reason: 'PRO_TRIAL_ALREADY_USED' });
  });

  test('a shop with an in-force trial is rejected (no double-trialing)', async () => {
    // trialUsed: false here isolates this specific branch — in practice
    // startTrial() always sets trialUsed alongside the TRIAL row, so the
    // ALREADY_USED check above would normally catch this combination
    // first; this test exists to confirm the in-force-trial check itself
    // is correct independent of that.
    mockGetEffectivePlan.mockResolvedValue({
      shop: { trialUsed: false },
      subscription: { status: 'TRIAL', plan: { name: 'Pro' } },
      isSubscriptionInForce: true,
    });

    await expect(canStartTrial('shop-1')).resolves.toEqual({ eligible: false, reason: 'PRO_TRIAL_ALREADY_ACTIVE' });
  });

  test('a shop with an in-force paid Pro subscription is rejected', async () => {
    mockGetEffectivePlan.mockResolvedValue({
      shop: { trialUsed: false },
      subscription: { status: 'ACTIVE', plan: { name: 'Pro' } },
      isSubscriptionInForce: true,
    });

    await expect(canStartTrial('shop-1')).resolves.toEqual({
      eligible: false,
      reason: 'PRO_SUBSCRIPTION_ALREADY_ACTIVE',
    });
  });

  test('a shop with an in-force Basic subscription is still eligible — only Pro/trial block it', async () => {
    mockGetEffectivePlan.mockResolvedValue({
      shop: { trialUsed: false },
      subscription: { status: 'ACTIVE', plan: { name: 'Basic' } },
      isSubscriptionInForce: true,
    });

    await expect(canStartTrial('shop-1')).resolves.toEqual({ eligible: true });
  });
});

describe('startTrial', () => {
  test('a fresh shop gets a 14-day Pro trial and trialUsed flips to true', async () => {
    const result = await startTrial('shop-1');

    expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: 'shop-1', planId: 'plan-pro', status: 'TRIAL' }),
      })
    );
    const { startDate, endDate } = mockPrisma.subscription.create.mock.calls[0][0].data;
    expect(endDate.getTime() - startDate.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(mockPrisma.shop.update).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      data: { trialUsed: true },
    });
    expect(result).toEqual({ id: 'sub-new', status: 'TRIAL' });
  });

  test('rejects with PRO_TRIAL_ALREADY_USED when trialUsed is already true, inside the transaction', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1', trialUsed: true });

    await expect(startTrial('shop-1')).rejects.toMatchObject({
      status: 409,
      details: { code: 'PRO_TRIAL_ALREADY_USED' },
    });
    expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
  });

  test('rejects with PRO_TRIAL_ALREADY_ACTIVE when an in-force trial already exists', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      status: 'TRIAL',
      endDate: new Date(Date.now() + 86400000),
      plan: { name: 'Pro' },
    });

    await expect(startTrial('shop-1')).rejects.toMatchObject({
      status: 409,
      details: { code: 'PRO_TRIAL_ALREADY_ACTIVE' },
    });
  });

  test('rejects with PRO_SUBSCRIPTION_ALREADY_ACTIVE when an in-force paid Pro subscription already exists', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      endDate: null,
      plan: { name: 'Pro' },
    });

    await expect(startTrial('shop-1')).rejects.toMatchObject({
      status: 409,
      details: { code: 'PRO_SUBSCRIPTION_ALREADY_ACTIVE' },
    });
  });

  test('an in-force Basic subscription does not block starting a Pro trial', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      endDate: null,
      plan: { name: 'Basic' },
    });

    await expect(startTrial('shop-1')).resolves.toEqual({ id: 'sub-new', status: 'TRIAL' });
  });

  test('an expired former trial does not block starting a new one', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({
      status: 'TRIAL',
      endDate: new Date(Date.now() - 86400000), // in the past -> not in force
      plan: { name: 'Pro' },
    });
    // Realistically trialUsed would already be true here too, but this
    // test is specifically isolating the "endDate already passed" half of
    // the in-force check — the ALREADY_USED guard above covers the other.
    mockPrisma.shop.findUnique.mockResolvedValue({ id: 'shop-1', trialUsed: false });

    await expect(startTrial('shop-1')).resolves.toEqual({ id: 'sub-new', status: 'TRIAL' });
  });

  test('throws 404 if the shop does not exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);

    await expect(startTrial('shop-missing')).rejects.toMatchObject({ status: 404 });
  });
});
