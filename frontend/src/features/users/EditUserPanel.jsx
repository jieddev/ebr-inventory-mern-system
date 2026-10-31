import { useEffect, useId, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { setUserCostCenter } from '../../api/users'
import { COST_CENTERS } from '../../utils/costCenters'
import { ROLE_LABELS } from '../../utils/roles'
import chevronIcon from '../../assets/icons/chevron-down.svg'

// Opened by clicking a row on User management. Warehouse users and encoders get a cost
// center; it applies from their next request. Admins have none (they switch between all).
export default function EditUserPanel({ user, onClose, onSaved }) {
  const costCenterId = useId()
  const costCenterRef = useRef(null)
  const isAdmin = user.role === 'admin'
  const [costCenter, setCostCenter] = useState(user.costCenter ?? '')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    costCenterRef.current?.focus()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!costCenter) return setError('Select a cost center')
    if (costCenter === user.costCenter) return onClose()

    setIsSaving(true)
    try {
      onSaved(await setUserCostCenter(user._id, costCenter))
    } catch (err) {
      setFormError(getErrorMessage(err))
      setIsSaving(false)
    }
  }

  return (
    <SidePanel
      title="Edit user"
      subtitle={`${user.name} · ${user.userId}`}
      onClose={onClose}
      as="form"
      bodyProps={{ onSubmit: handleSubmit, noValidate: true }}
      footer={
        isAdmin ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              Save changes
            </Button>
          </>
        )
      }
    >
      {formError && (
        <div className="panel-alert panel-alert-error" role="alert">
          {formError}
        </div>
      )}

      <TextField label="Name" readOnly tabIndex={-1} value={user.name} />
      <div className="panel-row">
        <TextField label="User ID" readOnly tabIndex={-1} value={user.userId} />
        <TextField label="Role" readOnly tabIndex={-1} value={ROLE_LABELS[user.role] ?? user.role} />
      </div>

      {isAdmin ? (
        <TextField
          label="Cost center"
          readOnly
          tabIndex={-1}
          value="All cost centers"
          hint="Admins switch between every cost center in the sidebar, so they aren't assigned one."
        />
      ) : (
        <div className={`field ${error ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={costCenterId}>
            Cost center
            <span className="field-required"> *</span>
          </label>
          <div className="field-control">
            <select
              ref={costCenterRef}
              id={costCenterId}
              className="field-input field-select"
              required
              aria-invalid={!!error}
              aria-describedby={`${costCenterId}-help`}
              value={costCenter}
              onChange={(e) => {
                setCostCenter(e.target.value)
                setError('')
              }}
            >
              <option value="" disabled>
                Select cost center
              </option>
              {COST_CENTERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="field-adornment field-adornment-icon" aria-hidden="true">
              <img src={chevronIcon} alt="" width="20" height="20" />
            </div>
          </div>
          <p id={`${costCenterId}-help`} className={error ? 'field-error' : 'field-hint'}>
            {error || "They'll only see this cost center's items, transactions and reports."}
          </p>
        </div>
      )}
    </SidePanel>
  )
}
