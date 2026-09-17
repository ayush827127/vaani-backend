const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireShop, requireActiveShop } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-subscription.controller');

const switchFreeSchema = z.object({ planId: z.string().uuid() });

const createClaimSchema = z.object({
  planId: z.string().uuid(),
  // Client-generated idempotency key (a UUID) — see PaymentClaim's doc
  // comment in schema.prisma for why this must come from the client rather
  // than being server-generated.
  reference: z.string().min(8).max(128),
  amount: z.number().positive(),
});

// Mounted at /api/shop
const router = Router();

router.get('/plans', requireShop, controller.listPlans);
router.post(
  '/subscription/switch-free',
  requireShop,
  requireActiveShop,
  validate(switchFreeSchema),
  controller.switchToFreePlan
);
router.post(
  '/payment-claims',
  requireShop,
  requireActiveShop,
  validate(createClaimSchema),
  controller.createPaymentClaim
);
router.get('/payment-claims', requireShop, controller.listMyPaymentClaims);
router.get('/subscription/voice-usage', requireShop, controller.getVoiceUsage);

// TEMPORARY diagnostic aliases — identical handlers, neutral path names with
// no "payment"/"subscription" wording, to test whether something in front
// of this app (Render's own edge, not our code — confirmed by these routes'
// failing responses carrying a different CSP than helmet ever sets) is
// blocking on the URL text itself. Remove once the /payment-claims and
// /subscription/voice-usage failures are root-caused.
router.get('/_diag/claims-alias', requireShop, controller.listMyPaymentClaims);
router.get('/_diag/usage-alias', requireShop, controller.getVoiceUsage);

module.exports = router;
