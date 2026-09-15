const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-sync.service');

const sync = asyncHandler(async (req, res) => {
  const result = await service.syncData(req.shop.id, req.body);
  return ok(res, result);
});

const pull = asyncHandler(async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const result = await service.pullData(req.shop.id, since);
  return ok(res, result);
});

module.exports = { sync, pull };
