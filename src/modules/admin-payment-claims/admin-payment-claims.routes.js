const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./admin-payment-claims.controller');

const rejectSchema = z.object({ note: z.string().max(500).optional() });

// Mounted at /api/admin/payment-claims
const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);
router.post('/:id/confirm', controller.confirm);
router.post('/:id/reject', validate(rejectSchema), controller.reject);

module.exports = router;
