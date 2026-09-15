const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-invoices.service');

const list = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await service.list(req.params.shopId, {
    search,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const invoice = await service.getById(req.params.shopId, req.params.id);
  return ok(res, invoice);
});

const create = asyncHandler(async (req, res) => {
  const invoice = await service.create(req.params.shopId, req.body);
  return ok(res, invoice, 201);
});

const update = asyncHandler(async (req, res) => {
  const invoice = await service.update(req.params.shopId, req.params.id, req.body);
  return ok(res, invoice);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.shopId, req.params.id);
  return ok(res, { deleted: true });
});

module.exports = { list, getById, create, update, remove };
