const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { parsePagination } = require('../../utils/pagination');
const service = require('./shop-items.service');

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
  return ok(res, item, 201);
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.shopId, req.params.id, req.body);
  return ok(res, item);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.shopId, req.params.id);
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
