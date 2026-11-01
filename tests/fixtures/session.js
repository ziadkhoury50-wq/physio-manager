export function testSession() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const id = '11111111-1111-4111-8111-111111111111'
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.test`,
    refresh_token: 'test-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'doctor@example.com' },
  }
}
