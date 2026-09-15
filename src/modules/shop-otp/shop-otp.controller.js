const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-otp.service');

const sendOtp = asyncHandler(async (req, res) => {
  await service.sendOtp(req.body.phone);
  return ok(res, { sent: true });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const otpToken = service.verifyOtp(req.body.phone, req.body.otp);
  return ok(res, { otpToken });
});

module.exports = { sendOtp, verifyOtp };
