import test from 'node:test'
import assert from 'node:assert/strict'
import { matchAppointment, normalizeName } from '../server/patient-matching.js'

const patients = [
  { id: 'a', name: 'Nadia Farah' },
  { id: 'b', name: 'Omar Haddad' },
]
test('matching accepts full names, reversed names, accents and one small typo', () => {
  assert.equal(matchAppointment('Physio: Nadia Farah - follow-up', patients).patient_id, 'a')
  assert.equal(matchAppointment('Farah Nadia', patients).patient_id, 'a')
  assert.equal(matchAppointment('Nadía Faráh', patients).patient_id, 'a')
  assert.equal(matchAppointment('Nadya Farah', patients).patient_id, 'a')
  assert.equal(
    matchAppointment('Nadia Adnan Farah', [{ id: 'a', name: 'Nadia Adnan Farah' }]).patient_id,
    'a',
  )
  assert.equal(normalizeName('إِياد خَوري'), normalizeName('اياد خوري'))
  assert.equal(matchAppointment('موعد اياد خوري', [{ id: 'a', name: 'إياد خوري' }]).patient_id, 'a')
})
test('matching refuses ambiguous names, first-name-only, relatives, archived patients and unrelated words', () => {
  assert.equal(matchAppointment('Nadia', patients).patient_id, null)
  assert.equal(
    matchAppointment('Nadia Farah', [...patients, { id: 'c', name: 'Nadya Farah' }]).patient_id,
    null,
  )
  assert.equal(
    matchAppointment('Nadia Farah', [...patients, { id: 'c', name: 'Nadia Farah' }]).patient_id,
    null,
  )
  assert.equal(matchAppointment('Nadia Farah + Omar Haddad', patients).patient_id, null)
  assert.equal(matchAppointment('Nadia Farah mother', patients).patient_id, null)
  assert.equal(matchAppointment('Nadia Farah private note', patients).patient_id, null)
  assert.equal(
    matchAppointment('Nadia Farah', [{ ...patients[0], archived: true }]).patient_id,
    null,
  )
  assert.equal(matchAppointment('Joann Smith', [{ id: 'a', name: 'Ann Smith' }]).patient_id, null)
  assert.equal(matchAppointment('', patients).patient_id, null)
})
