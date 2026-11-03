export function parseUsd(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text))
    throw new Error('Enter a USD amount with up to two decimal places.')
  const [dollars, cents = ''] = text.split('.')
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
  if (total > 100000000) throw new Error('The session amount cannot exceed $1,000,000.')
  return total
}
export const usd = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function revenueSummary(sessions, period, today) {
  const year = today.slice(0, 4)
  const month = today.slice(0, 7)
  const prior = new Date(`${month}-01T12:00:00Z`)
  prior.setUTCMonth(prior.getUTCMonth() - 1)
  const previousMonth = prior.toISOString().slice(0, 7)
  const rows = sessions.filter(
    (s) =>
      period === 'all' ||
      (period === 'year'
        ? s.session_date.startsWith(year)
        : s.session_date.startsWith(period === 'previous' ? previousMonth : month)),
  )
  const priced = rows.filter((s) => Number.isInteger(s.amount_cents) && s.amount_cents >= 0)
  const total = priced.reduce((sum, s) => sum + s.amount_cents, 0)
  const monthly = period === 'all' || period === 'year'
  const buckets = new Map()
  if (period === 'year')
    for (let i = 1; i <= 12; i++) buckets.set(`${year}-${String(i).padStart(2, '0')}`, 0)
  if (!monthly) for (let i = 1; i <= 5; i++) buckets.set(`Week ${i}`, 0)
  for (const row of rows) {
    const key = monthly
      ? row.session_date.slice(0, 7)
      : `Week ${Math.ceil(Number(row.session_date.slice(8, 10)) / 7)}`
    buckets.set(key, (buckets.get(key) || 0) + (row.amount_cents ?? 0))
  }
  return {
    rows,
    total,
    priced: priced.length,
    missing: rows.length - priced.length,
    average: priced.length ? Math.round(total / priced.length) : null,
    patientCount: new Set(rows.map((s) => s.patient_id)).size,
    buckets: [...buckets].sort(([a], [b]) => a.localeCompare(b)),
  }
}
