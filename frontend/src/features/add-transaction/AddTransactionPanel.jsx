import { useEffect, useRef, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SegmentedControl from '../../components/ui/SegmentedControl'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { getItemByItemId, getItemTransactions } from '../../api/items'
import { createTransaction } from '../../api/transactions'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatDate, formatNumber, todayInputValue } from '../../utils/format'
import { isCompleteItemId, parseItemId } from '../../utils/itemId'
import ItemCodePicker from './ItemCodePicker'
import ReceivingReportPanel from './ReceivingReportPanel'
import checkIcon from '../../assets/icons/check-circle.svg'
import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import './AddTransactionPanel.css'

const TYPE_OPTIONS = [
  { value: 'IN', label: 'IN', icon: dotIn, tone: 'in' },
  { value: 'OUT', label: 'OUT', icon: dotOut, tone: 'out' },
]

// The item is found by its Item ID (typed in full, or short like "12" + Enter) or picked
// by item code; either way the other fields fill in.
// After saving, the item, quantity and customer clear for the next entry. Date and
// IN/OUT are kept, since entries are usually typed in batches from the same day.
function SingleEntryPanel({ onClose, onSaved, modeToggle, isActive }) {
  const idRef = useRef(null)
  const codeRef = useRef(null)
  const dateRef = useRef(null)
  const quantityRef = useRef(null)
  const customerRef = useRef(null)
  const [idText, setIdText] = useState('')
  // The ID to look up (attempt changes on every request, so asking again retries),
  // and the result of the last finished lookup.
  const [lookup, setLookup] = useState({ itemId: '', attempt: 0 })
  const [idResult, setIdResult] = useState({ attempt: 0, error: '' })
  const [codeText, setCodeText] = useState('')
  const [item, setItem] = useState(null)
  const [date, setDate] = useState(todayInputValue)
  const [type, setType] = useState('OUT')
  const [quantity, setQuantity] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // The warning shown on Save: { missing: [{ label, message, ref }] } or { noCustomer: true }.
  const [warning, setWarning] = useState(null)

  useEffect(() => {
    if (isActive) idRef.current?.focus()
  }, [isActive])

  useEffect(() => {
    const { itemId, attempt } = lookup
    if (!itemId) return
    const controller = new AbortController()
    getItemByItemId(itemId, { signal: controller.signal })
      .then((found) => {
        setIdResult({ attempt, error: '' })
        setItem(found)
        setCodeText(found.code)
        setErrors((e) => ({ ...e, item: undefined }))
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setIdResult({ attempt, error: getErrorMessage(err, 'Could not look up this item ID.') })
      })
    return () => controller.abort()
  }, [lookup])

  // Keep the selected item's balance current when another PC records a transaction
  // for it, so "Balance after saving" is never based on an old number.
  useLiveUpdates(({ itemId, reconnected }) => {
    if (!item || (!reconnected && itemId !== item._id)) return
    getItemTransactions(item._id)
      .then(({ item: fresh }) => setItem((current) => (current?._id === fresh._id ? fresh : current)))
      .catch(() => {}) // keep showing the last known balance
  })

  function clearError(name) {
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  const findId = (itemId) => setLookup((l) => ({ itemId, attempt: l.attempt + 1 }))

  const isLookingUp = Boolean(lookup.itemId) && idResult.attempt !== lookup.attempt
  const idError = lookup.itemId && !isLookingUp ? idResult.error : ''

  function handleIdChange(text) {
    setIdText(text)
    setItem(null)
    setCodeText('')
    clearError('item')
    findId(isCompleteItemId(text) ? parseItemId(text) : '')
  }

  // Enter or leaving the field looks up a short ID such as "12". Asking again after
  // "not found" retries; a lookup already running or done isn't repeated.
  function findIdNow() {
    const itemId = parseItemId(idText)
    if (!itemId || item?.itemId === itemId) return
    if (itemId === lookup.itemId && (isLookingUp || !idError)) return
    setIdText(itemId)
    findId(itemId)
  }

  function handleCodeChange(text) {
    setCodeText(text)
    setItem(null)
    // The ID belonged to the item that was picked before.
    setIdText('')
    findId('')
    clearError('item')
  }

  function handleSelect(picked) {
    setItem(picked)
    setCodeText(picked.code)
    setIdText(picked.itemId ?? '')
    findId('')
    clearError('item')
  }

  const idHint = isLookingUp
    ? `Looking up ${lookup.itemId}…`
    : item
      ? `Found ${item.itemId}.`
      : 'e.g. ITM-00012, or just 12 and press Enter. Or pick the item by its code below.'

  const qty = Number(quantity)
  const hasQty = quantity !== '' && Number.isInteger(qty) && qty > 0
  const balanceAfter = item && hasQty ? item.balance + (type === 'IN' ? qty : -qty) : null
  const isBackDated = item?.lastTransactionDate && date && date < item.lastTransactionDate.slice(0, 10)

  // Save checks the fields first: anything required that's missing or wrong opens a
  // warning listing it; an empty customer name asks before saving.
  function handleSubmit(event) {
    event.preventDefault()
    const missing = []
    if (!item) {
      missing.push({
        key: 'item',
        label: 'Item',
        message: codeText.trim() ? 'Pick the item from the list' : 'Enter an item ID or pick an item code',
        ref: codeText.trim() ? codeRef : idRef,
      })
    }
    if (!date) missing.push({ key: 'date', label: 'Date', message: 'Pick a date', ref: dateRef })
    if (!hasQty) {
      missing.push({ key: 'quantity', label: 'Quantity', message: 'Enter a whole number, 1 or more', ref: quantityRef })
    }
    setErrors(Object.fromEntries(missing.map(({ key, message }) => [key, message])))
    setFormError('')

    if (missing.length) setWarning({ missing })
    else if (!customerName.trim()) setWarning({ noCustomer: true })
    else save()
  }

  function closeWarning() {
    const field = warning?.missing?.[0]?.ref
    setWarning(null)
    // After the dialog has closed and handed focus back to the Save button.
    requestAnimationFrame(() => field?.current?.focus())
  }

  async function save() {
    setWarning(null)
    setIsSaving(true)
    try {
      const { item: updated } = await createTransaction({ itemId: item._id, date, type, quantity: qty, customerName })
      setSuccessMessage(
        `Saved ${type} ${formatNumber(qty)} of “${updated.code}”. Ending balance is now ${formatNumber(updated.balance)}.`,
      )
      setItem(null)
      setIdText('')
      findId('')
      setCodeText('')
      setQuantity('')
      setCustomerName('')
      onSaved()
      idRef.current?.focus()
    } catch (err) {
      setSuccessMessage('')
      setFormError(getErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SidePanel
      title="Add Transaction"
      subtitle="Record stock coming in or going out."
      // Only the visible mode reacts to Esc and the close button.
      onClose={isActive ? onClose : ignoreClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Save Transaction
          </Button>
        </>
      }
    >
      {modeToggle}

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
        ref={idRef}
        label="Item ID"
        placeholder="ITM-00012"
        autoComplete="off"
        value={idText}
        onChange={(e) => handleIdChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Look the ID up instead of submitting the form.
          e.preventDefault()
          findIdNow()
        }}
        onBlur={findIdNow}
        error={idError}
        hint={idHint}
      />

      <ItemCodePicker
        inputRef={codeRef}
        value={codeText}
        onChange={handleCodeChange}
        selected={item}
        onSelect={handleSelect}
        error={errors.item}
        hint="Pick the item from the list. Brand and type fill in automatically."
      />

      <div className="panel-row">
        <TextField label="Brand name" readOnly tabIndex={-1} placeholder="—" value={item?.brand ?? ''} />
        <TextField label="Type / Design" readOnly tabIndex={-1} placeholder="—" value={item?.typeDesign ?? ''} />
      </div>

      <div className="horizontal-line" aria-hidden="true" />

      <div className="panel-row">
        <TextField
          label="Date"
          ref={dateRef}
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            clearError('date')
          }}
          error={errors.date}
        />
        <SegmentedControl label="Transaction type" name="type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      </div>

      <div className="panel-row panel-row-quantity">
        <TextField
          ref={quantityRef}
          label="Quantity"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          required
          placeholder="0"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value)
            clearError('quantity')
          }}
          error={errors.quantity}
        />
        <TextField
          ref={customerRef}
          label="Customer name"
          placeholder="e.g. CS-82305/RODERICK DOLOR"
          autoComplete="off"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </div>

      <section className="item-details" aria-live="polite">
        <header>
          <h3>Item details</h3>
          <p>{item ? 'Current stock for the selected item.' : 'Pick an item to see its current stock.'}</p>
        </header>
        <dl>
          <div>
            <dt>Last transaction date</dt>
            <dd>{item ? formatDate(item.lastTransactionDate) : '—'}</dd>
          </div>
          <div>
            <dt>Last transaction type</dt>
            <dd>{item?.lastTransactionType ? <Badge kind={item.lastTransactionType} /> : '—'}</dd>
          </div>
          <div>
            <dt>Ending balance</dt>
            <dd>{item ? formatNumber(item.balance) : '—'}</dd>
          </div>
          <div>
            <dt>Balance after saving</dt>
            <dd className="item-details-after">
              {balanceAfter === null ? (
                '—'
              ) : (
                <>
                  <span className={balanceAfter < 0 ? 'is-negative' : ''}>{formatNumber(balanceAfter)}</span>
                  <span className="item-details-math">
                    {formatNumber(item.balance)} {type === 'IN' ? '+' : '−'} {formatNumber(qty)}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
        {balanceAfter !== null && balanceAfter < 0 && (
          <p className="item-details-note is-warning">This will take the stock below zero.</p>
        )}
        {isBackDated && (
          <p className="item-details-note">
            This date is before the last transaction ({formatDate(item.lastTransactionDate)}). Ending balances of later
            entries will be recalculated.
          </p>
        )}
      </section>

      {warning?.missing && (
        <ConfirmDialog
          title="Fill in the required fields"
          message={
            <>
              <p>This transaction can't be saved yet:</p>
              <ul className="missing-fields">
                {warning.missing.map(({ key, label, message }) => (
                  <li key={key}>
                    <strong>{label}</strong>: {message}
                  </li>
                ))}
              </ul>
            </>
          }
          cancelLabel="OK"
          onCancel={closeWarning}
        />
      )}
      {warning?.noCustomer && (
        <ConfirmDialog
          title="Save without a customer name?"
          message="The customer name is empty. You can add it now, or save the transaction without it."
          cancelLabel="Add customer name"
          confirmLabel="Save anyway"
          tone="primary"
          onCancel={() => {
            setWarning(null)
            requestAnimationFrame(() => customerRef.current?.focus())
          }}
          onConfirm={save}
        />
      )}
    </SidePanel>
  )
}

