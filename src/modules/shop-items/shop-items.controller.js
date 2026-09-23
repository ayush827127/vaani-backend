const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { parsePagination } = require('../../utils/pagination');
const service = require('./shop-products.service');

const list = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const result = await service.list(req.params.shopId, { search, ...parsePagination(req.query) });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const product = await service.getById(req.params.shopId, req.params.id);
  return ok(res, product);
});

const create = asyncHandler(async (req, res) => {
  const product = await service.create(req.params.shopId, req.body);
  return ok(res, product, 201);
});

const update = asyncHandler(async (req, res) => {
  const product = await service.update(req.params.shopId, req.params.id, req.body);
  return ok(res, product);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.shopId, req.params.id);
  return ok(res, { deleted: true });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No image file provided', 400);
  }
  const product = await service.setImage(req.params.shopId, req.params.id, req.file.buffer);
  return ok(res, product);
});

const removeImage = asyncHandler(async (req, res) => {
  const product = await service.clearImage(req.params.shopId, req.params.id);
  return ok(res, product);
});

module.exports = { list, getById, create, update, remove, uploadImage, removeImage };
