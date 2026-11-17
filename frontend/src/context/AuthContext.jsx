import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { AuthContext } from './auth-context'

function readUser(data) {
  const user = data?.user
  if (!data?.success || !user || !['id', 'username', 'email', 'role'].every((key) => typeof user[key] === 'string')) {
    throw new Error('Unexpected account response')
  }
  // Keep only the public account fields, even if an API response changes.
  return { id: user.id, username: user.username, email: user.email, role: user.role }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const checkRequest = useRef(null)
  const logoutRequest = useRef(null)
  const revision = useRef(0)

  const checkAuth = useCallback(() => {
    // Also deduplicates the initial effect when React StrictMode runs it twice.
    if (checkRequest.current) return checkRequest.current
    const currentRevision = revision.current
    setIsChecking(true)
    setAuthError(null)
    const request = api.get('/auth/me')
      .then(({ data }) => {
        const nextUser = readUser(data)
        if (currentRevision === revision.current) {
          setUser(nextUser)
          setLastCheckedAt(new Date())
        }
        return nextUser
      })
      .catch((error) => {
        if (currentRevision !== revision.current) return null
        if (error.response?.status === 401) {
          setUser(null)
          setLastCheckedAt(null)
        } else {
          setAuthError('We couldn’t connect to your workspace. Please try again.')
        }
        return null
      })
      .finally(() => {
        checkRequest.current = null
        setIsLoading(false)
        setIsChecking(false)
      })
    checkRequest.current = request
    return request
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  // Recheck a returning tab without polling or starting a redirect loop.
  useEffect(() => {
    if (!user) return
    const onFocus = () => { void checkAuth() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, checkAuth])

  const login = useCallback(async (username, password) => {
    revision.current += 1
    const { data } = await api.post('/auth/login', { username, password })
    const nextUser = readUser(data)
    setUser(nextUser)
    setAuthError(null)
    setLastCheckedAt(new Date())
    return nextUser
  }, [])

  const logout = useCallback(() => {
    if (logoutRequest.current) return logoutRequest.current
    setIsLoggingOut(true)
    const request = api.post('/auth/logout')
      .then(({ data }) => {
        if (!data?.success) throw new Error('Sign out was not confirmed')
        revision.current += 1
        setUser(null)
        setAuthError(null)
        setLastCheckedAt(null)
      })
      .finally(() => {
        logoutRequest.current = null
        setIsLoggingOut(false)
      })
    logoutRequest.current = request
    return request
  }, [])

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: Boolean(user), isLoading, isChecking,
      isLoggingOut, authError, lastCheckedAt, login, logout, checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
