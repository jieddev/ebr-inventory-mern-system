import { useState } from 'react'
import Button from '../../components/ui/Button'
import SegmentedControl from '../../components/ui/SegmentedControl'
import SidePanel from '../../components/ui/SidePanel'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { updateUser } from '../../api/users'
import { COST_CENTERS, userCostCenters } from '../../utils/costCenters'
import { ROLE_LABELS } from '../../utils/roles'
import { permissionsOf } from '../../utils/permissions'
import { useAuth } from '../auth/useAuth'
import PermissionChecklist from './PermissionChecklist'
import CostCenterChecklist from './CostCenterChecklist'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Enable' },
  { value: 'disabled', label: 'Disable', tone: 'danger' },
]

// Opened by clicking a row on User management. Warehouse users and encoders get cost
// centers and permissions (admins have neither: they switch between all cost centers and can
// do everything), and any account but your own can be disabled. All apply from the user's
// next request.
export default function EditUserPanel({ user, onClose, onSaved }) {
  const { user: me } = useAuth()
  const isAdmin = user.role === 'admin'
  const isMe = user._id === me._id
  const [costCenters, setCostCenters] = useState(() => userCostCenters(user))
  const [permissions, setPermissions] = useState(() => permissionsOf(user))
  const [isActive, setIsActive] = useState(user.isActive)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!isAdmin && !costCenters.length) return setError('Pick at least one cost center')
    const changes = {}
    // In the COST_CENTERS order, so the comparison doesn't depend on the order they were ticked.
    const picked = COST_CENTERS.map((c) => c.value).filter((c) => costCenters.includes(c))
    if (!isAdmin && picked.join() !== userCostCenters(user).join()) changes.costCenters = picked
    if (!isAdmin && [...permissions].sort().join() !== [...permissionsOf(user)].sort().join()) {
      changes.permissions = permissions
    }
    if (isActive !== user.isActive) changes.isActive = isActive
    if (!Object.keys(changes).length) return onClose()

    setIsSaving(true)
    try {
      onSaved(await updateUser(user._id, changes))
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
        isAdmin && isMe ? (
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
          label="Cost centers"
          readOnly
          tabIndex={-1}
          value="All cost centers"
          hint="Admins switch between every cost center in the sidebar, so they aren't assigned one."
        />
      ) : (
        <CostCenterChecklist
          value={costCenters}
          onChange={(value) => {
            setCostCenters(value)
            setError('')
          }}
          error={error}
        />
      )}

      {isAdmin ? (
        <TextField
          label="Permissions"
          readOnly
          tabIndex={-1}
          value="Everything"
          hint="Admins can do everything, so they have no permissions to set."
        />
      ) : (
        <PermissionChecklist value={permissions} onChange={setPermissions} />
      )}

      {isMe ? (
        <TextField
          label="Account status"
          readOnly
          tabIndex={-1}
          value="Active"
          hint="You can't disable your own account."
        />
      ) : (
        <div className="field">
          <SegmentedControl
            label="Account status"
            name="status"
            options={STATUS_OPTIONS}
            value={isActive ? 'active' : 'disabled'}
            onChange={(value) => setIsActive(value === 'active')}
          />
        </div>
      )}
    </SidePanel>
  )
}
