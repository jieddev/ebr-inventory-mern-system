import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { checkReportNo, createReceivingReport } from '../../api/receiving'
import { formatDate, formatNumber, pluralize, todayInputValue } from '../../utils/format'
import ItemCodePicker from './ItemCodePicker'
import checkIcon from '../../assets/icons/check-circle.svg'
import closeIcon from '../../assets/icons/close.svg'
import plusIcon from '../../assets/icons/plus-muted.svg'
import './ReceivingReportPanel.css'

// Same limits as the paper slip and the API (backend models/ReceivingReport.js).
const LINE_LIMIT = 12
const START_LINES = 3
const UNITS = ['pcs', 'sets', 'pairs', 'boxes', 'rolls']

let nextLineKey = 1
const emptyLine = () => ({ key: nextLineKey++, qty: '', unit: 'pcs', codeText: '', item: null })
const emptyLines = () => Array.from({ length: START_LINES }, emptyLine)

const clean = (text) => text.trim().replace(/\s+/g, ' ').toUpperCase()

// The CUSTOMER NAME each transaction gets, as the API builds it (receiving.controller.js):
// "BIS# 92479 - No. 46954", or just one of them.
function customerText(customerName, reportNo) {
  const name = clean(customerName)
  const no = reportNo.trim()
  if (name && no) return `${name} - No. ${no}`
  return no ? `No. ${no}` : name
}

