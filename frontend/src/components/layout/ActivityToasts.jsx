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

// Flash messages like "Maria Santos has added a transaction" or "… has added an item",
// shown on every page of every other open tab. The tab that saved already shows its own
// confirmation. Encoders only ever receive item notices (backend events.service.js).
const TOAST_KINDS = ['transaction', 'release', 'cancel', 'rollback', 'edit', 'adjust', 'item', 'import', 'import_undo']
export default function ActivityToasts() {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])

  useLiveUpdates(({ activity, sourceClientId }) => {
    if (!TOAST_KINDS.includes(activity?.kind) || sourceClientId === CLIENT_ID) return
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
        {toast.kind === 'transaction' && (
          <>
            <p className="activity-toast-title">{toast.actorName} has added a transaction</p>
            <p className="activity-toast-detail">
              <Badge kind={toast.type} />
              <span>
                {formatNumber(toast.quantity)} of {toast.itemCode}
              </span>
            </p>
          </>
        )}
        {(toast.kind === 'release' || toast.kind === 'cancel') && (
          <>
            <p className="activity-toast-title">
              {toast.actorName} {toast.kind === 'release' ? 'confirmed a reservation out' : 'cancelled a reservation'}
            </p>
            <p className="activity-toast-detail">
              <Badge kind={toast.kind === 'release' ? 'OUT' : 'RESERVE'} />
              <span>
                {formatNumber(toast.quantity)} of {toast.itemCode}
              </span>
            </p>
          </>
        )}
        {toast.kind === 'rollback' && (
          <>
            <p className="activity-toast-title">{toast.actorName} rolled back a transaction</p>
            <p className="activity-toast-detail">
              <Badge kind={toast.type} />
              <span>
                {formatNumber(toast.quantity)} of {toast.itemCode}
              </span>
            </p>
          </>
        )}
        {toast.kind === 'edit' && (
          <>
            <p className="activity-toast-title">{toast.actorName} edited a transaction</p>
            <p className="activity-toast-detail">
              <Badge kind={toast.type} />
              <span>
                {formatNumber(toast.quantity)} of {toast.itemCode}
              </span>
            </p>
          </>
        )}
        {toast.kind === 'adjust' && (
          <>
            <p className="activity-toast-title">{toast.actorName} adjusted a balance to a physical count</p>
            <p className="activity-toast-detail">
              <Badge kind="ADJUST" />
              <span>
                {toast.adjustment > 0 ? '+' : '−'}
                {formatNumber(Math.abs(toast.adjustment))} on {toast.itemCode}
              </span>
            </p>
          </>
        )}
        {toast.kind === 'item' && (
          <>
            <p className="activity-toast-title">{toast.actorName} has added an item</p>
            <p className="activity-toast-detail">
              <span className="activity-toast-id">{toast.itemId}</span>
              <span>{toast.itemCode}</span>
            </p>
          </>
        )}
        {toast.kind === 'import' && (
          <>
            <p className="activity-toast-title">{toast.actorName} has imported items</p>
            <p className="activity-toast-detail">
              <span>{formatNumber(toast.count)} new items from Excel</span>
            </p>
          </>
        )}
        {toast.kind === 'import_undo' && (
          <>
            <p className="activity-toast-title">{toast.actorName} has undone an import</p>
            <p className="activity-toast-detail">
              <span>{formatNumber(toast.count)} imported items removed</span>
            </p>
          </>
        )}
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
