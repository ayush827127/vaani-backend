const prisma = require('../config/prisma');

// The Basic plan's voice-created-invoice cap — the one number both
// shop-voice.service.js (enforcement, before each Groq call) and
// shop-subscription.service.js (the usage figure the app displays) need to
// agree on. Counted from SyncedInvoice rows actually in the database, never
// from anything the client reports about itself.
const BASIC_VOICE_INVOICE_LIMIT = 50;

async function countVoiceInvoices(shopId) {
  return prisma.syncedInvoice.count({
    where: { shopId, isVoiceCreated: true, deletedAt: null },
  });
}

module.exports = { BASIC_VOICE_INVOICE_LIMIT, countVoiceInvoices };
