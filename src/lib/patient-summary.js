export const hasIntakeAnswer = (intake, tab) =>
  tab.questions.some((q) => intake.answers[q.id] != null && intake.answers[q.id] !== '')

export function profileSummary(intake) {
  const text = intake.summary || ''
  if (/^Answer overview\b/.test(text)) {
    const count = intake.tabs
      .flatMap((t) => t.questions)
      .filter((q) => intake.answers[q.id] != null && intake.answers[q.id] !== '').length
    return `${count} answers recorded. Open assessment answers for details.`
  }
  return text
}

export function visibleSummarySections(intake) {
  const sections = summarySections(profileSummary(intake))
  if (!sections) return null
  const key = (text) =>
    text
      .toLowerCase()
      .replace(/[\p{P}\s]+/gu, ' ')
      .trim()
  const unused = new Set(
    intake.tabs.filter((tab) => !hasIntakeAnswer(intake, tab)).map((tab) => key(tab.title)),
  )
  return sections.filter(
    (section) =>
      !unused.has(key(section.title)) &&
      !/^all (?:items|questions|screening questions) (?:are )?unanswered\b/i.test(
        section.text.replace(/^[-•]\s*/, ''),
      ),
  )
}

export function patientSummaryContext(patient, sessions = []) {
  const lines = ['Patient clinical details:']
  for (const [key, label] of [
    ['age', 'Age'],
    ['condition', 'Recorded diagnosis'],
    ['symptoms', 'Symptoms'],
    ['imaging_findings', 'Imaging findings'],
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
    if (!hasIntakeAnswer(patient.intake, tab)) continue
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
      ['msk_ultrasound', 'MSK ultrasound imaging'],
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
  return [
    result.sections[0]?.summary,
    result.painGuidance[0]?.guidance,
    [result.concerns, result.uncertainties].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n')
}

export function compactSummary(intake) {
  const sections = visibleSummarySections(intake)
  const text = profileSummary(intake)
  const brief = (value) => (value.length > 160 ? value.slice(0, 157).trimEnd() + '...' : value)
  if (!sections)
    return (summaryBullets(text) || text.split(/\n+/)).filter(Boolean).slice(0, 3).map(brief)
  const care = sections.find((s) => /pain management|care consideration/i.test(s.title))
  const review = sections.filter((s) => /concerns|missing|uncertain|unclear/i.test(s.title))
  return [sections[0]?.text, care?.text, review.map((s) => s.text).join(' ')]
    .filter(Boolean)
    .map((value) => brief(value.replace(/^[-\u2022]\s*/gm, '').replace(/\n/g, ' ')))
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
