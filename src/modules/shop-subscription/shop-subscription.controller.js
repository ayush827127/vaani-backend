const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-subscription.service');
const trialService = require('./trial.service');

const listPlans = asyncHandler(async (req, res) => {
  const plans = await service.listPlans();
  return ok(res, plans);
});

const switchToFreePlan = asyncHandler(async (req, res) => {
  const subscription = await service.switchToFreePlan(req.shop.id, req.body.planId);
  return ok(res, subscription);
});

const createPaymentClaim = asyncHandler(async (req, res) => {
  const claim = await service.createPaymentClaim(req.shop.id, req.body);
  return ok(res, claim, 201);
});

const listMyPaymentClaims = asyncHandler(async (req, res) => {
  const claims = await service.listMyPaymentClaims(req.shop.id);
  return ok(res, claims);
});

const getInvoiceUsage = asyncHandler(async (req, res) => {
  const usage = await service.getInvoiceUsage(req.shop.id);
  return ok(res, usage);
});

const startTrial = asyncHandler(async (req, res) => {
  const subscription = await trialService.startTrial(req.shop.id);
  return ok(res, subscription, 201);
});

module.exports = {
  listPlans,
  switchToFreePlan,
  createPaymentClaim,
  listMyPaymentClaims,
  getInvoiceUsage,
  startTrial,
};
