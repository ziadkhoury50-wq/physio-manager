import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../server/app.js'
import { HttpError } from '../server/errors.js'

const doctorId = '11111111-1111-4111-8111-111111111111'
const patientId = '22222222-2222-4222-8222-222222222222'
function fixture() {
  const calls = []
  const services = {
    async verify(token) {
      if (token === 'other')
        throw new HttpError(403, 'Only the designated doctor can access this workspace.')
      if (token !== 'doctor') throw new HttpError(401, 'Your session has expired.')
      return { id: doctorId }
    },
    records: {
      async remove(doctor, table, id) {
        calls.push({ doctor, table, id })
      },
      async list() {
        return { patients: [], sessions: [], links: [] }
      },
      async save(doctor, table, record, id) {
        calls.push({ doctor, table, record, id })
        return { ...record, id: id || patientId, owner_id: doctor.id }
      },
      async link(doctor, record) {
        calls.push({ doctor, record })
        return record
      },
      async unlink(doctor, record) {
        calls.push({ doctor, record })
      },
    },
    calendar: {
      async status() {
        return { connected: false }
      },
      async connect() {
        return { url: 'https://accounts.google.com/o/oauth2/v2/auth' }
      },
      async events(owner, query) {
        calls.push({ owner, query })
        return { items: [] }
      },
      async calendars() {
        return { items: [] }
      },
      async disconnect() {
        return { disconnected: true }
      },
      async callback() {
        throw new HttpError(400, 'Expired state')
      },
    },
  }
  return { app: createApp({ services }), services, calls }
}

test('Express accepts cents and rejects invalid session amounts', async () => {
  const { app } = fixture()
  const body = { patient_id: patientId, session_date: '2026-11-03', treatment: 'Assessment' }
  for (const amount of [-1, 1.5, 100000001, '45.25'])
    await request(app)
      .post('/api/sessions')
      .set('Authorization', 'Bearer doctor')
      .send({ ...body, amount_cents: amount })
      .expect(400)
  const response = await request(app)
    .post('/api/sessions')
    .set('Authorization', 'Bearer doctor')
    .send({ ...body, amount_cents: 4525 })
    .expect(201)
  assert.equal(response.body.amount_cents, 4525)
})

test('Express validates deletion identifiers and delegates only doctor-owned record deletion', async () => {
  const { app, calls } = fixture()
  for (const table of ['patients', 'sessions']) {
    await request(app)
      .delete(`/api/${table}/not-an-id`)
      .set('Authorization', 'Bearer doctor')
      .expect(400)
    await request(app)
      .delete(`/api/${table}/${patientId}`)
      .set('Authorization', 'Bearer doctor')
      .expect(204)
  }
  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls.map(({ table, id }) => ({ table, id })),
    [
      { table: 'patients', id: patientId },
      { table: 'sessions', id: patientId },
    ],
  )
})

