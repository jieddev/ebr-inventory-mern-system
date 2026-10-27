import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import * as authApi from '../../api/auth'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore the session from the httpOnly cookie on first load.
  useEffect(() => {
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  // Any 401 from a protected endpoint means the session ended: drop back to the login screen.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (err) => {
      const url = err.config?.url ?? ''
      if (err.response?.status === 401 && !url.startsWith('/auth/')) setUser(null)
      return Promise.reject(err)
    })
    return () => api.interceptors.response.eject(id)
  }, [])

  const login = useCallback(async (userId, password) => {
    const loggedIn = await authApi.login(userId, password)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
