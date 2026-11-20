import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuth } from '@/context/useAuth'
import { useMenus } from '@/context/useMenus'
import { readAdminResponse } from '@/lib/admin-response'

const message = (error) => error.response?.data?.message || 'The request could not be completed. Please try again.'
export function useAdminResource(path) {
  const { user, sessionVersion, checkAuth } = useAuth()
  const { refreshMenus } = useMenus()
  const key = `${sessionVersion}:${user.id}:${user.role}:${path}`
  const scopeRef = useRef(null)
  const [state, setState] = useState({ key: null, data: null, error: '', loading: true })
  const reload = useCallback(() => {
    const scope = scopeRef.current
    if (!scope || scope.key !== key || !scope.active) return Promise.resolve(null)
    if (scope.request) return scope.request
    setState((old) => ({ key, data: old.key === key ? old.data : null, loading: true, error: '' }))
    const request = api.get(path).then(({ data }) => {
      const result = readAdminResponse(path, data)
      if (scope.active) setState({ key, data: result, loading: false, error: '' })
      return result
    }).catch(async (error) => {
      if (scope.active) {
        setState((old) => ({ ...old, key, loading: false, error: message(error) }))
        if ([401, 403].includes(error.response?.status)) { await checkAuth(); await refreshMenus() }
      }
      return null
    }).finally(() => { scope.request = null })
    scope.request = request
    return request
  }, [path, key, checkAuth, refreshMenus])
  useEffect(() => {
    if (scopeRef.current?.key !== key) scopeRef.current = { key, active: true, request: null }
    const scope = scopeRef.current
    scope.active = true
    queueMicrotask(() => void reload())
    return () => { scope.active = false }
  }, [key, reload])
  return { ...(state.key === key ? state : { data: null, loading: true, error: '' }), reload }
}

export function useAdminMutation() {
  const { user, sessionVersion, checkAuth } = useAuth()
  const { refreshMenus } = useMenus()
  const key = `${sessionVersion}:${user.id}:${user.role}`
  const scopeRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    scopeRef.current = { key, active: true, pending: false }
    const scope = scopeRef.current
    return () => { scope.active = false }
  }, [key])
  const run = async (request, onSuccess, successMessage) => {
    const scope = scopeRef.current
    if (!scope || scope.key !== key || scope.pending || !scope.active) return
    scope.pending = true; setBusy(true); setError('')
    try {
      const { data } = await request()
      if (data?.success !== true) throw new Error('Invalid response')
      if (!scope.active) return
      if (successMessage) toast.success(successMessage)
      await onSuccess(data)
    } catch (failure) {
      if (!scope.active) return
      setError(message(failure)); toast.error(message(failure))
      if ([401, 403].includes(failure.response?.status)) { await checkAuth(); await refreshMenus() }
    } finally { scope.pending = false; if (scope.active) setBusy(false) }
  }
  const clearError = useCallback(() => setError(''), [])
  return { busy, error, run, clearError }
}
