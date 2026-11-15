import test from 'node:test'
import assert from 'node:assert/strict'
import {
  patientSummaryContext,
  summaryBullets,
  formatPatientSummary,
  summarySections,
} from '../src/lib/patient-summary.js'

test('summary context includes the full clinical profile, all questionnaire answers and all matching visits without identifiers or payment data', () => {
  const patient = {
    id: 'patient-1',
    name: 'Private Name',
    phone: 'PRIVATE-PHONE',
    email: 'PRIVATE-EMAIL',
    age: 0,
    condition: 'Recorded diagnosis',
    imaging_findings: 'MRI findings recorded by the referring provider.',
    assessment: 'Patient findings',
    history: 'Legacy medical notes',
    underlying_conditions: 'Relevant history',
    medication: 'Medication notes',
    pain_management: 'Pain plan',
    goals: 'Patient goals',
    intake: {
      tabs: [
        {
          title: 'Screening',
          questions: [
            { id: 'no', label: 'Night pain?' },
            { id: 'zero', label: 'Pain score' },
            { id: 'missing', label: 'Missing item' },
          ],
        },
      ],
      answers: { no: false, zero: 0 },
    },
  }
  const sessions = Array.from({ length: 40 }, (_, i) => ({
    patient_id: patient.id,
    session_date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    assessment: `Visit findings ${i}`,
    treatment: `Treatment ${i}`,
    progress: `Response ${i}`,
    plan: `Next plan ${i}`,
    pain_score: 0,
    msk_ultrasound: `Ultrasound ${i}`,
    amount_cents: 9876543,
    payment_received: false,
  }))
  sessions.push({
    patient_id: 'other-patient',
    session_date: '2026-12-01',
    treatment: 'OTHER-PATIENT-NOTES',
  })
  const context = patientSummaryContext(patient, sessions)
  for (const expected of [
    'Recorded assessment: Patient findings',
    'Imaging findings: MRI findings recorded by the referring provider.',
    'Night pain?: No',
    'Pain score: 0',
    'Missing item: Not answered',
    'Visit findings 0',
    'Visit findings 39',
    'MSK ultrasound imaging: Ultrasound 0',
    'Treatment 39',
    'Response 39',
    'Next plan 39',
    'Pain score (0\u201310): 0',
    'Age: 0',
    'Pain plan',
    'Patient goals',
    'Medication notes',
  ])
    assert.ok(context.includes(expected), expected)
  for (const privateValue of [
    'Private Name',
    'PRIVATE-PHONE',
    'PRIVATE-EMAIL',
    'patient-1',
    '9876543',
    'payment_received',
    'OTHER-PATIENT-NOTES',
  ])
    assert.ok(!context.includes(privateValue), privateValue)
  assert.deepEqual(summaryBullets('- First point\n- Second point'), ['First point', 'Second point'])
  assert.equal(summaryBullets('Existing paragraph summary.'), null)
})

test('structured summaries keep assessment and pain bullets apart from plain concerns and uncertainty text', () => {
  const rendered = formatPatientSummary({
    sections: [{ title: 'Assessment', summary: 'Night pain denied.' }],
    painGuidance: [{ painType: 'Recorded elbow pain', guidance: 'Review the documented plan.' }],
    concerns: 'No concerns documented.',
    uncertainties: 'Strength measurements not documented.',
  })
  const sections = summarySections(rendered)
  assert.deepEqual(sections[0].bullets, ['Night pain denied.'])
  assert.equal(sections[1].title, 'Pain management considerations')
  assert.equal(sections[2].bullets, null)
  assert.equal(sections[2].text, 'No concerns documented.')
  assert.equal(sections[3].title, 'Missing or uncertain information')
  assert.equal(summarySections('Legacy paragraph.'), null)
})
