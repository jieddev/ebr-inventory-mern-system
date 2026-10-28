import { useEffect, useId, useRef, useState } from 'react'
import Button from './Button'
import { todayInputValue } from '../../utils/format'
import './ConfirmDialog.css'
import './TextField.css'

// Modal date picker before opening a report (design screens 05 / 07).
// Render it only while it should be open. onConfirm gets "YYYY-MM-DD".
export default function PickDateDialog({ title, subtitle, initialDate, onConfirm, onCancel }) {
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
        onCancel()
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <div className="confirm-dialog-message">{subtitle}</div>}
        <div className="field pick-date-field">
          <label className="field-label" htmlFor={dateId}>
            Date
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
        <footer>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!date}>
            Confirm
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
