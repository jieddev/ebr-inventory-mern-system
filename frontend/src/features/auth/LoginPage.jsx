import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'
import TextField from '../../components/ui/TextField'
import { getErrorMessage } from '../../api/auth'
import eyeIcon from '../../assets/icons/eye.svg'
import eyeOffIcon from '../../assets/icons/eye-off.svg'
import { useAuth } from './useAuth'
import './LoginPage.css'

// 75 → "1:15"
const countdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

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
  // After too many failed logins the server asks to wait; Log in stays off until then.
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const isLocked = secondsLeft > 0

  useEffect(() => {
    if (!lockedUntil) return
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= lockedUntil) {
        clearInterval(timer)
        setLockedUntil(0)
        setFormError('')
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  if (user) return <Navigate to={redirectTo} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const errors = {}
    if (!userId.trim()) errors.userId = 'Enter your username'
    if (!password) errors.password = 'Enter your password'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length || isLocked) return

    setIsSubmitting(true)
    try {
      await login(userId.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const retryAfter = err.response?.status === 429 ? Number(err.response.data?.retryAfter) : 0
      if (retryAfter > 0) {
        const current = Date.now()
        setNow(current)
        setLockedUntil(current + retryAfter * 1000)
      }
      setFormError(getErrorMessage(err))
      setPassword('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">
          <Logo size="lg" />
        </div>

        <div className="login-brand">
          <p className="login-brand-name">EBR Inventory System</p>
          <p>By EBR IT Solutions</p>
        </div>

        <header className="login-titles">
          <p>Sign in to continue</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="login-alert" role="alert">
              {isLocked ? (
                <>
                  Too many failed login attempts. Please wait{' '}
                  <span className="login-countdown">{countdown(secondsLeft)}</span> before trying again.
                </>
              ) : (
                formError
              )}
            </div>
          )}

          <TextField
            label="Username"
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
                <img src={showPassword ? eyeOffIcon : eyeIcon} alt="" width="18" height="18" />
              </Button>
            }
          />

          <Button type="submit" size="lg" block isLoading={isSubmitting} disabled={isLocked}>
            {isSubmitting ? 'Logging in…' : isLocked ? `Try again in ${countdown(secondsLeft)}` : 'Log in'}
          </Button>
        </form>

        <p className="login-help">Forgot your username or password? Contact your administrator.</p>
      </section>
    </main>
  )
}
