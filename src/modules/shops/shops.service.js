const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { replaceImage, deleteImage } = require('../../utils/cloudinaryImage');

async function list({ page = 1, limit = 20, status, search }) {
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { ownerName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.shop.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } } },
    }),
    prisma.shop.count({ where }),
  ]);

  return { items, total, page, limit };
}

async function getById(id) {
  const shop = await prisma.shop.findUnique({
    where: { id },
    include: {
      subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
      moduleOverrides: { include: { module: true } },
      shopUsers: true,
    },
  });
  if (!shop) {
    throw new AppError('Shop not found', 404);
  }
  return shop;
}

async function create(data) {
  return prisma.shop.create({ data });
}

async function update(id, data) {
  await getById(id);
  return prisma.shop.update({ where: { id }, data });
}

async function setStatus(id, status) {
  await getById(id);
  return prisma.shop.update({ where: { id }, data: { status } });
}

async function setModuleOverride(shopId, moduleId, enabled) {
  await getById(shopId);
  return prisma.shopModuleOverride.upsert({
    where: { shopId_moduleId: { shopId, moduleId } },
    update: { enabled },
    create: { shopId, moduleId, enabled },
    include: { module: true },
  });
}

// Removes the override entirely so the shop goes back to "whatever its plan
// grants" — distinct from setModuleOverride(shopId, moduleId, false), which
// explicitly revokes the module regardless of plan. deleteMany rather than
// delete so calling this when no override exists is a no-op, not a 404.
async function removeModuleOverride(shopId, moduleId) {
  await getById(shopId);
  await prisma.shopModuleOverride.deleteMany({ where: { shopId, moduleId } });
}

async function setLogo(id, buffer) {
  const shop = await getById(id);
  const logoUrl = await replaceImage({
    buffer,
    folder: `vaani/shops/${id}`,
    previousUrl: shop.logoUrl,
  });
  return prisma.shop.update({ where: { id }, data: { logoUrl } });
}

async function clearLogo(id) {
  const shop = await getById(id);
  await deleteImage(shop.logoUrl);
  return prisma.shop.update({ where: { id }, data: { logoUrl: null } });
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
  setModuleOverride,
  setLogo,
  clearLogo,
};
