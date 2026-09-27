const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { hasPermission } = require('../services/permissions');

// Must run after requireActiveMembership (userAuth.middleware.js), which
// sets req.membership = { shopId, shopUserId, role }. Not attached to any
// route yet — see the Phase 4 plan for why there's nothing to attach it to
// until sync becomes user-aware.
function requirePermission(key) {
  return async (req, res, next) => {
    try {
      const overrides = await prisma.shopUserPermission.findMany({
        where: { shopUserId: req.membership.shopUserId },
        select: { permission: true, granted: true },
      });
      if (!hasPermission(req.membership.role, overrides, key)) {
        return next(new AppError(`Missing required permission: ${key}`, 403));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission };
