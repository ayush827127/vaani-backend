const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const controller = require('./shop-otp.controller');

const phoneSchema = z.object({ phone: z.string().length(10) });
const verifySchema = z.object({ phone: z.string().length(10), otp: z.string().length(6) });

// Mounted at /api/shop/auth, alongside shop-auth's register/login.
const router = Router();

router.post('/send-otp', validate(phoneSchema), controller.sendOtp);
router.post('/verify-otp', validate(verifySchema), controller.verifyOtp);

module.exports = router;
