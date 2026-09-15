const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-status.service');

const getMyStatus = asyncHandler(async (req, res) => {
  const status = await service.getStatus(req.shop.id);
  return ok(res, status);
});

module.exports = { getMyStatus };
