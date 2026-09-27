const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-sync.service');

const sync = asyncHandler(async (req, res) => {
  // Set only on the User-token path (requireShopOrUserContext) — undefined
  // for a legacy Shop-token request, in which case syncData() falls back to
  // Phase 6's resolveOwnerUserId(shopId) exactly as before.
  const result = await service.syncData(req.shop.id, req.body, req.attributedUserId);
  return ok(res, result);
});

const pull = asyncHandler(async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const result = await service.pullData(req.shop.id, since);
  return ok(res, result);
});

module.exports = { sync, pull };
