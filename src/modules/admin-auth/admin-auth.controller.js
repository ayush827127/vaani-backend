const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./admin-auth.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await service.login(email, password);
  return ok(res, result);
});

const me = asyncHandler(async (req, res) => {
  const result = await service.me(req.admin.id);
  return ok(res, result);
});

module.exports = { login, me };
