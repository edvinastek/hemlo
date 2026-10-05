// Generated from src/lib/ics-rules.ts by scripts/copy-shared.mjs. Do not edit here:
// change the original and run `node scripts/copy-shared.mjs`.

import { addDays, baseDates, fromDayNumber, toDayNumber, weekdayOf } from './series-rules.ts'

/** Calendar files (.ics, RFC 5545), written and read. Pure: no database, no
 *  React, no clock of its own, so every rule is checked in
 *  src/test/ics.check.mjs against files shaped like Google Calendar's.
 *
 *  Days are 'yyyy-MM-dd' and times 'HH:mm', the way the rest of the app keeps
 *  them. A task's time is the person's own wall-clock time, so it is written
 *  as "floating" time (no zone) with the zone named once for the whole file,
 *  which is how Google and Apple read a floating time. A calendar event keeps
 *  an exact moment, so it is written in UTC. */

/* ---------- when something happens ---------------------------------------- */

/** A whole day, a wall-clock time, or an exact moment in UTC. */
export type When =
  | { kind: 'date'; date: string }
  | { kind: 'local'; date: string; time: string }
  | { kind: 'utc'; iso: string }

export interface IcsEvent {
  uid: string
  summary: string
  description?: string | null
  location?: string | null
  start: When
  /** For a whole day this is the day after the last one, as the standard asks. */
  end?: When | null
  rrule?: string | null
  rdates?: When[]
  exdates?: When[]
  /** Set on a changed copy of one repeat, with the same uid as the series. */
  recurrenceId?: When | null
  categories?: string[]
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | null
  /** Visuma's own lines (GEN-26), which other calendars pass over:
   *  X-VISUMA-KIND (habit, chore, supplement, payment) and X-VISUMA-REPEAT, a
   *  repeat no RRULE can say ("3 times a week", "7 days after it was last
   *  done", "about every 7 days"). Reading the file back keeps them. */
  visuma?: { kind?: VisumaKind | null; repeat?: string | null } | null
}

/** What a Visuma event was in the app, when it was not a task or an event. */
export type VisumaKind = 'habit' | 'chore' | 'supplement' | 'payment'
export const VISUMA_KINDS: VisumaKind[] = ['habit', 'chore', 'supplement', 'payment']

/** The app's own lines are written with the name Visuma; files written before
 *  version 21, when the app was called GetIt, say X-GETIT-…, and read the same. */
export const X_KIND = ['X-VISUMA-KIND', 'X-GETIT-KIND'] as const
export const X_REPEAT = ['X-VISUMA-REPEAT', 'X-GETIT-REPEAT'] as const

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** 'yyyy-MM-dd' + 'HH:mm' plus some minutes, across midnight when it has to. */
export function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + Math.round(minutes)
  const days = Math.floor(total / 1440)
  const rest = total - days * 1440
  return { date: addDays(date, days), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` }
}

/** Minutes from one wall-clock moment to another. */
export function minutesBetween(a: { date: string; time: string }, b: { date: string; time: string }): number {
  const at = (x: { date: string; time: string }) => toDayNumber(x.date) * 1440 + Number(x.time.slice(0, 2)) * 60 + Number(x.time.slice(3, 5))
  return at(b) - at(a)
}

function whenValue(w: When): { params: string; value: string } {
  if (w.kind === 'date') return { params: ';VALUE=DATE', value: w.date.replace(/-/g, '') }
  if (w.kind === 'local') return { params: '', value: `${w.date.replace(/-/g, '')}T${w.time.replace(':', '')}00` }
  const d = new Date(w.iso)
  return {
    params: '',
    value: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`,
  }
}

/* ---------- writing -------------------------------------------------------- */

/** Text as a calendar file needs it: backslash, semicolon, comma and line
 *  breaks escaped, so a note with a comma in it is not cut in two. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

/** One content line folded at 75 bytes, as the standard asks: each extra
 *  line starts with a space, and a letter written in several bytes (ė, 😀)
 *  is never split between two lines. */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > limit) {
      out.push(cur)
      cur = ''
      size = 0
      limit = 74 // the leading space takes one byte of the next line
    }
    cur += ch
    size += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

function prop(name: string, value: string, params = ''): string {
  return foldLine(`${name}${params}:${value}`)
}

function whenProp(name: string, w: When): string {
  const { params, value } = whenValue(w)
  return prop(name, value, params)
}

function whenList(name: string, list: When[]): string[] {
  // Dates and times cannot share one line: group them by kind.
  const out: string[] = []
  for (const kind of ['date', 'local', 'utc'] as const) {
    const same = list.filter((w) => w.kind === kind)
    if (!same.length) continue
    const values = same.map((w) => whenValue(w).value)
    out.push(prop(name, values.join(','), kind === 'date' ? ';VALUE=DATE' : ''))
  }
  return out
}

export interface CalendarOptions {
  /** When the file was made, as an ISO moment (DTSTAMP). */
  stamp: string
  /** Shown as the calendar's name in apps that read it. */
  name?: string
  /** The person's zone (IANA, e.g. Europe/Amsterdam): how the floating times are meant. */
  timezone?: string | null
}

export const PRODID = '-//Visuma//Visuma planner//EN'

