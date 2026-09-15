const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./subscriptions.controller');

const statusEnum = z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED']);

const createSchema = z.object({
  shopId: z.string().uuid(),
  planId: z.string().uuid(),
  status: statusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
});

const updateSchema = z.object({
  planId: z.string().uuid().optional(),
  status: statusEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
});

// Mounted at /api/admin — paths are relative to that prefix.
const router = Router();

router.use(requireAdmin);

router.get('/shops/:shopId/subscriptions', controller.listForShop);
router.post('/subscriptions', validate(createSchema), controller.create);
router.patch('/subscriptions/:id', validate(updateSchema), controller.update);

module.exports = router;