const ignoreClose = () => {}

const MODE_KEY = 'ebr.addTransaction.mode'
const MODE_OPTIONS = [
  { value: 'form', label: 'Form' },
  { value: 'brr', label: 'BRR template' },
]

// Remembered per PC, so the bodega PC can stay on the BRR template.
function savedMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'brr' ? 'brr' : 'form'
  } catch {
    return 'form'
  }
}

// Add Transaction with two modes: the single-entry form, or the Bodega Receiving Report
// slip (several IN lines at once). Both stay mounted, so switching never loses what was typed.
export default function AddTransactionPanel({ onClose, onSaved }) {
  const [mode, setMode] = useState(savedMode)

  function changeMode(next) {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // not remembered; fine
    }
  }

  // One per panel: radio buttons sharing a name would act as a single group.
  const modeToggle = (name) => (
    <SegmentedControl label="Entry type" name={name} options={MODE_OPTIONS} value={mode} onChange={changeMode} />
  )

  return (
    <>
      <div className="entry-mode-slot" hidden={mode !== 'form'}>
        <SingleEntryPanel onClose={onClose} onSaved={onSaved} modeToggle={modeToggle('entry-mode-form')} isActive={mode === 'form'} />
      </div>
      <div className="entry-mode-slot" hidden={mode !== 'brr'}>
        <ReceivingReportPanel onClose={onClose} onSaved={onSaved} modeToggle={modeToggle('entry-mode-brr')} isActive={mode === 'brr'} />
      </div>
    </>
  )
}
