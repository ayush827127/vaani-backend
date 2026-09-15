const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function getStatus(shopId) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: { include: { modules: { include: { module: true } } } } },
      },
      moduleOverrides: { include: { module: true } },
    },
  });
  if (!shop) {
    throw new AppError('Shop not found', 404);
  }

  const subscription = shop.subscriptions[0] || null;

  // A subscription only grants its plan's modules while it's actually in
  // force — TRIAL/ACTIVE and not past its own endDate. EXPIRED/CANCELLED
  // (or a TRIAL/ACTIVE row whose endDate has simply passed) grants nothing,
  // same as having no subscription at all.
  const isSubscriptionInForce =
    subscription &&
    (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL') &&
    (!subscription.endDate || new Date(subscription.endDate) > new Date());

  const moduleKeys = new Set(
    isSubscriptionInForce ? subscription.plan.modules.map((pm) => pm.module.key) : []
  );

  for (const override of shop.moduleOverrides) {
    if (override.enabled) {
      moduleKeys.add(override.module.key);
    } else {
      moduleKeys.delete(override.module.key);
    }
  }

  // Shop-level suspension/cancellation is a master switch — it locks the
  // shop out entirely regardless of subscription state or manual overrides.
  if (shop.status === 'SUSPENDED' || shop.status === 'CANCELLED') {
    moduleKeys.clear();
  }

  return {
    shopStatus: shop.status,
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan.name,
          endDate: subscription.endDate,
        }
      : null,
    modules: Array.from(moduleKeys),
  };
}

module.exports = { getStatus };
