const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/apiResponse');

function handler(req, res) {
  return fail(res, 'Too many requests — please try again later.', 429);
}

// Baseline for all API traffic.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Tighter limit for auth endpoints — the targets for brute-force and
// SMS-cost abuse (admin login, shop send-otp/verify-otp/register/login).
// A factory, not a shared instance: admin-auth and shop-auth each need their
// own independent counter, or a burst against one surface (e.g. OTP spam)
// would also lock out the other (e.g. admin login) since express-rate-limit
// keys its store by IP alone, not by route.
function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
  });
}

module.exports = { globalLimiter, createAuthLimiter };
