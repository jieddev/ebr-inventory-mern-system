import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { updateItem } from '../../api/items'
import { formatNumber } from '../../utils/format'
import ItemFields from './ItemFields'
import { validateItemForm } from './itemForm'

// Admin only. Changing the balance forwarded also moves the item's current balance by
// the same amount, because the opening entry is re-run through the ledger.
export default function EditItemPanel({ item, onClose, onSaved }) {
  const categoryRef = useRef(null)
  const [form, setForm] = useState(() => ({
    category: item.category ?? '',
    code: item.code,
    brand: item.brand ?? '',
    typeDesign: item.typeDesign ?? '',
    balanceForwarded: String(item.balanceForwarded ?? 0),
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
    const { errors: nextErrors, balanceForwarded } = validateItemForm(form)
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const saved = await updateItem(item._id, { ...form, balanceForwarded })
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
    </SidePanel>
  )
}
