const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./shop-invoices.controller');

const itemSchema = z.object({
  productId: z.number().int(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  sellingPrice: z.number(),
  gstRate: z.number().optional(),
});

const createSchema = z.object({
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().optional(),
  paymentMode: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  discountType: z.enum(['none', 'percent', 'flat']).optional(),
  discountValue: z.number().optional(),
  receivedAmount: z.number().optional(),
  items: z.array(itemSchema).min(1),
});

const updateSchema = z.object({
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().optional(),
  paymentMode: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  discountType: z.enum(['none', 'percent', 'flat']).optional(),
  discountValue: z.number().optional(),
  receivedAmount: z.number().optional(),
  items: z.array(itemSchema).optional(),
});

// Mounted at /api/admin/shops/:shopId/invoices
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
