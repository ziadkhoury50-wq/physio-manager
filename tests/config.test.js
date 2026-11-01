import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePublicUrls } from '../server/config.js'

test('Render supplies HTTPS origins and the exact Google callback automatically', () => {
  const config = resolvePublicUrls({
    PORT: '10000',
    RENDER_EXTERNAL_URL: 'https://physiomanager-example.onrender.com',
  })
  assert.equal(config.port, 10000)
  assert.equal(config.origin, 'https://physiomanager-example.onrender.com')
  assert.equal(config.publicApiUrl, config.origin)
  assert.equal(
    config.callbackUrl,
    'https://physiomanager-example.onrender.com/api/calendar/callback',
  )
})
test('explicit production or local URL settings take precedence over the Render default', () => {
  const config = resolvePublicUrls({
    RENDER_EXTERNAL_URL: 'https://example.onrender.com',
    APP_URL: 'https://clinic.example.com/',
    API_PUBLIC_URL: 'https://clinic.example.com/',
  })
  assert.equal(config.origin, 'https://clinic.example.com')
  assert.equal(config.callbackUrl, 'https://clinic.example.com/api/calendar/callback')
  assert.equal(
    resolvePublicUrls({
      PORT: '3001',
      APP_URL: 'http://127.0.0.1:3001',
      API_PUBLIC_URL: 'http://127.0.0.1:3001',
    }).callbackUrl,
    'http://127.0.0.1:3001/api/calendar/callback',
  )
})
