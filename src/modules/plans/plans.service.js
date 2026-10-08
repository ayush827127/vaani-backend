const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

const withModules = { modules: { include: { module: true } } };

async function list() {
  return prisma.plan.findMany({ include: withModules, orderBy: { price: 'asc' } });
}

async function getById(id) {
  const plan = await prisma.plan.findUnique({ where: { id }, include: withModules });
  if (!plan) {
    throw new AppError('Plan not found', 404);
  }
  return plan;
}

async function create({ moduleIds, ...data }) {
  return prisma.plan.create({
    data: {
      ...data,
      modules: moduleIds ? { create: moduleIds.map((moduleId) => ({ moduleId })) } : undefined,
    },
    include: withModules,
  });
}

async function update(id, { moduleIds, ...data }) {
  await getById(id);

  return prisma.$transaction(async (tx) => {
    if (moduleIds) {
      await tx.planModule.deleteMany({ where: { planId: id } });
      await tx.planModule.createMany({
        data: moduleIds.map((moduleId) => ({ planId: id, moduleId })),
      });
    }
    return tx.plan.update({ where: { id }, data, include: withModules });
  });
}

async function remove(id) {
  await getById(id);
  return prisma.plan.update({ where: { id }, data: { isActive: false } });
}

// A genuine hard delete — unlike remove() above, which only deactivates
// (the safe default, since Subscription/PaymentClaim rows commonly
// reference a plan for billing history). Only allowed when nothing
// actually references this plan any more; otherwise refuses with a clear
// count rather than letting the database throw an opaque foreign-key
// error, or silently cascading away real billing history. PlanModule rows
// are the one thing that's always safe to take with it (onDelete: Cascade
// in the schema — they're pure join rows, no history of their own).
async function removePermanently(id) {
  await getById(id);
  const [subscriptionCount, claimCount] = await Promise.all([
    prisma.subscription.count({ where: { planId: id } }),
    prisma.paymentClaim.count({ where: { planId: id } }),
  ]);
  if (subscriptionCount > 0 || claimCount > 0) {
    throw new AppError(
      `Cannot permanently delete — ${subscriptionCount} subscription(s) and ${claimCount} payment claim(s) still reference this plan. Deactivate it instead to keep that history intact.`,
      409
    );
  }
  await prisma.plan.delete({ where: { id } });
}

module.exports = { list, getById, create, update, remove, removePermanently };
