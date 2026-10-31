const { Router } = require('express');
const { dailyReport, exportDailyReport } = require('../controllers/reports.controller');
const { requireAuth, requireWarehouse, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Reports show stock and transaction dates: warehouse users and admins only.
router.use(requireAuth, requireWarehouse, resolveCostCenter);
router.get('/daily', dailyReport);
router.get('/daily/export', exportDailyReport);

module.exports = router;
