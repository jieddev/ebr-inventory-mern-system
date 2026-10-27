import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { createUser } from '../../api/users'
import './CreateUserPage.css'

const EMPTY_FORM = { userId: '', name: '', password: '', confirmPassword: '', role: 'staff' }

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

  const [form, setForm] = useState(EMPTY_FORM)
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
      })
      setSuccessMessage(`User "${created.userId}" (${created.role}) created.`)
      setForm(EMPTY_FORM)
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
        <Button variant="secondary" onClick={() => navigate('/transactions')}>
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
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <Button type="submit" size="lg" block isLoading={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create user'}
        </Button>
      </form>
    </section>
  )
}
