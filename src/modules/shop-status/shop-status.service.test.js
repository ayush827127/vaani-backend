const mockPrisma = {
  shop: { findUnique: jest.fn() },
  plan: { findFirst: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const { getEffectivePlan, getStatus } = require('./shop-status.service');

// Matches withModules' shape: { modules: [{ module: { key } }] }. Resource
// limits default to null (unlimited) unless a test's plan explicitly sets
// one, matching how a real Pro/Advanced Plan row has them unset.
function planWith(name, moduleKeys, limits = {}) {
  return {
    name,
    modules: moduleKeys.map((key) => ({ module: { key } })),
    voiceInvoiceLimit: null,
    staffLimit: null,
    manualInvoiceMonthlyLimit: null,
    ...limits,
  };
}

const BASIC_PLAN = planWith(
  'Basic',
  ['billing', 'inventory', 'customers', 'printer', 'notifications'],
  { voiceInvoiceLimit: 50, staffLimit: 0, manualInvoiceMonthlyLimit: 50 }
);
const PRO_PLAN = planWith('Pro', ['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager']);

function shopWith({ status = 'ACTIVE', subscriptions = [], moduleOverrides = [] } = {}) {
  return { id: 'shop-1', status, subscriptions, moduleOverrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.plan.findFirst.mockResolvedValue(BASIC_PLAN);
});

describe('getEffectivePlan — which plan is actually in force', () => {
  test('no subscription at all falls back to Basic', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ subscriptions: [] }));

    const result = await getEffectivePlan('shop-1');

    expect(result.effectivePlan.name).toBe('Basic');
    // subscription is null (no rows at all), so `subscription && (...)`
    // short-circuits to null rather than false — both are correctly falsy,
    // and every real caller only ever checks truthiness, never strict
    // equality, so this isn't a bug to "fix" in the implementation.
    expect(result.isSubscriptionInForce).toBeFalsy();
    expect([...result.moduleKeys].sort()).toEqual(
      ['billing', 'customers', 'inventory', 'notifications', 'printer'].sort()
    );
  });

  test('an ACTIVE subscription with no endDate is in force and grants its plan\'s modules', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({ subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }] })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.isSubscriptionInForce).toBe(true);
    expect(result.effectivePlan.name).toBe('Pro');
    expect(result.moduleKeys.has('reports')).toBe(true);
    expect(result.moduleKeys.has('ai_manager')).toBe(true);
  });

  test('a TRIAL subscription counts as in force, same as ACTIVE', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [
          { status: 'TRIAL', endDate: new Date(Date.now() + 86400000), plan: PRO_PLAN },
        ],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.isSubscriptionInForce).toBe(true);
    expect(result.effectivePlan.name).toBe('Pro');
  });

  test('an ACTIVE subscription whose endDate has already passed falls back to Basic', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [
          { status: 'ACTIVE', endDate: new Date(Date.now() - 86400000), plan: PRO_PLAN },
        ],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.isSubscriptionInForce).toBe(false);
    expect(result.effectivePlan.name).toBe('Basic');
    expect(result.moduleKeys.has('reports')).toBe(false);
  });

  test('an EXPIRED-status subscription falls back to Basic even with a future endDate', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [
          { status: 'EXPIRED', endDate: new Date(Date.now() + 86400000), plan: PRO_PLAN },
        ],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.isSubscriptionInForce).toBe(false);
    expect(result.effectivePlan.name).toBe('Basic');
  });

  test('a CANCELLED-status subscription falls back to Basic', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({ subscriptions: [{ status: 'CANCELLED', endDate: null, plan: PRO_PLAN }] })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.isSubscriptionInForce).toBe(false);
    expect(result.effectivePlan.name).toBe('Basic');
  });
});

describe('getEffectivePlan — ShopModuleOverride', () => {
  test('an override can grant a module the plan does not include', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [],
        moduleOverrides: [{ enabled: true, module: { key: 'reports' } }],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.has('reports')).toBe(true); // Basic doesn't include reports
  });

  test('an override can revoke a module the plan does include', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [],
        moduleOverrides: [{ enabled: false, module: { key: 'inventory' } }],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.has('inventory')).toBe(false);
  });

  test('multiple overrides apply independently', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [],
        moduleOverrides: [
          { enabled: false, module: { key: 'customers' } },
          { enabled: true, module: { key: 'ai_manager' } },
        ],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.has('customers')).toBe(false);
    expect(result.moduleKeys.has('ai_manager')).toBe(true);
    expect(result.moduleKeys.has('billing')).toBe(true); // untouched by any override
  });
});

