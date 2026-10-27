const { Router } = require('express');
const { streamEvents } = require('../controllers/events.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, streamEvents);

module.exports = router;
