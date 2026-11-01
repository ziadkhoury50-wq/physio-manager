import { test, expect } from '@playwright/test'

const doctorId = '11111111-1111-4111-8111-111111111111'
function session() {
  const base64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const token = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ sub: doctorId, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.test`
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'test-refresh',
    user: {
      id: doctorId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'doctor@example.com',
    },
  }
}
async function mockApi(page, { allowed = true, saveError = false } = {}) {
  const writes = []
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    let body = []
    if (url.pathname.endsWith('/token')) body = session()
    else if (url.pathname.endsWith('/user')) body = session().user
    else throw new Error(`Unexpected direct Supabase data request: ${url.pathname}`)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let body
    if (!allowed)
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Only the designated doctor can access this workspace.' }),
      })
    if (path === '/api/access') body = { allowed: true }
    else if (path === '/api/records') body = { patients: [], sessions: [], links: [] }
    else if (path === '/api/calendar/status') body = { connected: false }
    else if (request.method() === 'POST' || request.method() === 'PATCH') {
      writes.push(request.postDataJSON())
      if (saveError)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Could not save this record. Please try again.' }),
        })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  return writes
}
async function signIn(page) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('doctor@example.com')
  await page.getByLabel('Password', { exact: true }).fill('private-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('configured app requires login and denies an undesignated account', async ({ page }) => {
  await mockApi(page, { allowed: false })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'This workspace is private' })).toBeVisible()
  await expect(page.getByText('Only the doctor account configured')).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
})
test('doctor opens an empty real workspace and failed saves preserve the draft', async ({
  page,
}) => {
  await mockApi(page, { saveError: true })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Your calendar.' })).toBeVisible()
  await expect(page.getByText('Design preview', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Connect your calendar' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Mobile navigation', exact: true })
    .getByRole('link', { name: 'Patients', exact: true })
    .click()
  await page.getByRole('button', { name: 'New patient', exact: true }).click()
  await page.getByLabel('Full name *', { exact: true }).fill('Draft patient')
  await page.getByRole('button', { name: 'Save patient', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save')
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Draft patient')
})
