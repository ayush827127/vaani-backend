const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./modules.controller');

const createSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial();

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);

module.exports = router;
