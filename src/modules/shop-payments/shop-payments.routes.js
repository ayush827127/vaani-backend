const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./shop-payments.controller');

const createSchema = z.object({
  customerId: z.number().int(),
  invoiceId: z.number().int().nullable().optional(),
  type: z.string().min(1),
  amount: z.number(),
  paymentMode: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

// Mounted at /api/admin/shops/:shopId/payments
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
