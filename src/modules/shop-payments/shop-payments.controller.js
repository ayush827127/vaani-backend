const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const service = require('./shop-payments.service');

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const result = await service.list(req.params.shopId, { search, ...parsePagination(req.query) });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const payment = await service.getById(req.params.shopId, req.params.id);
  return ok(res, payment);
});

const create = asyncHandler(async (req, res) => {
  const payment = await service.create(req.params.shopId, req.body);
  return ok(res, payment, 201);
});

const update = asyncHandler(async (req, res) => {
  const payment = await service.update(req.params.shopId, req.params.id, req.body);
  return ok(res, payment);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.shopId, req.params.id);
  return ok(res, { deleted: true });
});

module.exports = { list, getById, create, update, remove };
