const express = require('express');
const {
  listItems,
  searchItems,
  findByItemId,
  listTypes,
  listCategories,
  listBrands,
  similarItems,
  listFacets,
  createItem,
  updateItem,
  archiveItem,
  restoreItem,
  batchItems,
  importItems,
  latestImport,
  undoImport,
  exportItems,
  exportItemList,
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
router.get('/brands', usesItemChoices, listBrands);
router.post('/', requirePermission('addItems'), createItem);
// Add Item's "Do you mean this item?".
router.get('/similar', requirePermission('addItems'), similarItems);

// The Items page; stock fields only with viewItemStock (see listItems).
router.get('/', canViewItems, listItems);
// The item search on Add Transaction and Reconcile.
router.get('/search', requirePermission('addTransactions', 'reconcile'), searchItems);
router.get('/by-item-id/:itemId', canAddTransactions, findByItemId);
// The filter dropdown on the Items and Transactions pages.
router.get('/facets', requirePermission('viewItems', 'addTransactions'), listFacets);
router.get('/export', adminOnly, exportItems);
// The Items page's item list (no stock) as Excel.
router.get('/export/list', canViewItems, exportItemList);
router.post('/batch', adminOnly, batchItems);
// The Excel file is sent as the raw request body.
router.post('/import', adminOnly, express.raw({ type: () => true, limit: '25mb' }), importItems);
// Undo import: the newest import, and undoing it.
router.get('/imports/latest', adminOnly, latestImport);
router.post('/imports/:id/undo', adminOnly, undoImport);
router.get('/:id/transactions', canAddTransactions, listItemTransactions);
router.patch('/:id', adminOnly, updateItem);
router.delete('/:id', adminOnly, archiveItem);
router.post('/:id/restore', adminOnly, restoreItem);

module.exports = router;
