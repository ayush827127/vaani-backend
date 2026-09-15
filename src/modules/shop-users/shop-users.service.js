const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

const withAccess = { moduleAccess: { include: { module: true } } };

async function listForShop(shopId) {
  return prisma.shopUser.findMany({
    where: { shopId },
    include: withAccess,
    orderBy: { createdAt: 'asc' },
  });
}

async function create(shopId, data) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new AppError('Shop not found', 404);
  }
  return prisma.shopUser.create({ data: { ...data, shopId }, include: withAccess });
}

async function update(shopId, id, data) {
  const existing = await prisma.shopUser.findFirst({ where: { id, shopId } });
  if (!existing) {
    throw new AppError('Shop user not found', 404);
  }
  return prisma.shopUser.update({ where: { id }, data, include: withAccess });
}

async function setModuleAccess(shopId, id, moduleId, { canView, canEdit }) {
  const existing = await prisma.shopUser.findFirst({ where: { id, shopId } });
  if (!existing) {
    throw new AppError('Shop user not found', 404);
  }

  return prisma.shopUserModuleAccess.upsert({
    where: { shopUserId_moduleId: { shopUserId: id, moduleId } },
    update: { canView, canEdit },
    create: { shopUserId: id, moduleId, canView, canEdit },
    include: { module: true },
  });
}

module.exports = { listForShop, create, update, setModuleAccess };
