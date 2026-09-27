const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./user-auth.service');

const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.body.phone);
  return ok(res, result);
});

const selectShop = asyncHandler(async (req, res) => {
  const result = await service.selectShop(req.user.userId, req.body.shopId);
  return ok(res, result);
});

const me = asyncHandler(async (req, res) => {
  const result = await service.me(req.user.userId);
  return ok(res, { ...result, activeShopId: req.user.activeShopId });
});

module.exports = { login, selectShop, me };
