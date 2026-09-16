const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { createWithNegativeLocalId } = require('../../utils/negativeLocalId');

// Payment `type` -> effect on the customer's aggregate balance, mirroring
// the phone app's own logic (collect_payment_sheet.dart /
// payment_bottom_sheet.dart). Admin-panel payments are never linked to a
// specific invoice — the admin UI has no invoice picker — so only the
// customer-level totals are reconciled here; a future invoice-linked admin
// payment would additionally need to update that invoice's own
// receivedAmount/pendingAmount, same as shop-invoices.service.js does.
function balanceDelta(type, amount) {
  switch (type) {
    case 'advance_deposit':
    case 'refund':
      return { outstanding: 0, advance: amount };
    case 'outstanding_collection':
      return { outstanding: -amount, advance: 0 };
    case 'advance_used':
      return { outstanding: 0, advance: -amount };
    default:
      // 'bill_payment' (cash collected at checkout, already reflected on the
      // invoice itself) and any unrecognized type — no customer-level effect.
      return { outstanding: 0, advance: 0 };
  }
}

// Applies a balance delta if the customer has been synced from the phone at
// least once (nothing to reconcile otherwise). Both fields are floored at 0,
// same as the phone's own updateCustomerBalances() — which means reversing a
// delta by negating it can under-correct if the original application had
// already been clamped (e.g. undoing a large outstanding_collection on a
// customer whose balance was already nudged to 0 by something else). That's
// an acceptable, rare edge case; it mirrors the phone's own behavior rather
// than introducing new drift.
async function applyBalanceDelta(tx, shopId, localCustomerId, delta) {
  if (delta.outstanding === 0 && delta.advance === 0) return;
  const customer = await tx.syncedCustomer.findFirst({ where: { shopId, localId: localCustomerId } });
  if (!customer) return;
  await tx.syncedCustomer.update({
    where: { id: customer.id },
    data: {
      totalOutstanding: Math.max(0, customer.totalOutstanding + delta.outstanding),
      advanceBalance: Math.max(0, customer.advanceBalance + delta.advance),
      localUpdatedAt: new Date(),
    },
  });
}

function negate(delta) {
  return { outstanding: -delta.outstanding, advance: -delta.advance };
}

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
  const now = new Date();
  return createWithNegativeLocalId(prisma, 'syncedPaymentTransaction', shopId, async (tx, localId) => {
    const payment = await tx.syncedPaymentTransaction.create({
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
    await applyBalanceDelta(tx, shopId, data.customerId, balanceDelta(data.type, data.amount));
    return payment;
  });
}

async function update(shopId, id, data) {
  const existing = await getById(shopId, id);
  const { customerId, invoiceId, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.syncedPaymentTransaction.update({
      where: { id },
      data: {
        ...rest,
        ...(customerId !== undefined ? { localCustomerId: customerId } : {}),
        ...(invoiceId !== undefined ? { localInvoiceId: invoiceId } : {}),
        localUpdatedAt: new Date(),
      },
    });
    // Reverse the old effect, then apply the new one — handles a changed
    // type, amount, and/or customer in a single pass, whichever changed.
    await applyBalanceDelta(
      tx,
      shopId,
      existing.localCustomerId,
      negate(balanceDelta(existing.type, existing.amount))
    );
    await applyBalanceDelta(
      tx,
      shopId,
      updated.localCustomerId,
      balanceDelta(updated.type, updated.amount)
    );
    return updated;
  });
}

async function remove(shopId, id) {
  const existing = await getById(shopId, id);
  await prisma.$transaction(async (tx) => {
    // Soft delete — see the matching note on shop-products' remove().
    await tx.syncedPaymentTransaction.update({
      where: { id },
      data: { deletedAt: new Date(), localUpdatedAt: new Date() },
    });
    await applyBalanceDelta(
      tx,
      shopId,
      existing.localCustomerId,
      negate(balanceDelta(existing.type, existing.amount))
    );
  });
}

module.exports = { list, getById, create, update, remove };
