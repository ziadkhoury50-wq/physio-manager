import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardRange, parseUsd, revenueSummary, usd } from '../src/lib/revenue.js'

test('dashboard presets handle days, Monday weeks, leap months and year boundaries', () => {
  assert.deepEqual(dashboardRange('day', '2026-11-03'), { start: '2026-11-03', end: '2026-11-03' })
  assert.deepEqual(dashboardRange('yesterday', '2026-01-01'), {
    start: '2025-12-31',
    end: '2025-12-31',
  })
  assert.deepEqual(dashboardRange('week', '2026-01-01'), { start: '2025-12-29', end: '2026-01-04' })
  assert.deepEqual(dashboardRange('week', '2026-01-04'), { start: '2025-12-29', end: '2026-01-04' })
  assert.deepEqual(dashboardRange('previousWeek', '2026-01-01'), {
    start: '2025-12-22',
    end: '2025-12-28',
  })
  assert.deepEqual(dashboardRange('last7', '2026-01-03'), {
    start: '2025-12-28',
    end: '2026-01-03',
  })
  assert.deepEqual(dashboardRange('month', '2024-02-15'), {
    start: '2024-02-01',
    end: '2024-02-29',
  })
  assert.deepEqual(dashboardRange('previous', '2026-01-01'), {
    start: '2025-12-01',
    end: '2025-12-31',
  })
})

test('custom date filters include both boundaries, reject invalid dates and keep chart totals consistent', () => {
  const sessions = ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30'].map((date, i) => ({
    patient_id: String(i),
    session_date: date,
    amount_cents: 100,
  }))
  const filtered = revenueSummary(sessions, 'custom', '2026-11-03', {
    start: '2026-03-28',
    end: '2026-03-29',
  })
  assert.equal(filtered.total, 200)
  assert.equal(filtered.rows.length, 2)
  assert.equal(filtered.granularity, 'day')
  assert.equal(
    filtered.buckets.reduce((sum, [, amount]) => sum + amount, 0),
    filtered.total,
  )
  assert.equal(
    revenueSummary(sessions, 'custom', '2026-11-03', { start: '2026-03-28', end: '2026-03-28' })
      .rows.length,
    1,
  )
  for (const range of [
    { start: '', end: '' },
    { start: '2026-02-30', end: '2026-03-03' },
    { start: '2026-03-30', end: '2026-03-29' },
  ])
    assert.ok(dashboardRange('custom', '2026-11-03', range).error)
  assert.equal(
    revenueSummary(sessions, 'custom', '2026-11-03', { start: '', end: '' }).rows.length,
    0,
  )
  assert.equal(revenueSummary(sessions, 'month', '2026-03-03').granularity, 'week')
  assert.equal(revenueSummary(sessions, 'year', '2026-03-03').granularity, 'month')
})

test('USD input converts exactly to integer cents and distinguishes blank from zero', () => {
  assert.equal(parseUsd(''), null)
  assert.equal(parseUsd('0.00'), 0)
  assert.equal(parseUsd('0.10'), 10)
  assert.equal(parseUsd('45.25'), 4525)
  assert.equal(parseUsd('1.2'), 120)
  assert.equal(usd(4525), '$45.25')
  for (const invalid of ['-1', '1.001', '1e3', '$2', '1000000.01', 'Infinity'])
    assert.throws(() => parseUsd(invalid))
})
test('revenue excludes missing amounts, includes zero and filters by session date', () => {
  const rows = [
    { patient_id: 'a', session_date: '2026-11-03', amount_cents: 1000 },
    { patient_id: 'a', session_date: '2026-11-04', amount_cents: 0 },
    { patient_id: 'b', session_date: '2026-11-10', amount_cents: null },
    { patient_id: 'b', session_date: '2026-10-01', amount_cents: 4500 },
  ]
  const current = revenueSummary(rows, 'month', '2026-11-03')
  assert.equal(current.total, 1000)
  assert.equal(current.average, 500)
  assert.equal(current.missing, 1)
  assert.equal(current.priced, 2)
  assert.equal(current.patientCount, 2)
  assert.equal(
    current.buckets.reduce((sum, [, value]) => sum + value, 0),
    current.total,
  )
  assert.equal(revenueSummary(rows, 'previous', '2026-11-03').total, 4500)
  assert.equal(revenueSummary(rows, 'all', '2026-11-03').total, 5500)
  assert.equal(revenueSummary(rows, 'year', '2026-11-03').total, 5500)
  assert.equal(revenueSummary([], 'all', '2026-11-03').average, null)
  assert.equal(
    revenueSummary(
      [{ patient_id: 'a', session_date: '2025-12-31', amount_cents: 10 }],
      'previous',
      '2026-01-01',
    ).total,
    10,
  )
})
