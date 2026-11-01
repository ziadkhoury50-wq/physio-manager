import { addDays, dateKey } from '../../src/lib/dates.js'

export function fixtureData() {
  const today = dateKey()
  const patients = [
    {
      id: 'demo-1',
      name: 'Nadia Farah',
      phone: '+961 70 123 456',
      referred_by: 'Dr. Test Referral',
      underlying_conditions: '',
      medication: '',
      date_of_birth: '1988-04-12',
      condition: 'Rotator cuff rehabilitation',
      history: 'Right shoulder pain following a sports injury. Discomfort with overhead movement.',
      goals: 'Return to swimming comfortably and restore full shoulder mobility.',
      archived: false,
      created_at: today,
    },
    {
      id: 'demo-2',
      name: 'Omar Haddad',
      phone: '+961 71 234 567',
      referred_by: '',
      underlying_conditions: '',
      medication: '',
      date_of_birth: '1979-09-22',
      condition: 'Lower back pain',
      history: 'Recurrent lower back discomfort with prolonged sitting.',
      goals: 'Improve sitting tolerance and return to regular exercise.',
      archived: false,
      created_at: today,
    },
    {
      id: 'demo-3',
      name: 'Lina Tabet',
      phone: '+961 76 345 678',
      referred_by: '',
      underlying_conditions: '',
      medication: '',
      date_of_birth: '1995-02-05',
      condition: 'ACL recovery',
      history: 'Post-operative knee rehabilitation.',
      goals: 'Restore strength and confidence with daily activities.',
      archived: false,
      created_at: today,
    },
    {
      id: 'demo-4',
      name: 'Karim Mansour',
      phone: '+961 03 456 789',
      referred_by: '',
      underlying_conditions: '',
      medication: '',
      date_of_birth: null,
      condition: 'Neck & posture',
      history: '',
      goals: 'Comfortable movement throughout the working day.',
      archived: false,
      created_at: today,
    },
  ]
  const sessions = [
    {
      id: 'session-1',
      patient_id: 'demo-1',
      session_date: addDays(today, -3),
      symptoms: 'Less discomfort with daily movement. Some pain at night.',
      pain_score: 4,
      treatment:
        'Shoulder mobility exercises, gentle manual therapy, and progressive resistance work.',
      progress: 'Improved range of motion and tolerance to exercise.',
      plan: 'Continue home exercises. Review overhead movement next session.',
      created_at: today,
    },
    {
      id: 'session-2',
      patient_id: 'demo-2',
      session_date: addDays(today, -1),
      symptoms: 'Lower back stiffness after sitting.',
      pain_score: 5,
      treatment: 'Lumbar mobility, soft tissue work, and guided core exercises.',
      progress: 'Moving more freely after the session.',
      plan: 'Continue daily mobility routine and review sitting tolerance.',
      created_at: today,
    },
    {
      id: 'session-3',
      patient_id: 'demo-1',
      session_date: addDays(today, -7),
      symptoms: 'Shoulder discomfort with reaching.',
      pain_score: 6,
      treatment: 'Initial movement assessment and gentle assisted range of motion.',
      progress: 'Tolerated initial exercises well.',
      plan: 'Begin home mobility routine.',
      created_at: today,
    },
  ]
  // Test-only synthetic records. Never imported by application code.
  const events = [
    {
      id: 'event-1',
      summary: 'Nadia Farah · Follow-up',
      start: { dateTime: `${today}T09:00:00+02:00` },
      end: { dateTime: `${today}T09:45:00+02:00` },
      location: 'Treatment room 1',
    },
    {
      id: 'event-2',
      summary: 'Omar Haddad · Rehabilitation',
      start: { dateTime: `${today}T10:00:00+02:00` },
      end: { dateTime: `${today}T10:45:00+02:00` },
      location: 'Treatment room 1',
    },
    {
      id: 'event-3',
      summary: 'Lina Tabet · Initial assessment',
      start: { dateTime: `${today}T11:30:00+02:00` },
      end: { dateTime: `${today}T12:30:00+02:00` },
      location: 'Treatment room 2',
    },
    {
      id: 'event-4',
      summary: 'Karim Mansour · Follow-up',
      start: { dateTime: `${today}T14:00:00+02:00` },
      end: { dateTime: `${today}T14:45:00+02:00` },
    },
  ]
  return {
    patients,
    sessions,
    events,
    links: [
      { calendar_id: 'demo', event_id: 'event-1', patient_id: 'demo-1' },
      { calendar_id: 'demo', event_id: 'event-2', patient_id: 'demo-2' },
    ],
  }
}
