const prisma = require('../config/prisma');

// Counted from SyncedInvoice rows actually in the database, never from
// anything the client reports about itself. The cap itself now lives on the
// Plan row (Plan.voiceInvoiceLimit, null = unlimited) — see
// shop-voice.service.js's checkVoiceInvoiceQuota and
// shop-subscription.service.js's getVoiceUsage, both of which read it off
// the shop's effectivePlan rather than a hardcoded number.
async function countVoiceInvoices(shopId) {
  return prisma.syncedInvoice.count({
    where: { shopId, isVoiceCreated: true, deletedAt: null },
  });
}

module.exports = { countVoiceInvoices };
