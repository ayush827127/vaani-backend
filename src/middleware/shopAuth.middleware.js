const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const prisma = require('../config/prisma');
const statusService = require('../modules/shop-status/shop-status.service');

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

module.exports = { requireShop, requireActiveShop, requireModule };
