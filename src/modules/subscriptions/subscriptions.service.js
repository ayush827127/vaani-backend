const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function listForShop(shopId) {
  return prisma.subscription.findMany({
    where: { shopId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function create({ shopId, planId, status, startDate, endDate, autoRenew }) {
  const [shop, plan] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId } }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);
  if (!shop) throw new AppError('Shop not found', 404);
  if (!plan) throw new AppError('Plan not found', 404);

  return prisma.subscription.create({
    data: { shopId, planId, status, startDate, endDate, autoRenew },
    include: { plan: true },
  });
}

async function update(id, data) {
  const existing = await prisma.subscription.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Subscription not found', 404);
  }
  return prisma.subscription.update({ where: { id }, data, include: { plan: true } });
}

module.exports = { listForShop, create, update };
