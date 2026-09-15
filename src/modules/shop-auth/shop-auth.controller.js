const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.body);
  return ok(res, result, 201);
});

const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.body.phone);
  return ok(res, result);
});

module.exports = { register, login };
