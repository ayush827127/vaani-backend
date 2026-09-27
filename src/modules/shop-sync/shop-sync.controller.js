const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-sync.service');

const sync = asyncHandler(async (req, res) => {
  // req.attributedUserId/req.membership are set only on the User-token path
  // (requireShopOrUserContext) — both undefined for a legacy Shop-token
  // request, in which case syncData() falls back to Phase 6's
  // resolveOwnerUserId(shopId) and applies no permission filtering at all,
  // exactly as before.
  const result = await service.syncData(req.shop.id, req.body, req.attributedUserId, req.membership);
  return ok(res, result);
});

const pull = asyncHandler(async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const result = await service.pullData(req.shop.id, since);
  return ok(res, result);
});

module.exports = { sync, pull };
