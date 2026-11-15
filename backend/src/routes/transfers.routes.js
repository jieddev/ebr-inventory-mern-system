const { Router } = require('express');
const { createTransfer } = require('../controllers/transfers.controller');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// Anyone who can add transactions and has two or more cost centers (admins: all). The body names
// both cost centers, so there's no X-Cost-Center (resolveCostCenter); the controller checks access.
router.use(requireAuth, requirePermission('addTransactions'));
router.post('/', createTransfer);

module.exports = router;
