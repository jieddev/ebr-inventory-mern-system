import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { getItemByItemId } from '../../api/items'
import { adjustToCount, getAdjustPreview } from '../../api/transactions'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatNumber, todayInputValue } from '../../utils/format'
import { parseItemId } from '../../utils/itemId'
import { costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import ItemCodePicker from '../add-transaction/ItemCodePicker'
import checkIcon from '../../assets/icons/check-circle.svg'
import '../add-transaction/AddTransactionPanel.css'
import './AdjustCountPanel.css'

const signed = (n) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(-n)}` : '0')

// Admin: sets an item's balance to a physical count. The item's system balance on the count date
// and its pending reservations (still on the shelf, so they're part of the count) are shown with
// the difference the count will make. A count that matches is only logged as verified.
// Stays open after each save, so a whole count sheet can be entered in a row.
export default function AdjustCountPanel({ onClose, onSaved }) {
  const { costCenter } = useCostCenter()
  const idRef = useRef(null)
  const codeRef = useRef(null)
  const countRef = useRef(null)
  const [idText, setIdText] = useState('')
  const [idState, setIdState] = useState({ looking: '', error: '' })
  const [codeText, setCodeText] = useState('')
  const [item, setItem] = useState(null)
  // Kept between saves: a count sheet is usually done on one day.
  const [date, setDate] = useState(todayInputValue)
  const [count, setCount] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // The last finished preview for `${item._id}|${date}|${refresh}`.
  const [refresh, setRefresh] = useState(0)
  const [preview, setPreview] = useState({ key: '', data: null, error: '' })
  const previewKey = item && date ? `${item._id}|${date}|${refresh}` : ''

  useEffect(() => {
    idRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!previewKey) return
    const controller = new AbortController()
    getAdjustPreview(item._id, date, { signal: controller.signal })
      .then((data) => setPreview({ key: previewKey, data, error: '' }))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPreview({ key: previewKey, data: null, error: getErrorMessage(err, 'Could not load the system balance.') })
        }
      })
    return () => controller.abort()
  }, [previewKey, item, date])

  // Another PC recorded something on this item: the system balance may have changed.
  useLiveUpdates(({ itemId, reconnected }) => {
    if (item && (reconnected || itemId === item._id)) setRefresh((r) => r + 1)
  })

  const current = preview.key === previewKey ? preview : { data: null, error: '' }
  const isLoadingPreview = Boolean(previewKey) && preview.key !== previewKey

  function clearError(name) {
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function findId() {
    const itemId = parseItemId(idText)
    if (!itemId || item?.itemId === itemId || idState.looking) return
    setIdText(itemId)
    setIdState({ looking: itemId, error: '' })
    try {
      const found = await getItemByItemId(itemId)
      setItem(found)
      setCodeText(found.code)
      setIdState({ looking: '', error: '' })
      clearError('item')
      countRef.current?.focus()
    } catch (err) {
      setIdState({ looking: '', error: getErrorMessage(err, 'Could not look up this item ID.') })
    }
  }

  function handleIdChange(text) {
    setIdText(text)
    setIdState({ looking: '', error: '' })
    setItem(null)
    setCodeText('')
  }

  function handleCodeChange(text) {
    setCodeText(text)
    setItem(null)
    setIdText('')
    clearError('item')
  }

  function handleSelect(picked) {
    setItem(picked)
    setCodeText(picked.code)
    setIdText(picked.itemId ?? '')
    clearError('item')
    countRef.current?.focus()
  }

  const counted = Number(count)
  const hasCount = count !== '' && Number.isInteger(counted) && counted >= 0
  const data = current.data
  // The balance the count sets: what's on the shelf less what's reserved there.
  const newBalance = data && hasCount ? counted - data.reserved : null
  const difference = newBalance === null ? null : newBalance - data.systemBalance
  const isFuture = date > todayInputValue()

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!item) nextErrors.item = 'Pick an item'
    if (!date) nextErrors.date = 'Enter the count date'
    else if (isFuture) nextErrors.date = 'The count date can’t be in the future'
    if (!hasCount) nextErrors.count = 'Enter the physical count (0 or more)'
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length) return

    setIsSaving(true)
    try {
      const result = await adjustToCount({ itemId: item._id, date, countedQuantity: counted, notes })
      const name = `${item.itemId} ${item.code}`
      setSuccessMessage(
        result.verified
          ? `${name}: the count matches the system balance. It was logged as verified.`
          : `${name}: balance set to ${formatNumber(result.transaction.endingBalance)} (${signed(result.transaction.adjustment)}).`,
      )
      if (!result.verified) onSaved(item._id)
      setItem(null)
      setIdText('')
      setCodeText('')
      setCount('')
      setNotes('')
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
      title={`Adjust to Count for ${costCenterLabel(costCenter)}`}
      subtitle="Set an item’s balance to its physical count."
      onClose={onClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Save Count
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
        ref={idRef}
        label="Item ID"
        placeholder="ITM-00012"
        autoComplete="off"
        value={idText}
        onChange={(e) => handleIdChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          findId()
        }}
        onBlur={findId}
        error={idState.error}
        hint={idState.looking ? `Looking up ${idState.looking}…` : item ? `Found ${item.itemId}.` : ''}
      />

      <ItemCodePicker
        inputRef={codeRef}
        value={codeText}
        onChange={handleCodeChange}
        selected={item}
        onSelect={handleSelect}
        error={errors.item}
      />

      <div className="panel-row">
        <TextField label="Brand name" readOnly tabIndex={-1} placeholder="—" value={item?.brand ?? ''} />
        <TextField label="Category" readOnly tabIndex={-1} placeholder="—" value={item?.category ?? ''} />
      </div>

      <div className="horizontal-line" aria-hidden="true" />

      <div className="panel-row panel-row-quantity">
        <TextField
          label="Count date"
          type="date"
          max={todayInputValue()}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            clearError('date')
          }}
          error={errors.date}
        />
        <TextField
          ref={countRef}
          label="Physical count"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          placeholder="0"
          value={count}
          onChange={(e) => {
            setCount(e.target.value)
            clearError('count')
          }}
          error={errors.count}
        />
      </div>

      <TextField
        label="Notes"
        placeholder="e.g. year-end count, counted by"
        autoComplete="off"
        maxLength={300}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <section className="item-details" aria-live="polite" aria-busy={isLoadingPreview}>
        <header>
          <h3>Count check</h3>
        </header>
        {current.error && <p className="item-details-note is-warning">{current.error}</p>}
        <dl>
          <div>
            <dt>System balance on this date</dt>
            <dd>{data ? formatNumber(data.systemBalance) : '—'}</dd>
          </div>
          <div>
            <dt>Reserved (pending, on the shelf)</dt>
            <dd>{data ? formatNumber(data.reserved) : '—'}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>
              {difference === null ? (
                '—'
              ) : (
                <span className={`count-difference ${difference > 0 ? 'is-up' : difference < 0 ? 'is-down' : ''}`}>
                  {signed(difference)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Balance after saving</dt>
            <dd className="item-details-after">
              {newBalance === null ? (
                '—'
              ) : (
                <>
                  <span className={newBalance < 0 ? 'is-negative' : ''}>{formatNumber(newBalance)}</span>
                  {data.reserved > 0 && (
                    <span className="item-details-math">
                      {formatNumber(counted)} − {formatNumber(data.reserved)} reserved
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        </dl>
        {difference === 0 && (
          <p className="item-details-note">The count matches. Saving logs it as verified without a new entry.</p>
        )}
        {item?.lastTransactionDate && date && date < item.lastTransactionDate.slice(0, 10) && (
          <p className="item-details-note">
            This date is before the item’s last transaction. Entries after the count will apply on top of it.
          </p>
        )}
      </section>
    </SidePanel>
  )
}
