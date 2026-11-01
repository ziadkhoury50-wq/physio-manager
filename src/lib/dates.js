export const CLINIC_ZONE = 'Asia/Beirut'

export function dateKey(value = new Date(), timeZone = CLINIC_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type) => parts.find((part) => part.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function addDays(key, count) {
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
export function formatDate(key, options = {}) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(new Date(`${key}T12:00:00Z`))
}
export function weekDates(key) {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay()
  const monday = addDays(key, -(day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}
export function eventTime(event, timeZone = CLINIC_ZONE) {
  if (event.start.date) return 'All day'
  return new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(event.start.dateTime),
  )
}
export function eventOnDay(event, day, timeZone = CLINIC_ZONE) {
  const start = event.start.date || dateKey(event.start.dateTime, timeZone)
  const end =
    event.end?.date ||
    (event.end?.dateTime
      ? dateKey(new Date(new Date(event.end.dateTime).getTime() - 1), timeZone)
      : start)
  return (
    start <= day && (event.start.date ? day < (event.end?.date || addDays(start, 1)) : day <= end)
  )
}
export function eventDate(event, timeZone = CLINIC_ZONE) {
  return event.start.date || dateKey(event.start.dateTime, timeZone)
}
export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase()
}
