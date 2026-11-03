import { fixtureData } from './workspace.js'
import { testSession } from './session.js'
import { randomUUID } from 'node:crypto'

// These fixtures intercept browser requests only. Nothing is written to Supabase.
export async function mockWorkspace(page) {
  const data = fixtureData()
  const session = testSession()
  await page.addInitScript(
    (value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)),
    session,
  )
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('/user') ? session.user : session),
    }),
  )
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postDataJSON()
    let result
    if (path === '/api/access') result = { allowed: true }
    else if (path === '/api/records')
      result = { patients: data.patients, sessions: data.sessions, links: data.links }
    else if (path === '/api/calendar/status') result = { connected: true }
    else if (path === '/api/calendar/calendars')
      result = { items: [{ id: 'demo', summary: 'Test calendar', primary: true }] }
    else if (path === '/api/calendar/events') result = { items: data.events }
    else if (path === '/api/appointment-links') {
      data.links = data.links.filter(
        (link) => link.calendar_id !== body.calendar_id || link.event_id !== body.event_id,
      )
      if (method === 'PUT') {
        data.links.push(body)
        result = body
      } else return route.fulfill({ status: 204 })
    } else {
      const [, , table, id] = path.split('/')
      if (!['patients', 'sessions'].includes(table)) throw new Error(`Unexpected API route ${path}`)
      if (method === 'DELETE') {
        data[table] = data[table].filter((row) => row.id !== id)
        if (table === 'patients') {
          data.sessions = data.sessions.filter((row) => row.patient_id !== id)
          data.links = data.links.filter((row) => row.patient_id !== id)
        }
        return route.fulfill({ status: 204 })
      }
      if (method === 'POST') {
        result = {
          ...body,
          id: randomUUID(),
          archived: false,
          created_at: new Date().toISOString(),
        }
        data[table].push(result)
      } else if (method === 'PATCH') {
        result = { ...data[table].find((row) => row.id === id), ...body }
        data[table] = data[table].map((row) => (row.id === id ? result : row))
      } else throw new Error(`Unexpected method ${method}`)
    }
    await route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    })
  })
}
