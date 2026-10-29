const { Router } = require('express');
const { listTransactions, getTransaction, createTransaction } = require('../controllers/transactions.controller');
const { requireAuth, requireWarehouse } = require('../middleware/auth');

const router = Router();

router.use(requireAuth, requireWarehouse);
router.get('/', listTransactions);
router.post('/', createTransaction);
router.get('/:id', getTransaction);

module.exports = router;
