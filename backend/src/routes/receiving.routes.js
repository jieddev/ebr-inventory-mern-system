const { Router } = require('express');
const { checkReportNo, createReceivingReport } = require('../controllers/receiving.controller');
const { requireAuth, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Anyone who can add transactions can enter a receiving report.
router.use(requireAuth, requirePermission('addTransactions'), resolveCostCenter);
router.get('/check', checkReportNo);
router.post('/', createReceivingReport);

module.exports = router;
