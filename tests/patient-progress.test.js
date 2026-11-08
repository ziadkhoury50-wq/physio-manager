import test from 'node:test'
import assert from 'node:assert/strict'
import { patientProgress } from '../src/lib/patient-progress.js'
import { clinicalContext } from '../src/lib/clinical-context.js'

test('pain progress compares chronological recorded scores, includes zero and never fills missing values', () => {
  const p = patientProgress([
    { id: 'c', session_date: '2026-11-03', pain_score: null },
    { id: 'b', session_date: '2026-11-02', pain_score: 0 },
    { id: 'a', session_date: '2026-11-01', pain_score: 6 },
  ])
  assert.equal(p.baseline.pain_score, 6)
  assert.equal(p.latest.pain_score, 0)
  assert.equal(p.change, -6)
  assert.equal(p.lastVisit, '2026-11-03')
  assert.equal(p.scored.length, 2)
  assert.equal(
    patientProgress([{ id: 'a', session_date: '2026-11-01', pain_score: 0 }]).change,
    null,
  )
  assert.equal(patientProgress([]).latest, null)
})
test('AI preview includes current session assessment and pain plan while excluding identifiers and amounts', () => {
  const text = clinicalContext(
    {
      id: 'a',
      name: 'Private name',
      phone: '123456',
      age: 0,
      condition: 'Shoulder',
      assessment: 'Older background',
    },
    [],
    { assessment: 'Current findings', pain_management: 'Current plan', pain_score: 0, amount: 500 },
  )
  assert.match(text, /assessment: Current findings/)
  assert.match(text, /pain management: Current plan/)
  assert.match(text, /pain score: 0/)
  assert.match(text, /age: 0/)
  assert.ok(!text.includes('Private name') && !text.includes('123456') && !text.includes('500'))
})
