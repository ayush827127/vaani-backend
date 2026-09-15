const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const { imageUpload } = require('../../middleware/imageUpload.middleware');
const controller = require('./shops.controller');

const statusEnum = z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']);

const createSchema = z.object({
  name: z.string().min(1),
  ownerName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().optional(),
  status: statusEnum.optional(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({ status: statusEnum });

const moduleOverrideSchema = z.object({ enabled: z.boolean() });

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.patch('/:id/status', validate(statusSchema), controller.setStatus);
router.patch(
  '/:id/modules/:moduleId',
  validate(moduleOverrideSchema),
  controller.setModuleOverride
);
router.post('/:id/logo', imageUpload, controller.uploadLogo);
router.delete('/:id/logo', controller.removeLogo);

module.exports = router;
