const { Router } = require('express');
const { listTransactions, createTransaction } = require('../controllers/transactions.controller');
const { requireAuth, requireStaff } = require('../middleware/auth');

const router = Router();

router.use(requireAuth, requireStaff);
router.get('/', listTransactions);
router.post('/', createTransaction);

module.exports = router;
