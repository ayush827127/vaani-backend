const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const { imageUpload } = require('../../middleware/imageUpload.middleware');
const controller = require('./shop-products.controller');

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  costPrice: z.number(),
  sellingPrice: z.number(),
  gstRate: z.number(),
  stockQuantity: z.number().int(),
  reorderLevel: z.number().int(),
  imagePath: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

// Mounted at /api/admin/shops/:shopId/products
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/image', imageUpload, controller.uploadImage);
router.delete('/:id/image', controller.removeImage);

module.exports = router;
