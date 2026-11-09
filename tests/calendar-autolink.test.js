import test from 'node:test'
import assert from 'node:assert/strict'
import { createServices } from '../server/services.js'

test('automatic links preserve manual choices, blocks and invalidate changed titles without reassignment', async () => {
  const rows = {
    patients: [
      { id: 'a', name: 'Nadia Farah' },
      { id: 'b', name: 'Omar Haddad' },
    ],
    appointment_links: [
      {
        owner_id: 'doctor',
        calendar_id: 'cal',
        event_id: 'manual',
        patient_id: 'a',
        source: 'manual',
      },
      {
        owner_id: 'doctor',
        calendar_id: 'cal',
        event_id: 'blocked',
        patient_id: null,
        source: 'blocked',
      },
    ],
  }
  const db = {
    from(table) {
      return {
        select() {
          return this
        },
        order() {
          return this
        },
        range() {
          return Promise.resolve({ data: structuredClone(rows[table]), error: null })
        },
        upsert(values, options) {
          for (const value of Array.isArray(values) ? values : [values]) {
            const i = rows[table].findIndex(
              (r) => r.calendar_id === value.calendar_id && r.event_id === value.event_id,
            )
            if (i < 0) rows[table].push(value)
            else if (!options?.ignoreDuplicates) rows[table][i] = value
          }
          return {
            select() {
              return this
            },
            single() {
              return Promise.resolve({ error: null, data: values })
            },
            then(resolve) {
              resolve({ error: null, data: values })
            },
          }
        },
        update(value) {
          const filters = []
          return {
            eq(key, v) {
              filters.push([key, v])
              return this
            },
            then(resolve) {
              for (const row of rows[table])
                if (filters.every(([k, v]) => row[k] === v)) Object.assign(row, value)
              resolve({ error: null })
            },
          }
        },
      }
    },
  }
  const records = createServices({
    supabaseUrl: 'http://127.0.0.1:54321',
    serviceKey: 'test',
    publishableKey: 'test',
  }).records
  const doctor = { id: 'doctor', db }
  const events = [
    { id: 'auto', summary: 'Nadia Farah - follow-up' },
    { id: 'manual', summary: 'Omar Haddad' },
    { id: 'blocked', summary: 'Nadia Farah' },
  ]
  let result = await records.autoLink(doctor, 'cal', events)
  assert.equal(result.links.find((r) => r.event_id === 'auto').source, 'automatic')
  assert.equal(result.links.find((r) => r.event_id === 'manual').patient_id, 'a')
  assert.equal(result.links.find((r) => r.event_id === 'blocked').patient_id, null)
  result = await records.autoLink(doctor, 'cal', [{ id: 'auto', summary: 'Omar Haddad' }])
  assert.equal(result.links.find((r) => r.event_id === 'auto').source, 'blocked')
  await records.link(doctor, { calendar_id: 'cal', event_id: 'auto', patient_id: 'b' })
  assert.equal(rows.appointment_links.find((r) => r.event_id === 'auto').source, 'manual')
  await records.unlink(doctor, { calendar_id: 'cal', event_id: 'auto' })
  assert.equal(rows.appointment_links.find((r) => r.event_id === 'auto').source, 'blocked')
  assert.equal(rows.appointment_links.find((r) => r.event_id === 'auto').patient_id, null)
})
