const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./subscriptions.service');

const listForShop = asyncHandler(async (req, res) => {
  const subscriptions = await service.listForShop(req.params.shopId);
  return ok(res, subscriptions);
});

const create = asyncHandler(async (req, res) => {
  const subscription = await service.create(req.body);
  return ok(res, subscription, 201);
});

const update = asyncHandler(async (req, res) => {
  const subscription = await service.update(req.params.id, req.body);
  return ok(res, subscription);
});

module.exports = { listForShop, create, update };
