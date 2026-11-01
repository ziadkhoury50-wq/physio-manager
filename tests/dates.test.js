import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dateKey, eventDate, eventOnDay, eventTime, weekDates } from '../src/lib/dates.js'

test('weeks start on Monday, including Sunday and year boundaries', () => {
  assert.deepEqual(weekDates('2026-11-01'), [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ])
  assert.equal(weekDates('2027-01-01')[0], '2026-12-28')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
})
test('clinic date uses the selected time zone, including daylight-saving changes', () => {
  assert.equal(dateKey('2026-06-01T22:30:00Z', 'Asia/Beirut'), '2026-06-02')
  assert.equal(dateKey('2026-01-01T21:30:00Z', 'Asia/Beirut'), '2026-01-01')
  assert.equal(dateKey('2026-03-29T01:30:00Z', 'Europe/London'), '2026-03-29')
})
test('all-day event end dates are exclusive', () => {
  const event = { start: { date: '2026-11-01' }, end: { date: '2026-11-03' } }
  assert.equal(eventOnDay(event, '2026-10-31'), false)
  assert.equal(eventOnDay(event, '2026-11-01'), true)
  assert.equal(eventOnDay(event, '2026-11-02'), true)
  assert.equal(eventOnDay(event, '2026-11-03'), false)
  assert.equal(eventTime(event), 'All day')
})
test('timed events crossing midnight occupy both days but midnight ends are exclusive', () => {
  const event = {
    start: { dateTime: '2026-11-01T23:30:00+02:00' },
    end: { dateTime: '2026-11-02T00:30:00+02:00' },
  }
  assert.equal(eventDate(event), '2026-11-01')
  assert.equal(eventOnDay(event, '2026-11-01'), true)
  assert.equal(eventOnDay(event, '2026-11-02'), true)
  assert.equal(
    eventOnDay({ ...event, end: { dateTime: '2026-11-02T00:00:00+02:00' } }, '2026-11-02'),
    false,
  )
})
