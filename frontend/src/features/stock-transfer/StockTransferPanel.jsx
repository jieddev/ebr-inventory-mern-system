import { useEffect, useId, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { createTransfer } from '../../api/transfers'
import { COST_CENTERS, costCenterLabel } from '../../utils/costCenters'
import { formatDate, formatNumber, pluralize, todayInputValue } from '../../utils/format'
import ItemCodePicker from '../add-transaction/ItemCodePicker'
import { useCostCenter } from '../costCenter/useCostCenter'
import checkIcon from '../../assets/icons/check-circle.svg'
import chevronIcon from '../../assets/icons/chevron-down.svg'
import closeIcon from '../../assets/icons/close.svg'
import plusIcon from '../../assets/icons/plus-muted.svg'
import '../add-transaction/ReceivingReportPanel.css'
import './StockTransferPanel.css'

// Same limit as the API (backend models/StockTransfer.js).
const LINE_LIMIT = 12

let nextLineKey = 1
// inTouched: Qty in was typed by hand; until then it copies Qty out.
const emptyLine = () => ({
  key: nextLineKey++,
  outQty: '',
  inQty: '',
  inTouched: false,
  fromText: '',
  fromItem: null,
  toText: '',
  toItem: null,
})

const isQty = (text) => text.trim() !== '' && Number.isInteger(Number(text)) && Number(text) >= 1

const describe = (item) => [item.itemId, item.brand, item.category].filter(Boolean).join(' · ')

// Moves stock between two of the user's cost centers: every line is an OUT on the item picked in
// From and an IN on the item picked in To, saved together (backend transfers.controller.js). Each
// side has its own quantity (e.g. 1 box out, 12 pcs in); Qty in copies Qty out until it's typed.
// Items are never created here; both sides must already exist.
export default function StockTransferPanel({ onClose, onSaved }) {
  const { costCenter, allowed } = useCostCenter()
  const options = COST_CENTERS.filter((c) => allowed.includes(c.value))
  const [from, setFrom] = useState(costCenter)
  const [to, setTo] = useState(() => allowed.find((c) => c !== costCenter) ?? '')
  const [date, setDate] = useState(todayInputValue)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState(() => [emptyLine()])
  const [errors, setErrors] = useState({ lines: {} })
  const [successMessage, setSuccessMessage] = useState('')
  const [confirm, setConfirm] = useState(null) // { isBusy, error }
  const [confirmClose, setConfirmClose] = useState(false)
  const fromRef = useRef(null)

  useEffect(() => {
    fromRef.current?.focus()
  }, [])

  const filledLines = lines.filter(
    (l) => l.outQty.trim() !== '' || l.inQty.trim() !== '' || l.fromText.trim() !== '' || l.toText.trim() !== '',
  )
  const totalOut = filledLines.reduce((sum, l) => sum + (Number(l.outQty) || 0), 0)
  const totalIn = filledLines.reduce((sum, l) => sum + (Number(l.inQty) || 0), 0)
  const totalsText = `Out ${formatNumber(totalOut)} · In ${formatNumber(totalIn)}`
  const hasEntries = filledLines.length > 0 || Boolean(reference.trim() || notes.trim())
  // The From items' balances after this transfer; an item can be on more than one line.
  const fromAfter = new Map()
  for (const line of filledLines) {
    if (!line.fromItem) continue
    const before = fromAfter.get(line.fromItem._id) ?? line.fromItem.balance
    fromAfter.set(line.fromItem._id, before - (Number(line.outQty) || 0))
  }
  const negativeItems = [...fromAfter.values()].filter((balance) => balance < 0).length

  function updateLine(key, changes) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...changes } : line)))
    setErrors((e) => ({ ...e, lines: { ...e.lines, [key]: undefined } }))
  }

  function setOutQty(line, text) {
    updateLine(line.key, line.inTouched ? { outQty: text } : { outQty: text, inQty: text })
  }

  // Clearing Qty in makes it follow Qty out again.
  function setInQty(line, text) {
    updateLine(
      line.key,
      text.trim() === '' ? { inQty: line.outQty, inTouched: false } : { inQty: text, inTouched: true },
    )
  }

  function removeLine(key) {
    setLines((list) => (list.length > 1 ? list.filter((line) => line.key !== key) : [emptyLine()]))
  }

  // A new From or To cost center: items picked for that side belong to the old one.
  function changeSide(side, value) {
    const other = side === 'from' ? to : from
    if (side === 'from') setFrom(value)
    else setTo(value)
    // Picking the other side's cost center swaps them, so From and To never match.
    if (value === other) {
      if (side === 'from') setTo(from)
      else setFrom(to)
      setLines((list) =>
        list.map((l) => ({
          ...l,
          fromText: l.toText,
          fromItem: l.toItem,
          toText: l.fromText,
          toItem: l.fromItem,
        })),
      )
    } else {
      const clear = side === 'from' ? { fromText: '', fromItem: null } : { toText: '', toItem: null }
      setLines((list) => list.map((l) => ({ ...l, ...clear })))
    }
    setErrors({ lines: {} })
  }

  function validate() {
    const next = { lines: {} }
    if (!from || !to || from === to) next.sides = 'Pick two different cost centers'
    if (!date) next.date = 'Pick the transfer date'
    if (reference.trim() && !/^\d+$/.test(reference.trim())) next.reference = 'Type only the number (e.g. 1234)'
    for (const line of filledLines) {
      const lineErrors = []
      if (!isQty(line.outQty)) lineErrors.push('Qty out: whole number, 1 or more')
      if (!isQty(line.inQty)) lineErrors.push('Qty in: whole number, 1 or more')
      if (!line.fromItem)
        lineErrors.push(line.fromText.trim() ? 'Pick the From item from the list' : 'Pick the From item')
      if (!line.toItem) lineErrors.push(line.toText.trim() ? 'Pick the To item from the list' : 'Pick the To item')
      if (lineErrors.length) next.lines[line.key] = lineErrors
    }
    if (!filledLines.length) next.noLines = 'Enter at least one item to transfer'
    setErrors(next)
    return !next.sides && !next.date && !next.reference && !next.noLines && !Object.keys(next.lines).length
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSuccessMessage('')
    if (validate()) setConfirm({ isBusy: false, error: '' })
  }

  async function save() {
    setConfirm({ isBusy: true, error: '' })
    try {
      await createTransfer({
        fromCostCenter: from,
        toCostCenter: to,
        date,
        reference: reference.trim(),
        notes: notes.trim(),
        lines: filledLines.map((l) => ({
          fromItemId: l.fromItem._id,
          toItemId: l.toItem._id,
          outQuantity: Number(l.outQty),
          inQuantity: Number(l.inQty),
        })),
      })
      setConfirm(null)
      setSuccessMessage(
        `Transferred ${pluralize(filledLines.length, 'line')} (${totalsText}) from ${costCenterLabel(from)} to ${costCenterLabel(to)}.`,
      )
      setReference('')
      setNotes('')
      setLines([emptyLine()])
      setErrors({ lines: {} })
      onSaved()
    } catch (err) {
      setConfirm({
        isBusy: false,
        error: getErrorMessage(err, 'Could not save the transfer.'),
      })
    }
  }

  function requestClose() {
    if (hasEntries) setConfirmClose(true)
    else onClose()
  }

  return (
    <SidePanel
      title="Stock Transfer"
      onClose={requestClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        <>
          <Button variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
          <Button type="submit">Transfer stock</Button>
        </>
      }
    >
      {successMessage && (
        <div className="panel-alert panel-alert-success" role="status">
          <img src={checkIcon} alt="" width="20" height="20" />
          <p>{successMessage}</p>
        </div>
      )}

      <div className="panel-row">
        <CostCenterSelect
          ref={fromRef}
          label="From"
          value={from}
          options={options}
          onChange={(value) => changeSide('from', value)}
        />
        <CostCenterSelect label="To" value={to} options={options} onChange={(value) => changeSide('to', value)} />
      </div>
      {errors.sides && <p className="field-error">{errors.sides}</p>}

      <div className="panel-row">
        <TextField
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
          label="Reference no."
          inputMode="numeric"
          autoComplete="off"
          placeholder="Optional"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value)
            setErrors((er) => ({ ...er, reference: undefined }))
          }}
          error={errors.reference}
        />
      </div>

      <section className="transfer-lines" aria-label="Items to transfer">
        {lines.map((line, index) => {
          const lineErrors = errors.lines[line.key]
          const outQty = Number(line.outQty) || 0
          const inQty = Number(line.inQty) || 0
          return (
            <div key={line.key} className={`transfer-line ${lineErrors ? 'has-error' : ''}`}>
              <div className="transfer-line-header">
                <span className="transfer-line-title">Line {index + 1}</span>
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

              <div className="transfer-side">
                <span className="transfer-side-label">OUT · {costCenterLabel(from)}</span>
                <div className="transfer-side-row">
                  <ItemCodePicker
                    key={`from-${from}`}
                    label={`Line ${index + 1} From item`}
                    hideLabel
                    required={false}
                    placeholder="Item description or ID"
                    costCenter={from}
                    value={line.fromText}
                    selected={line.fromItem}
                    onChange={(text) => updateLine(line.key, { fromText: text, fromItem: null })}
                    onSelect={(item) =>
                      updateLine(line.key, {
                        fromText: item.code,
                        fromItem: item,
                      })
                    }
                  />
                  <QtyInput
                    label={`Line ${index + 1} quantity out`}
                    placeholder="Qty out"
                    value={line.outQty}
                    onChange={(text) => setOutQty(line, text)}
                  />
                </div>
                {line.fromItem && (
                  <p className="brr-line-details">
                    {describe(line.fromItem)} · Bal. {formatNumber(line.fromItem.balance)}
                    {outQty > 0 && (
                      <>
                        {' → '}
                        <span className={line.fromItem.balance - outQty < 0 ? 'brr-negative' : ''}>
                          {formatNumber(line.fromItem.balance - outQty)}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="transfer-side">
                <span className="transfer-side-label">IN · {costCenterLabel(to)}</span>
                <div className="transfer-side-row">
                  <ItemCodePicker
                    key={`to-${to}`}
                    label={`Line ${index + 1} To item`}
                    hideLabel
                    required={false}
                    placeholder="Item description or ID"
                    costCenter={to}
                    value={line.toText}
                    selected={line.toItem}
                    onChange={(text) => updateLine(line.key, { toText: text, toItem: null })}
                    onSelect={(item) => updateLine(line.key, { toText: item.code, toItem: item })}
                  />
                  <QtyInput
                    label={`Line ${index + 1} quantity in`}
                    placeholder="Qty in"
                    value={line.inQty}
                    onChange={(text) => setInQty(line, text)}
                  />
                </div>
                {line.toItem && (
                  <p className="brr-line-details">
                    {describe(line.toItem)} · Bal. {formatNumber(line.toItem.balance)}
                    {inQty > 0 && ` → ${formatNumber(line.toItem.balance + inQty)}`}
                  </p>
                )}
              </div>

              {lineErrors && <p className="field-error">{lineErrors.join(' · ')}</p>}
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
            {pluralize(filledLines.length, 'line')} · {totalsText}
          </span>
        </div>
        {errors.noLines && <p className="field-error">{errors.noLines}</p>}
      </section>

      <TextField
        label="Notes"
        autoComplete="off"
        placeholder="Optional"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {confirm && (
        <ConfirmDialog
          title={`Transfer ${pluralize(filledLines.length, 'line')}?`}
          tone="primary"
          confirmLabel="Transfer stock"
          isBusy={confirm.isBusy}
          error={confirm.error}
          onCancel={() => setConfirm(null)}
          onConfirm={save}
          message={
            <div className="brr-confirm">
              {negativeItems > 0 && (
                <p className="brr-confirm-warning">
                  {pluralize(negativeItems, 'item')} in {costCenterLabel(from)} will have a negative balance after this.
                </p>
              )}
              {date > todayInputValue() && <p className="brr-confirm-warning">The date is in the future.</p>}
              <p>
                <strong>{costCenterLabel(from)}</strong> → <strong>{costCenterLabel(to)}</strong> on{' '}
                <strong>{formatDate(`${date}T00:00:00Z`)}</strong>
                {reference.trim() && ` · No. ${reference.trim()}`}
              </p>
              <ul>
                {filledLines.map((l) => (
                  <li key={l.key}>
                    <strong>{formatNumber(Number(l.outQty))} ×</strong> {l.fromItem?.itemId} · {l.fromItem?.code} →{' '}
                    <strong>{formatNumber(Number(l.inQty))} ×</strong> {l.toItem?.itemId} · {l.toItem?.code}
                  </li>
                ))}
              </ul>
              <p>
                Total: <strong>{totalsText}</strong>
              </p>
            </div>
          }
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title="Close without saving?"
          message={<p>This stock transfer hasn't been saved.</p>}
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

function QtyInput({ label, placeholder, value, onChange }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min="1"
      step="1"
      className="field-input transfer-qty"
      placeholder={placeholder}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function CostCenterSelect({ ref, label, value, options, onChange, hint }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        <span className="field-required"> *</span>
      </label>
      <div className="field-control">
        <select
          ref={ref}
          id={id}
          className="field-input field-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint`}
        >
          {options.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="field-adornment field-adornment-icon" aria-hidden="true">
          <img src={chevronIcon} alt="" width="20" height="20" />
        </div>
      </div>
      <p id={`${id}-hint`} className="field-hint">
        {hint}
      </p>
    </div>
  )
}
