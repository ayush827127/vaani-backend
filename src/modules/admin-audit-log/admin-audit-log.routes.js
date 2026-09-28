const { Router } = require('express');
const { requireAdmin } = require('../../middleware/auth.middleware');
const controller = require('./admin-audit-log.controller');

// Mounted at /api/admin/shops/:shopId/audit-log
const router = Router({ mergeParams: true });

router.use(requireAdmin);

router.get('/', controller.list);

module.exports = router;
