const express = require('express');
const {
  listItems,
  searchItems,
  listTypes,
  listCategories,
  createItem,
  importItems,
  exportItems,
  listItemTransactions,
} = require('../controllers/items.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');

router.use(requireAuth);
router.get('/', adminOnly, listItems);
router.get('/search', searchItems);
router.get('/types', listTypes);
router.get('/categories', listCategories);
router.get('/export', adminOnly, exportItems);
router.post('/', createItem);
// The Excel file is sent as the raw request body.
router.post('/import', adminOnly, express.raw({ type: () => true, limit: '25mb' }), importItems);
router.get('/:id/transactions', listItemTransactions);

module.exports = router;
