const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const auditLog = require('../../services/auditLog.service');
const service = require('./shop-customers.service');

function adminActor(req) {
  return { actorType: 'ADMIN', adminId: req.admin.id, adminEmail: req.admin.email };
}

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const result = await service.list(req.params.shopId, { search, ...parsePagination(req.query) });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const customer = await service.getById(req.params.shopId, req.params.id);
  return ok(res, customer);
});

const create = asyncHandler(async (req, res) => {
  const customer = await service.create(req.params.shopId, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'CREATE_CUSTOMER',
    module: 'customer',
    entityType: 'Customer',
    entityId: customer.id,
    metadata: adminActor(req),
  });
  return ok(res, customer, 201);
});

const update = asyncHandler(async (req, res) => {
  const customer = await service.update(req.params.shopId, req.params.id, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'UPDATE_CUSTOMER',
    module: 'customer',
    entityType: 'Customer',
    entityId: customer.id,
    metadata: adminActor(req),
  });
  return ok(res, customer);
});

const remove = asyncHandler(async (req, res) => {
  const existing = await service.getById(req.params.shopId, req.params.id);
  await service.remove(req.params.shopId, req.params.id);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'DELETE_CUSTOMER',
    module: 'customer',
    entityType: 'Customer',
    entityId: req.params.id,
    metadata: { ...adminActor(req), name: existing.name },
  });
  return ok(res, { deleted: true });
});

module.exports = { list, getById, create, update, remove };
