import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { updateItem } from '../../api/items'
import { formatDate, formatNumber } from '../../utils/format'
import checkIcon from '../../assets/icons/check-circle.svg'
import ItemFields from './ItemFields'
import { validateItemForm } from './itemForm'

// Admin only. Changing the balance forwarded also moves the item's current balance by
// the same amount, because the opening entry is re-run through the ledger. The "Correct balance"
// mark is toggled right away (not on Save) through onToggleCheck.
export default function EditItemPanel({ item, onClose, onSaved, onToggleCheck, isChecking = false }) {
  const categoryRef = useRef(null)
  const [form, setForm] = useState(() => ({
    category: item.category ?? '',
    code: item.code,
    brand: item.brand ?? '',
    // No longer editable, but sent back unchanged so saving doesn't clear it.
    typeDesign: item.typeDesign ?? '',
    balanceForwarded: String(item.balanceForwarded ?? 0),
    lowStockThreshold: item.lowStockThreshold == null ? '' : String(item.lowStockThreshold),
  }))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    categoryRef.current?.focus()
  }, [])

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  const newBalanceForwarded = Number(form.balanceForwarded || 0)
  const balanceDelta = Number.isInteger(newBalanceForwarded) ? newBalanceForwarded - item.balanceForwarded : 0
  const balanceHint = balanceDelta
    ? `Current balance will change from ${formatNumber(item.balance)} to ${formatNumber(item.balance + balanceDelta)}.`
    : ''

  async function handleSubmit(event) {
    event.preventDefault()
    const { errors: nextErrors, balanceForwarded, lowStockThreshold } = validateItemForm(form)
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const saved = await updateItem(item._id, { ...form, balanceForwarded, lowStockThreshold })
      onSaved(saved)
    } catch (err) {
      if (err.response?.status === 409) setErrors({ code: err.response.data.message })
      else setFormError(getErrorMessage(err))
      setIsSaving(false)
    }
  }

  return (
    <SidePanel
      title="Edit Item"
      subtitle={`${item.itemId} · ${item.code}`}
      onClose={onClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Save changes
          </Button>
        </>
      }
    >
      {formError && (
        <div className="panel-alert panel-alert-error" role="alert">
          {formError}
        </div>
      )}

      <TextField label="Item ID" readOnly tabIndex={-1} value={item.itemId} hint="Item IDs never change." />

      <ItemFields
        form={form}
        errors={errors}
        onChange={setField}
        categoryRef={categoryRef}
        balanceHint={balanceHint}
      />

      <BalanceCheck check={item.balanceCheck} onToggle={onToggleCheck} isBusy={isChecking} />
    </SidePanel>
  )
}

// Whether an admin marked the current balance as matching the actual count, with the toggle.
function BalanceCheck({ check, onToggle, isBusy }) {
  return (
    <div className="edit-item-check">
      <div className="edit-item-check-text">
        <span className="edit-item-check-label">Correct balance</span>
        {check ? (
          <span className="edit-item-check-status">
            <img src={checkIcon} alt="" width="16" height="16" />
            {formatDate(check.on)}
            {check.byName && ` · ${check.byName}`} · balance then {formatNumber(check.balance)}
          </span>
        ) : (
          <span className="edit-item-check-status">Not marked yet.</span>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onToggle}
        isLoading={isBusy}
        title={check ? 'Remove the "Correct balance" mark' : 'The current balance matches the actual count'}
      >
        {check ? 'Unmark' : 'Mark correct'}
      </Button>
    </div>
  )
}