describe('getEffectivePlan — shop-level lockout overrides everything', () => {
  test('SUSPENDED clears every module, even ones an override tried to grant', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        status: 'SUSPENDED',
        subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }],
        moduleOverrides: [{ enabled: true, module: { key: 'reports' } }],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.size).toBe(0);
    expect(result.effectivePlan).toBeNull();
  });

  test('CANCELLED clears every module the same way', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        status: 'CANCELLED',
        subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.size).toBe(0);
    expect(result.effectivePlan).toBeNull();
  });

  test('ACTIVE (not locked out) is unaffected — sanity check the lockout condition itself', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        status: 'ACTIVE',
        subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }],
      })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.size).toBeGreaterThan(0);
  });

  test('TRIAL shop status (not suspended/cancelled) is also unaffected', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({ status: 'TRIAL', subscriptions: [] })
    );

    const result = await getEffectivePlan('shop-1');

    expect(result.moduleKeys.size).toBeGreaterThan(0); // Basic fallback still applies
  });
});

describe('getEffectivePlan — not found', () => {
  test('throws a 404 AppError when the shop does not exist', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);

    await expect(getEffectivePlan('shop-missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('getStatus — the public /me/status contract', () => {
  test('shape matches what the Flutter client parses (SubscriptionStatus.fromJson)', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        status: 'ACTIVE',
        subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }],
      })
    );

    const status = await getStatus('shop-1');

    expect(status).toEqual({
      shopStatus: 'ACTIVE',
      subscription: { status: 'ACTIVE', planName: 'Pro', endDate: null },
      effectivePlanName: 'Pro',
      modules: expect.arrayContaining(['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager']),
      voiceInvoiceLimit: null,
      staffLimit: null,
      manualInvoiceMonthlyLimit: null,
    });
  });

  test('subscription is null when the shop has never had one, but effectivePlanName still reports Basic', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ subscriptions: [] }));

    const status = await getStatus('shop-1');

    expect(status.subscription).toBeNull();
    expect(status.effectivePlanName).toBe('Basic');
    expect(status.modules).toEqual(expect.arrayContaining(['billing', 'inventory', 'customers']));
  });

  test('a Basic shop sees its real resource caps, straight off the Plan row', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ subscriptions: [] }));

    const status = await getStatus('shop-1');

    expect(status.voiceInvoiceLimit).toBe(50);
    expect(status.staffLimit).toBe(0);
    expect(status.manualInvoiceMonthlyLimit).toBe(50);
  });

  test('a shop locked out (suspended) reports every limit as null, same as every module being cleared', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ status: 'SUSPENDED', subscriptions: [] }));

    const status = await getStatus('shop-1');

    expect(status.voiceInvoiceLimit).toBeNull();
    expect(status.staffLimit).toBeNull();
    expect(status.manualInvoiceMonthlyLimit).toBeNull();
  });

  test('an expired Pro subscription: subscription.planName still says "Pro" (billing history), but effectivePlanName says "Basic"', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        subscriptions: [
          { status: 'ACTIVE', endDate: new Date(Date.now() - 86400000), plan: PRO_PLAN },
        ],
      })
    );

    const status = await getStatus('shop-1');

    expect(status.subscription.planName).toBe('Pro');
    expect(status.effectivePlanName).toBe('Basic');
    expect(status.modules).not.toContain('reports');
  });

  test('a locked-out (SUSPENDED) shop reports an empty module list and a null effectivePlanName', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(
      shopWith({
        status: 'SUSPENDED',
        subscriptions: [{ status: 'ACTIVE', endDate: null, plan: PRO_PLAN }],
      })
    );

    const status = await getStatus('shop-1');

    expect(status.shopStatus).toBe('SUSPENDED');
    expect(status.effectivePlanName).toBeNull();
    expect(status.modules).toEqual([]);
  });
});
