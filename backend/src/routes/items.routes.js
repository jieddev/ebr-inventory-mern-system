const { Router } = require('express');
const { searchItems, listTypes, listCategories, createItem, listItemTransactions } = require('../controllers/items.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.use(requireAuth);
router.get('/search', searchItems);
router.get('/types', listTypes);
router.get('/categories', listCategories);
router.post('/', createItem);
router.get('/:id/transactions', listItemTransactions);

module.exports = router;
