import { useState } from 'react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import PickDateDialog from '../../components/ui/PickDateDialog'
import { getErrorMessage } from '../../api/auth'
import { cancelReservation, releaseReservation } from '../../api/transactions'
import { formatNumber, todayInputValue } from '../../utils/format'

// The Confirm out and Cancel reservation dialogs, shared by the Reservations page and the
// transaction details panel. reservation: { _id, quantity, item: { code } }.
// Render it only while it should be open; onDone(action) runs after the request succeeds.
export default function ReservationDialogs({ reservation, action, onDone, onClose }) {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const quantity = formatNumber(reservation.quantity)
  const code = reservation.item?.code ?? 'this item'

  async function run(request) {
    setIsBusy(true)
    setError('')
    try {
      await request()
      onDone(action)
    } catch (err) {
      setError(getErrorMessage(err))
      setIsBusy(false)
    }
  }

  if (action === 'release') {
    return (
      <PickDateDialog
        title="Confirm out"
        subtitle={`${quantity} of ${code} left the warehouse. The reservation becomes an OUT entry on this date.`}
        label="Out date"
        initialDate={todayInputValue()}
        confirmLabel="Confirm out"
        isBusy={isBusy}
        error={error}
        onConfirm={(date) => run(() => releaseReservation(reservation._id, date))}
        onCancel={onClose}
      />
    )
  }

  return (
    <ConfirmDialog
      title="Cancel this reservation?"
      message={`The ${quantity} reserved ${code} go back to stock. This can't be undone.`}
      cancelLabel="Keep it"
      confirmLabel="Cancel reservation"
      isBusy={isBusy}
      error={error}
      onConfirm={() => run(() => cancelReservation(reservation._id))}
      onCancel={onClose}
    />
  )
}