const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Add Transaction's "BRR template": the Bodega Receiving Report slip. Every line is saved
// as an IN transaction in one go. After saving, Received by is kept and everything else
// clears, including the date, which is always typed from the slip.
export default function ReceivingReportPanel({ onClose, onSaved, modeToggle, isActive }) {
  const dateRef = useRef(null)
  const [date, setDate] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [reportNo, setReportNo] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [lines, setLines] = useState(emptyLines)
  const [errors, setErrors] = useState({ lines: {} })
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [confirm, setConfirm] = useState(null) // { duplicateSavedAt, isBusy, error }
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (isActive) dateRef.current?.focus()
  }, [isActive])

  const filledLines = lines.filter((line) => line.qty.trim() !== '' || line.codeText.trim() !== '')
  const totalQty = filledLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)
  const hasEntries = filledLines.length > 0 || Boolean(date || customerName.trim() || reportNo.trim())
  const custPreview = customerText(customerName, reportNo)

  function updateLine(key, changes) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...changes } : line)))
    setErrors((e) => ({ ...e, lines: { ...e.lines, [key]: undefined } }))
  }

  function removeLine(key) {
    setLines((list) => (list.length > 1 ? list.filter((line) => line.key !== key) : [emptyLine()]))
  }

  function validate() {
    const next = { lines: {} }
    if (!date) next.date = 'Type the date written on the slip'
    if (reportNo.trim() && !/^\d+$/.test(reportNo.trim())) next.reportNo = 'Type only the number printed on the slip (e.g. 46954)'
    for (const line of filledLines) {
      const lineErrors = {}
      if (!line.item) lineErrors.item = line.codeText.trim() ? 'Pick the item from the list' : 'Pick an item'
      const qty = Number(line.qty)
      if (line.qty.trim() === '' || !Number.isInteger(qty) || qty < 1) lineErrors.qty = 'Whole number, 1 or more'
      if (Object.keys(lineErrors).length) next.lines[line.key] = lineErrors
    }
    if (!filledLines.length) next.noLines = 'Enter at least one quantity and item'
    setErrors(next)
    return !next.date && !next.reportNo && !next.noLines && !Object.keys(next.lines).length
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')
    if (!validate()) return

    // Ask the server first, so the confirmation can warn about a slip saved before.
    let duplicateSavedAt = null
    if (reportNo.trim()) {
      setIsChecking(true)
      try {
        duplicateSavedAt = (await checkReportNo(reportNo.trim()))?.savedAt ?? null
      } catch (err) {
        setFormError(getErrorMessage(err, 'Could not check the Ref. No.'))
        return
      } finally {
        setIsChecking(false)
      }
    }
    setConfirm({ duplicateSavedAt, isBusy: false, error: '' })
  }

  async function save() {
    setConfirm((c) => ({ ...c, isBusy: true, error: '' }))
    try {
      const result = await createReceivingReport({
        date,
        customerName,
        receivedBy,
        reportNo: reportNo.trim(),
        lines: filledLines.map((line) => ({ itemId: line.item._id, quantity: Number(line.qty), unit: line.unit })),
        allowDuplicate: Boolean(confirm.duplicateSavedAt),
      })
      setConfirm(null)
      setSuccessMessage(
        `Saved ${pluralize(filledLines.length, 'line')} as IN, total ${formatNumber(result.totalQuantity)}` +
          (reportNo.trim() ? ` (receiving report No. ${reportNo.trim()}).` : '.'),
      )
      // Ready for the next slip: keep Received by, clear everything else.
      setDate('')
      setCustomerName('')
      setReportNo('')
      setLines(emptyLines())
      setErrors({ lines: {} })
      onSaved()
      dateRef.current?.focus()
    } catch (err) {
      // Saved from another PC between the check and now: ask again.
      if (err.response?.data?.code === 'DUPLICATE_REPORT') {
        setConfirm({ duplicateSavedAt: err.response.data.savedAt, isBusy: false, error: '' })
      } else {
        setConfirm((c) => ({ ...c, isBusy: false, error: getErrorMessage(err, 'Could not save the receiving report.') }))
      }
    }
  }

  function clearForm() {
    setDate('')
    setCustomerName('')
    setReportNo('')
    setReceivedBy('')
    setLines(emptyLines())
    setErrors({ lines: {} })
    setFormError('')
    setSuccessMessage('')
    dateRef.current?.focus()
  }

  // Only the visible mode reacts (Esc and the close button), and unsaved lines need a yes.
  function requestClose() {
    if (!isActive) return
    if (hasEntries) setConfirmClose(true)
    else onClose()
  }

  const isFuture = date && date > todayInputValue()

  return (
    <SidePanel
      title="Add Transaction"
      subtitle="Bodega Receiving Report"
      onClose={requestClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={clearForm} disabled={!hasEntries && !receivedBy}>
            Clear
          </Button>
          <Button type="submit" isLoading={isChecking}>
            Save to Inventory
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
        ref={dateRef}
        label="Date"
        type="date"
        required
        value={date}
        onChange={(e) => {
          setDate(e.target.value)
          setErrors((er) => ({ ...er, date: undefined }))
        }}
        error={errors.date}
      />

      <TextField
        label="Customer name"
        placeholder="e.g. BIS# 92479"
        autoComplete="off"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />

      <section className="brr-lines" aria-label="Items received">
        <div className="brr-line brr-line-header" aria-hidden="true">
          <span>Quantity</span>
          <span>Unit</span>
          <span>Items</span>
          <span />
        </div>
        {lines.map((line, index) => {
          const lineErrors = errors.lines[line.key] ?? {}
          return (
            <div key={line.key} className="brr-line-group">
              <div className="brr-line">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className={`field-input brr-qty ${lineErrors.qty ? 'is-invalid' : ''}`}
                  aria-label={`Line ${index + 1} quantity`}
                  aria-invalid={Boolean(lineErrors.qty)}
                  value={line.qty}
                  onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                />
                <select
                  className="field-input brr-unit"
                  aria-label={`Line ${index + 1} unit`}
                  value={line.unit}
                  onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <div className={`brr-item ${lineErrors.item ? 'has-error' : ''}`}>
                  <ItemCodePicker
                    label={`Line ${index + 1} item`}
                    hideLabel
                    required={false}
                    placeholder="Item code or ID"
                    value={line.codeText}
                    selected={line.item}
                    onChange={(text) => updateLine(line.key, { codeText: text, item: null })}
                    onSelect={(item) => updateLine(line.key, { codeText: item.code, item })}
                  />
                </div>
                <button
                  type="button"
                  className="brr-remove"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Remove line ${index + 1}`}
                  title="Remove line"
                >
                  <img src={closeIcon} alt="" width="16" height="16" />
                </button>
              </div>
              {line.item && (
                <p className="brr-line-details">
                  {[line.item.itemId, line.item.brand, line.item.category].filter(Boolean).join(' · ')} · Bal.{' '}
                  {formatNumber(line.item.balance)}
                  {Number(line.qty) > 0 && ` → ${formatNumber(line.item.balance + Number(line.qty))}`}
                </p>
              )}
              {(lineErrors.qty || lineErrors.item) && (
                <p className="field-error brr-line-error">{[lineErrors.qty, lineErrors.item].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          )
        })}
        <div className="brr-lines-footer">
          {lines.length < LINE_LIMIT && (
            <Button variant="ghost" size="sm" onClick={() => setLines((list) => [...list, emptyLine()])}>
              <img src={plusIcon} alt="" />
              Add line
            </Button>
          )}
          <span className="brr-total">
            {pluralize(filledLines.length, 'line')} · Total quantity {formatNumber(totalQty)}
          </span>
        </div>
        {errors.noLines && <p className="field-error">{errors.noLines}</p>}
      </section>

      <div className="panel-row">
        <TextField
          label="Ref. No."
          className="brr-ref"
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 46954"
          value={reportNo}
          onChange={(e) => {
            setReportNo(e.target.value)
            setErrors((er) => ({ ...er, reportNo: undefined }))
          }}
          error={errors.reportNo}
          hint="The red number printed on the slip."
        />
        <TextField
          label="Received by"
          autoComplete="off"
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          hint="Kept for the next slip."
        />
      </div>

      {custPreview && (
        <p className="brr-preview">
          Saved on each transaction as customer: <strong>{custPreview}</strong>
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title={`Save ${pluralize(filledLines.length, 'line')} as IN?`}
          tone="primary"
          confirmLabel={confirm.duplicateSavedAt ? 'Save again' : 'Save to Inventory'}
          isBusy={confirm.isBusy}
          error={confirm.error}
          onCancel={() => setConfirm(null)}
          onConfirm={save}
          message={
            <div className="brr-confirm">
              {confirm.duplicateSavedAt && (
                <p className="brr-confirm-warning">
                  Receiving report No. {reportNo.trim()} was already saved on{' '}
                  {new Date(confirm.duplicateSavedAt).toLocaleString('en-US')}. Saving it again adds its items to the
                  inventory a second time.
                </p>
              )}
              {isFuture && <p className="brr-confirm-warning">The date is in the future.</p>}
              <p>
                Date: <strong>{formatDate(`${date}T00:00:00Z`)}</strong> ({longDate.format(new Date(`${date}T00:00:00Z`))})
              </p>
              <ul>
                {filledLines.map((line) => (
                  <li key={line.key}>
                    <strong>
                      {formatNumber(Number(line.qty))} {line.unit}
                    </strong>{' '}
                    {line.item?.itemId} · {line.item?.code}
                  </li>
                ))}
              </ul>
              <p>
                Total quantity: <strong>{formatNumber(totalQty)}</strong>
              </p>
              <p>
                Customer name: <strong>{custPreview || '(none)'}</strong>
              </p>
            </div>
          }
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title="Close without saving?"
          message={<p>The lines on this receiving report haven't been saved.</p>}
          confirmLabel="Close anyway"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false)
            onClose()
          }}
        />
      )}
    </SidePanel>
  )
}