test('Express protects record and calendar endpoints from missing, invalid, and other-user tokens', async () => {
  const { app, calls } = fixture()
  for (const [method, path] of [
    ['get', '/api/records'],
    ['post', '/api/patients'],
    ['delete', `/api/patients/${patientId}`],
    ['delete', `/api/sessions/${patientId}`],
    ['post', '/api/sessions'],
    ['get', '/api/calendar/status'],
    ['post', '/api/calendar/connect'],
    ['post', '/api/clinical-assistant'],
    ['put', '/api/appointment-links'],
    ['delete', '/api/calendar/connection'],
  ]) {
    await request(app)[method](path).expect(401)
    await request(app)[method](path).set('Authorization', 'Bearer expired').expect(401)
    await request(app)[method](path).set('Authorization', 'Bearer other').expect(403)
  }
  assert.equal(calls.length, 0)
})
test('Express validates writes, rejects injected ownership, and preserves zero pain scores', async () => {
  const { app, calls } = fixture()
  const post = (path, body) =>
    request(app).post(path).set('Authorization', 'Bearer doctor').send(body)
  await post('/api/patients', { name: '   ' }).expect(400)
  await post('/api/patients', { name: 'Synthetic', owner_id: doctorId }).expect(400)
  await post('/api/patients', { name: 'Synthetic', date_of_birth: '2026-02-30' }).expect(400)
  await post('/api/patients', { name: 'Synthetic', email: 'invalid' }).expect(400)
  await post('/api/patients', { name: 'Synthetic', referred_by: 'x'.repeat(301) }).expect(400)
  await post('/api/patients', { name: 'Synthetic', medication: 'x'.repeat(10001) }).expect(400)
  await post('/api/patients', {
    name: 'Synthetic',
    underlying_conditions: 'x'.repeat(10001),
  }).expect(400)
  const session = {
    patient_id: patientId,
    session_date: '2026-11-01',
    treatment: 'Movement assessment',
    pain_score: 0,
  }
  await post('/api/sessions', { ...session, pain_score: 11 }).expect(400)
  await post('/api/sessions', { ...session, pain_score: 2.5 }).expect(400)
  await post('/api/sessions', { ...session, patient_id: 'not-a-uuid' }).expect(400)
  await post('/api/sessions', { ...session, calendar_id: 'cal' }).expect(400)
  await post('/api/sessions', session).expect(201)
  const response = await post('/api/patients', {
    name: '  Synthetic Patient  ',
    referred_by: 'Dr. Referral',
    underlying_conditions: 'Recorded condition',
    medication: 'Recorded medication',
  }).expect(201)
  assert.equal(response.body.name, 'Synthetic Patient')
  assert.equal(response.body.referred_by, 'Dr. Referral')
  assert.equal(response.body.underlying_conditions, 'Recorded condition')
  assert.equal(response.body.medication, 'Recorded medication')
  assert.equal(calls[0].record.pain_score, 0)
  assert.equal(calls[0].doctor.id, doctorId)
  assert.equal('owner_id' in calls[0].record, false)
  assert.equal(calls.length, 2)
})
test('Express supports patient archiving, appointment linking, and validates calendar ranges', async () => {
  const { app, calls } = fixture()
  await request(app)
    .patch(`/api/patients/${patientId}`)
    .set('Authorization', 'Bearer doctor')
    .send({ archived: true })
    .expect(200)
  assert.deepEqual(calls[0].record, { archived: true })
  await request(app)
    .patch('/api/patients/bad-id')
    .set('Authorization', 'Bearer doctor')
    .send({ archived: true })
    .expect(400)
  await request(app)
    .put('/api/appointment-links')
    .set('Authorization', 'Bearer doctor')
    .send({ calendar_id: 'cal', event_id: 'event', patient_id: patientId })
    .expect(200)
  await request(app)
    .delete('/api/appointment-links')
    .set('Authorization', 'Bearer doctor')
    .send({ calendar_id: 'cal', event_id: 'event' })
    .expect(204)
  const query = {
    calendarId: 'primary',
    timeMin: '2026-11-01T00:00:00Z',
    timeMax: '2026-11-08T00:00:00Z',
  }
  await request(app)
    .get('/api/calendar/events')
    .set('Authorization', 'Bearer doctor')
    .query(query)
    .expect(200)
  await request(app)
    .get('/api/calendar/events')
    .set('Authorization', 'Bearer doctor')
    .query({ ...query, timeMax: '2026-12-30T00:00:00Z' })
    .expect(400)
  await request(app)
    .post('/api/calendar/events')
    .set('Authorization', 'Bearer doctor')
    .send({})
    .expect(404)
})
test('Express hides internals, sets security headers, and rejects malformed requests', async () => {
  const { app, services } = fixture()
  const health = await request(app).get('/api/health').expect(200)
  assert.equal(health.headers['x-powered-by'], undefined)
  assert.equal(health.headers['x-content-type-options'], 'nosniff')
  assert.equal(health.headers['cache-control'], 'no-store')
  await request(app)
    .post('/api/patients')
    .set('Content-Type', 'application/json')
    .send('{bad')
    .expect(400)
  services.records.list = async () => {
    throw new Error('DO_NOT_EXPOSE_SECRET')
  }
  const error = await request(app)
    .get('/api/records')
    .set('Authorization', 'Bearer doctor')
    .expect(500)
  assert.equal(JSON.stringify(error.body).includes('DO_NOT_EXPOSE_SECRET'), false)
  const callback = await request(app)
    .get('/api/calendar/callback?state=expired&redirect=https://evil.example')
    .expect(303)
  assert.equal(new URL(callback.headers.location).origin, 'http://localhost:5173')
  assert.equal(new URL(callback.headers.location).searchParams.get('calendar'), 'failed')
  const missing = createApp({ services: null })
  await request(missing).get('/api/health').expect(200)
  await request(missing).get('/api/records').expect(503)
  const limited = createApp({ services, limit: 1 })
  await request(limited).get('/api/health').expect(200)
  await request(limited).get('/api/health').expect(429)
})
