import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { createUser } from '../../api/users'
import { viewPath } from '../../utils/rememberedViews'
import { COST_CENTERS, costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import './CreateUserPage.css'

// costCenter starts as the one on screen (see CreateUserPage).
const EMPTY_FORM = { userId: '', name: '', password: '', confirmPassword: '', role: 'warehouse', costCenter: '' }

function validate(form) {
  const errors = {}
  const userId = form.userId.trim()
  if (!userId) errors.userId = 'Enter an ID'
  else if (userId.length < 3 || userId.length > 32) errors.userId = 'ID must be 3–32 characters'
  if (!form.name.trim()) errors.name = 'Enter a name'
  if (!form.password) errors.password = 'Enter a password'
  else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters'
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match'
  return errors
}

export default function CreateUserPage() {
  const navigate = useNavigate()
  const roleId = useId()
  const costCenterId = useId()
  const { costCenter } = useCostCenter()
  const emptyForm = { ...EMPTY_FORM, costCenter }

  const [form, setForm] = useState(emptyForm)
  const isAdminRole = form.role === 'admin'
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const errors = validate(form)
    setFieldErrors(errors)
    setFormError('')
    setSuccessMessage('')
    if (Object.keys(errors).length) return

    setIsSubmitting(true)
    try {
      const created = await createUser({
        userId: form.userId.trim(),
        name: form.name.trim(),
        password: form.password,
        role: form.role,
        // Admins switch between every cost center.
        costCenter: isAdminRole ? undefined : form.costCenter,
      })
      const where = created.costCenter ? `, ${costCenterLabel(created.costCenter)}` : ''
      setSuccessMessage(`User "${created.userId}" (${created.role}${where}) created.`)
      setForm(emptyForm)
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="create-user-page">
      <header className="create-user-header">
        <h1>Create user</h1>
        <Button variant="secondary" onClick={() => navigate(viewPath('/transactions'))}>
          Go to Transactions
        </Button>
      </header>

      <form className="create-user-card" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="create-user-alert is-error" role="alert">
            {formError}
          </div>
        )}
        {successMessage && (
          <div className="create-user-alert is-success" role="status">
            {successMessage}
          </div>
        )}

        <TextField
          label="ID"
          name="userId"
          required
          autoComplete="off"
          autoFocus
          hint="Used to log in. 3–32 characters."
          value={form.userId}
          onChange={handleChange}
          error={fieldErrors.userId}
        />

        <TextField
          label="Full name"
          name="name"
          required
          autoComplete="off"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
        />

        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />

        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
        />

        <div className="field">
          <label className="field-label" htmlFor={roleId}>
            Role
          </label>
          <select id={roleId} name="role" className="field-input" value={form.role} onChange={handleChange}>
            <option value="warehouse">Warehouse: items and transactions</option>
            <option value="encoder">Encoder: add items only</option>
            <option value="admin">Admin: everything</option>
          </select>
        </div>

        {isAdminRole ? (
          <p className="field-hint">Admins can switch between every cost center.</p>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor={costCenterId}>
              Cost center
            </label>
            <select
              id={costCenterId}
              name="costCenter"
              className="field-input"
              value={form.costCenter}
              onChange={handleChange}
            >
              {COST_CENTERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="field-hint">They will only see this cost center&apos;s items and transactions.</p>
          </div>
        )}

        <Button type="submit" size="lg" block isLoading={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create user'}
        </Button>
      </form>
    </section>
  )
}
