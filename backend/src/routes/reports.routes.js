const { Router } = require('express');
const { dailyReport } = require('../controllers/reports.controller');
const { requireAuth, requireStaff } = require('../middleware/auth');

const router = Router();

// Reports show stock and transaction dates: staff and admins only.
router.use(requireAuth, requireStaff);
router.get('/daily', dailyReport);

module.exports = router;
