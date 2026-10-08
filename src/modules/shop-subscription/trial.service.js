const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { getEffectivePlan } = require('../shop-status/shop-status.service');

const TRIAL_DAYS = 14;
const TRIAL_PLAN_NAME = 'Pro';

// Mirrors shop-status.service.js's getEffectivePlan's own inline
// trialAvailable computation exactly. Not shared via a single helper: that
// file needs the boolean as part of a response it's already building from
// one getEffectivePlan call, whereas this function does a dedicated fetch
// and needs the richer {eligible, reason} shape for error messaging — the
// underlying rule (not trialUsed, no in-force trial, no in-force paid Pro)
// is simple enough that keeping both readable independently was judged
// better than factoring out a three-line rule shared by two call shapes.
async function canStartTrial(shopId) {
  const { shop, subscription, isSubscriptionInForce } = await getEffectivePlan(shopId);

  if (shop.trialUsed) {
    return { eligible: false, reason: 'PRO_TRIAL_ALREADY_USED' };
  }
  if (isSubscriptionInForce && subscription.status === 'TRIAL') {
    return { eligible: false, reason: 'PRO_TRIAL_ALREADY_ACTIVE' };
  }
  if (isSubscriptionInForce && subscription.status === 'ACTIVE' && subscription.plan.name === 'Pro') {
    return { eligible: false, reason: 'PRO_SUBSCRIPTION_ALREADY_ACTIVE' };
  }
  return { eligible: true };
}

const REASON_MESSAGES = {
  PRO_TRIAL_ALREADY_USED: 'This business has already used its one-time Pro trial.',
  PRO_TRIAL_ALREADY_ACTIVE: 'This business already has an active Pro trial.',
  PRO_SUBSCRIPTION_ALREADY_ACTIVE: 'This business already has an active Pro subscription.',
};

// Starts the shop's one-time 14-day Pro trial. Re-checks eligibility inside
// the same transaction as the writes (not just before it) so two
// near-simultaneous calls for the same shop — a double-tap on the "Start
// Trial" button — can't both pass the earlier read and both insert a
// trial; the second one always finds trialUsed already true once the
// first's transaction commits.
async function startTrial(shopId) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      throw new AppError('Shop not found', 404);
    }

    const latestSub = await tx.subscription.findFirst({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    const isInForce =
      latestSub &&
      (latestSub.status === 'ACTIVE' || latestSub.status === 'TRIAL') &&
      (!latestSub.endDate || new Date(latestSub.endDate) > new Date());

    if (shop.trialUsed) {
      throw new AppError(REASON_MESSAGES.PRO_TRIAL_ALREADY_USED, 409, { code: 'PRO_TRIAL_ALREADY_USED' });
    }
    if (isInForce && latestSub.status === 'TRIAL') {
      throw new AppError(REASON_MESSAGES.PRO_TRIAL_ALREADY_ACTIVE, 409, { code: 'PRO_TRIAL_ALREADY_ACTIVE' });
    }
    if (isInForce && latestSub.status === 'ACTIVE' && latestSub.plan.name === 'Pro') {
      throw new AppError(REASON_MESSAGES.PRO_SUBSCRIPTION_ALREADY_ACTIVE, 409, {
        code: 'PRO_SUBSCRIPTION_ALREADY_ACTIVE',
      });
    }

    const trialPlan = await tx.plan.findFirst({ where: { name: TRIAL_PLAN_NAME, isActive: true } });
    if (!trialPlan) {
      throw new AppError('Trial plan is not configured', 500);
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + TRIAL_DAYS);

    const created = await tx.subscription.create({
      data: { shopId, planId: trialPlan.id, status: 'TRIAL', startDate, endDate },
      include: { plan: true },
    });
    await tx.shop.update({ where: { id: shopId }, data: { trialUsed: true } });

    return created;
  });
}

module.exports = { canStartTrial, startTrial, TRIAL_DAYS, TRIAL_PLAN_NAME };
