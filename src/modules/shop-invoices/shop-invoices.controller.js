const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination } = require('../../utils/pagination');
const auditLog = require('../../services/auditLog.service');
const service = require('./shop-invoices.service');

function adminActor(req) {
  return { actorType: 'ADMIN', adminId: req.admin.id, adminEmail: req.admin.email };
}

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const result = await service.list(req.params.shopId, { search, ...parsePagination(req.query) });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const invoice = await service.getById(req.params.shopId, req.params.id);
  return ok(res, invoice);
});

const create = asyncHandler(async (req, res) => {
  const invoice = await service.create(req.params.shopId, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'CREATE_BILL',
    module: 'invoice',
    entityType: 'Invoice',
    entityId: invoice.id,
    metadata: { ...adminActor(req), invoiceNumber: invoice.invoiceNumber },
  });
  return ok(res, invoice, 201);
});

const update = asyncHandler(async (req, res) => {
  const invoice = await service.update(req.params.shopId, req.params.id, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'UPDATE_BILL',
    module: 'invoice',
    entityType: 'Invoice',
    entityId: invoice.id,
    metadata: { ...adminActor(req), invoiceNumber: invoice.invoiceNumber },
  });
  return ok(res, invoice);
});

const remove = asyncHandler(async (req, res) => {
  const existing = await service.getById(req.params.shopId, req.params.id);
  await service.remove(req.params.shopId, req.params.id);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'DELETE_BILL',
    module: 'invoice',
    entityType: 'Invoice',
    entityId: req.params.id,
    metadata: { ...adminActor(req), invoiceNumber: existing.invoiceNumber },
  });
  return ok(res, { deleted: true });
});

module.exports = { list, getById, create, update, remove };
