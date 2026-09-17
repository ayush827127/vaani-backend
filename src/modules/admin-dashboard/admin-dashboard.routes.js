const { Router } = require('express');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./admin-dashboard.controller');

const router = Router();

router.use(requireAdmin);

router.get('/summary', controller.summary);

module.exports = router;
