const { Router } = require('express');
const { streamEvents } = require('../controllers/events.controller');
const { requireAuth, resolveCostCenter } = require('../middleware/auth');

const router = Router();

// Everyone signed in; each event only goes to the roles and cost center allowed to see it (events.service.js).
router.get('/', requireAuth, resolveCostCenter, streamEvents);

module.exports = router;
