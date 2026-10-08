const prisma = require('../config/prisma');

// Counted from SyncedInvoice rows actually in the database, mirroring
// voiceQuota.js's countVoiceInvoices — but scoped to the current calendar
// month (resets monthly), unlike the lifetime voice-invoice count. The cap
// itself lives on the Plan row (Plan.manualInvoiceMonthlyLimit, null =
// unlimited) — see shop-subscription.service.js's getManualInvoiceUsage.
// There is no server-side *enforcement* of this cap (see
// payment_bottom_sheet.dart's local check for why: these invoices only
// ever reach the backend through the batch /sync endpoint, not a sensible
// place to reject a single over-quota record out of an otherwise-valid
// batch) — this exists purely so the usage figure the app displays is
// server-truth rather than self-reported.
async function countManualInvoicesThisMonth(shopId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return prisma.syncedInvoice.count({
    where: { shopId, isVoiceCreated: false, deletedAt: null, localCreatedAt: { gte: monthStart } },
  });
}

module.exports = { countManualInvoicesThisMonth };
