const { Router } = require('express');
const { createUser } = require('../controllers/users.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = Router();

router.post('/', requireAuth, requireRole('admin'), createUser);

module.exports = router;
