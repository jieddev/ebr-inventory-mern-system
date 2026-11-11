import { Fragment, useEffect, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SidePanel from '../../components/ui/SidePanel'
import SegmentedControl from '../../components/ui/SegmentedControl'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { getTransaction, rollbackTransaction, updateTransaction } from '../../api/transactions'
import { formatDate, formatNumber } from '../../utils/format'
import ReservationDialogs from '../reservations/ReservationDialogs'
import { useAuth } from '../auth/useAuth'
import { ROLE_LABELS } from '../../utils/roles'
import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import './TransactionDetailsPanel.css'

const EDIT_TYPE_OPTIONS = [
  { value: 'IN', label: 'IN', icon: dotIn, tone: 'in' },
  { value: 'OUT', label: 'OUT', icon: dotOut, tone: 'out' },
]
const FORM_ID = 'txn-edit-form'

// "2026-11-11T00:00:00.000Z" → "2026-11-11" for a date input.
const toDayInput = (value) => (value ? String(value).slice(0, 10) : '')

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

// Details of one ledger entry, opened by clicking it in the Transactions table.
// Reservations also get Confirm out and Cancel reservation, and admins get Edit and Rollback on any
// entry but the balance forwarded. onChanged(itemId) runs after each.
export default function TransactionDetailsPanel({ transactionId, onClose, onChanged }) {
  const { user } = useAuth()
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
  const isReserved = t?.type === 'RESERVE'
  const canRollback = user.role === 'admin' && t && !t.isBalanceForwarded

  const [dialog, setDialog] = useState(null) // 'release' | 'cancel' | 'rollback' | null
  const [rollback, setRollback] = useState({ isBusy: false, error: '' })
  const [edit, setEdit] = useState(null) // { form, isBusy, error } while editing

  function startEdit() {
    setEdit({
      form: {
        date: toDayInput(t.date),
        type: t.type,
        quantity: String(t.quantity),
        customerName: t.customerName ?? '',
        neededBy: toDayInput(t.neededBy),
        notes: t.notes ?? '',
      },
      isBusy: false,
      error: '',
    })
  }

  const setField = (changes) =>
    setEdit((prev) => ({
      ...prev,
      form: { ...prev.form, ...changes },
      error: '',
    }))

  async function handleSave(event) {
    event.preventDefault()
    const { form } = edit
    // Slip entries keep the slip's date and type; only reservations have needed-by and notes.
    const changes = {
      quantity: form.quantity,
      customerName: form.customerName,
    }
    if (!receiving) changes.date = form.date
    if (!receiving && !isReserved) changes.type = form.type
    if (isReserved) Object.assign(changes, { neededBy: form.neededBy, notes: form.notes })
    setEdit((prev) => ({ ...prev, isBusy: true, error: '' }))
    try {
      await updateTransaction(t._id, changes)
      setEdit(null)
      onChanged?.(t.item?._id)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setEdit((prev) => ({
        ...prev,
        isBusy: false,
        error: getErrorMessage(err, 'Could not save the changes.'),
      }))
    }
  }

  // Released: show it again as OUT. Cancelled or rolled back: the entry is gone, so the panel closes.
  function handleDone(action) {
    setDialog(null)
    onChanged?.(t.item?._id)
    if (action === 'release') setReloadKey((k) => k + 1)
    else onClose()
  }

  async function handleRollback() {
    setRollback({ isBusy: true, error: '' })
    try {
      await rollbackTransaction(t._id)
      handleDone('rollback')
    } catch (err) {
      setRollback({ isBusy: false, error: getErrorMessage(err) })
    }
  }

  function closeRollback() {
    setDialog(null)
    setRollback({ isBusy: false, error: '' })
  }

  return (
    <SidePanel
      title="Transaction details"
      subtitle={t ? `${t.isBalanceForwarded ? 'Balance forwarded' : t.type} · ${formatDate(t.date)}` : undefined}
      onClose={onClose}
      footer={
        // Separate keys, so Save is a new button: if it reused Edit's button, the click on Edit would
        // also submit the form.
        edit ? (
          <Fragment key="editing">
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={edit.isBusy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} isLoading={edit.isBusy}>
              Save changes
            </Button>
          </Fragment>
        ) : (
          (isReserved || canRollback) && (
            <Fragment key="viewing">
              {canRollback && (
                <Button variant="danger" className="txn-details-rollback" onClick={() => setDialog('rollback')}>
                  Rollback
                </Button>
              )}
              {canRollback && (
                <Button variant="secondary" onClick={startEdit}>
                  Edit
                </Button>
              )}
              {isReserved && (
                <>
                  <Button variant="secondary" onClick={() => setDialog('cancel')}>
                    Cancel reservation
                  </Button>
                  <Button onClick={() => setDialog('release')}>Confirm out</Button>
                </>
              )}
            </Fragment>
          )
        )
      }
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
          {edit ? (
            <EditForm
              form={edit.form}
              error={edit.error}
              isReserved={isReserved}
              slipKind={receiving ? receiving.kind : null}
              onChange={setField}
              onSubmit={handleSave}
            />
          ) : (
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
            </>
          )}

          {!edit && (isReserved || t.releasedAt) && (
            <section className="txn-details-section">
              <h3>Reservation</h3>
              {isReserved && (
                <p className="txn-details-note">
                  This stock is held for the customer and already deducted from the balance. Confirm it out when it
                  leaves the warehouse.
                </p>
              )}
              <dl>
                <div>
                  <dt>Needed by</dt>
                  <dd>{t.neededBy ? formatDate(t.neededBy) : '—'}</dd>
                </div>
                {t.releasedAt && (
                  <div>
                    <dt>Released by</dt>
                    <dd>
                      {t.releasedBy?.name ?? '—'}
                      <span className="txn-details-muted"> · {dateTime.format(new Date(t.releasedAt))}</span>
                    </dd>
                  </div>
                )}
                <div className="txn-details-wide">
                  <dt>Notes</dt>
                  <dd>{t.notes || '—'}</dd>
                </div>
              </dl>
            </section>
          )}

          {receiving && (
            <section className="txn-details-section">
              <h3>{receiving.kind === 'OUT' ? 'Batch out' : 'Receiving report'}</h3>
              <dl>
                <div>
                  <dt>Ref. No.</dt>
                  <dd>{receiving.reportNo || '—'}</dd>
                </div>
                <div>
                  <dt>{receiving.kind === 'OUT' ? 'Released by' : 'Received by'}</dt>
                  <dd>{(receiving.kind === 'OUT' ? receiving.releasedBy : receiving.receivedBy) || '—'}</dd>
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

      {dialog === 'rollback' && t && (
        <ConfirmDialog
          title="Roll back this transaction?"
          message={`The ${t.type} of ${formatNumber(t.quantity)} ${t.item?.code ?? ''} on ${formatDate(t.date)} will be removed as if it was never recorded${receiving ? ', including its line on the receiving report' : ''}. The item's balance will be recalculated. This can't be undone.`}
          cancelLabel="Keep it"
          confirmLabel="Rollback"
          isBusy={rollback.isBusy}
          error={rollback.error}
          onConfirm={handleRollback}
          onCancel={closeRollback}
        />
      )}

      {(dialog === 'release' || dialog === 'cancel') && t && (
        <ReservationDialogs reservation={t} action={dialog} onDone={handleDone} onClose={() => setDialog(null)} />
      )}
    </SidePanel>
  )
}

// The Edit form for one entry (admin). slipKind: 'IN' | 'OUT' when it's on a receiving report /
// batch out slip, which sets its date and type.
function EditForm({ form, error, isReserved, slipKind, onChange, onSubmit }) {
  const slipNote = slipKind && `Set by the ${slipKind === 'OUT' ? 'batch out slip' : 'receiving report'}`
  return (
    <form id={FORM_ID} className="txn-details-section txn-edit-form" onSubmit={onSubmit}>
      <h3>Edit transaction</h3>
      {error && (
        <div className="page-error" role="alert">
          {error}
        </div>
      )}
      <TextField
        label="Date"
        type="date"
        required
        value={form.date}
        disabled={Boolean(slipKind)}
        hint={slipNote || undefined}
        onChange={(e) => onChange({ date: e.target.value })}
      />
      {!isReserved && !slipKind && (
        <SegmentedControl
          label="Transaction type"
          name="txn-edit-type"
          options={EDIT_TYPE_OPTIONS}
          value={form.type}
          onChange={(type) => onChange({ type })}
        />
      )}
      <div className="txn-edit-row">
        <TextField
          label="Quantity"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          required
          value={form.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
        <TextField
          label="Customer name / Details"
          autoComplete="off"
          maxLength={120}
          value={form.customerName}
          onChange={(e) => onChange({ customerName: e.target.value })}
        />
      </div>
      {isReserved && (
        <div className="txn-edit-row">
          <TextField
            label="Needed by"
            type="date"
            value={form.neededBy}
            onChange={(e) => onChange({ neededBy: e.target.value })}
          />
          <TextField
            label="Notes"
            autoComplete="off"
            maxLength={300}
            value={form.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </div>
      )}
    </form>
  )
}
