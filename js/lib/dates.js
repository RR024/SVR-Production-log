/**
 * Factory-date helpers.
 *
 * `production_logs.log_date` is a PostgreSQL `date` (no time, no zone) and
 * travels as 'YYYY-MM-DD'. It must NEVER go through `new Date('YYYY-MM-DD')`
 * followed by local-zone formatting, which shifts the day west of UTC. We
 * build the Date from its parts in UTC and format in UTC, so the day is kept.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

const longFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

function toUtc(iso) {
  const m = ISO.exec(iso || '')
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null
}

export const isValidIsoDate = (iso) => toUtc(iso) !== null

/** Today's calendar date on the device = the factory's local day. */
export function todayISO() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso, days) {
  const d = toUtc(iso)
  if (!d) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const formatLogDate = (iso) => (toUtc(iso) ? longFmt.format(toUtc(iso)) : iso || '')
export const formatShortDate = (iso) => (toUtc(iso) ? shortFmt.format(toUtc(iso)) : iso || '')
export const formatDayMonth = (iso) => (toUtc(iso) ? dayMonthFmt.format(toUtc(iso)) : iso || '')
export const formatWeekday = (iso) => (toUtc(iso) ? weekdayFmt.format(toUtc(iso)) : '')

/** Real instants (created_at / updated_at) are shown in the viewer's zone. */
export function formatTimestamp(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : stampFmt.format(d)
}
