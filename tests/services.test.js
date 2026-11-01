import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createServices } from '../server/services.js'

test('the real Express service validates tokens with Supabase and rechecks the doctor allowlist', async () => {
  const calls = []
  const provider = createServer((req, res) => {
    const token = req.headers.authorization?.slice(7)
    calls.push({ url: req.url, token })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/auth/v1/user') {
      if (!['doctor', 'other'].includes(token)) {
        res.statusCode = 401
        res.end(JSON.stringify({ code: 'bad_jwt', message: 'Invalid token' }))
        return
      }
      res.end(
        JSON.stringify({
          id:
            token === 'doctor'
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222',
          email: 'synthetic@example.com',
          aud: 'authenticated',
        }),
      )
    } else if (req.url === '/rest/v1/rpc/is_doctor') res.end(JSON.stringify(token === 'doctor'))
    else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  try {
    const service = createServices({
      supabaseUrl: `http://127.0.0.1:${provider.address().port}`,
      publishableKey: 'synthetic-publishable',
      serviceKey: 'synthetic-service',
    })
    const doctor = await service.verify('doctor')
    assert.equal(doctor.id, '11111111-1111-4111-8111-111111111111')
    await assert.rejects(
      () => service.verify('other'),
      (error) => error.status === 403,
    )
    await assert.rejects(
      () => service.verify('expired'),
      (error) => error.status === 401,
    )
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        '/auth/v1/user',
        '/rest/v1/rpc/is_doctor',
        '/auth/v1/user',
        '/rest/v1/rpc/is_doctor',
        '/auth/v1/user',
      ],
    )
  } finally {
    provider.closeAllConnections()
    await new Promise((resolve) => provider.close(resolve))
  }
})
