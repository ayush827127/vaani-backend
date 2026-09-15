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
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.syncedInvoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { localCreatedAt: 'desc' },
    }),
    prisma.syncedInvoice.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function getById(shopId, id) {
  const invoice = await prisma.syncedInvoice.findFirst({
    where: { id, shopId },
    include: { items: true },
  });
  if (!invoice) throw new AppError('Invoice not found', 404);
  return invoice;
}

// Computes per-item and invoice-level totals from raw line inputs — the same
// math the phone app does in invoice_repository.dart (lineTotal = qty *
// price, gstAmount = lineTotal * gstRate / 100), so admin-created/edited
// invoices are computed identically to phone-synced ones.
function computeTotals(items, discountType, discountValue) {
  const computedItems = items.map((item) => {
    const lineTotal = item.quantity * item.sellingPrice;
    const gstAmount = lineTotal * (item.gstRate ?? 0) / 100;
    return { ...item, lineTotal, gstAmount };
  });
  const subtotal = computedItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const gstAmount = computedItems.reduce((sum, i) => sum + i.gstAmount, 0);
  const discountAmount =
    discountType === 'percent' ? (subtotal * (discountValue ?? 0)) / 100 : discountValue ?? 0;
  const grandTotal = subtotal + gstAmount - discountAmount;
  return { computedItems, subtotal, gstAmount, discountAmount, grandTotal };
}

async function create(shopId, data) {
  const { computedItems, subtotal, gstAmount, discountAmount, grandTotal } = computeTotals(
    data.items,
    data.discountType ?? 'none',
    data.discountValue ?? 0
  );
  const receivedAmount = data.receivedAmount ?? grandTotal;
  const pendingAmount = grandTotal - receivedAmount;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const localId = await nextNegativeLocalId(tx, 'syncedInvoice', shopId);
    const invoice = await tx.syncedInvoice.create({
      data: {
        shopId,
        localId,
        invoiceNumber: `ADM-${Date.now()}`,
        localCustomerId: data.customerId ?? null,
        customerName: data.customerName ?? 'Walk-in Customer',
        subtotal,
        discountType: data.discountType ?? 'none',
        discountValue: data.discountValue ?? 0,
        discountAmount,
        gstAmount,
        grandTotal,
        receivedAmount,
        pendingAmount,
        paymentMode: data.paymentMode ?? 'cash',
        status: data.status ?? 'paid',
        notes: data.notes ?? null,
        localCreatedAt: now,
        localUpdatedAt: now,
        items: {
          create: computedItems.map((item, i) => ({
            localId: -(i + 1),
            localProductId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            gstRate: item.gstRate ?? 0,
            gstAmount: item.gstAmount,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: { items: true },
    });
    return invoice;
  });
}

async function update(shopId, id, data) {
  const existing = await getById(shopId, id);

  const hasItems = Array.isArray(data.items);
  const totals = hasItems
    ? computeTotals(
        data.items,
        data.discountType ?? existing.discountType,
        data.discountValue ?? existing.discountValue
      )
    : null;

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.syncedInvoice.update({
      where: { id },
      data: {
        ...(data.customerId !== undefined ? { localCustomerId: data.customerId } : {}),
        ...(data.customerName !== undefined ? { customerName: data.customerName } : {}),
        ...(data.paymentMode !== undefined ? { paymentMode: data.paymentMode } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.receivedAmount !== undefined ? { receivedAmount: data.receivedAmount } : {}),
        ...(totals
          ? {
              discountType: data.discountType ?? existing.discountType,
              discountValue: data.discountValue ?? existing.discountValue,
              subtotal: totals.subtotal,
              gstAmount: totals.gstAmount,
              discountAmount: totals.discountAmount,
              grandTotal: totals.grandTotal,
              pendingAmount:
                totals.grandTotal - (data.receivedAmount ?? existing.receivedAmount),
            }
          : {}),
        localUpdatedAt: new Date(),
      },
    });

    if (hasItems) {
      await tx.syncedInvoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.syncedInvoiceItem.createMany({
        data: totals.computedItems.map((item, i) => ({
          invoiceId: id,
          localId: -(i + 1),
          localProductId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          gstRate: item.gstRate ?? 0,
          gstAmount: item.gstAmount,
          lineTotal: item.lineTotal,
        })),
      });
    }

    return tx.syncedInvoice.findUnique({ where: { id }, include: { items: true } });
  });
}

async function remove(shopId, id) {
  await getById(shopId, id);
  // Soft delete — see the matching note on shop-products' remove().
  await prisma.syncedInvoice.update({
    where: { id },
    data: { deletedAt: new Date(), localUpdatedAt: new Date() },
  });
}

module.exports = { list, getById, create, update, remove };