/** A whole calendar file, lines ending in CRLF. */
export function buildCalendar(events: IcsEvent[], o: CalendarOptions): string {
  const stamp = whenValue({ kind: 'utc', iso: o.stamp }).value
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (o.name) lines.push(prop('X-WR-CALNAME', escapeText(o.name)))
  if (o.timezone) lines.push(prop('X-WR-TIMEZONE', o.timezone))
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(prop('UID', e.uid))
    lines.push(`DTSTAMP:${stamp}`)
    if (e.recurrenceId) lines.push(whenProp('RECURRENCE-ID', e.recurrenceId))
    lines.push(whenProp('DTSTART', e.start))
    if (e.end) lines.push(whenProp('DTEND', e.end))
    if (e.rrule) lines.push(prop('RRULE', e.rrule))
    if (e.rdates?.length) lines.push(...whenList('RDATE', e.rdates))
    if (e.exdates?.length) lines.push(...whenList('EXDATE', e.exdates))
    lines.push(prop('SUMMARY', escapeText(e.summary || 'Untitled')))
    if (e.description) lines.push(prop('DESCRIPTION', escapeText(e.description)))
    if (e.location) lines.push(prop('LOCATION', escapeText(e.location)))
    if (e.categories?.length) lines.push(prop('CATEGORIES', e.categories.map(escapeText).join(',')))
    if (e.status) lines.push(`STATUS:${e.status}`)
    if (e.visuma?.kind) lines.push(prop(X_KIND[0], e.visuma.kind))
    if (e.visuma?.repeat) lines.push(prop(X_REPEAT[0], e.visuma.repeat))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/* ---------- the app's rows as events -------------------------------------- */

export interface TaskLike {
  id: string
  title: string
  planned_date: string | null
  planned_time: string | null
  duration_min: number | null
  notes: string | null
  category?: string | null
  status?: string
}

/** The domain stays getit.app after the rename: a calendar that already took
 *  these events in knows them by this UID, and a new one would show twice. */
export const uidFor = (id: string) => `${id}@getit.app`

/** A task with a time is an event of its length (30 minutes when it has
 *  none); a task without a time is an all-day event. A task with no day, or
 *  one dropped, is not in a calendar. */
export function taskEvent(t: TaskLike, defaultMinutes = 30): IcsEvent | null {
  if (!t.planned_date || !DATE.test(t.planned_date) || t.status === 'dropped') return null
  const time = t.planned_time?.slice(0, 5) ?? null
  const base = {
    uid: uidFor(t.id),
    summary: t.title || 'Untitled',
    description: t.notes || null,
    categories: t.category ? [t.category] : undefined,
  }
  if (!time || !TIME.test(time)) {
    return { ...base, start: { kind: 'date', date: t.planned_date }, end: { kind: 'date', date: addDays(t.planned_date, 1) } }
  }
  const end = addMinutes(t.planned_date, time, t.duration_min && t.duration_min > 0 ? t.duration_min : defaultMinutes)
  return { ...base, start: { kind: 'local', date: t.planned_date, time }, end: { kind: 'local', ...end } }
}

export interface EventLike {
  id: string
  title: string
  /** For an all-day event: the local day(s); otherwise ISO moments. */
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  /** The local day of starts_at and ends_at, worked out by the caller. */
  start_day: string
  end_day: string | null
  /** The local clock time of starts_at ('HH:mm'), for a repeating event. */
  start_time?: string | null
  /** How the person's own event repeats (AGN-03): the one repeat engine's rule. */
  rule?: string | null
  rule_config?: SeriesLike['rule_config'] | null
  end_date?: string | null
  count?: number | null
}

/** An agenda event. Timed ones keep their exact moment, in UTC; an all-day
 *  one runs from its first local day to the day after its last. A
 *  repeating one is written with its RRULE (AGN-03); its time is then the
 *  person's own wall-clock time, as a repeating task's is, so it stays at
 *  19:00 when the clocks change. */
export function calendarEvent(e: EventLike): IcsEvent | null {
  const base = { uid: uidFor(e.id), summary: e.title || 'Untitled', location: e.location || null }
  if (e.rule) return repeatingEvent(e, base)
  if (e.all_day) {
    if (!DATE.test(e.start_day)) return null
    const last = e.end_day && DATE.test(e.end_day) && e.end_day > e.start_day ? e.end_day : e.start_day
    return { ...base, start: { kind: 'date', date: e.start_day }, end: { kind: 'date', date: addDays(last, 1) } }
  }
  const start = Date.parse(e.starts_at)
  if (Number.isNaN(start)) return null
  const endMs = e.ends_at ? Date.parse(e.ends_at) : NaN
  return {
    ...base,
    start: { kind: 'utc', iso: new Date(start).toISOString() },
    end: { kind: 'utc', iso: new Date(Number.isNaN(endMs) || endMs < start ? start + 3600000 : endMs).toISOString() },
  }
}

/** A repeating agenda event as one event with its rule: it starts on the
 *  first day the rule really gives (a calendar counts the start as one
 *  time), keeps its length, and ends on its last day or after its count. */
function repeatingEvent(e: EventLike, base: Pick<IcsEvent, 'uid' | 'summary' | 'location'>): IcsEvent | null {
  if (!DATE.test(e.start_day)) return null
  const series: SeriesLike = {
    id: e.id, title: e.title, rule: e.rule!, rule_config: e.rule_config ?? {}, start_date: e.start_day,
    end_date: e.end_date && DATE.test(e.end_date) ? e.end_date : null, occurrence_count: e.count ?? null, time_of_day: null,
  }
  const time = !e.all_day && e.start_time && TIME.test(e.start_time) ? e.start_time : null
  const rule = seriesRule(series, !time)
  const first = firstDay(series)
  if (!rule || !first || (series.end_date && first > series.end_date)) return null
  const lastDay = e.end_day && DATE.test(e.end_day) && e.end_day > e.start_day ? e.end_day : e.start_day
  const days = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${e.start_day}T00:00:00Z`)) / 86400000)
  if (!time) {
    return { ...base, start: { kind: 'date', date: first }, end: { kind: 'date', date: addDays(first, days + 1) },
      rrule: rule.rrule, rdates: rule.rdates.map((d) => ({ kind: 'date', date: d })) }
  }
  const startMs = Date.parse(e.starts_at)
  const endMs = e.ends_at ? Date.parse(e.ends_at) : NaN
  const minutes = Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs ? 60 : Math.round((endMs - startMs) / 60000)
  return { ...base, start: { kind: 'local', date: first, time }, end: { kind: 'local', ...addMinutes(first, time, minutes) },
    rrule: rule.rrule, rdates: rule.rdates.map((d) => ({ kind: 'local', date: d, time })) }
}

/** A dated record of any module: its name, its day (and time, if it has
 *  one), the rest of its fields written out as the description. */
export function recordEvent(id: string, title: string, date: string, time: string | null, description: string | null, minutes = 60): IcsEvent | null {
  return taskEvent({ id, title, planned_date: date, planned_time: time, duration_min: minutes, notes: description })
}

/* ---------- repeating series ---------------------------------------------- */

export interface SeriesLike {
  id: string
  title: string
  rule: string
  rule_config: { n?: number; weekdays?: number[]; day_of_month?: number; dates?: string[]; nth?: number; weekday?: number; month?: number; day?: number; times?: number; mode?: string }
  start_date: string
  end_date: string | null
  occurrence_count: number | null
  time_of_day: string | null
  task_template?: { duration_min?: number | null; notes?: string | null; category?: string | null } | null
}

export interface ExceptionLike {
  exception_date: string
  action: string
  moved_to: string | null
  changes?: Record<string, unknown> | null
  deleted_at?: string | null
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const byday = (days: number[]) => MONDAY_FIRST.filter((d) => days.includes(d)).map((d) => BYDAY[d]).join(',')

/** The first day a series really lands on. Starting a calendar's repeat on a
 *  day the rule does not produce would add that day as an extra occurrence. */
export function firstDay(s: SeriesLike): string | null {
  if (s.rule === 'dates') return [...(s.rule_config?.dates ?? [])].filter((d) => DATE.test(d)).sort()[0] ?? null
  const days = baseDates({ ...s, occurrence_count: 1 } as never, addDays(s.start_date, 800))
  return days[0] ?? null
}

/** The series' rule as an RRULE, or its days as a list for a 'dates'
 *  series. Null when the rule is one this file does not know. */
export function seriesRule(s: SeriesLike, allDay: boolean): { rrule: string | null; rdates: string[] } | null {
  const c = s.rule_config ?? {}
  // Counted from the last time it was done (GEN-22): no calendar rule says
  // that, so there is none; looseRepeat() writes it as Visuma's own line.
  if (looseRepeat(s)) return null
  let parts: string[]
  switch (s.rule) {
    case 'daily': {
      const n = Math.max(1, Math.floor(c.n ?? 1))
      parts = ['FREQ=DAILY', ...(n > 1 ? [`INTERVAL=${n}`] : [])]
      break
    }
    case 'weekdays': parts = ['FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR']; break
    case 'weekends': parts = ['FREQ=WEEKLY', 'BYDAY=SA,SU']; break
    case 'weekly': case 'every_n_weeks': {
      const days = (c.weekdays ?? []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
      const picked = days.length ? days : [weekdayOf(s.start_date)]
      const n = s.rule === 'every_n_weeks' ? Math.max(1, Math.floor(c.n ?? 2)) : 1
      // Weeks start on Monday in the app; WKST says so, which matters once
      // the repeat skips weeks.
      parts = ['FREQ=WEEKLY', ...(n > 1 ? [`INTERVAL=${n}`] : []), `BYDAY=${byday(picked)}`, 'WKST=MO']
      break
    }
    case 'monthly_nth': {
      const n = Math.max(1, Math.floor(c.n ?? 1))
      const wd = Math.min(6, Math.max(0, Math.floor(c.weekday ?? weekdayOf(s.start_date))))
      const nth = c.nth === -1 ? -1 : Math.min(5, Math.max(1, Math.floor(c.nth ?? Math.ceil(Number(s.start_date.slice(8, 10)) / 7))))
      parts = ['FREQ=MONTHLY', ...(n > 1 ? [`INTERVAL=${n}`] : []), `BYDAY=${nth}${BYDAY[wd]}`]
      break
    }
    case 'yearly': {
      const n = Math.max(1, Math.floor(c.n ?? 1))
      const month = Math.min(12, Math.max(1, Math.floor(c.month ?? Number(s.start_date.slice(5, 7)))))
      const day = Math.min(31, Math.max(1, Math.floor(c.day ?? Number(s.start_date.slice(8, 10)))))
      // 29 February falls on the 28th in other years, as the app has it.
      parts = day === 29 && month === 2
        ? ['FREQ=YEARLY', ...(n > 1 ? [`INTERVAL=${n}`] : []), 'BYMONTH=2', 'BYMONTHDAY=28,29', 'BYSETPOS=-1']
        : ['FREQ=YEARLY', ...(n > 1 ? [`INTERVAL=${n}`] : []), `BYMONTH=${month}`, `BYMONTHDAY=${day}`]
      break
    }
    case 'monthly': {
      const d = Math.min(31, Math.max(1, Math.floor(c.day_of_month ?? Number(s.start_date.slice(8, 10)))))
      // "The 31st" means the month's last day in a shorter month: the last
      // of the 28th to the 31st that the month has.
      const every = Math.max(1, Math.floor(c.n ?? 1))
      const iv = every > 1 ? [`INTERVAL=${every}`] : []
      parts = d <= 28 ? ['FREQ=MONTHLY', ...iv, `BYMONTHDAY=${d}`]
        : ['FREQ=MONTHLY', ...iv, `BYMONTHDAY=${Array.from({ length: d - 27 }, (_, i) => 28 + i).join(',')}`, 'BYSETPOS=-1']
      break
    }
    case 'dates': {
      const days = [...new Set((c.dates ?? []).filter((d) => DATE.test(d)))].sort()
      return { rrule: null, rdates: days.slice(1) }
    }
    default: return null
  }
  if (s.end_date && DATE.test(s.end_date)) parts.push(`UNTIL=${s.end_date.replace(/-/g, '')}${allDay ? '' : 'T235959'}`)
  else if (s.occurrence_count != null && s.occurrence_count > 0) parts.push(`COUNT=${Math.floor(s.occurrence_count)}`)
  return { rrule: parts.join(';'), rdates: [] }
}

/** A repeating series as one event that repeats, plus a changed copy for each
 *  repeat that was moved or edited on its own. Skipped repeats are left out
 *  with EXDATE. Empty when the series never lands on a day. */
export function seriesEvents(s: SeriesLike, exceptions: ExceptionLike[] = [], defaultMinutes = 30): IcsEvent[] {
  const time = s.time_of_day?.slice(0, 5) ?? null
  const timed = !!time && TIME.test(time)
  const rule = seriesRule(s, !timed)
  const first = firstDay(s)
  if (!rule || !first) return []
  if (s.end_date && first > s.end_date) return []
  const minutes = s.task_template?.duration_min && s.task_template.duration_min > 0 ? s.task_template.duration_min : defaultMinutes
  const at = (date: string, t: string | null = time): When => (t && TIME.test(t) ? { kind: 'local', date, time: t } : { kind: 'date', date })
  const endOf = (date: string, t: string | null = time, mins = minutes): When =>
    t && TIME.test(t) ? { kind: 'local', ...addMinutes(date, t, mins) } : { kind: 'date', date: addDays(date, 1) }
  const live = exceptions.filter((e) => !e.deleted_at && DATE.test(e.exception_date))
  const uid = uidFor(s.id)
  const master: IcsEvent = {
    uid,
    summary: s.title || 'Untitled',
    description: s.task_template?.notes || null,
    categories: s.task_template?.category ? [s.task_template.category] : undefined,
    start: at(first),
    end: endOf(first),
    rrule: rule.rrule,
    rdates: rule.rdates.map((d) => at(d)),
    exdates: live.filter((e) => e.action === 'skip' || (e.action === 'move' && !e.moved_to)).map((e) => at(e.exception_date)),
  }
  const out = [master]
  for (const e of live) {
    const changes = e.changes ?? {}
    if (e.action === 'move' && e.moved_to && DATE.test(e.moved_to)) {
      out.push({ ...master, rrule: null, rdates: [], exdates: [], recurrenceId: at(e.exception_date), start: at(e.moved_to), end: endOf(e.moved_to) })
    } else if (e.action === 'change') {
      const t = typeof changes.planned_time === 'string' ? changes.planned_time.slice(0, 5) : time
      const mins = typeof changes.duration_min === 'number' && changes.duration_min > 0 ? changes.duration_min : minutes
      const title = typeof changes.title === 'string' && changes.title ? changes.title : master.summary
      const notes = typeof changes.notes === 'string' ? changes.notes : master.description
      // A repeat's time cannot change from a whole day to a time in the
      // calendar's eyes (its id is the original start), so a whole-day series
      // keeps whole days.
      const own = timed ? t : null
      out.push({ ...master, rrule: null, rdates: [], exdates: [], recurrenceId: at(e.exception_date), summary: title, description: notes || null,
        start: at(e.exception_date, own), end: endOf(e.exception_date, own, mins) })
    }
  }
  return out
}

/* ---------- repeats an RRULE cannot say (GEN-26) --------------------------- */

const LOOSE_MODES = ['after', 'flexible']

/** "MODE=AFTER;DAYS=7" for "7 days after it was last done", "MODE=FLEXIBLE;
 *  DAYS=7" for "about every 7 days", "TIMES=3" for "3 times a week"; null
 *  for every rule an RRULE says exactly. */
export function looseRepeat(s: Pick<SeriesLike, 'rule' | 'rule_config'>): string | null {
  const c = s.rule_config ?? {}
  if (s.rule === 'daily' && c.mode && LOOSE_MODES.includes(c.mode)) {
    return `MODE=${c.mode.toUpperCase()};DAYS=${Math.max(1, Math.floor(c.n ?? 7))}`
  }
  if (s.rule === 'times_per_week') return `TIMES=${Math.min(7, Math.max(1, Math.floor(c.times ?? 1)))}`
  return null
}

/** X-VISUMA-REPEAT (or the older X-GETIT-REPEAT) read back into the app's rule, or null. */
export function readLooseRepeat(value: string): { rule: 'daily' | 'times_per_week'; rule_config: { n?: number; mode?: 'after' | 'flexible'; times?: number } } | null {
  const kv = Object.fromEntries(value.split(';').map((p) => p.split('=')).filter((p) => p.length === 2)
    .map(([k, v]) => [k.trim().toUpperCase(), v.trim().toUpperCase()]))
  const mode = kv.MODE?.toLowerCase()
  const days = Math.floor(Number(kv.DAYS))
  if (mode && LOOSE_MODES.includes(mode) && Number.isFinite(days) && days >= 1 && days <= 730) {
    return { rule: 'daily', rule_config: { n: days, mode: mode as 'after' | 'flexible' } }
  }
  const times = Math.floor(Number(kv.TIMES))
  if (!mode && Number.isFinite(times) && times >= 1 && times <= 7) return { rule: 'times_per_week', rule_config: { times } }
  return null
}

/** Anything of a module that comes round (GEN-26): a habit, a chore, a
 *  supplement, a planned payment. */
export interface ScheduleLike {
  id: string
  kind: VisumaKind
  title: string
  rule: string | null
  rule_config: SeriesLike['rule_config'] | null
  start_date: string
  end_date: string | null
  /** 'HH:mm', or null for the whole day. */
  time: string | null
  minutes?: number | null
  notes?: string | null
  /** For "after" and flexible: the day it is next due, where its one event goes. */
  next?: string | null
}

/** One event for something that comes round: its rule as an RRULE (or its
 *  days as RDATE) like a repeating task, or, for what no RRULE can say, one
 *  event on the day it is next due ("after", flexible) or once a week from
 *  the Monday of its first week ("3 times a week"), with Visuma's own line so
 *  that reading the file back into Visuma gives the very same rule. No rule:
 *  once, on its first day. Null when it never lands on a day. */
export function scheduleEvent(x: ScheduleLike, defaultMinutes = 30): IcsEvent | null {
  if (!DATE.test(x.start_date)) return null
  const time = x.time && TIME.test(x.time.slice(0, 5)) ? x.time.slice(0, 5) : null
  const visuma = { kind: x.kind, repeat: x.rule ? looseRepeat({ rule: x.rule, rule_config: x.rule_config ?? {} }) : null }
  const minutes = x.minutes && x.minutes > 0 ? x.minutes : defaultMinutes
  const single = (day: string): IcsEvent | null => {
    const e = taskEvent({ id: x.id, title: x.title, planned_date: day, planned_time: time, duration_min: minutes, notes: x.notes ?? null })
    return e ? { ...e, visuma } : null
  }
  if (!x.rule) return single(x.start_date)
  if (x.rule === 'times_per_week') {
    const monday = addDays(x.start_date, -((weekdayOf(x.start_date) + 6) % 7))
    const until = x.end_date && DATE.test(x.end_date) ? `;UNTIL=${x.end_date.replace(/-/g, '')}` : ''
    return {
      uid: uidFor(x.id), summary: x.title || 'Untitled', description: x.notes || null,
      start: { kind: 'date', date: monday }, end: { kind: 'date', date: addDays(monday, 1) },
      rrule: `FREQ=WEEKLY;BYDAY=MO;WKST=MO${until}`, visuma,
    }
  }
  if (visuma.repeat) return x.next && DATE.test(x.next) && (!x.end_date || x.next <= x.end_date) ? single(x.next) : null
  const [master] = seriesEvents({
    id: x.id, title: x.title, rule: x.rule, rule_config: x.rule_config ?? {}, start_date: x.start_date, end_date: x.end_date,
    occurrence_count: null, time_of_day: time, task_template: { duration_min: minutes, notes: x.notes ?? null },
  })
  return master ? { ...master, visuma } : null
}

/* ---------- reading -------------------------------------------------------- */

interface Prop { name: string; params: Record<string, string>; value: string }
interface Component { type: string; props: Prop[]; children: Component[] }

/** Lines back to whole: a line that starts with a space or a tab carries on
 *  the one before it. */
export function unfold(text: string): string[] {
  const raw = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else if (line.trim() !== '') out.push(line)
  }
  return out
}

/** NAME;PARAM=value;PARAM="quoted:value":the value */
export function parseLine(line: string): Prop | null {
  let i = 0
  let quoted = false
  let colon = -1
  for (; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) { colon = i; break }
  }
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const pieces: string[] = []
  let cur = ''
  quoted = false
  for (const ch of head) {
    if (ch === '"') { quoted = !quoted; continue }
    if (ch === ';' && !quoted) { pieces.push(cur); cur = ''; continue }
    cur += ch
  }
  pieces.push(cur)
  const name = pieces[0].toUpperCase().trim()
  if (!name) return null
  const params: Record<string, string> = {}
  for (const p of pieces.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase().trim()] = p.slice(eq + 1)
  }
  return { name, params, value }
}

export function unescapeText(s: string): string {
  return s.replace(/\\(\\|;|,|n|N)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function components(lines: string[]): Component {
  const root: Component = { type: 'ROOT', props: [], children: [] }
  const stack = [root]
  for (const line of lines) {
    const p = parseLine(line)
    if (!p) continue
    if (p.name === 'BEGIN') {
      const c: Component = { type: p.value.trim().toUpperCase(), props: [], children: [] }
      stack[stack.length - 1].children.push(c)
      stack.push(c)
    } else if (p.name === 'END') {
      if (stack.length > 1) stack.pop()
    } else {
      stack[stack.length - 1].props.push(p)
    }
  }
  return root
}

/* ---------- zones ---------------------------------------------------------- */

const formats = new Map<string, Intl.DateTimeFormat | null>()
function formatFor(zone: string): Intl.DateTimeFormat | null {
  if (!formats.has(zone)) {
    try {
      formats.set(zone, new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }))
    } catch { formats.set(zone, null) }
  }
  return formats.get(zone)!
}

/** A zone name as calendar files write it: quoted, or with a vendor path
 *  in front ("/mozilla.org/20050126_1/Europe/Berlin"). Null when unknown. */
export function cleanZone(z: string | undefined | null): string | null {
  if (!z) return null
  let s = z.replace(/"/g, '').trim()
  if (formatFor(s)) return s
  const parts = s.split('/').filter(Boolean)
  for (let n = Math.min(3, parts.length); n >= 1; n--) {
    s = parts.slice(-n).join('/')
    if (formatFor(s)) return s
  }
  return null
}

/** The wall-clock day and time a moment is in a zone. */
export function utcToWall(ms: number, zone: string): { date: string; time: string } {
  const f = formatFor(zone) ?? formatFor('UTC')!
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

function offsetAt(ms: number, zone: string): number {
  const w = utcToWall(ms, zone)
  const asUtc = Date.UTC(Number(w.date.slice(0, 4)), Number(w.date.slice(5, 7)) - 1, Number(w.date.slice(8, 10)),
    Number(w.time.slice(0, 2)), Number(w.time.slice(3, 5)))
  return asUtc - Math.floor(ms / 60000) * 60000
}

/** The moment a wall-clock time in a zone is. In the hour the clocks skip
 *  it lands just after; in the hour they repeat, on the first of the two. */
export function wallToUtc(date: string, time: string, zone: string): number {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)),
    Number(time.slice(0, 2)), Number(time.slice(3, 5)))
  const first = guess - offsetAt(guess, zone)
  const second = guess - offsetAt(first, zone)
  return Math.min(first, second)
}

/* ---------- values --------------------------------------------------------- */

/** A DTSTART-like value read into the reader's own wall-clock time. */
interface Stamp { date: string; time: string | null }

function readStamp(p: Prop | undefined, zone: string): Stamp | null {
  if (!p) return null
  return readValue(p.value.split(',')[0], p.params, zone)
}

function readValue(raw: string, params: Record<string, string>, zone: string): Stamp | null {
  const v = raw.trim()
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v)
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  if (!DATE.test(date) || Number.isNaN(Date.parse(date))) return null
  if (params.VALUE?.toUpperCase() === 'DATE' || m[4] === undefined) return { date, time: null }
  const time = `${m[4]}:${m[5]}`
  if (!TIME.test(time)) return null
  if (m[7]) return utcToWall(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)), zone)
  const tz = cleanZone(params.TZID)
  if (tz && tz !== zone) return utcToWall(wallToUtc(date, time, tz), zone)
  // Floating, or already in the reader's zone.
  return { date, time }
}

/** P1D, PT1H30M, P1W: in minutes. */
export function durationMinutes(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m || v.trim() === 'P' || v.trim().endsWith('T')) return null
  const mins = Number(m[2] ?? 0) * 10080 + Number(m[3] ?? 0) * 1440 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0) + Math.floor(Number(m[6] ?? 0) / 60)
  return m[1] === '-' ? -mins : mins
}

/* ---------- repeat rules, read --------------------------------------------- */

export interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
  interval: number
  count: number | null
  /** Last day, inclusive, in the reader's wall-clock time. */
  until: string | null
  byday: { n: number; wd: number }[]
  bymonthday: number[]
  bymonth: number[]
  bysetpos: number[]
  wkst: number
  /** Parts this reader does not follow (BYYEARDAY, BYWEEKNO, BYHOUR…). */
  unsupported: string[]
}

export function parseRule(value: string, zone: string, startParams: Record<string, string> = {}, startTime: string | null = null): Rule | null {
  const kv = Object.fromEntries(value.split(';').map((p) => p.split('=')).filter((p) => p.length === 2)
    .map(([k, v]) => [k.trim().toUpperCase(), v.trim().toUpperCase()]))
  const freq = kv.FREQ as Rule['freq']
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(freq)) return null
  const list = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])
  const ints = (s: string | undefined) => list(s).map(Number).filter((n) => Number.isInteger(n) && n !== 0)
  const byday = list(kv.BYDAY).map((d) => {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d)
    return m ? { n: m[1] ? Number(m[1]) : 0, wd: BYDAY.indexOf(m[2]) } : null
  })
  if (byday.some((d) => d === null)) return null
  let until: string | null = null
  if (kv.UNTIL) {
    const s = readValue(kv.UNTIL, kv.UNTIL.length === 8 ? { VALUE: 'DATE' } : { TZID: startParams.TZID ?? '' }, zone)
    if (!s) return null
    // An end at 00:00 on a day, for a repeat at 09:00, ends the day before.
    until = s.time && startTime && s.time < startTime ? addDays(s.date, -1) : s.date
  }
  const count = kv.COUNT ? Math.floor(Number(kv.COUNT)) : null
  return {
    freq,
    interval: Math.max(1, Math.floor(Number(kv.INTERVAL ?? 1)) || 1),
    count: count !== null && Number.isFinite(count) && count > 0 ? count : null,
    until,
    byday: byday as { n: number; wd: number }[],
    bymonthday: ints(kv.BYMONTHDAY).filter((n) => Math.abs(n) <= 31),
    bymonth: ints(kv.BYMONTH).filter((n) => n >= 1 && n <= 12),
    bysetpos: ints(kv.BYSETPOS),
    wkst: kv.WKST && BYDAY.includes(kv.WKST) ? BYDAY.indexOf(kv.WKST) : 1,
    unsupported: ['BYYEARDAY', 'BYWEEKNO', 'BYHOUR', 'BYMINUTE', 'BYSECOND'].filter((k) => kv[k]),
  }
}

/** The app's own series rule, when the calendar's rule says exactly the
 *  same thing; null when it does not (it is then laid out day by day). */
export interface SeriesRule {
  rule: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'every_n_weeks' | 'monthly' | 'monthly_nth' | 'yearly' | 'dates'
  rule_config: { n?: number; weekdays?: number[]; day_of_month?: number; nth?: number; weekday?: number; month?: number; day?: number; dates?: string[]; mode?: 'after' | 'flexible' }
}

/** Every rule the app writes (seriesRule) reads back as the same rule
 *  (GEN-26): days, weekdays, weekends, chosen days every n weeks, a day of
 *  the month (the 31st as "the last of the 28th to the 31st"), the 2nd
 *  Tuesday or last Friday, a day of the year (29 February too). */
export function mapRule(r: Rule, start: string): SeriesRule | null {
  if (r.unsupported.length) return null
  const iv = r.interval > 1 ? { n: r.interval } : {}
  if (r.freq === 'YEARLY') {
    // Every year on a day: "BYMONTH=9;BYMONTHDAY=28", or nothing (the start's day).
    if (r.byday.length) return null
    if (!r.bymonth.length && !r.bymonthday.length && !r.bysetpos.length) {
      return { rule: 'yearly', rule_config: { ...iv, month: Number(start.slice(5, 7)), day: Number(start.slice(8, 10)) } }
    }
    if (r.bymonth.length !== 1) return null
    const days = [...r.bymonthday].sort((a, b) => a - b)
    if (days.length === 1 && days[0] >= 1 && !r.bysetpos.length) return { rule: 'yearly', rule_config: { ...iv, month: r.bymonth[0], day: days[0] } }
    if (r.bymonth[0] === 2 && days.join() === '28,29' && r.bysetpos.join() === '-1') return { rule: 'yearly', rule_config: { ...iv, month: 2, day: 29 } }
    return null
  }
  if (r.bymonth.length) return null
  const plainDays = r.byday.every((d) => d.n === 0)
  if (r.freq === 'DAILY' && !r.byday.length && !r.bymonthday.length && !r.bysetpos.length) {
    return { rule: 'daily', rule_config: r.interval > 1 ? { n: r.interval } : {} }
  }
  if (r.freq === 'WEEKLY' && plainDays && !r.bymonthday.length && !r.bysetpos.length) {
    const days = [...new Set(r.byday.map((d) => d.wd))].sort((a, b) => a - b)
    const picked = days.length ? days : [weekdayOf(start)]
    if (r.interval === 1 && picked.join() === '1,2,3,4,5') return { rule: 'weekdays', rule_config: {} }
    if (r.interval === 1 && picked.join() === '0,6') return { rule: 'weekends', rule_config: {} }
    if (r.interval === 1) return { rule: 'weekly', rule_config: { weekdays: picked } }
    // Weeks counted from a Monday, as the app counts them.
    if (r.wkst === 1) return { rule: 'every_n_weeks', rule_config: { n: r.interval, weekdays: picked } }
    return null
  }
  // "The 2nd Tuesday", "the last Friday", every n months.
  if (r.freq === 'MONTHLY' && r.byday.length === 1 && !r.bymonthday.length && !r.bysetpos.length) {
    const { n, wd } = r.byday[0]
    if ((n >= 1 && n <= 5) || n === -1) return { rule: 'monthly_nth', rule_config: { ...iv, nth: n, weekday: wd } }
    return null
  }
  if (r.freq === 'MONTHLY' && !r.byday.length) {
    const days = [...r.bymonthday].sort((a, b) => a - b)
    if (!days.length && !r.bysetpos.length) {
      const d = Number(start.slice(8, 10))
      return d <= 28 ? { rule: 'monthly', rule_config: { ...iv, day_of_month: d } } : null
    }
    if (days.length === 1 && days[0] >= 1 && days[0] <= 28 && !r.bysetpos.length) return { rule: 'monthly', rule_config: { ...iv, day_of_month: days[0] } }
    // "The last of the 28th to the 31st": the app's own "31st, or the last day".
    if (r.bysetpos.length === 1 && r.bysetpos[0] === -1 && days[0] === 28 && days.every((d, i) => d === 28 + i) && days.length >= 2) {
      return { rule: 'monthly', rule_config: { ...iv, day_of_month: days[days.length - 1] } }
    }
  }
  return null
}

const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const dayStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Days of one month that match a BYDAY list (with 2MO, -1FR ordinals). */
function monthByDay(y: number, m: number, byday: Rule['byday']): number[] {
  const n = dim(y, m)
  const out = new Set<number>()
  for (const { n: ord, wd } of byday) {
    const days: number[] = []
    for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) days.push(d)
    if (ord === 0) days.forEach((d) => out.add(d))
    else {
      const pick = ord > 0 ? days[ord - 1] : days[days.length + ord]
      if (pick) out.add(pick)
    }
  }
  return [...out]
}

function setpos(list: string[], pos: number[]): string[] {
  if (!pos.length) return list
  const sorted = [...list].sort()
  const out = new Set<string>()
  for (const p of pos) {
    const v = p > 0 ? sorted[p - 1] : sorted[sorted.length + p]
    if (v) out.add(v)
  }
  return [...out].sort()
}

/** Every day a rule produces from `start` that falls between `from` and
 *  `to` (both included), stopping at the rule's own end or after `cap` days
 *  kept. The start always counts as the first, and days before `from` still
 *  count towards COUNT. `truncated` says the cap was reached. */
export function expandRule(r: Rule, start: string, from: string, to: string, cap: number): { days: string[]; truncated: boolean } {
  const out: string[] = []
  const last = r.until && r.until < to ? r.until : to
  const limit = r.count ?? Infinity
  let counted = 0
  let truncated = false
  const take = (d: string) => {
    if (d > last || counted >= limit || truncated) return
    counted++
    if (d < from) return
    if (out.length >= cap) { truncated = true; return }
    out.push(d)
  }
  /** A day the rule produced; the start was already taken. */
  const push = (d: string) => { if (d > start) take(d) }
  take(start)
  const y0 = Number(start.slice(0, 4))
  const m0 = Number(start.slice(5, 7))
  const d0 = Number(start.slice(8, 10))
  const startNum = toDayNumber(start)
  const lastNum = toDayNumber(last)
  const monthOk = (m: number) => !r.bymonth.length || r.bymonth.includes(m)
  const monthDays = (y: number, m: number) => {
    const n = dim(y, m)
    return r.bymonthday.map((d) => (d > 0 ? d : n + d + 1)).filter((d) => d >= 1 && d <= n)
  }
  const done = () => counted >= limit || truncated
  let guard = 0
  if (r.freq === 'DAILY') {
    for (let n = startNum; n <= lastNum && !done() && guard++ < 100000; n += r.interval) {
      const day = fromDayNumber(n)
      const m = Number(day.slice(5, 7))
      if (!monthOk(m)) continue
      if (r.byday.length && !r.byday.some((b) => b.wd === weekdayOf(day))) continue
      if (r.bymonthday.length && !monthDays(Number(day.slice(0, 4)), m).includes(Number(day.slice(8, 10)))) continue
      push(day)
    }
  } else if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? [...new Set(r.byday.map((b) => b.wd))] : [weekdayOf(start)]
    const weekStart = startNum - ((weekdayOf(start) - r.wkst + 7) % 7)
    for (let w = weekStart; w <= lastNum && !done() && guard++ < 100000; w += 7 * r.interval) {
      const week: string[] = []
      for (let i = 0; i < 7; i++) {
        const day = fromDayNumber(w + i)
        if (days.includes(weekdayOf(day)) && monthOk(Number(day.slice(5, 7)))) week.push(day)
      }
      setpos(week, r.bysetpos).forEach(push)
    }
  } else if (r.freq === 'MONTHLY') {
    for (let k = 0; !done() && guard++ < 100000; k += r.interval) {
      const y = y0 + Math.floor((m0 - 1 + k) / 12)
      const m = ((m0 - 1 + k) % 12) + 1
      if (dayStr(y, m, 1) > last) break
      if (!monthOk(m)) continue
      let days: number[]
      if (r.bymonthday.length && r.byday.length) { const bd = monthByDay(y, m, r.byday); days = monthDays(y, m).filter((d) => bd.includes(d)) }
      else if (r.bymonthday.length) days = monthDays(y, m)
      else if (r.byday.length) days = monthByDay(y, m, r.byday)
      else days = d0 <= dim(y, m) ? [d0] : []
      setpos([...new Set(days)].sort((a, b) => a - b).map((d) => dayStr(y, m, d)), r.bysetpos).forEach(push)
    }
  } else if (r.freq === 'YEARLY') {
    for (let k = 0; !done() && guard++ < 1000; k += r.interval) {
      const y = y0 + k
      if (dayStr(y, 1, 1) > last) break
      const months = r.bymonth.length ? r.bymonth : [m0]
      let list: string[] = []
      for (const m of months) {
        let days: number[]
        if (r.bymonthday.length) days = monthDays(y, m)
        else if (r.byday.length) days = r.bymonth.length ? monthByDay(y, m, r.byday) : []
        else days = d0 <= dim(y, m) ? [d0] : []
        list.push(...days.map((d) => dayStr(y, m, d)))
      }
      if (r.byday.length && !r.bymonth.length && !r.bymonthday.length) {
        // BYDAY across the whole year ("the 20th Monday"): counted over the year.
        const all: string[] = []
        for (let n = toDayNumber(dayStr(y, 1, 1)); n <= toDayNumber(dayStr(y, 12, 31)); n++) {
          const day = fromDayNumber(n)
          if (r.byday.some((b) => b.wd === weekdayOf(day))) all.push(day)
        }
        list = []
        for (const b of r.byday) {
          const same = all.filter((d) => weekdayOf(d) === b.wd)
          if (b.n === 0) list.push(...same)
          else { const v = b.n > 0 ? same[b.n - 1] : same[same.length + b.n]; if (v) list.push(v) }
        }
      }
      setpos([...new Set(list)].sort(), r.bysetpos).forEach(push)
    }
  }
  return { days: [...new Set(out)].sort(), truncated }
}

/* ---------- events, read --------------------------------------------------- */

/** TRANSP as the calendar wrote it (RFC 5545 3.8.2.7), or null. */
export function readTransp(v: string | undefined): 'opaque' | 'transparent' | null {
  const t = (v ?? '').trim().toUpperCase()
  return t === 'OPAQUE' ? 'opaque' : t === 'TRANSPARENT' ? 'transparent' : null
}

export interface ParsedEvent {
  uid: string | null
  summary: string
  description: string | null
  location: string | null
  allDay: boolean
  /** The first day, in the reader's wall-clock time. */
  date: string
  time: string | null
  /** The last day (inclusive) and the end time, when it has them. */
  endDate: string | null
  endTime: string | null
  /** A timed event's length. */
  minutes: number | null
  /** The app's own series rule, when the calendar's maps to one. */
  series: (SeriesRule & { start_date: string; end_date: string | null; occurrence_count: number | null }) | null
  /** Repeats of a mapped series that were removed or changed on their own. */
  exdates: string[]
  /** Every day, laid out, for a repeat the app cannot express (or when asked). */
  dates: string[]
  recurrenceId: string | null
  /** TRANSP (AGN-07): 'opaque' when the calendar marks the time busy,
   *  'transparent' when free, null when it does not say. */
  transp?: 'opaque' | 'transparent' | null
  /** Visuma's own lines, when the file came from Visuma (GEN-26): what it was
   *  (a habit, a chore…) and a repeat no RRULE says, as the app's rule. */
  kind?: VisumaKind | null
  repeat?: ReturnType<typeof readLooseRepeat>
}

export interface ReadOptions {
  /** The reader's zone (IANA). Times are turned into this zone's wall clock. */
  zone: string
  /** Today, yyyy-MM-dd: repeats are laid out from 3 years before to 5 after. */
  today: string
  /** A narrower stretch to lay repeats out in, when only that is wanted (a
   *  followed calendar keeps 3 months back to 12 ahead). Both days included. */
  from?: string
  to?: string
  /** Keep repeats as series where the rule maps (tasks); false lays every
   *  repeat out day by day (agenda events, module records). */
  mapSeries?: boolean
  maxEvents?: number
  maxPerEvent?: number
}

export interface ReadResult { events: ParsedEvent[]; problems: string[]; calendarName: string | null }

/** Every event in a calendar file, in the reader's own time. Changed copies
 *  of one repeat replace that repeat; cancelled ones remove it. */
export function parseIcs(text: string, o: ReadOptions): ReadResult {
  const problems: string[] = []
  const maxEvents = o.maxEvents ?? 20000
  const maxPer = o.maxPerEvent ?? 1000
  const mapSeries = o.mapSeries ?? true
  const root = components(unfold(text))
  const cal = root.children.find((c) => c.type === 'VCALENDAR')
  if (!cal) return { events: [], problems: ['This is not a calendar file: it has no BEGIN:VCALENDAR.'], calendarName: null }
  const calName = cal.props.find((p) => p.name === 'X-WR-CALNAME')
  const from = o.from ?? addDays(o.today, -365 * 3)
  const to = o.to ?? addDays(o.today, 365 * 5)

  interface Raw { ev: ParsedEvent; rule: Rule | null; rdates: string[]; cancelled: boolean; line: string }
  const raws: Raw[] = []
  let skipped = 0
  for (const c of cal.children) {
    if (c.type !== 'VEVENT') continue
    if (raws.length >= maxEvents) { skipped++; continue }
    const get = (n: string) => c.props.find((p) => p.name === n)
    const all = (n: string) => c.props.filter((p) => p.name === n)
    const summary = unescapeText(get('SUMMARY')?.value ?? '').trim()
    const label = summary || '(no title)'
    const dtstart = get('DTSTART')
    const start = readStamp(dtstart, o.zone)
    if (!start) { problems.push(`"${label}" has no start date it can read, so it was left out.`); continue }
    const dtend = readStamp(get('DTEND'), o.zone)
    const allDay = start.time === null
    let endDate: string | null = null
    let endTime: string | null = null
    let minutes: number | null = null
    const dur = get('DURATION') ? durationMinutes(get('DURATION')!.value) : null
    if (allDay) {
      // DTEND of a whole-day event is the day after its last day.
      if (dtend) endDate = addDays(dtend.date, -1)
      else if (dur && dur >= 1440) endDate = addDays(start.date, Math.floor(dur / 1440) - 1)
      if (endDate && endDate < start.date) endDate = null
      if (endDate === start.date) endDate = null
    } else {
      if (dtend && dtend.time) minutes = minutesBetween({ date: start.date, time: start.time! }, { date: dtend.date, time: dtend.time })
      else if (dur !== null) minutes = dur
      if (minutes !== null && minutes < 0) minutes = null
      if (minutes !== null) { const e = addMinutes(start.date, start.time!, minutes); endDate = e.date; endTime = e.time }
    }
    const status = (get('STATUS')?.value ?? '').trim().toUpperCase()
    const rid = readStamp(get('RECURRENCE-ID'), o.zone)
    const ruleProp = get('RRULE')
    let rule: Rule | null = null
    if (ruleProp) {
      rule = parseRule(ruleProp.value, o.zone, dtstart!.params, start.time)
      if (!rule) problems.push(`"${label}" repeats in a way that could not be read; only its first day was imported.`)
      else if (rule.unsupported.length || ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(rule.freq)) {
        problems.push(`"${label}" repeats in a way the app cannot follow (${rule.unsupported.join(', ') || rule.freq}); only its first day was imported.`)
        rule = null
      }
    }
    const rdates = all('RDATE').flatMap((p) => p.value.split(',').map((v) => readValue(v, p.params, o.zone)?.date ?? null))
      .filter((d): d is string => !!d)
    const exdates = all('EXDATE').flatMap((p) => p.value.split(',').map((v) => readValue(v, p.params, o.zone)?.date ?? null))
      .filter((d): d is string => !!d)
    raws.push({
      ev: {
        uid: get('UID')?.value.trim() || null,
        summary,
        description: get('DESCRIPTION') ? unescapeText(get('DESCRIPTION')!.value).trim() || null : null,
        location: get('LOCATION') ? unescapeText(get('LOCATION')!.value).trim() || null : null,
        allDay, date: start.date, time: start.time, endDate, endTime, minutes,
        series: null, exdates: [...new Set(exdates)].sort(), dates: [], recurrenceId: rid?.date ?? null,
        transp: readTransp(get('TRANSP')?.value),
        kind: VISUMA_KINDS.find((k) => k === (get(X_KIND[0]) ?? get(X_KIND[1]))?.value.trim().toLowerCase()) ?? null,
        repeat: (() => { const x = get(X_REPEAT[0]) ?? get(X_REPEAT[1]); return x ? readLooseRepeat(x.value) : null })(),
      },
      rule, rdates, cancelled: status === 'CANCELLED', line: label,
    })
  }
  if (skipped) problems.push(`The file has more than ${maxEvents} events; ${skipped} were left out.`)

  // Changed copies of one repeat, by the series they belong to.
  const overrides = new Map<string, Raw[]>()
  for (const r of raws) {
    if (r.ev.recurrenceId && r.ev.uid) overrides.set(r.ev.uid, [...(overrides.get(r.ev.uid) ?? []), r])
  }

  const masters = new Set(raws.filter((r) => !r.ev.recurrenceId && r.ev.uid).map((r) => r.ev.uid!))
  const out: ParsedEvent[] = []
  for (const r of raws) {
    const ev = r.ev
    if (ev.recurrenceId && ev.uid && masters.has(ev.uid)) {
      // Kept as a one-off in its own right, unless it was cancelled.
      if (!r.cancelled) out.push({ ...ev, exdates: [] })
      continue
    }
    if (r.cancelled) continue
    const replaced = (ev.uid ? overrides.get(ev.uid) ?? [] : []).map((x) => x.ev.recurrenceId!)
    const removed = new Set([...ev.exdates, ...replaced])
    const mapped = mapSeries && r.rule && !r.rdates.length ? mapRule(r.rule, ev.date) : null
    if (mapped && r.rule) {
      ev.series = { ...mapped, start_date: ev.date, end_date: r.rule.until, occurrence_count: r.rule.count }
      ev.exdates = [...removed].sort()
      out.push(ev)
      continue
    }
    // Days picked by hand: the start and its RDATEs are the app's 'dates' rule.
    if (mapSeries && !r.rule && r.rdates.length) {
      const dates = [...new Set([ev.date, ...r.rdates])].filter((d) => !removed.has(d)).sort()
      if (dates.length && dates.length <= maxPer) {
        ev.series = { rule: 'dates', rule_config: { dates }, start_date: dates[0], end_date: dates[dates.length - 1], occurrence_count: null }
        out.push({ ...ev, date: dates[0], exdates: [] })
        continue
      }
    }
    if (r.rule || r.rdates.length) {
      let days = [ev.date]
      let truncated = false
      if (r.rule) ({ days, truncated } = expandRule(r.rule, ev.date, from, to, maxPer + removed.size))
      days = [...new Set([...days, ...r.rdates])].filter((d) => !removed.has(d) && d >= from && d <= to).sort()
      if (days.length > maxPer) { days = days.slice(0, maxPer); truncated = true }
      if (truncated) problems.push(`"${r.line}" repeats more than ${maxPer} times; only the first ${maxPer} were imported.`)
      if (!days.length) continue
      out.push({ ...ev, date: days[0], exdates: [], dates: days })
      continue
    }
    out.push({ ...ev, exdates: [] })
  }
  return { events: out, problems, calendarName: calName ? unescapeText(calName.value).trim() || null : null }
}

/** The days a read event lands on between two days (inclusive): its own
 *  day, its laid-out days, or its series' days without the removed ones. */
export function eventDays(ev: ParsedEvent, from: string, to: string, cap = 1000): string[] {
  if (ev.series) {
    const days = baseDates({ ...ev.series } as never, to).filter((d) => d >= from && !ev.exdates.includes(d))
    return days.slice(0, cap)
  }
  if (ev.dates.length) return ev.dates.filter((d) => d >= from && d <= to).slice(0, cap)
  return ev.date >= from && ev.date <= to ? [ev.date] : []
}
