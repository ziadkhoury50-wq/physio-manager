import { addDays, weekDates } from './dates.js'

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

export function paymentSummary(sessions) {
  const priced = sessions.filter((s) => Number.isInteger(s.amount_cents) && s.amount_cents > 0)
  const pending = priced.filter((s) => s.payment_received !== true)
  return {
    received: priced
      .filter((s) => s.payment_received === true)
      .reduce((n, s) => n + s.amount_cents, 0),
    pendingTotal: pending.reduce((n, s) => n + s.amount_cents, 0),
    pending,
    unconfirmed: pending.filter((s) => s.payment_received == null).length,
  }
}
export const paymentLabel = (session) =>
  session.amount_cents == null
    ? 'No amount recorded'
    : session.amount_cents === 0
      ? 'No payment due'
      : session.payment_received === true
        ? 'Received'
        : session.payment_received === false
          ? 'Not received'
          : 'Not marked'

const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export function dashboardRange(period, today, custom = {}) {
  const month = today.slice(0, 7)
  const year = today.slice(0, 4)
  const monthStart = `${month}-01`
  const last = (start) => {
    const d = new Date(`${start}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    d.setUTCDate(0)
    return d.toISOString().slice(0, 10)
  }
  if (period === 'all') return { start: null, end: null }
  if (period === 'custom') {
    if (!validDate(custom.start) || !validDate(custom.end))
      return { error: 'Choose valid start and end dates.' }
    if (custom.start > custom.end) return { error: 'End date must be on or after the start date.' }
    return { start: custom.start, end: custom.end }
  }
  if (period === 'day') return { start: today, end: today }
  if (period === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) }
  if (period === 'last7') return { start: addDays(today, -6), end: today }
  if (period === 'week' || period === 'previousWeek') {
    const start = addDays(weekDates(today)[0], period === 'previousWeek' ? -7 : 0)
    return { start, end: addDays(start, 6) }
  }
  if (period === 'year') return { start: `${year}-01-01`, end: `${year}-12-31` }
  const start = period === 'previous' ? `${addDays(monthStart, -1).slice(0, 7)}-01` : monthStart
  return { start, end: last(start) }
}

export function revenueSummary(sessions, period, today, custom) {
  const range = dashboardRange(period, today, custom)
  const rows = range.error
    ? []
    : sessions.filter(
        (s) =>
          (!range.start || s.session_date >= range.start) &&
          (!range.end || s.session_date <= range.end),
      )
  const priced = rows.filter((s) => Number.isInteger(s.amount_cents) && s.amount_cents >= 0)
  const total = priced.reduce((sum, s) => sum + s.amount_cents, 0)
  const dates = rows.map((s) => s.session_date).sort()
  const start = range.start || dates[0] || today
  const end = range.end || dates.at(-1) || today
  const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000 + 1
  const granularity = days <= 14 ? 'day' : days <= 120 ? 'week' : days <= 730 ? 'month' : 'year'
  const bucketKey = (date) =>
    granularity === 'day'
      ? date
      : granularity === 'week'
        ? weekDates(date)[0]
        : granularity === 'month'
          ? date.slice(0, 7)
          : date.slice(0, 4)
  const buckets = new Map()
  let cursor =
    granularity === 'week'
      ? weekDates(start)[0]
      : granularity === 'month'
        ? `${start.slice(0, 7)}-01`
        : granularity === 'year'
          ? `${start.slice(0, 4)}-01-01`
          : start
  while (/^\d{4}-/.test(cursor) && cursor <= end && buckets.size < 10000) {
    buckets.set(bucketKey(cursor), 0)
    if (granularity === 'day' || granularity === 'week')
      cursor = addDays(cursor, granularity === 'week' ? 7 : 1)
    else {
      const d = new Date(`${cursor}T12:00:00Z`)
      if (granularity === 'month') d.setUTCMonth(d.getUTCMonth() + 1)
      else d.setUTCFullYear(d.getUTCFullYear() + 1)
      cursor = d.toISOString().slice(0, 10)
    }
  }
  for (const row of rows) {
    const key = bucketKey(row.session_date)
    buckets.set(
      key,
      (buckets.get(key) || 0) +
        (Number.isInteger(row.amount_cents) && row.amount_cents >= 0 ? row.amount_cents : 0),
    )
  }
  return {
    rows,
    payments: paymentSummary(rows),
    total,
    priced: priced.length,
    missing: rows.length - priced.length,
    average: priced.length ? Math.round(total / priced.length) : null,
    patientCount: new Set(rows.map((s) => s.patient_id)).size,
    buckets: [...buckets].sort(([a], [b]) => a.localeCompare(b)),
    granularity,
    range,
  }
}
