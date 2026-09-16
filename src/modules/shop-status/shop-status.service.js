const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

const withModules = { modules: { include: { module: true } } };

// Shared by getStatus() (below) and shop-voice.service.js's voice-invoice
// limit check — both need to know "what plan is actually in force for this
// shop right now", so this is the one place that logic lives.
//
// Basic is the always-available free tier: a shop with no subscription at
// all (never paid), or whose paid subscription has expired, falls back to
// Basic rather than losing every module — a plan lapsing was previously
// indistinguishable from the shop having literally nothing, which meant an
// expired Pro/Advanced subscriber was worse off than a shop that never
// subscribed to anything. Shop-level SUSPENDED/CANCELLED is a separate,
// harder lockout that overrides even the Basic fallback — see moduleKeys
// below.
async function getEffectivePlan(shopId) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: { include: withModules } },
      },
      moduleOverrides: { include: { module: true } },
    },
  });
  if (!shop) {
    throw new AppError('Shop not found', 404);
  }

  const subscription = shop.subscriptions[0] || null;

  const isSubscriptionInForce =
    subscription &&
    (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL') &&
    (!subscription.endDate || new Date(subscription.endDate) > new Date());

  let effectivePlan = isSubscriptionInForce ? subscription.plan : null;
  if (!effectivePlan) {
    effectivePlan = await prisma.plan.findFirst({
      where: { name: 'Basic', isActive: true },
      include: withModules,
    });
  }

  const moduleKeys = new Set((effectivePlan?.modules ?? []).map((pm) => pm.module.key));

  for (const override of shop.moduleOverrides) {
    if (override.enabled) {
      moduleKeys.add(override.module.key);
    } else {
      moduleKeys.delete(override.module.key);
    }
  }

  // Shop-level suspension/cancellation is a master switch — it locks the
  // shop out entirely regardless of plan (paid, in-force, or the Basic
  // fallback) or manual overrides.
  const isLockedOut = shop.status === 'SUSPENDED' || shop.status === 'CANCELLED';
  if (isLockedOut) {
    moduleKeys.clear();
  }

  return {
    shop,
    subscription,
    isSubscriptionInForce,
    effectivePlan: isLockedOut ? null : effectivePlan,
    moduleKeys,
  };
}

async function getStatus(shopId) {
  const { shop, subscription, effectivePlan, moduleKeys } = await getEffectivePlan(shopId);

  return {
    shopStatus: shop.status,
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan.name,
          endDate: subscription.endDate,
        }
      : null,
    // The plan actually granting these modules right now — the paid
    // subscription's plan if one is in force, otherwise Basic (or null if
    // the shop is locked out). Distinct from `subscription.planName` above,
    // which is the phone's billing history, not necessarily what's active
    // (an expired Pro subscription still shows planName "Pro" there, but
    // effectivePlan is "Basic").
    effectivePlanName: effectivePlan?.name ?? null,
    modules: Array.from(moduleKeys),
  };
}

module.exports = { getStatus, getEffectivePlan };
