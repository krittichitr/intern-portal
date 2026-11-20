import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  withCredentials: true,
  timeout: 12000,
  headers: { Accept: 'application/json' },
})

export default api

// Avatar paths belong to the backend origin, rather than the API /api prefix.
export function resolveAvatarUrl(avatarUrl) {
  if (typeof avatarUrl !== 'string' || !avatarUrl.trim()) return undefined
  try {
    const backend = new URL(api.defaults.baseURL, window.location.origin)
    const image = new URL(avatarUrl, `${backend.origin}/`)
    return ['http:', 'https:'].includes(image.protocol) ? image.href : undefined
  } catch {
    return undefined
  }
}
