const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const service = require('./admin-audit-log.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.params.shopId, parsePagination(req.query));
  return ok(res, result);
});

module.exports = { list };
