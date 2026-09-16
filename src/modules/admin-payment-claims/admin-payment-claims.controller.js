const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const service = require('./admin-payment-claims.service');

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const result = await service.list({ status, ...parsePagination(req.query) });
  return ok(res, result);
});

const confirm = asyncHandler(async (req, res) => {
  const result = await service.confirm(req.params.id, req.admin.email);
  return ok(res, result);
});

const reject = asyncHandler(async (req, res) => {
  const claim = await service.reject(req.params.id, req.admin.email, req.body.note);
  return ok(res, claim);
});

module.exports = { list, confirm, reject };
