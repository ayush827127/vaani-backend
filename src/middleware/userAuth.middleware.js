const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const prisma = require('../config/prisma');

// Mirrors shopAuth.middleware.js's requireShop exactly, for the new
// User-scoped token — see the Phase 2 plan for why this exists alongside
// (not instead of) requireShop.
function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.scope !== 'user') {
      return next(new AppError('Invalid or expired token', 401));
    }
    req.user = decoded;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

// Re-derives authorization from the database on every request rather than
// trusting the token's activeShopId claim by itself — a client-supplied
// shopId (even one embedded in a token this same server issued) is only a
// selector, never authorization on its own, since membership can be revoked
// or a shop suspended after the token was issued. Must run after requireUser.
async function requireActiveMembership(req, res, next) {
  try {
    if (!req.user.activeShopId) {
      return next(new AppError('No business selected — call select-shop first', 404));
    }
    const membership = await prisma.shopUser.findFirst({
      where: { shopId: req.user.activeShopId, userId: req.user.userId },
      include: { shop: { select: { status: true } } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      return next(new AppError('You are not an active member of this business', 403));
    }
    if (membership.shop.status === 'SUSPENDED' || membership.shop.status === 'CANCELLED') {
      return next(new AppError('This business account is not active — contact support', 403));
    }
    req.membership = {
      shopId: membership.shopId,
      shopUserId: membership.id,
      role: membership.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireUser, requireActiveMembership };
