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

// Short-lived proof that a phone number was just OTP-verified — required by
// shop-auth's register/login so they no longer trust a bare phone number.
function signOtpToken(phone) {
  return jwt.sign({ phone, scope: 'otp_verified' }, env.jwtSecret, { expiresIn: '5m' });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signAdminToken, signShopToken, signOtpToken, verifyToken };
