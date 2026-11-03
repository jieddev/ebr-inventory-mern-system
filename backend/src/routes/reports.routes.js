const { Router } = require('express');
const { dailyReport, exportDailyReport } = require('../controllers/reports.controller');
const { requireAuth, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Reports show stock and transaction dates.
router.use(requireAuth, requirePermission('viewDailyReport'), resolveCostCenter);
router.get('/daily', dailyReport);
router.get('/daily/export', exportDailyReport);

module.exports = router;
