const { Router } = require('express');
const { listTransactions, createTransaction } = require('../controllers/transactions.controller');
const { requireAuth, requireWarehouse } = require('../middleware/auth');

const router = Router();

router.use(requireAuth, requireWarehouse);
router.get('/', listTransactions);
router.post('/', createTransaction);

module.exports = router;
