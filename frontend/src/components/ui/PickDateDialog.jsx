import { useEffect, useId, useRef, useState } from 'react'
import Button from './Button'
import { todayInputValue } from '../../utils/format'
import './ConfirmDialog.css'
import './TextField.css'

// Modal date picker, e.g. before opening a report (design screens 05 / 07).
// Render it only while it should be open. onConfirm gets "YYYY-MM-DD".
export default function PickDateDialog({
  title,
  subtitle,
  initialDate,
  label = 'Date',
  confirmLabel = 'Confirm',
  isBusy = false,
  error,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)
  const titleId = useId()
  const dateId = useId()
  const [date, setDate] = useState(initialDate || todayInputValue())

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    if (date) onConfirm(date)
  }

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!isBusy) onCancel()
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <div className="confirm-dialog-message">{subtitle}</div>}
        <div className="field pick-date-field">
          <label className="field-label" htmlFor={dateId}>
            {label}
          </label>
          <input
            id={dateId}
            type="date"
            className="field-input"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {error && (
          <p className="confirm-dialog-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!date} isLoading={isBusy}>
            {confirmLabel}
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
