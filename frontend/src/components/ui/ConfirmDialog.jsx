import { useEffect, useId, useRef } from 'react'
import Button from './Button'
import alertIcon from '../../assets/icons/alert-triangle.svg'
import './ConfirmDialog.css'

// Modal "Are you sure?" built on the native <dialog>, which traps focus and closes on Esc.
// Render it only while it should be open. tone: 'danger' (red confirm button) or 'primary'.
// Without onConfirm it's a plain warning with one button (cancelLabel) that closes it.
// warning: shows a yellow "Warning" label above the title.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  warning = false,
  onConfirm,
  onCancel,
  isBusy = false,
  error,
}) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let the parent decide, so state and the dialog stay in sync.
        event.preventDefault()
        if (!isBusy) onCancel()
      }}
    >
      {warning && (
        <p className="confirm-dialog-warning">
          <img src={alertIcon} alt="" width="16" height="16" />
          Warning
        </p>
      )}
      <h2 id={titleId}>{title}</h2>
      <div className="confirm-dialog-message">{message}</div>
      {error && (
        <p className="confirm-dialog-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Button variant={onConfirm ? 'secondary' : 'primary'} onClick={onCancel} disabled={isBusy}>
          {cancelLabel}
        </Button>
        {onConfirm && (
          <Button variant={tone} onClick={onConfirm} isLoading={isBusy}>
            {confirmLabel}
          </Button>
        )}
      </footer>
    </dialog>
  )
}
