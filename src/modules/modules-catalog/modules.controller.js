const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./modules.service');

const list = asyncHandler(async (req, res) => {
  const modules = await service.list();
  return ok(res, modules);
});

const create = asyncHandler(async (req, res) => {
  const module_ = await service.create(req.body);
  return ok(res, module_, 201);
});

const update = asyncHandler(async (req, res) => {
  const module_ = await service.update(req.params.id, req.body);
  return ok(res, module_);
});

module.exports = { list, create, update };
