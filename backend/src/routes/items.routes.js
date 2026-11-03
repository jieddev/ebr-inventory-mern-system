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
const { requireAuth, requireRole, requirePermission, resolveCostCenter } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');
const canAddTransactions = requirePermission('addTransactions');
const canViewItems = requirePermission('viewItems');

// Every request works on one cost center's items (req.costCenter).
router.use(requireAuth, resolveCostCenter);
// Choices for Add Item, the Items page filters and Add Transaction.
const usesItemChoices = requirePermission('addItems', 'viewItems', 'addTransactions');
router.get('/types', usesItemChoices, listTypes);
router.get('/categories', usesItemChoices, listCategories);
router.post('/', requirePermission('addItems'), createItem);

// The Items page; stock fields only with viewItemStock (see listItems).
router.get('/', canViewItems, listItems);
router.get('/search', canAddTransactions, searchItems);
router.get('/by-item-id/:itemId', canAddTransactions, findByItemId);
// The filter dropdown on the Items and Transactions pages.
router.get('/facets', requirePermission('viewItems', 'addTransactions'), listFacets);
router.get('/export', adminOnly, exportItems);
router.post('/batch', adminOnly, batchItems);
// The Excel file is sent as the raw request body.
router.post('/import', adminOnly, express.raw({ type: () => true, limit: '25mb' }), importItems);
router.get('/:id/transactions', canAddTransactions, listItemTransactions);
router.patch('/:id', adminOnly, updateItem);
router.delete('/:id', adminOnly, archiveItem);
router.post('/:id/restore', adminOnly, restoreItem);

module.exports = router;
