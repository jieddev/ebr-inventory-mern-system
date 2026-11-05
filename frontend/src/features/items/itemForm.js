// Shared by Add Item and Edit Item (see ItemFields.jsx).
export const EMPTY_ITEM_FORM = { category: '', code: '', brand: '', balanceForwarded: '' }

// Checks the form the same way the API does. Returns the errors and the parsed balance.
export function validateItemForm(form) {
  const errors = {}
  if (!form.category) errors.category = 'Select a category'
  if (!form.code.trim()) errors.code = 'Enter an item description'
  const balanceForwarded = form.balanceForwarded === '' ? 0 : Number(form.balanceForwarded)
  if (!Number.isInteger(balanceForwarded) || balanceForwarded < 0) {
    errors.balanceForwarded = 'Enter a whole number, 0 or more'
  }
  return { errors, balanceForwarded }
}
