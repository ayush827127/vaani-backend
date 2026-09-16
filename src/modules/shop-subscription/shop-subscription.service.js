const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { getEffectivePlan } = require('../shop-status/shop-status.service');
const { BASIC_VOICE_INVOICE_LIMIT, countVoiceInvoices } = require('../../utils/voiceQuota');

const withModules = { modules: { include: { module: true } } };

async function listPlans() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    include: withModules,
    orderBy: { price: 'asc' },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    billingCycle: p.billingCycle,
    modules: p.modules.map((pm) => pm.module.key),
  }));
}

// A shop switching itself straight to a free plan needs no payment claim —
// there's nothing to verify. Only plans priced at exactly 0 are reachable
// this way; the price check happens here, server-side, specifically so a
// client can't call this endpoint with a paid plan's id and grant itself
// that plan for free.
async function switchToFreePlan(shopId, planId) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new AppError('Plan not found', 404);
  if (Number(plan.price) !== 0) {
    throw new AppError('This plan requires payment — use the payment-claim flow instead', 400);
  }

  return prisma.subscription.create({
    data: { shopId, planId, status: 'ACTIVE', endDate: null },
    include: { plan: true },
  });
}

// Records that a shop *says* it paid for a plan via UPI — never activates
// anything by itself (see PaymentClaim's doc comment in schema.prisma).
// `reference` is a client-generated idempotency key: calling this again
// with the same reference (e.g. a retried request after a timeout) returns
// the existing claim rather than creating a duplicate one.
async function createPaymentClaim(shopId, { planId, reference, amount }) {
  const existing = await prisma.paymentClaim.findUnique({ where: { reference } });
  if (existing) {
    if (existing.shopId !== shopId) {
      // Reference collision across shops should be practically impossible
      // (the app generates a UUID), but never hand back another shop's claim.
      throw new AppError('Invalid payment reference', 400);
    }
    return existing;
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new AppError('Plan not found', 404);
  if (Number(plan.price) === 0) {
    throw new AppError('This plan is free — no payment claim needed', 400);
  }

  return prisma.paymentClaim.create({
    data: { shopId, planId, reference, amount },
    include: { plan: true },
  });
}

async function listMyPaymentClaims(shopId) {
  return prisma.paymentClaim.findMany({
    where: { shopId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

// Server-computed voice-invoice usage — the app shows this rather than
// trusting its own local count, for the same reason shop-voice.service.js's
// quota check does: it's derived from SyncedInvoice rows actually in our
// database, not from anything the client reports about itself.
async function getVoiceUsage(shopId) {
  const { effectivePlan } = await getEffectivePlan(shopId);
  const isBasic = effectivePlan?.name === 'Basic';
  const used = await countVoiceInvoices(shopId);
  return { used, limit: isBasic ? BASIC_VOICE_INVOICE_LIMIT : null, unlimited: !isBasic };
}

module.exports = {
  listPlans,
  switchToFreePlan,
  createPaymentClaim,
  listMyPaymentClaims,
  getVoiceUsage,
};
