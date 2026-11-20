import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { readMenus } from '@/lib/menu-navigation'
import { useAuth } from './useAuth'
import { MenuContext } from './menu-context'

export function MenuProvider({ children }) {
  const { user, sessionVersion, checkAuth } = useAuth()
  const key = user ? `${sessionVersion}:${user.id}:${user.role}` : null
  const scopeRef = useRef(null)
  const [state, setState] = useState({ key: null, status: 'idle', menus: [], allowedPaths: [] })
  const refreshMenus = useCallback(() => {
    const scope = scopeRef.current
    if (!scope || scope.key !== key || !scope.key || !scope.active) return Promise.resolve(null)
    if (scope.request) return scope.request
    setState((old) => old.key === scope.key && old.status === 'ready'
      ? { ...old, isRefreshing: true } : { key: scope.key, status: 'loading', menus: [], allowedPaths: [], isRefreshing: true })
    const request = api.get('/me/menus').then(({ data }) => {
      const result = readMenus(data)
      if (scope.active) setState({ ...result, key: scope.key, status: 'ready', isRefreshing: false })
      return result
    }).catch(async (error) => {
      if (!scope.active) return null
      setState({ key: scope.key, status: 'error', menus: [], allowedPaths: [], isRefreshing: false,
        error: error.response?.data?.code === 'RBAC_NOT_READY' ? 'Your account role isn’t configured. Contact an administrator.' : 'We couldn’t load your navigation. Please try again.' })
      if (error.response?.status === 401 || error.response?.data?.code === 'RBAC_NOT_READY') await checkAuth()
      return null
    }).finally(() => { scope.request = null })
    scope.request = request
    return request
  }, [key, checkAuth])
  useEffect(() => {
    if (scopeRef.current?.key !== key) scopeRef.current = { key, active: true, request: null }
    const scope = scopeRef.current
    scope.active = true
    queueMicrotask(() => void refreshMenus())
    const focus = () => { void refreshMenus() }
    if (scope.key) window.addEventListener('focus', focus)
    return () => { scope.active = false; window.removeEventListener('focus', focus) }
  }, [key, refreshMenus])
  const current = state.key === key && key ? state : { status: key ? 'loading' : 'idle', menus: [], allowedPaths: [], isRefreshing: false }
  return <MenuContext.Provider value={{ ...current, refreshMenus }}>{children}</MenuContext.Provider>
}
