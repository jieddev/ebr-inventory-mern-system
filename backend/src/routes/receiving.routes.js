const { Router } = require('express');
const { checkReportNo, createReceivingReport, createBatchOut } = require('../controllers/receiving.controller');
const { requireAuth, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Anyone who can add transactions can enter a receiving report or a Batch Out slip.
router.use(requireAuth, requirePermission('addTransactions'), resolveCostCenter);
router.get('/check', checkReportNo);
router.post('/', createReceivingReport);
router.post('/out', createBatchOut);

module.exports = router;
