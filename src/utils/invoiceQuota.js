const prisma = require('../config/prisma');
const AppError = require('./AppError');
const { getEffectivePlan } = require('../modules/shop-status/shop-status.service');

// Counts voice- AND manually-created invoices TOGETHER against one combined
// monthly quota — replaces the old split (a lifetime voice cap, a separate
// monthly manual cap). Counted from SyncedInvoice rows actually in the
// database, never from anything the client reports about itself.
async function countInvoicesThisMonth(shopId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.syncedInvoice.count({
    where: { shopId, deletedAt: null, localCreatedAt: { gte: monthStart } },
  });
}

// Refuses further invoice creation once a shop has reached its plan's
// invoiceMonthlyLimit (null = unlimited) — the one enforcement point that
// runs synchronously (before the Groq call in the voice-billing flow); the
// batch-sync path has its own, per-record version of this same check (see
// shop-sync.service.js), since it can't throw for one record without
// dropping the rest of a valid batch.
async function checkInvoiceQuota(shopId) {
  const { effectivePlan } = await getEffectivePlan(shopId);
  if (!effectivePlan || effectivePlan.invoiceMonthlyLimit == null) return; // unlimited

  const used = await countInvoicesThisMonth(shopId);
  if (used >= effectivePlan.invoiceMonthlyLimit) {
    throw new AppError(
      `${effectivePlan.name} plan is limited to ${effectivePlan.invoiceMonthlyLimit} invoices this month. Upgrade for unlimited billing.`,
      403,
      { code: 'MONTHLY_INVOICE_LIMIT_REACHED', limit: effectivePlan.invoiceMonthlyLimit, used, plan: effectivePlan.name }
    );
  }
}

module.exports = { countInvoicesThisMonth, checkInvoiceQuota };
