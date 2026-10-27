import { useCallback, useEffect, useState } from 'react'
import Badge from '../ui/Badge'
import { CLIENT_ID } from '../../api/client'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatNumber } from '../../utils/format'
import closeIcon from '../../assets/icons/close.svg'
import './ActivityToasts.css'

const SHOW_FOR_MS = 6000
const MAX_TOASTS = 4

let nextId = 1

// Flash messages like "Maria Santos has added a transaction", shown on every page of
// every other open tab. The tab that saved already shows its own confirmation.
export default function ActivityToasts() {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])

  useLiveUpdates(({ activity, sourceClientId }) => {
    if (activity?.kind !== 'transaction' || sourceClientId === CLIENT_ID) return
    setToasts((list) => [...list, { id: nextId++, ...activity }].slice(-MAX_TOASTS))
  })

  return (
    <div className="activity-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ActivityToast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}

function ActivityToast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), SHOW_FOR_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div className="activity-toast">
      <div className="activity-toast-text">
        <p className="activity-toast-title">{toast.actorName} has added a transaction</p>
        <p className="activity-toast-detail">
          <Badge kind={toast.type} />
          <span>
            {formatNumber(toast.quantity)} of {toast.itemCode}
          </span>
        </p>
      </div>
      <button
        type="button"
        className="activity-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <img src={closeIcon} alt="" width="16" height="16" />
      </button>
    </div>
  )
}
