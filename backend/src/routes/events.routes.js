const { Router } = require('express');
const { streamEvents } = require('../controllers/events.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Everyone signed in; each event only goes to the roles allowed to see it (events.service.js).
router.get('/', requireAuth, streamEvents);

module.exports = router;
