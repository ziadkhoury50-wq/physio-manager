import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUsd, revenueSummary, usd } from '../src/lib/revenue.js'

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
