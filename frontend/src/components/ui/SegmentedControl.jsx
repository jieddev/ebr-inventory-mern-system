import { useId } from 'react'
import './SegmentedControl.css'

// options: [{ value, label, icon?, tone? }]. tone ('in' | 'out') colors the selected option.
export default function SegmentedControl({ label, options, value, onChange, name }) {
  const labelId = useId()

  return (
    <div className="segmented-field">
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`segmented-option ${option.tone ? `segmented-${option.tone}` : ''} ${
              value === option.value ? 'is-selected' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.icon && <img src={option.icon} alt="" width="6" height="6" />}
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}
