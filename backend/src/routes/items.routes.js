const express = require('express');
const {
  listItems,
  searchItems,
  findByItemId,
  listTypes,
  listCategories,
  listFacets,
  createItem,
  updateItem,
  archiveItem,
  restoreItem,
  batchItems,
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
router.get('/by-item-id/:itemId', findByItemId);
router.get('/types', listTypes);
router.get('/categories', listCategories);
router.get('/facets', listFacets);
router.get('/export', adminOnly, exportItems);
router.post('/', createItem);
router.post('/batch', adminOnly, batchItems);
// The Excel file is sent as the raw request body.
router.post('/import', adminOnly, express.raw({ type: () => true, limit: '25mb' }), importItems);
router.get('/:id/transactions', listItemTransactions);
router.patch('/:id', adminOnly, updateItem);
router.delete('/:id', adminOnly, archiveItem);
router.post('/:id/restore', adminOnly, restoreItem);

module.exports = router;
