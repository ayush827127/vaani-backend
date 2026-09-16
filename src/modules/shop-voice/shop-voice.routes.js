const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireShop, requireModule } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-voice.controller');

const parseSchema = z.object({ prompt: z.string().min(1) });

// Mounted at /api/shop
const router = Router();

// requireModule('billing') also subsumes the suspended/cancelled and
// expired-subscription cases (see shop-status.service.js) — this is the
// endpoint that costs real Groq API money per call, so it's the one place
// module gating is enforced server-side rather than trusted to the client.
router.post('/voice/parse', requireShop, requireModule('billing'), validate(parseSchema), controller.parse);

module.exports = router;
