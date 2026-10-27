import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import { useAuth } from './useAuth'
import './LoginPage.css'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/'

  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (user) return <Navigate to={redirectTo} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const errors = {}
    if (!userId.trim()) errors.userId = 'Enter your ID'
    if (!password) errors.password = 'Enter your password'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length) return

    setIsSubmitting(true)
    try {
      await login(userId.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setFormError(getErrorMessage(err))
      setPassword('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-hidden="true">
        <h2>EBR Inventory System</h2>
        <p>Track stock in and out, and print daily and transaction reports.</p>
      </section>

      <section className="login-card">
        <div className="login-logo">
          <Logo />
        </div>

        <header className="login-titles">
          <h1>Welcome</h1>
          <p>Sign in to continue</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="login-alert" role="alert">
              {formError}
            </div>
          )}

          <TextField
            label="ID"
            name="userId"
            autoComplete="username"
            autoFocus
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            error={fieldErrors.userId}
          />

          <TextField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            endAdornment={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            }
          />

          <Button type="submit" size="lg" block isLoading={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="login-help">Forgot your ID or password? Contact your administrator.</p>
      </section>
    </main>
  )
}
