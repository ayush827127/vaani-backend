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

// A real, hard delete — unlike Plan's soft "deactivate," nothing else in
// the schema references a Subscription row by id (it's a leaf model: only
// Shop/Plan point INTO it, never the reverse), so there's no history to
// protect by keeping a tombstone around. Lets an admin fully remove a
// mistaken or test subscription (e.g. a QA shop's trial row) rather than
// being stuck with CANCELLED rows forever. If the row being deleted is the
// shop's current in-force subscription, getEffectivePlan's own
// "most-recent row" lookup simply falls through to whatever's next (or
// the Basic fallback) on its very next read — nothing here needs to
// special-case that.
async function remove(id) {
  const existing = await prisma.subscription.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Subscription not found', 404);
  }
  await prisma.subscription.delete({ where: { id } });
}

module.exports = { listForShop, create, update, remove };
