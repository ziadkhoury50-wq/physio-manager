import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createCalendarService, encryptToken, decryptToken } from '../server/google-calendar.js'

test('Google credentials are encrypted with authenticated encryption and tampering is rejected', () => {
  const key = randomBytes(32).toString('base64')
  const encrypted = encryptToken('synthetic-refresh-token', key)
  assert.equal(encrypted.includes('synthetic-refresh-token'), false)
  assert.equal(decryptToken(encrypted, key), 'synthetic-refresh-token')
  assert.notEqual(encrypted, encryptToken('synthetic-refresh-token', key))
  assert.throws(() => decryptToken(encrypted, randomBytes(32).toString('base64')))
  const [iv, tag, data] = encrypted.split('.')
  assert.throws(() => decryptToken(`${iv}.${tag}.${data.slice(1)}`, key))
})
test('calendar resources use GET only, expand recurring events, and follow pagination', async () => {
  const key = randomBytes(32).toString('base64')
  const calls = []
  const admin = {
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        async maybeSingle() {
          return { data: { refresh_token_encrypted: encryptToken('synthetic-token', key) } }
        },
      }
    },
  }
  const google = {
    setCredentials(value) {
      assert.equal(value.refresh_token, 'synthetic-token')
    },
    async request(options) {
      calls.push(options)
      return {
        data:
          calls.length === 1
            ? { items: [{ id: 'event-1' }], nextPageToken: 'page-2' }
            : { items: [{ id: 'event-2' }] },
      }
    },
  }
  const service = createCalendarService(admin, { encryptionKey: key }, () => google)
  const result = await service.events('doctor', {
    calendarId: 'calendar@example.com',
    timeMin: '2026-11-01T00:00:00Z',
    timeMax: '2026-11-08T00:00:00Z',
  })
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['event-1', 'event-2'],
  )
  assert.ok(calls.every((call) => call.method === 'GET'))
  assert.equal(new URL(calls[0].url).searchParams.get('singleEvents'), 'true')
  assert.equal(new URL(calls[1].url).searchParams.get('pageToken'), 'page-2')
  google.request = async () => {
    const error = new Error('invalid_grant')
    error.response = { status: 400 }
    throw error
  }
  await assert.rejects(
    () => service.events('doctor', { calendarId: 'primary' }),
    (error) => error.status === 409 && error.message.includes('reconnect'),
  )
})
