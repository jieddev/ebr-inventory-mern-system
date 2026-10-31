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
const { requireAuth, requireRole, requireWarehouse, resolveCostCenter } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');

// Every request works on one cost center's items (req.costCenter).
router.use(requireAuth, resolveCostCenter);
// Encoders: only what Add Item needs.
router.get('/types', listTypes);
router.get('/categories', listCategories);
router.post('/', createItem);

// Admins and encoders use the Items page; encoders get no stock fields (see listItems).
router.get('/', requireRole('admin', 'encoder'), listItems);
router.get('/search', requireWarehouse, searchItems);
router.get('/by-item-id/:itemId', requireWarehouse, findByItemId);
router.get('/facets', listFacets);
router.get('/export', adminOnly, exportItems);
router.post('/batch', adminOnly, batchItems);
// The Excel file is sent as the raw request body.
router.post('/import', adminOnly, express.raw({ type: () => true, limit: '25mb' }), importItems);
router.get('/:id/transactions', requireWarehouse, listItemTransactions);
router.patch('/:id', adminOnly, updateItem);
router.delete('/:id', adminOnly, archiveItem);
router.post('/:id/restore', adminOnly, restoreItem);

module.exports = router;
