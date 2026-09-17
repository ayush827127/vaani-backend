const prisma = require('../../config/prisma');

// Same "in force" rule as shop-status.service.js's getEffectivePlan — kept
// separate rather than imported since that one is written to answer for a
// single shop (its own findMany with nested includes) while this needs to
// scan every shop at once for a plan-distribution count. Duplicated logic,
// same semantics: keep both in sync if the in-force rule ever changes.
function isSubscriptionInForce(sub) {
  if (!sub) return false;
  const activeStatus = sub.status === 'ACTIVE' || sub.status === 'TRIAL';
  const notExpired = !sub.endDate || new Date(sub.endDate) > new Date();
  return activeStatus && notExpired;
}

async function summary() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalShops,
    shopsByStatusRaw,
    shopsWithLatestSub,
    newShopsLast7Days,
    newShopsLast30Days,
    confirmedRevenue,
    confirmedThisMonth,
    pendingClaims,
    pendingClaimsCount,
    moduleCount,
    activePlanCount,
    recentShops,
  ] = await Promise.all([
    prisma.shop.count(),
    prisma.shop.groupBy({ by: ['status'], _count: true }),
    prisma.shop.findMany({
      select: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, endDate: true, plan: { select: { name: true } } },
        },
      },
    }),
    prisma.shop.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.shop.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.paymentClaim.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amount: true } }),
    prisma.paymentClaim.aggregate({
      where: { status: 'CONFIRMED', confirmedAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.paymentClaim.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
    prisma.paymentClaim.count({ where: { status: 'PENDING' } }),
    prisma.module.count(),
    prisma.plan.count({ where: { isActive: true } }),
    prisma.shop.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, ownerName: true, phone: true, status: true, createdAt: true },
    }),
  ]);

  const shopsByStatus = { TRIAL: 0, ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0 };
  for (const row of shopsByStatusRaw) shopsByStatus[row.status] = row._count;

  // Every shop lands in exactly one bucket — the plan actually granting its
  // modules right now, not its billing history — same "falls back to Basic"
  // rule as the phone's own /me/status, so this reads consistently with
  // what a shopkeeper sees in the app.
  const planDistribution = {};
  for (const shop of shopsWithLatestSub) {
    const sub = shop.subscriptions[0];
    const planName = isSubscriptionInForce(sub) ? sub.plan.name : 'Basic';
    planDistribution[planName] = (planDistribution[planName] || 0) + 1;
  }

  return {
    shops: {
      total: totalShops,
      byStatus: shopsByStatus,
      newLast7Days: newShopsLast7Days,
      newLast30Days: newShopsLast30Days,
    },
    plans: {
      distribution: planDistribution,
      activeCatalogCount: activePlanCount,
    },
    revenue: {
      confirmedTotal: Number(confirmedRevenue._sum.amount ?? 0),
      confirmedThisMonth: Number(confirmedThisMonth._sum.amount ?? 0),
      pendingTotal: Number(pendingClaims._sum.amount ?? 0),
      pendingCount: pendingClaimsCount,
    },
    moduleCount,
    recentShops,
  };
}

module.exports = { summary };
