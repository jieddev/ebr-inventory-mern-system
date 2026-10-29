import { useEffect, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import { getErrorMessage } from '../../api/auth'
import { getTransaction } from '../../api/transactions'
import { formatDate, formatNumber } from '../../utils/format'
import { ROLE_LABELS } from '../../utils/roles'
import './TransactionDetailsPanel.css'

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

// Read-only details of one ledger entry, opened by clicking it in the Transactions table.
export default function TransactionDetailsPanel({ transactionId, onClose }) {
  // The last finished request; it's loading while that isn't the current one.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  const requestKey = `${transactionId}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getTransaction(transactionId, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, 'Could not load this transaction.') })
      })
    return () => controller.abort()
  }, [transactionId, requestKey])

  const isLoading = response.key !== requestKey
  const { transaction: t, receiving } = (!isLoading && response.data) || {}

  return (
    <SidePanel
      title="Transaction details"
      subtitle={t ? `${t.isBalanceForwarded ? 'Balance forwarded' : t.type} · ${formatDate(t.date)}` : undefined}
      onClose={onClose}
    >
      {isLoading && <p className="txn-details-status">Loading…</p>}

      {!isLoading && response.error && (
        <div className="page-error" role="alert">
          {response.error}
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </div>
      )}

      {t && (
        <>
          <section className="txn-details-section">
            <h3>Transaction</h3>
            <dl>
              <div>
                <dt>Type</dt>
                <dd>
                  <Badge kind={t.type} />
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(t.date)}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {formatNumber(t.quantity)}
                  {receiving?.unit && ` ${receiving.unit}`}
                </dd>
              </div>
              <div>
                <dt>Ending balance</dt>
                <dd className={t.endingBalance < 0 ? 'is-negative' : ''}>{formatNumber(t.endingBalance)}</dd>
              </div>
              <div className="txn-details-wide">
                <dt>Customer name / Details</dt>
                <dd>{t.customerName || '—'}</dd>
              </div>
            </dl>
          </section>

          {receiving && (
            <section className="txn-details-section">
              <h3>Receiving report</h3>
              <dl>
                <div>
                  <dt>Ref. No.</dt>
                  <dd>{receiving.reportNo || '—'}</dd>
                </div>
                <div>
                  <dt>Received by</dt>
                  <dd>{receiving.receivedBy || '—'}</dd>
                </div>
              </dl>
            </section>
          )}

          <section className="txn-details-section">
            <h3>Recorded</h3>
            <dl>
              <div className="txn-details-wide">
                <dt>Recorded by</dt>
                <dd>
                  {t.createdBy ? (
                    <>
                      {t.createdBy.name}
                      <span className="txn-details-muted">
                        {' '}
                        · {ROLE_LABELS[t.createdBy.role] ?? t.createdBy.role} · {t.createdBy.userId}
                      </span>
                    </>
                  ) : (
                    'Not recorded'
                  )}
                </dd>
              </div>
              <div className="txn-details-wide">
                <dt>Recorded on</dt>
                <dd>{t.createdAt ? dateTime.format(new Date(t.createdAt)) : '—'}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </SidePanel>
  )
}
