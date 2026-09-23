const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { createWithNegativeLocalId } = require('../../utils/negativeLocalId');

async function list(shopId, { search, page = 1, limit = 20 }) {
  const where = {
    shopId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.syncedCustomer.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.syncedCustomer.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function getById(shopId, id) {
  const customer = await prisma.syncedCustomer.findFirst({ where: { id, shopId } });
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

async function create(shopId, data) {
  const now = new Date();
  return createWithNegativeLocalId(prisma, 'syncedCustomer', shopId, (tx, localId) =>
    tx.syncedCustomer.create({
      data: {
        shopId,
        localId,
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        totalPurchases: data.totalPurchases ?? 0,
        totalBills: data.totalBills ?? 0,
        totalOutstanding: data.totalOutstanding ?? 0,
        advanceBalance: data.advanceBalance ?? 0,
        lastVisit: data.lastVisit ? new Date(data.lastVisit) : null,
        localCreatedAt: now,
        localUpdatedAt: now,
      },
    })
  );
}

async function update(shopId, id, data) {
  await getById(shopId, id);
  const { lastVisit, ...rest } = data;
  return prisma.syncedCustomer.update({
    where: { id },
    data: {
      ...rest,
      ...(lastVisit !== undefined ? { lastVisit: lastVisit ? new Date(lastVisit) : null } : {}),
      localUpdatedAt: new Date(),
    },
  });
}

async function remove(shopId, id) {
  await getById(shopId, id);
  // Soft delete — see the matching note on shop-items' remove().
  await prisma.syncedCustomer.update({
    where: { id },
    data: { deletedAt: new Date(), localUpdatedAt: new Date() },
  });
}

module.exports = { list, getById, create, update, remove };
