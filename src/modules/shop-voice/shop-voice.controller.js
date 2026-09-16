const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./shop-voice.service');

const parse = asyncHandler(async (req, res) => {
  await service.checkVoiceInvoiceQuota(req.shop.id);
  const text = await service.parse(req.body.prompt);
  return ok(res, { text });
});

module.exports = { parse };
