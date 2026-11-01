import { supabase } from './supabase'

export async function api(path, { method = 'GET', body } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in again.')
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    })
  } catch {
    throw new Error('The Express server could not be reached. Check your connection and try again.')
  }
  const data =
    response.status === 204
      ? null
      : await response.json().catch(() => {
          throw new Error('The Express API is unavailable. Check the server configuration.')
        })
  if (!response.ok) {
    const error = new Error(data.error || 'This request could not be completed.')
    error.status = response.status
    throw error
  }
  return data
}
export function calendarApi(action, parameters = {}) {
  if (action === 'connect') return api('/calendar/connect', { method: 'POST' })
  if (action === 'disconnect') return api('/calendar/connection', { method: 'DELETE' })
  const query = new URLSearchParams(parameters).toString()
  return api(`/calendar/${action}${query ? `?${query}` : ''}`)
}
