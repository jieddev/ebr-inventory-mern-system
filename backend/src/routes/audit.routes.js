const { Router } = require('express');
const { listAuditLog, listAuditFacets } = require('../controllers/audit.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = Router();

// Read-only: there is no way to change or delete audit log entries.
router.use(requireAuth, requireRole('admin'));
router.get('/', listAuditLog);
router.get('/facets', listAuditFacets);

module.exports = router;
