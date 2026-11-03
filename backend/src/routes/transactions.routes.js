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
} = require('../controllers/transactions.controller');
const { requireAuth, requireRole, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = Router();

router.use(requireAuth, requirePermission('addTransactions'), resolveCostCenter);
router.get('/', listTransactions);
router.post('/', createTransaction);
// Before /:id, so "reservations" isn't read as a transaction ID.
router.get('/reservations', listReservations);
router.get('/reservations/count', reservationCounts);
router.get('/:id', getTransaction);
router.post('/:id/release', releaseReservation);
router.post('/:id/rollback', requireRole('admin'), rollbackTransaction);
router.delete('/:id', cancelReservation);

module.exports = router;
