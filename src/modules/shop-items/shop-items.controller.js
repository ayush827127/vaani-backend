const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { parsePagination } = require('../../utils/pagination');
const auditLog = require('../../services/auditLog.service');
const service = require('./shop-items.service');

function adminActor(req) {
  return { actorType: 'ADMIN', adminId: req.admin.id, adminEmail: req.admin.email };
}

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const result = await service.list(req.params.shopId, { search, ...parsePagination(req.query) });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.shopId, req.params.id);
  return ok(res, item);
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.params.shopId, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'CREATE_ITEM',
    module: 'item',
    entityType: 'Item',
    entityId: item.id,
    metadata: adminActor(req),
  });
  return ok(res, item, 201);
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.shopId, req.params.id, req.body);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'UPDATE_ITEM',
    module: 'item',
    entityType: 'Item',
    entityId: item.id,
    metadata: adminActor(req),
  });
  return ok(res, item);
});

const remove = asyncHandler(async (req, res) => {
  // Snapshotted before deletion — otherwise this audit row would only ever
  // say "some uuid got deleted," never what it actually was.
  const existing = await service.getById(req.params.shopId, req.params.id);
  await service.remove(req.params.shopId, req.params.id);
  await auditLog.record({
    shopId: req.params.shopId,
    action: 'DELETE_ITEM',
    module: 'item',
    entityType: 'Item',
    entityId: req.params.id,
    metadata: { ...adminActor(req), name: existing.name },
  });
  return ok(res, { deleted: true });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No image file provided', 400);
  }
  const item = await service.setImage(req.params.shopId, req.params.id, req.file.buffer);
  return ok(res, item);
});

const removeImage = asyncHandler(async (req, res) => {
  const item = await service.clearImage(req.params.shopId, req.params.id);
  return ok(res, item);
});

module.exports = { list, getById, create, update, remove, uploadImage, removeImage };
