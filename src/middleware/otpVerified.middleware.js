const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

// Requires a short-lived otpToken (from POST /api/shop/auth/verify-otp)
// proving the request's phone number was just OTP-verified. Run after body
// validation so req.body.phone/otpToken are already present.
function requireOtpVerified(req, res, next) {
  const { otpToken, phone } = req.body;
  if (!otpToken) {
    return next(new AppError('OTP verification required', 401));
  }
  try {
    const decoded = verifyToken(otpToken);
    if (decoded.scope !== 'otp_verified' || decoded.phone !== phone) {
      return next(new AppError('OTP verification required', 401));
    }
    next();
  } catch (err) {
    next(new AppError('OTP verification expired — please verify again', 401));
  }
}

module.exports = { requireOtpVerified };
