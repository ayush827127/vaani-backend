const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./plans.controller');

const createSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
  isActive: z.boolean().optional(),
  moduleIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
