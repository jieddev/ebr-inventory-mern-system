const { Router } = require('express');
const { checkReportNo, createReceivingReport, createBatchOut, updateSlipDate } = require('../controllers/receiving.controller');
const { requireAuth, requireRole, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Anyone who can add transactions can enter a receiving report or a Batch Out slip.
router.use(requireAuth, requirePermission('addTransactions'), resolveCostCenter);
router.get('/check', checkReportNo);
router.post('/', createReceivingReport);
router.post('/out', createBatchOut);
// Admins move a whole slip (and every transaction on it) to another date.
router.patch('/by-transaction/:transactionId/date', requireRole('admin'), updateSlipDate);

module.exports = router;
