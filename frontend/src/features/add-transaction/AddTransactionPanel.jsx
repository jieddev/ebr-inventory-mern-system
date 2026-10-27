import { useEffect, useRef, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import SegmentedControl from '../../components/ui/SegmentedControl'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { getItemTransactions } from '../../api/items'
import { createTransaction } from '../../api/transactions'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatDate, formatNumber, todayInputValue } from '../../utils/format'
import ItemCodePicker from './ItemCodePicker'
import checkIcon from '../../assets/icons/check-circle.svg'
import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import './AddTransactionPanel.css'

const TYPE_OPTIONS = [
  { value: 'IN', label: 'IN', icon: dotIn, tone: 'in' },
  { value: 'OUT', label: 'OUT', icon: dotOut, tone: 'out' },
]

// After saving, the item, quantity and customer clear for the next entry. Date and
// IN/OUT are kept, since entries are usually typed in batches from the same day.
export default function AddTransactionPanel({ onClose, onSaved }) {
  const codeRef = useRef(null)
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

  useEffect(() => {
    codeRef.current?.focus()
  }, [])

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

  function handleCodeChange(text) {
    setCodeText(text)
    setItem(null)
    clearError('item')
  }

  function handleSelect(picked) {
    setItem(picked)
    setCodeText(picked.code)
    clearError('item')
  }

  const qty = Number(quantity)
  const hasQty = quantity !== '' && Number.isInteger(qty) && qty > 0
  const balanceAfter = item && hasQty ? item.balance + (type === 'IN' ? qty : -qty) : null
  const isBackDated = item?.lastTransactionDate && date && date < item.lastTransactionDate.slice(0, 10)

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!item) nextErrors.item = codeText.trim() ? 'Pick the item from the list' : 'Enter an item code'
    if (!date) nextErrors.date = 'Pick a date'
    if (!hasQty) nextErrors.quantity = 'Enter a whole number, 1 or more'
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const { item: updated } = await createTransaction({ itemId: item._id, date, type, quantity: qty, customerName })
      setSuccessMessage(
        `Saved ${type} ${formatNumber(qty)} of “${updated.code}”. Ending balance is now ${formatNumber(updated.balance)}.`,
      )
      setItem(null)
      setCodeText('')
      setQuantity('')
      setCustomerName('')
      onSaved()
      codeRef.current?.focus()
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
      onClose={onClose}
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

      <div className="panel-row">
        <TextField
          label="Date"
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
    </SidePanel>
  )
}
