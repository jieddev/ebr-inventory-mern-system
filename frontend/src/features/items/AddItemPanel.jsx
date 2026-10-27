import { useEffect, useId, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { createItem, getItemTypes } from '../../api/items'
import { formatNumber } from '../../utils/format'
import plusIcon from '../../assets/icons/plus.svg'
import checkIcon from '../../assets/icons/check-circle.svg'
import chevronIcon from '../../assets/icons/chevron-down.svg'
import './AddItemPanel.css'

const EMPTY_FORM = { code: '', brand: '', typeDesign: '', balanceForwarded: '' }

// Stays open after each save: the fields clear, a confirmation shows, and the item
// is added to "Added this session", so many items can be entered in a row.
export default function AddItemPanel({ onClose, onAdded, addedThisSession }) {
  const typesListId = useId()
  const codeRef = useRef(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [types, setTypes] = useState([])
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    codeRef.current?.focus()
    getItemTypes()
      .then(setTypes)
      .catch(() => setTypes([]))
  }, [])

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.code.trim()) nextErrors.code = 'Enter an item code'
    const balance = form.balanceForwarded === '' ? 0 : Number(form.balanceForwarded)
    if (!Number.isInteger(balance) || balance < 0) nextErrors.balanceForwarded = 'Enter a whole number, 0 or more'
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const item = await createItem({ ...form, balanceForwarded: balance })
      setSuccessMessage(`“${item.code}” was added. You can add another item.`)
      setForm(EMPTY_FORM)
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

      <TextField
        ref={codeRef}
        label="Item code"
        required
        placeholder="e.g. 185 R14 DUNLOP VANO1"
        autoComplete="off"
        value={form.code}
        onChange={(e) => setField('code', e.target.value)}
        error={errors.code}
      />

      <div className="panel-row">
        <TextField
          label="Brand name"
          placeholder="e.g. DUNLOP"
          autoComplete="off"
          value={form.brand}
          onChange={(e) => setField('brand', e.target.value)}
        />
        <TextField
          label="Type / Design"
          placeholder="Select type"
          autoComplete="off"
          list={typesListId}
          endIcon={chevronIcon}
          value={form.typeDesign}
          onChange={(e) => setField('typeDesign', e.target.value)}
        />
        <datalist id={typesListId}>
          {types.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
      </div>

      <TextField
        label="Balance forwarded"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        placeholder="0"
        value={form.balanceForwarded}
        onChange={(e) => setField('balanceForwarded', e.target.value)}
        error={errors.balanceForwarded}
        hint="Stock on hand when the item is added. Saved as an IN entry marked BALANCE FORWARDED."
      />

      {addedThisSession.length > 0 && (
        <section className="added-items">
          <h3>Added this session ({addedThisSession.length})</h3>
          <ul>
            {addedThisSession.map((item) => (
              <li key={item._id}>
                <span className="added-item-code">{item.code}</span>
                {item.typeDesign && <span className="added-item-type">{item.typeDesign}</span>}
                <span className="added-item-balance">Bal. fwd. {formatNumber(item.balanceForwarded)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SidePanel>
  )
}
