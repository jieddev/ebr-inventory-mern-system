const { Router } = require('express');
const { listAuditLog } = require('../controllers/audit.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = Router();

// Read-only: there is no way to change or delete audit log entries.
router.get('/', requireAuth, requireRole('admin'), listAuditLog);

module.exports = router;
