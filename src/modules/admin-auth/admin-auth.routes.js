const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./admin-auth.controller');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const router = Router();

router.post('/login', validate(loginSchema), controller.login);
router.get('/me', requireAdmin, controller.me);

module.exports = router;
