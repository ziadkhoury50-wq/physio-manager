export function patientProgress(sessions) {
  const chronological = [...sessions].sort(
    (a, b) =>
      a.session_date.localeCompare(b.session_date) ||
      (a.created_at || '').localeCompare(b.created_at || '') ||
      a.id.localeCompare(b.id),
  )
  const scored = chronological.filter(
    (s) => Number.isFinite(s.pain_score) && s.pain_score >= 0 && s.pain_score <= 10,
  )
  return {
    chronological,
    scored,
    baseline: scored[0] || null,
    latest: scored.at(-1) || null,
    change: scored.length > 1 ? scored.at(-1).pain_score - scored[0].pain_score : null,
    lastVisit: chronological.at(-1)?.session_date || null,
  }
}
