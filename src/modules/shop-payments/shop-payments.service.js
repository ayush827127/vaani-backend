const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { nextNegativeLocalId } = require('../../utils/negativeLocalId');

async function list(shopId, { search, page = 1, limit = 20 }) {
  const where = {
    shopId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { type: { contains: search, mode: 'insensitive' } },
            { notes: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.syncedPaymentTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { localCreatedAt: 'desc' },
    }),
    prisma.syncedPaymentTransaction.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function getById(shopId, id) {
  const payment = await prisma.syncedPaymentTransaction.findFirst({ where: { id, shopId } });
  if (!payment) throw new AppError('Payment not found', 404);
  return payment;
}

async function create(shopId, data) {
  const localId = await nextNegativeLocalId(prisma, 'syncedPaymentTransaction', shopId);
  const now = new Date();
  return prisma.syncedPaymentTransaction.create({
    data: {
      shopId,
      localId,
      localCustomerId: data.customerId,
      localInvoiceId: data.invoiceId ?? null,
      type: data.type,
      amount: data.amount,
      paymentMode: data.paymentMode,
      notes: data.notes ?? null,
      localCreatedAt: now,
      localUpdatedAt: now,
    },
  });
}

async function update(shopId, id, data) {
  await getById(shopId, id);
  const { customerId, invoiceId, ...rest } = data;
  return prisma.syncedPaymentTransaction.update({
    where: { id },
    data: {
      ...rest,
      ...(customerId !== undefined ? { localCustomerId: customerId } : {}),
      ...(invoiceId !== undefined ? { localInvoiceId: invoiceId } : {}),
      localUpdatedAt: new Date(),
    },
  });
}

async function remove(shopId, id) {
  await getById(shopId, id);
  // Soft delete — see the matching note on shop-products' remove().
  await prisma.syncedPaymentTransaction.update({
    where: { id },
    data: { deletedAt: new Date(), localUpdatedAt: new Date() },
  });
}

module.exports = { list, getById, create, update, remove };
