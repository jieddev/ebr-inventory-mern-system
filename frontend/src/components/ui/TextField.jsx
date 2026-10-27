import { useId } from 'react'
import './TextField.css'

export default function TextField({ label, hint, error, endAdornment, required, className = '', ...inputProps }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="field-required"> *</span>}
        </label>
      )}
      <div className="field-control">
        <input
          id={id}
          className="field-input"
          aria-invalid={!!error}
          aria-describedby={describedBy}
          required={required}
          {...inputProps}
        />
        {endAdornment && <div className="field-adornment">{endAdornment}</div>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
