const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./admin-dashboard.service');

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary();
  return ok(res, result);
});

module.exports = { summary };
