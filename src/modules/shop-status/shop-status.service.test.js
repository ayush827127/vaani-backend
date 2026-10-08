const mockPrisma = {
  shop: { findUnique: jest.fn() },
  plan: { findFirst: jest.fn() },
  subscription: { update: jest.fn() },
};
jest.mock('../../config/prisma', () => mockPrisma);

const { getEffectivePlan, getStatus } = require('./shop-status.service');

// Matches withModules' shape: { modules: [{ module: { key } }] }. Resource
// limits default to null (unlimited) unless a test's plan explicitly sets
// one, matching how a real Pro Plan row has them unset.
function planWith(name, moduleKeys, limits = {}) {
  return {
    name,
    modules: moduleKeys.map((key) => ({ module: { key } })),
    invoiceMonthlyLimit: null,
    staffLimit: null,
    ...limits,
  };
}

const BASIC_PLAN = planWith(
  'Basic',
  ['billing', 'inventory', 'customers', 'printer', 'notifications'],
  { invoiceMonthlyLimit: 50, staffLimit: 0 }
);
const PRO_PLAN = planWith('Pro', ['billing', 'inventory', 'customers', 'printer', 'notifications', 'reports', 'ai_manager']);

function shopWith({ status = 'ACTIVE', subscriptions = [], moduleOverrides = [], trialUsed = false } = {}) {
  return { id: 'shop-1', status, subscriptions, moduleOverrides, trialUsed };
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
      invoiceMonthlyLimit: null,
      staffLimit: null,
      trialUsed: false,
      trialAvailable: false, // already has an active paid Pro subscription
      trialEndsAt: null,
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

    expect(status.invoiceMonthlyLimit).toBe(50);
    expect(status.staffLimit).toBe(0);
  });

  test('a shop locked out (suspended) reports every limit as null, same as every module being cleared', async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ status: 'SUSPENDED', subscriptions: [] }));

    const status = await getStatus('shop-1');

    expect(status.invoiceMonthlyLimit).toBeNull();
    expect(status.staffLimit).toBeNull();
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

  describe('trial fields', () => {
    test('a shop that never trialed and has no in-force subscription is trial-available', async () => {
      mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ subscriptions: [] }));

      const status = await getStatus('shop-1');

      expect(status.trialUsed).toBe(false);
      expect(status.trialAvailable).toBe(true);
      expect(status.trialEndsAt).toBeNull();
    });

    test('a shop already marked trialUsed is not trial-available even with nothing else in force', async () => {
      mockPrisma.shop.findUnique.mockResolvedValue(shopWith({ subscriptions: [], trialUsed: true }));

      const status = await getStatus('shop-1');

      expect(status.trialAvailable).toBe(false);
    });

    test('a shop with an in-force Basic subscription is still trial-available — only Pro/trial block it', async () => {
      mockPrisma.shop.findUnique.mockResolvedValue(
        shopWith({ subscriptions: [{ status: 'ACTIVE', endDate: null, plan: BASIC_PLAN }] })
      );

      const status = await getStatus('shop-1');

      expect(status.trialAvailable).toBe(true);
    });

    test('an in-force trial reports trialEndsAt and is not itself trial-available', async () => {
      const endDate = new Date(Date.now() + 5 * 86400000);
      mockPrisma.shop.findUnique.mockResolvedValue(
        shopWith({ subscriptions: [{ status: 'TRIAL', endDate, plan: PRO_PLAN }] })
      );

      const status = await getStatus('shop-1');

      expect(status.trialEndsAt).toEqual(endDate);
      expect(status.trialAvailable).toBe(false);
    });

    test('a TRIAL subscription past its endDate is lazily flipped to EXPIRED and no longer reports trialEndsAt', async () => {
      const pastEndDate = new Date(Date.now() - 86400000);
      // trialUsed: true because startTrial() always sets it atomically with
      // the TRIAL subscription row it creates — this fixture mirrors that
      // real combination, not a hypothetical TRIAL row with trialUsed still
      // false (which startTrial()'s own transaction guarantees can't happen).
      mockPrisma.shop.findUnique.mockResolvedValue(
        shopWith({
          subscriptions: [{ id: 'sub-1', status: 'TRIAL', endDate: pastEndDate, plan: PRO_PLAN }],
          trialUsed: true,
        })
      );
      mockPrisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: 'EXPIRED',
        endDate: pastEndDate,
        plan: PRO_PLAN,
      });

      const status = await getStatus('shop-1');

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' }, data: { status: 'EXPIRED' } })
      );
      expect(status.subscription.status).toBe('EXPIRED');
      expect(status.effectivePlanName).toBe('Basic'); // already correct even before the flip
      expect(status.trialEndsAt).toBeNull();
      // A shop whose only-ever trial just expired has consumed it — the flip
      // must never reset trialAvailable back to true.
      expect(status.trialAvailable).toBe(false);
    });
  });
});
