import { useEffect, useId, useRef, useState } from 'react'
import Button from './Button'
import DateRangeFields from './DateRangeFields'
import { isValidRange, rangePeriod } from '../../utils/dateRange'
import { todayInputValue } from '../../utils/format'
import './ConfirmDialog.css'

// Modal picker for a single day or a date range, e.g. "Change dates" on the Transaction Report.
// Render it only while it should be open. onConfirm gets { from, to } as "YYYY-MM-DD";
// for a single day they're the same.
export default function PickDateRangeDialog({
  title,
  subtitle,
  initialFrom,
  initialTo,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)
  const titleId = useId()
  const [range, setRange] = useState(() => {
    const from = initialFrom || todayInputValue()
    const to = initialTo || from
    return { mode: from !== to ? 'range' : 'day', from, to }
  })

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const isValid = isValidRange(range)

  function handleSubmit(event) {
    event.preventDefault()
    if (isValid) onConfirm(rangePeriod(range))
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
        <DateRangeFields {...range} onChange={setRange} />
        <footer>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid}>
            {confirmLabel}
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
