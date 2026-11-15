// Shared by Add Item and Edit Item (see ItemFields.jsx).
export const EMPTY_ITEM_FORM = { category: '', code: '', brand: '', balanceForwarded: '', lowStockThreshold: '' }

// Checks the form the same way the API does. Returns the errors, the parsed balance and the
// parsed low-stock threshold (null when blank: no alert).
export function validateItemForm(form) {
  const errors = {}
  if (!form.category) errors.category = 'Select a category'
  if (!form.code.trim()) errors.code = 'Enter an item description'
  const balanceForwarded = form.balanceForwarded === '' ? 0 : Number(form.balanceForwarded)
  // Negative is allowed: the item starts with more out than on hand.
  if (!Number.isInteger(balanceForwarded)) {
    errors.balanceForwarded = 'Enter a whole number'
  }
  const thresholdText = String(form.lowStockThreshold ?? '').trim()
  const lowStockThreshold = thresholdText === '' ? null : Number(thresholdText)
  if (lowStockThreshold !== null && !(Number.isInteger(lowStockThreshold) && lowStockThreshold >= 0)) {
    errors.lowStockThreshold = 'Enter a whole number of 0 or more'
  }
  return { errors, balanceForwarded, lowStockThreshold }
}
