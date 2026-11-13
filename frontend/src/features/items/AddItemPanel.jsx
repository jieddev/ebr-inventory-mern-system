import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import { getErrorMessage } from '../../api/auth'
import { createItem, getSimilarItems } from '../../api/items'
import { formatNumber, todayInputValue } from '../../utils/format'
import TextField from '../../components/ui/TextField'
import plusIcon from '../../assets/icons/plus.svg'
import checkIcon from '../../assets/icons/check-circle.svg'
import ItemFields from './ItemFields'
import { EMPTY_ITEM_FORM, validateItemForm } from './itemForm'
import { useCostCenter } from '../costCenter/useCostCenter'
import { costCenterLabel } from '../../utils/costCenters'
import './AddItemPanel.css'

// Waits this long after the last keystroke before looking for similar items.
const SIMILAR_DELAY_MS = 300

// Existing items close to the typed description, for "Do you mean this item?". [] when none,
// while typing, or if the lookup fails (it's only a hint).
function useSimilarItems(code) {
  const [result, setResult] = useState({ code: '', items: [] })
  const text = code.trim()

  useEffect(() => {
    if (!text) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getSimilarItems(text, { signal: controller.signal })
        .then((items) => setResult({ code: text, items }))
        .catch(() => {
          if (!controller.signal.aborted) setResult({ code: text, items: [] })
        })
    }, SIMILAR_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  // Only show results for what's in the box now.
  return result.code === text ? result.items : []
}

// Stays open after each save: the fields clear (except Category), a confirmation shows,
// and the item is added to "Added this session", so many items can be entered in a row.
// initialCode fills in Item description, e.g. from a search that found nothing.
export default function AddItemPanel({ onClose, onAdded, addedThisSession, initialCode = '' }) {
  const { costCenter } = useCostCenter()
  const categoryRef = useRef(null)
  const codeRef = useRef(null)
  const [form, setForm] = useState(() => ({ ...EMPTY_ITEM_FORM, code: initialCode }))
  // Kept between saves, like Category: a batch of opening balances usually shares one date.
  const [balanceDate, setBalanceDate] = useState(todayInputValue)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const similarItems = useSimilarItems(form.code)

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
      // An empty date is saved as today (the server's today).
      const item = await createItem({ ...form, balanceForwarded, balanceForwardedDate: balanceDate })
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
      title={`Add Item for ${costCenterLabel(costCenter)}`}
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
        codeHint={similarItems.length > 0 && <SimilarItems items={similarItems} />}
      />

      <TextField
        label="Balance forwarded date"
        type="date"
        value={balanceDate}
        onChange={(e) => setBalanceDate(e.target.value)}
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

// Under Item description: existing items that look like the one being added.
function SimilarItems({ items }) {
  return (
    <div className="similar-items" role="status">
      <p>Please make sure that an item does not exist</p>
      <p className="similar-items-title">{items.length === 1 ? 'Do you mean this item?' : 'Do you mean one of these items?'}</p>
      <ul>
        {items.map((item) => (
          <li key={item._id}>
            <span className="similar-item-code">{item.code}</span>
            <span className="similar-item-meta">
              {[item.itemId, item.brand, item.category].filter(Boolean).join(' · ')}
              {item.isArchived && <span className="similar-item-archived">Archived</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
