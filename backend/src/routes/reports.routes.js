const { Router } = require('express');
const {
  dailyReport,
  exportDailyReport,
  transactionReport,
  exportTransactionReport,
} = require('../controllers/reports.controller');
const { requireAuth, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Reports show stock and transaction dates; each report has its own permission.
router.use(requireAuth, resolveCostCenter);

const daily = requirePermission('viewDailyReport');
router.get('/daily', daily, dailyReport);
router.get('/daily/export', daily, exportDailyReport);

const transactions = requirePermission('viewTransactionReport');
router.get('/transactions', transactions, transactionReport);
router.get('/transactions/export', transactions, exportTransactionReport);

module.exports = router;
