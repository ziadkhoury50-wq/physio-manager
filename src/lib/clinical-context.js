export function clinicalContext(patient, sessions, draft) {
  const fields = [
    'symptoms',
    'pain_score',
    'assessment',
    'pain_management',
    'treatment',
    'progress',
    'plan',
  ]
  const lines = ['Current session draft:']
  const append = (record, keys) =>
    lines.push(
      ...keys
        .filter((key) => record[key] != null && record[key] !== '')
        .map((key) => `${key.replaceAll('_', ' ')}: ${record[key]}`),
    )
  append(draft, fields)
  lines.push('\nPatient background (not findings from this visit):')
  append(patient, [
    'age',
    'condition',
    'symptoms',
    'assessment',
    'pain_management',
    'underlying_conditions',
    'medication',
    'history',
    'goals',
  ])
  sessions
    .filter((s) => s.patient_id === patient.id && s.id !== draft.id)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 3)
    .forEach((s, i) => {
      lines.push(`\nPrevious session ${i + 1} (most recent first):`)
      append(s, fields)
    })
  return lines.join('\n').slice(0, 14000)
}
