const { Router } = require('express');
const { searchItems, listTypes, createItem, listItemTransactions } = require('../controllers/items.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);
router.get('/search', searchItems);
router.get('/types', listTypes);
router.post('/', createItem);
router.get('/:id/transactions', listItemTransactions);

module.exports = router;
