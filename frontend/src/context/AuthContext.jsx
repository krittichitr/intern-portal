import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { AuthContext } from './auth-context'

function readUser(data) {
  const user = data?.user
  if (!data?.success || !user || !['id', 'username', 'email', 'role'].every((key) => typeof user[key] === 'string')) {
    throw new Error('Unexpected account response')
  }
  const profile = {}
  for (const key of ['firstName', 'lastName', 'phone', 'avatarUrl']) {
    const value = user[key] ?? null
    if (value !== null && typeof value !== 'string') {
      throw new Error('Unexpected account response')
    }
    profile[key] = value
  }
  // Keep only validated public fields; older login responses may omit profile data.
  return { id: user.id, username: user.username, email: user.email, role: user.role, ...profile }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [authErrorCode, setAuthErrorCode] = useState(null)
  const [lastCheckedAt, setLastCheckedAt] = useState(null)
  const checkRequest = useRef(null)
  const logoutRequest = useRef(null)
  const profileRequest = useRef(null)
  const avatarRequest = useRef(null)
  const revision = useRef(0)

  const checkAuth = useCallback(() => {
    // Also deduplicates the initial effect when React StrictMode runs it twice.
    if (checkRequest.current) return checkRequest.current
    const currentRevision = revision.current
    setIsChecking(true)
    setAuthError(null)
    setAuthErrorCode(null)
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
          setSessionVersion((value) => value + 1)
          setUser(null)
          setLastCheckedAt(null)
        } else if (error.response?.status === 403 && error.response?.data?.code === 'RBAC_NOT_READY') {
          revision.current += 1
          setSessionVersion((value) => value + 1)
          setUser(null)
          setLastCheckedAt(null)
          setAuthErrorCode('RBAC_NOT_READY')
          setAuthError('Your account role isn’t configured. Contact an administrator.')
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
    setSessionVersion((value) => value + 1)
    setUser(nextUser)
    setAuthError(null)
    setAuthErrorCode(null)
    setLastCheckedAt(new Date())
    return nextUser
  }, [])

  const applyProfileResponse = useCallback((data, currentRevision, userId) => {
    if (data?.success !== true) throw new Error('Unexpected account response')
    const nextUser = readUser(data)
    if (nextUser.id !== userId) throw new Error('Unexpected account response')
    if (currentRevision !== revision.current || logoutRequest.current) {
      throw new Error('Your session changed. Check your session before saving again.')
    }
    // Both profile APIs invalidate earlier /me and mutation responses.
    revision.current += 1
    setUser(nextUser)
    setAuthError(null)
    setAuthErrorCode(null)
    setLastCheckedAt(new Date())
    return nextUser
  }, [])

  const updateProfile = useCallback((changes) => {
    if (profileRequest.current) return profileRequest.current
    const keys = Object.keys(changes || {})
    if (!user || logoutRequest.current || keys.length === 0 ||
        keys.some((key) => !['firstName', 'lastName', 'phone', 'email'].includes(key))) {
      return Promise.reject(new Error('Invalid profile update'))
    }
    const currentRevision = revision.current
    const request = api.patch('/profile/me', changes)
      .then(({ data }) => applyProfileResponse(data, currentRevision, user.id))
      .finally(() => { profileRequest.current = null })
    profileRequest.current = request
    return request
  }, [user, applyProfileResponse])

  const uploadAvatar = useCallback((file) => {
    if (avatarRequest.current) return avatarRequest.current
    if (!user || logoutRequest.current || !(file instanceof File)) {
      return Promise.reject(new Error('Invalid avatar upload'))
    }
    const currentRevision = revision.current
    const body = new FormData()
    body.append('avatar', file)
    // Leave Content-Type unset so the browser supplies the multipart boundary.
    const request = api.post('/profile/me/avatar', body)
      .then(({ data }) => {
        if (typeof data?.user?.avatarUrl !== 'string' || !data.user.avatarUrl.trim()) {
          throw new Error('Unexpected account response')
        }
        return applyProfileResponse(data, currentRevision, user.id)
      })
      .finally(() => { avatarRequest.current = null })
    avatarRequest.current = request
    return request
  }, [user, applyProfileResponse])

  const logout = useCallback(() => {
    if (logoutRequest.current) return logoutRequest.current
    setIsLoggingOut(true)
    const request = api.post('/auth/logout')
      .then(({ data }) => {
        if (!data?.success) throw new Error('Sign out was not confirmed')
        revision.current += 1
        setSessionVersion((value) => value + 1)
        setUser(null)
        setAuthError(null)
        setAuthErrorCode(null)
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
      user, sessionVersion, isAuthenticated: Boolean(user), isLoading, isChecking,
      isLoggingOut, authError, authErrorCode, lastCheckedAt, login, logout, checkAuth, updateProfile, uploadAvatar,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
