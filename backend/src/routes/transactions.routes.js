const { Router } = require('express');
const {
  listTransactions,
  getTransaction,
  createTransaction,
  listReservations,
  reservationCounts,
  releaseReservation,
  cancelReservation,
  rollbackTransaction,
  updateTransaction,
  adjustPreview,
  adjustToCount,
} = require('../controllers/transactions.controller');
const { requireAuth, requireRole, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

router.use(requireAuth, requirePermission('addTransactions'), resolveCostCenter);
router.get('/', listTransactions);
router.post('/', createTransaction);
// Before /:id, so "reservations" isn't read as a transaction ID.
router.get('/reservations', listReservations);
router.get('/reservations/count', reservationCounts);
// Adjust to Count (physical count), admins only.
router.get('/adjust/preview', requireRole('admin'), adjustPreview);
router.post('/adjust', requireRole('admin'), adjustToCount);
router.get('/:id', getTransaction);
router.post('/:id/release', releaseReservation);
router.post('/:id/rollback', requireRole('admin'), rollbackTransaction);
router.patch('/:id', requireRole('admin'), updateTransaction);
router.delete('/:id', cancelReservation);

module.exports = router;
