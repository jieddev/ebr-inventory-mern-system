import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import { getErrorMessage } from '../../api/auth'
import { createItem } from '../../api/items'
import { formatNumber } from '../../utils/format'
import plusIcon from '../../assets/icons/plus.svg'
import checkIcon from '../../assets/icons/check-circle.svg'
import ItemFields from './ItemFields'
import { EMPTY_ITEM_FORM, validateItemForm } from './itemForm'
import './AddItemPanel.css'

// Stays open after each save: the fields clear (except Category), a confirmation shows,
// and the item is added to "Added this session", so many items can be entered in a row.
export default function AddItemPanel({ onClose, onAdded, addedThisSession }) {
  const categoryRef = useRef(null)
  const codeRef = useRef(null)
  const [form, setForm] = useState(EMPTY_ITEM_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    categoryRef.current?.focus()
  }, [])

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const { errors: nextErrors, balanceForwarded } = validateItemForm(form)
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const item = await createItem({ ...form, balanceForwarded })
      setSuccessMessage(`“${item.code}” was added as ${item.itemId}. You can add another item.`)
      setForm({ ...EMPTY_ITEM_FORM, category: form.category })
      onAdded(item)
      codeRef.current?.focus()
    } catch (err) {
      setSuccessMessage('')
      if (err.response?.status === 409) setErrors({ code: err.response.data.message })
      else setFormError(getErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SidePanel
      title="Add Item"
      subtitle="Add a new item to the inventory list."
      onClose={onClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {!isSaving && <img src={plusIcon} alt="" />}
            Add Item
          </Button>
        </>
      }
    >
      {successMessage && (
        <div className="panel-alert panel-alert-success" role="status">
          <img src={checkIcon} alt="" width="20" height="20" />
          <p>{successMessage}</p>
        </div>
      )}
      {formError && (
        <div className="panel-alert panel-alert-error" role="alert">
          {formError}
        </div>
      )}

      <ItemFields
        form={form}
        errors={errors}
        onChange={setField}
        categoryRef={categoryRef}
        codeRef={codeRef}
      />

      {addedThisSession.length > 0 && (
        <section className="added-items">
          <h3>Added this session ({addedThisSession.length})</h3>
          <ul>
            {addedThisSession.map((item) => (
              <li key={item._id}>
                <span className="added-item-code">{item.code}</span>
                {item.category && <span className="added-item-category">{item.category}</span>}
                <span className="added-item-balance">Bal. fwd. {formatNumber(item.balanceForwarded)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SidePanel>
  )
}
