const { Router } = require('express');
const { dailyReport, exportDailyReport } = require('../controllers/reports.controller');
const { requireAuth, requireWarehouse } = require('../middleware/auth');

const router = Router();

// Reports show stock and transaction dates: warehouse users and admins only.
router.use(requireAuth, requireWarehouse);
router.get('/daily', dailyReport);
router.get('/daily/export', exportDailyReport);

module.exports = router;
