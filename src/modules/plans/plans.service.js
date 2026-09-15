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

module.exports = { list, getById, create, update, remove };
