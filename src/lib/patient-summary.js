export function patientSummaryContext(patient, sessions = []) {
  const lines = ['Patient clinical details:']
  for (const [key, label] of [
    ['age', 'Age'],
    ['condition', 'Recorded diagnosis'],
    ['symptoms', 'Symptoms'],
    ['assessment', 'Recorded assessment'],
    ['underlying_conditions', 'Relevant history'],
    ['history', 'Previously recorded medical notes'],
    ['medication', 'Medication'],
    ['pain_management', 'Pain management plan'],
    ['goals', 'Treatment goals'],
  ])
    if (patient[key] != null && patient[key] !== '') lines.push(`${label}: ${patient[key]}`)
  lines.push('\nAssessment questionnaire answers:')
  for (const tab of patient.intake?.tabs || []) {
    if (!tab.questions.length) continue
    lines.push(tab.title)
    for (const q of tab.questions) {
      const value = patient.intake.answers[q.id]
      lines.push(
        `${q.label}: ${value == null || value === '' ? 'Not answered' : value === true ? 'Yes' : value === false ? 'No' : String(value)}`,
      )
    }
  }
  const history = sessions
    .filter((s) => patient.id && s.patient_id === patient.id)
    .toSorted(
      (a, b) =>
        a.session_date.localeCompare(b.session_date) ||
        (a.created_at || '').localeCompare(b.created_at || ''),
    )
  if (history.length) lines.push('\nSession history (oldest first):')
  for (const session of history) {
    lines.push(`Visit: ${session.session_date}`)
    for (const [key, label] of [
      ['symptoms', 'Symptoms'],
      ['pain_score', 'Pain score (0–10)'],
      ['assessment', 'Assessment findings'],
      ['pain_management', 'Pain management plan'],
      ['treatment', 'Treatment performed'],
      ['progress', 'Progress / response'],
      ['plan', 'Next-session plan'],
    ])
      if (session[key] != null && session[key] !== '') lines.push(`${label}: ${session[key]}`)
  }
  return lines.join('\n')
}

export function summaryBullets(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.length && lines.every((line) => /^[-•]\s+/.test(line))
    ? lines.map((line) => line.replace(/^[-•]\s+/, ''))
    : null
}

export function formatPatientSummary(result) {
  const blocks = result.sections.map((section) => `**${section.title}**\n- ${section.summary}`)
  if (result.painGuidance.length)
    blocks.push(
      `**Pain management considerations**\n${result.painGuidance.map((item) => `- ${item.painType}: ${item.guidance}`).join('\n')}`,
    )
  blocks.push(
    `**Concerns to review**\n${result.concerns}`,
    `**Missing or uncertain information**\n${result.uncertainties}`,
  )
  return blocks.join('\n\n')
}

export function summarySections(text) {
  const lines = text.split('\n')
  if (!/^\*\*[^\n]+\*\*$/.test(lines[0]?.trim() || '')) return null
  const sections = []
  for (const line of lines) {
    const heading = /^\*\*(.+)\*\*$/.exec(line.trim())
    if (heading) sections.push({ title: heading[1], lines: [] })
    else if (line.trim()) sections.at(-1)?.lines.push(line.trim())
  }
  return sections.map((section) => ({
    title: section.title,
    text: section.lines.join('\n'),
    bullets: summaryBullets(section.lines.join('\n')),
  }))
}
