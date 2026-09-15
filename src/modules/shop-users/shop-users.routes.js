const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./shop-users.controller');

const roleEnum = z.enum(['OWNER', 'MANAGER', 'CASHIER']);

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  role: roleEnum.optional(),
});

const updateSchema = createSchema.partial();

const accessSchema = z.object({
  moduleId: z.string().uuid(),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
});

// Mounted at /api/admin/shops/:shopId/users
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.listForShop);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.patch('/:id/access', validate(accessSchema), controller.setModuleAccess);

module.exports = router;
