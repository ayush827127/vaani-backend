const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireOtpVerified } = require('../../middleware/otpVerified.middleware');
const { requireUser } = require('../../middleware/userAuth.middleware');
const controller = require('./user-auth.controller');

const loginSchema = z.object({
  phone: z.string().min(1),
  otpToken: z.string().min(1),
});

const selectShopSchema = z.object({
  shopId: z.string().min(1),
});

const router = Router();

// Reuses the same OTP send/verify endpoints under /api/shop/auth
// (shop-otp.routes.js) — that flow is already phone-only with zero shop
// coupling, so there's no need for a parallel /api/user/otp surface.
router.post('/login', validate(loginSchema), requireOtpVerified, controller.login);
router.post('/select-shop', requireUser, validate(selectShopSchema), controller.selectShop);
router.get('/me', requireUser, controller.me);

module.exports = router;
