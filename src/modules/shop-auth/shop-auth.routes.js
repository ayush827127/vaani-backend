const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireOtpVerified } = require('../../middleware/otpVerified.middleware');
const { requireShop } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-auth.controller');

const registerSchema = z.object({
  name: z.string().min(1),
  ownerName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().optional(),
  otpToken: z.string().min(1),
});

const loginSchema = z.object({
  phone: z.string().min(1),
  otpToken: z.string().min(1),
});

// `phone` here is the NEW number, freshly OTP-verified — same shape as
// login/register so requireOtpVerified (which checks req.body.phone against
// the otpToken) works unmodified.
const changePhoneSchema = z.object({
  phone: z.string().min(1),
  otpToken: z.string().min(1),
});

const router = Router();

router.post('/register', validate(registerSchema), requireOtpVerified, controller.register);
router.post('/login', validate(loginSchema), requireOtpVerified, controller.login);
router.post(
  '/change-phone',
  requireShop,
  validate(changePhoneSchema),
  requireOtpVerified,
  controller.changePhone
);

module.exports = router;
