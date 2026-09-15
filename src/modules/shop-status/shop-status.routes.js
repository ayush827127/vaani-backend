const { Router } = require('express');
const { requireShop } = require('../../middleware/shopAuth.middleware');
const controller = require('./shop-status.controller');

const router = Router();

router.get('/me/status', requireShop, controller.getMyStatus);

module.exports = router;
