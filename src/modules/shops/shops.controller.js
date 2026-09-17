const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { parsePagination } = require('../../utils/pagination');
const service = require('./shops.service');

const list = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const result = await service.list({ ...parsePagination(req.query), status, search });
  return ok(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const shop = await service.getById(req.params.id);
  return ok(res, shop);
});

const create = asyncHandler(async (req, res) => {
  const shop = await service.create(req.body);
  return ok(res, shop, 201);
});

const update = asyncHandler(async (req, res) => {
  const shop = await service.update(req.params.id, req.body);
  return ok(res, shop);
});

const setStatus = asyncHandler(async (req, res) => {
  const shop = await service.setStatus(req.params.id, req.body.status);
  return ok(res, shop);
});

const setModuleOverride = asyncHandler(async (req, res) => {
  const override = await service.setModuleOverride(
    req.params.id,
    req.params.moduleId,
    req.body.enabled
  );
  return ok(res, override);
});

const removeModuleOverride = asyncHandler(async (req, res) => {
  await service.removeModuleOverride(req.params.id, req.params.moduleId);
  return ok(res, { removed: true });
});

const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No image file provided', 400);
  }
  const shop = await service.setLogo(req.params.id, req.file.buffer);
  return ok(res, shop);
});

const removeLogo = asyncHandler(async (req, res) => {
  const shop = await service.clearLogo(req.params.id);
  return ok(res, shop);
});

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
  setModuleOverride,
  removeModuleOverride,
  uploadLogo,
  removeLogo,
};
