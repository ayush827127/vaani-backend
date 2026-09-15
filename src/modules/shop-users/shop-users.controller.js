const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-users.service');

const listForShop = asyncHandler(async (req, res) => {
  const users = await service.listForShop(req.params.shopId);
  return ok(res, users);
});

const create = asyncHandler(async (req, res) => {
  const user = await service.create(req.params.shopId, req.body);
  return ok(res, user, 201);
});

const update = asyncHandler(async (req, res) => {
  const user = await service.update(req.params.shopId, req.params.id, req.body);
  return ok(res, user);
});

const setModuleAccess = asyncHandler(async (req, res) => {
  const access = await service.setModuleAccess(
    req.params.shopId,
    req.params.id,
    req.body.moduleId,
    req.body
  );
  return ok(res, access);
});

module.exports = { listForShop, create, update, setModuleAccess };
