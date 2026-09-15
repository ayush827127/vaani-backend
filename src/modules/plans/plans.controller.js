const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./plans.service');

const list = asyncHandler(async (req, res) => {
  const plans = await service.list();
  return ok(res, plans);
});

const getById = asyncHandler(async (req, res) => {
  const plan = await service.getById(req.params.id);
  return ok(res, plan);
});

const create = asyncHandler(async (req, res) => {
  const plan = await service.create(req.body);
  return ok(res, plan, 201);
});

const update = asyncHandler(async (req, res) => {
  const plan = await service.update(req.params.id, req.body);
  return ok(res, plan);
});

const remove = asyncHandler(async (req, res) => {
  const plan = await service.remove(req.params.id);
  return ok(res, plan);
});

module.exports = { list, getById, create, update, remove };
