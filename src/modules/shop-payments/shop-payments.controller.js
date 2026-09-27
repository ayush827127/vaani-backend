const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const auditLog = require('../../services/auditLog.service');
const service = require('./shop-payments.service');

function adminActor(req) {
  return { actorType: 'ADMIN', adminId: req.admin.id, adminEmail: req.admin.email };
}

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
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'PAYMENT_RECEIVED',
    module: 'payment',
    entityType: 'PaymentTransaction',
    entityId: payment.id,
    metadata: { ...adminActor(req), amount: payment.amount, type: payment.type },
  });
  return ok(res, payment, 201);
});

const update = asyncHandler(async (req, res) => {
  const payment = await service.update(req.params.shopId, req.params.id, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'PAYMENT_UPDATED',
    module: 'payment',
    entityType: 'PaymentTransaction',
    entityId: payment.id,
    metadata: { ...adminActor(req), amount: payment.amount, type: payment.type },
  });
  return ok(res, payment);
});

const remove = asyncHandler(async (req, res) => {
  const existing = await service.getById(req.params.shopId, req.params.id);
  await service.remove(req.params.shopId, req.params.id);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'PAYMENT_DELETED',
    module: 'payment',
    entityType: 'PaymentTransaction',
    entityId: req.params.id,
    metadata: { ...adminActor(req), amount: existing.amount, type: existing.type },
  });
  return ok(res, { deleted: true });
});

module.exports = { list, getById, create, update, remove };
