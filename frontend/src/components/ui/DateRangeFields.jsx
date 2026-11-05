import { useId } from 'react'
import SegmentedControl from './SegmentedControl'
import { isBackwards } from '../../utils/dateRange'
import './ConfirmDialog.css'
import './TextField.css'

const MODES = [
  { value: 'day', label: 'Single day' },
  { value: 'range', label: 'Date range' },
]

// A single day or a From/To range ("YYYY-MM-DD"), e.g. for the Transaction Report.
// Controlled: onChange gets the whole { mode, from, to }.
export default function DateRangeFields({ mode, from, to, onChange }) {
  const id = useId()
  const isRange = mode === 'range'
  const update = (changes) => onChange({ mode, from, to, ...changes })

  return (
    <>
      <div className="pick-date-field">
        <SegmentedControl label="Period" options={MODES} value={mode} onChange={(next) => update({ mode: next })} name={`${id}-mode`} />
      </div>
      <div className="field pick-date-field">
        <label className="field-label" htmlFor={`${id}-from`}>
          {isRange ? 'From' : 'Date'}
        </label>
        <input
          id={`${id}-from`}
          type="date"
          className="field-input"
          required
          value={from}
          onChange={(e) => update({ from: e.target.value })}
        />
      </div>
      {isRange && (
        <div className="field pick-date-field">
          <label className="field-label" htmlFor={`${id}-to`}>
            To
          </label>
          <input
            id={`${id}-to`}
            type="date"
            className="field-input"
            required
            min={from || undefined}
            value={to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </div>
      )}
      {isRange && isBackwards(from, to) && (
        <p className="confirm-dialog-error" role="alert">
          The start date must be on or before the end date.
        </p>
      )}
    </>
  )
}

