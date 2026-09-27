const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const prisma = require('../config/prisma');
const statusService = require('../modules/shop-status/shop-status.service');

// Accepts EITHER a legacy Shop-scoped token OR the new User-scoped token
// with an active, verified membership — needed because an invited staff
// member's phone is never Shop.phone, so a legacy token can never be
// issued to them; without this, their device could never sync the shop's
// data at all. A legacy token behaves byte-for-byte identically to
// requireShop (same req.shop shape) — this is additive, not a replacement.
// Only used on the two sync routes for now; every other shop-facing route
// stays on requireShop/requireUser as before.
async function requireShopOrUserContext(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }

  if (decoded.scope === 'shop') {
    req.shop = decoded;
    return next();
  }

  if (decoded.scope === 'user') {
    if (!decoded.activeShopId) {
      return next(new AppError('No business selected — call select-shop first', 404));
    }
    try {
      const membership = await prisma.shopUser.findFirst({
        where: { shopId: decoded.activeShopId, userId: decoded.userId },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        return next(new AppError('You are not an active member of this business', 403));
      }
      // Same shape requireShop already produces — every downstream
      // controller/service (which only ever reads req.shop.id) needs zero
      // changes; requireActiveShop right after this in the route chain
      // re-queries Shop.status purely from req.shop.id, so it works
      // identically for both paths without any modification either.
      req.shop = { id: decoded.activeShopId, scope: 'user' };
      req.attributedUserId = decoded.userId;
      // Same shape requireActiveMembership already produces — lets
      // syncData() resolve this user's effective permissions and filter the
      // push accordingly. Never set on the legacy-token branch, which is
      // exactly what tells syncData() to skip permission filtering entirely
      // for a shop's own device.
      req.membership = { shopId: membership.shopId, shopUserId: membership.id, role: membership.role };
      return next();
    } catch (err) {
      return next(err);
    }
  }

  return next(new AppError('Invalid or expired token', 401));
}

function requireShop(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.scope !== 'shop') {
      return next(new AppError('Invalid or expired token', 401));
    }
    req.shop = decoded;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

// A valid JWT alone doesn't mean the shop should still be able to *do*
// anything — SUSPENDED/CANCELLED was previously enforced only by the module
// list the client happens to read from /me/status, so a shop in either state
// (or a client that ignores that list) could keep calling data-bearing
// endpoints indefinitely on its 180-day token. Must run after requireShop.
async function requireActiveShop(req, res, next) {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: req.shop.id },
      select: { status: true },
    });
    if (!shop) return next(new AppError('Shop not found', 404));
    if (shop.status === 'SUSPENDED' || shop.status === 'CANCELLED') {
      return next(new AppError('This shop account is not active — contact support', 403));
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Blocks access unless [moduleKey] is currently granted — the same
// subscription-in-force + override logic /me/status uses to decide what the
// client shows, now enforced server-side too so an expired trial/
// subscription (or a suspended/cancelled shop, which this subsumes — see
// shop-status.service.js) can't keep calling a paid endpoint like voice
// parsing just because the client didn't bother checking, or is stale.
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const status = await statusService.getStatus(req.shop.id);
      if (!status.modules.includes(moduleKey)) {
        return next(
          new AppError(`The "${moduleKey}" module is not enabled for this shop`, 403)
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireShop, requireShopOrUserContext, requireActiveShop, requireModule };
