const { Router } = require('express');
const { dashboard } = require('../controllers/dashboard.controller');
const { requireAuth, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Every signed-in user; the controller leaves out what their permissions don't cover.
router.get('/', requireAuth, resolveCostCenter, dashboard);

module.exports = router;
