const { Router } = require('express');
const {
  listTransactions,
  listBis,
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
// viewTransactions only reads the Transactions page (the list and one entry); the rest needs addTransactions.
const canAdd = requirePermission('addTransactions');

router.use(requireAuth, requirePermission('addTransactions', 'viewTransactions'), resolveCostCenter);
router.get('/', listTransactions);
router.post('/', canAdd, createTransaction);
// Before /:id, so "bis" isn't read as a transaction ID.
router.get('/bis', listBis);
// Before /:id, so "reservations" isn't read as a transaction ID.
router.get('/reservations', canAdd, listReservations);
router.get('/reservations/count', canAdd, reservationCounts);
// Adjust to Count (physical count), admins only.
router.get('/adjust/preview', requireRole('admin'), adjustPreview);
router.post('/adjust', requireRole('admin'), adjustToCount);
router.get('/:id', getTransaction);
router.post('/:id/release', canAdd, releaseReservation);
router.post('/:id/rollback', requireRole('admin'), rollbackTransaction);
router.patch('/:id', requireRole('admin'), updateTransaction);
router.delete('/:id', canAdd, cancelReservation);

module.exports = router;
