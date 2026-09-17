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

// Not createSchema.partial() — key is deliberately excluded (it's the
// stable identifier plans/overrides/module-access reference by; changing it
// after creation would silently detach all of those) and description needs
// to accept `null` to actually be clearable, not just omittable.
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

const router = Router();

router.use(requireAdmin);

router.get('/', controller.list);
router.post('/', validate(createSchema), controller.create);
router.patch('/:id', validate(updateSchema), controller.update);

module.exports = router;
