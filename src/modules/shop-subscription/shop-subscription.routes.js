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

module.exports = router;
