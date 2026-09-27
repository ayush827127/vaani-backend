const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, scope: 'admin' },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function signShopToken(shop) {
  return jwt.sign({ id: shop.id, phone: shop.phone, scope: 'shop' }, env.jwtSecret, {
    expiresIn: env.shopJwtExpiresIn,
  });
}

// The new User-based identity (see the multi-user/multi-shop migration's
// Phase 2 plan) — activeShopId is null until a membership is selected via
// POST /api/user/auth/select-shop; a token with no activeShopId can
// authenticate (requireUser) but can't pass requireActiveMembership, by
// design. Reuses the same 180-day expiry as signShopToken: same "no refresh
// flow, re-auth needs a fresh OTP" reasoning already established for shops.
function signUserToken(user, activeShopId) {
  return jwt.sign(
    { userId: user.id, phone: user.phone, activeShopId: activeShopId ?? null, scope: 'user' },
    env.jwtSecret,
    { expiresIn: env.shopJwtExpiresIn }
  );
}

// Short-lived proof that a phone number was just OTP-verified — required by
// shop-auth's register/login so they no longer trust a bare phone number.
function signOtpToken(phone) {
  return jwt.sign({ phone, scope: 'otp_verified' }, env.jwtSecret, { expiresIn: '5m' });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signAdminToken, signShopToken, signUserToken, signOtpToken, verifyToken };
