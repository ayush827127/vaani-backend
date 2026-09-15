const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireShop } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-voice.controller');

const parseSchema = z.object({ prompt: z.string().min(1) });

// Mounted at /api/shop
const router = Router();

router.post('/voice/parse', requireShop, validate(parseSchema), controller.parse);

module.exports = router;
