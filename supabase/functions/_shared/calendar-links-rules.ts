// Generated from src/lib/calendar-links-rules.ts by scripts/copy-shared.mjs. Do not edit here:
// change the original and run `node scripts/copy-shared.mjs`.

import { addDays, baseDates, toDayNumber, weekdayOf } from './series-rules.ts'
import {
  buildCalendar, calendarEvent, eventDays, seriesEvents, taskEvent, uidFor, utcToWall, wallToUtc,
  type ExceptionLike, type IcsEvent, type ParsedEvent, type SeriesLike, type TaskLike,
} from './ics-rules.ts'

/** Calendar links, both ways, as rules with no database, no network and no
 *  clock of their own, so every one is checked in plain Node
 *  (src/test/calendarlinks.check.mjs). The server functions run the very
 *  same code: scripts/copy-shared.mjs copies this file, with ics-rules.ts and
 *  series-rules.ts, into supabase/functions/_shared/.
 *
 *  GetIt → Google: a private link (the "feed") that Google Calendar reads
 *  every few hours. Anyone holding the link can read what it shows, so it
 *  shows as little as it can: titles, times, sections and places, and task
 *  notes only when the person asks for them. Nothing about health: meals,
 *  training, weigh-ins, sleep, habits and supplements stay out (isHealthTask).
 *
 *  Google → GetIt: the person pastes their calendar's secret address; the
 *  server fetches it (a browser may not) and the app reads the file with
 *  ics-rules.ts and keeps those events on the device, read-only. */

/* ---------- the window both directions keep -------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0')
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A day some months later (or earlier, with a negative n). The 31st of a
 *  month becomes the last day of a shorter one. */
export function shiftMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7)) - 1 + n
  const d = Number(day.slice(8, 10))
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`
}

/** What a feed shows and what a followed calendar keeps: from three months
 *  back to twelve months ahead, both days included. A repeating task goes out
 *  as one repeating event, cut to the same window (windowedSeries). */
export function feedWindow(today: string): { from: string; to: string } {
  return { from: shiftMonths(today, -3), to: shiftMonths(today, 12) }
}

/* ---------- the feed link --------------------------------------------------- */

/** A feed token: 32 random bytes, base64url, no padding. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/
export const isFeedToken = (t: unknown): t is string => typeof t === 'string' && TOKEN.test(t)

/** The address Google Calendar is given. */
export function feedUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed?t=${encodeURIComponent(token)}`
}

export interface FeedTask extends TaskLike {
  series_id?: string | null
  deleted_at?: string | null
  /** Where the task came from ('meal' for a planned meal) and the module it
   *  belongs to: both say whether it is about health. */
  source?: string | null
  module_key?: string | null
}
export interface FeedSeries extends SeriesLike {
  active?: boolean
  deleted_at?: string | null
  module_key?: string | null
}
export interface FeedException extends ExceptionLike {
  series_id: string
}
export interface FeedEvent {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  subscription_id?: string | null
  deleted_at?: string | null
  /** A repeating own event's rule (031, AGN-03). */
  rule?: string | null
  rule_config?: Record<string, unknown> | null
  end_date?: string | null
  count?: number | null
}

export interface FeedInput {
  /** The person's zone (IANA). Task times are their own wall-clock times. */
  timezone: string | null
  /** Task notes go out only when the person turned this on. */
  notes: boolean
  /** When the file is made (ISO) and the person's today (yyyy-MM-dd). */
  stamp: string
  today: string
  tasks: FeedTask[]
  series: FeedSeries[]
  exceptions: FeedException[]
  events: FeedEvent[]
}

/** The calendar's name in Google. Only "GetIt": the profile's name would tell
 *  whoever holds the link whose plan it is. */
export const FEED_NAME = 'GetIt'

/* ---------- what never goes in the feed: health ------------------------------ */

/** The modules whose records are health data (special category data, GDPR
 *  article 9). The list follows docs/privacy/records-of-processing.md, which
 *  counts weigh-ins, food, training, sleep, habits and supplements as health.
 *  A task or series of one of these never goes in the feed. */
export const HEALTH_MODULES = ['nutrition', 'health', 'training', 'sleep', 'habits', 'supplements'] as const
/** Task sections that belong to those modules (CATEGORY_MODULE in
 *  colours-rules.ts: Meal is Nutrition, Training is Training, Body is Health). */
export const HEALTH_SECTIONS = ['Meal', 'Training', 'Body'] as const
/** Where a task can come from that is always about health: a planned meal
 *  ("Breakfast: Eggs · 143 kcal"), a workout, a habit. */
export const HEALTH_SOURCES = ['meal', 'workout', 'habit'] as const

const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const HEALTH_MODULE_SET = new Set<string>(HEALTH_MODULES)
const HEALTH_SECTION_SET = new Set<string>(HEALTH_SECTIONS.map((c) => c.toLowerCase()))
const HEALTH_SOURCE_SET = new Set<string>(HEALTH_SOURCES)

/** A module the person built (key u_…). The app cannot tell whether it is
 *  about health (a mood journal is; a plant-watering list is not), so its
 *  tasks never go in the feed. */
export const isBuiltModule = (key: string | null | undefined): boolean => /^u_/i.test(key?.trim() ?? '')

/** Is this task about health? Its source, its module or its section says so.
 *  Upper or lower case makes no difference. */
export function isHealthTask(t: { source?: string | null; module_key?: string | null; category?: string | null }): boolean {
  return HEALTH_SOURCE_SET.has(lower(t.source)) || HEALTH_MODULE_SET.has(lower(t.module_key)) || HEALTH_SECTION_SET.has(lower(t.category))
    || isBuiltModule(t.module_key)
}

/** Is this repeating series about health? Its module, or the section its
 *  tasks are given. */
export function isHealthSeries(s: { module_key?: string | null; task_template?: { category?: string | null } | null }): boolean {
  return isHealthTask({ module_key: s.module_key, category: s.task_template?.category })
}

/* ---------- a repeating series, cut to the window ---------------------------- */

/** The days a series lands on up to a day, by the app's own rule. */
const daysOf = (s: SeriesLike, until: string): string[] => baseDates(s as never, until)

/** The series with only its days in the window: it starts on its first day
 *  there and stops on its last, so a calendar reading the feed sees nothing
 *  from before three months ago or after a year ahead. A count, if it has
 *  one, is used up in working out those days (a series of ten that ends
 *  inside the window still ends after ten). Null when none of its days are
 *  in the window. */
export function windowedSeries<S extends FeedSeries>(s: S, from: string, to: string): S | null {
  if (!DATE.test(s.start_date ?? '')) return null
  const days = daysOf(s, to).filter((d) => d >= from)
  if (!days.length) return null
  const c = s.rule_config ?? {}
  // Moving the start must not change which days the rule picks: the weekday
  // and the day of the month were read from the old start when not set.
  const weekdays = (c.weekdays ?? []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
  const rule_config = s.rule === 'dates'
    ? { dates: days }
    : { ...c, weekdays: weekdays.length ? weekdays : [weekdayOf(s.start_date)], day_of_month: c.day_of_month ?? Number(s.start_date.slice(8, 10)) }
  return { ...s, start_date: days[0], end_date: days[days.length - 1], occurrence_count: null, rule_config }
}

const dayOf = (w: IcsEvent['start']): string | null => (w.kind === 'utc' ? null : w.date)

/** A series as feed events, from its first day in the window to its last. A
 *  repeat moved out of the window is left out; one moved into the window from
 *  a day outside it goes as an event of its own. */
export function feedSeriesEvents(s: FeedSeries, exceptions: FeedException[], from: string, to: string): IcsEvent[] {
  const cut = windowedSeries(s, from, to)
  if (!cut) return []
  const evs = seriesEvents(cut, exceptions)
  if (!evs.length) return []
  const [master, ...changed] = evs
  const inRange = new Set(daysOf(cut, to))
  // A day before the window that the series really landed on.
  const earlierRepeat = (day: string) => day < cut.start_date && daysOf(s, day).at(-1) === day
  const skipped = (master.exdates ?? []).filter((w) => { const d = dayOf(w); return !!d && inRange.has(d) })
  const out: IcsEvent[] = []
  for (const e of changed) {
    const was = e.recurrenceId ? dayOf(e.recurrenceId) : null
    const now = dayOf(e.start)
    if (!was || !now) continue
    const shown = now >= from && now <= to
    if (inRange.has(was)) {
      if (shown) out.push(e)
      else skipped.push(e.recurrenceId!)
    } else if (shown && earlierRepeat(was)) {
      out.push({ ...e, uid: uidFor(`${s.id}-${was}`), recurrenceId: null })
    }
  }
  return [{ ...master, exdates: skipped }, ...out]
}

/* ---------- the feed ------------------------------------------------------------ */

/** What a feed holds, as events: every task with a day in the window (with
 *  or without a time, not dropped, not deleted), each repeating series once
 *  with its repeat rule cut to the window, and the person's own agenda
 *  events. Left out: anything about health (isHealthTask), and events that
 *  came from a calendar they follow, so Google's own events are never sent
 *  back to Google. */
export function feedEvents(i: FeedInput): IcsEvent[] {
  const { from, to } = feedWindow(i.today)
  const zone = i.timezone || 'UTC'
  const strip = (e: IcsEvent): IcsEvent => (i.notes ? e : { ...e, description: null })
  const byParent = new Map<string, FeedException[]>()
  for (const x of i.exceptions) byParent.set(x.series_id, [...(byParent.get(x.series_id) ?? []), x])

  const out: IcsEvent[] = []
  const repeating = new Set<string>()
  const health = new Set<string>()
  for (const s of i.series) {
    if (isHealthSeries(s)) { health.add(s.id); continue }
    if (s.deleted_at || s.active === false) continue
    const evs = feedSeriesEvents(s, byParent.get(s.id) ?? [], from, to)
    if (evs.length) { out.push(...evs.map(strip)); repeating.add(s.id) }
  }
  for (const t of i.tasks) {
    if (t.deleted_at || !t.planned_date || t.planned_date < from || t.planned_date > to) continue
    // A day of a health series is health too, whatever its own section says.
    if (isHealthTask(t) || (t.series_id && health.has(t.series_id))) continue
    if (t.series_id && repeating.has(t.series_id)) continue
    const e = taskEvent(t)
    if (e) out.push(strip(e))
  }
  for (const e of i.events) {
    if (e.deleted_at || e.subscription_id) continue
    const start = Date.parse(e.starts_at)
    if (Number.isNaN(start)) continue
    const wall = utcToWall(start, zone)
    const startDay = wall.date
    const end = e.ends_at ? Date.parse(e.ends_at) : NaN
    const endDay = Number.isNaN(end) ? null : utcToWall(end, zone).date
    if (e.rule) {
      // A repeating own event (AGN-03) goes once with its rule, cut to the
      // window as a repeating task is: from its first day there to its last.
      const cut = windowedSeries({ id: e.id, title: e.title, rule: e.rule, rule_config: e.rule_config ?? {}, start_date: startDay,
        end_date: e.end_date ?? null, occurrence_count: e.count ?? null, time_of_day: null } as unknown as FeedSeries, from, to)
      if (!cut) continue
      const length = endDay && endDay > startDay ? Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86400000) : 0
      const ev = calendarEvent({ ...e, rule: cut.rule, rule_config: cut.rule_config, end_date: cut.end_date, count: null,
        start_day: cut.start_date, start_time: wall.time, end_day: endDay ? addDays(cut.start_date, length) : null })
      if (ev) out.push(ev)
      continue
    }
    if (startDay < from || startDay > to) continue
    const ev = calendarEvent({ ...e, rule: null, start_day: startDay, end_day: endDay })
    if (ev) out.push(ev)
  }
  return out
}

/** The whole feed file. */
export function buildFeed(i: FeedInput): string {
  return buildCalendar(feedEvents(i), { stamp: i.stamp, name: FEED_NAME, timezone: i.timezone })
}

/* ---------- a calendar to follow: its address -------------------------------- */

export const MAX_URL = 2048
export const NAME_MAX = 60
export const MAX_SUBSCRIPTIONS = 10
/** The most events one followed calendar keeps on a device. */
export const MAX_EVENTS = 5000
/** How often a followed calendar is fetched again while the app is open. */
export const REFRESH_MS = 3 * 60 * 60 * 1000

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string }

const PRIVATE_NETWORK = 'That address points at a private network, so it cannot be followed.'

/** Names that only mean something inside one network. */
function localName(host: string): boolean {
  return host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa|intranet)$/.test(host) || host.endsWith('.')
}

/** The address as pasted, cleaned: spaces trimmed, webcal:// read as
 *  https://, and anything that is not a plain secure web address refused.
 *  The server checks again, and also where the name leads (isPublicIp). */
export function normaliseCalendarUrl(input: string): UrlCheck {
  let s = String(input ?? '').trim()
  if (!s) return { ok: false, error: 'Paste the calendar’s address.' }
  if (/^webcals?:\/\//i.test(s)) s = 'https://' + s.replace(/^webcals?:\/\//i, '')
  if (/\s/.test(s)) return { ok: false, error: 'An address has no spaces in it. Copy it again.' }
  if (s.length > MAX_URL) return { ok: false, error: 'That address is too long.' }
  let u: URL
  try { u = new URL(s) } catch { return { ok: false, error: 'That is not a web address. It starts with https://' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only secure addresses (https://) can be followed.' }
  if (u.username || u.password) return { ok: false, error: 'An address with a name and password in it cannot be followed.' }
  if (u.port && u.port !== '443') return { ok: false, error: 'Only addresses on the usual secure port can be followed.' }
  const host = u.hostname.toLowerCase()
  const literal = ipLiteral(host)
  if (literal !== null) {
    if (!isPublicIp(literal)) return { ok: false, error: PRIVATE_NETWORK }
  } else {
    if (localName(host)) return { ok: false, error: PRIVATE_NETWORK }
    if (!host.includes('.')) return { ok: false, error: 'That address has no proper domain name.' }
  }
  if (u.href.length > MAX_URL) return { ok: false, error: 'That address is too long.' }
  return { ok: true, url: u.href }
}

/** The IP address a host name is written as, or null for a real name. The
 *  URL parser has already turned forms like 0x7f.1 into 127.0.0.1. */
export function ipLiteral(host: string): string | null {
  if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1)
  return parseIPv4(host) ? host : null
}

/** A calendar's name as it is kept: trimmed, one line, at most 60 characters. */
export function cleanName(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return s || null
}

/* ---------- where an address leads: public or not ---------------------------- */

/** 'a.b.c.d' as four numbers, or null. Only the plain form. */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split('.')
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p.startsWith('0'))) return null
    const n = Number(p)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

/** An IPv6 address as its eight 16-bit groups, or null. Takes '::', a
 *  dotted IPv4 tail (::ffff:10.0.0.1) and brackets; a zone (%eth0) is refused. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  if (!s || s.includes('%') || !/^[0-9a-fA-F:.]+$/.test(s)) return null
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(s.slice(lastColon + 1))
    if (!v4) return null
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
    // What is left before the IPv4 part: "::ffff:" becomes "::ffff", "::" stays.
    s = s.slice(0, lastColon + 1)
    if (!s.endsWith('::')) s = s.slice(0, -1)
  }
  const want = 8 - tail.length
  const halves = s.split('::')
  if (halves.length > 2) return null
  const group = (g: string) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)
  const head = halves[0] ? halves[0].split(':').map(group) : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':').map(group) : []
  if ([...head, ...rest].some((n) => Number.isNaN(n))) return null
  let groups: number[]
  if (halves.length === 2) {
    const fill = want - head.length - rest.length
    if (fill < 1) return null
    groups = [...head, ...Array(fill).fill(0), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== want) return null
  return [...groups, ...tail]
}

type Range4 = [number, number, number, number, number]
/** Every IPv4 range that is not the public internet: this network, private,
 *  shared (carrier NAT), loopback, link-local (with the cloud metadata
 *  address 169.254.169.254), protocol and documentation blocks, benchmarking,
 *  multicast, reserved and broadcast. */
const NOT_PUBLIC_V4: Range4[] = [
  [0, 0, 0, 0, 8], [10, 0, 0, 0, 8], [100, 64, 0, 0, 10], [127, 0, 0, 0, 8], [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12], [192, 0, 0, 0, 24], [192, 0, 2, 0, 24], [192, 88, 99, 0, 24], [192, 168, 0, 0, 16],
  [198, 18, 0, 0, 15], [198, 51, 100, 0, 24], [203, 0, 113, 0, 24], [224, 0, 0, 0, 4], [240, 0, 0, 0, 4],
]

function v4Public(b: number[]): boolean {
  const n = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3]
  return !NOT_PUBLIC_V4.some(([a, bb, c, d, bits]) => {
    const base = ((a << 24) >>> 0) + (bb << 16) + (c << 8) + d
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((n & mask) >>> 0) === ((base & mask) >>> 0)
  })
}

/** True only for an address on the public internet. Anything that cannot be
 *  read counts as not public. IPv6 addresses that carry an IPv4 address
 *  (mapped, NAT64, 6to4) are judged by the IPv4 address inside. */
export function isPublicIp(ip: string): boolean {
  const v4 = parseIPv4(ip)
  if (v4) return v4Public(v4)
  const g = parseIPv6(ip)
  if (!g) return false
  const inner = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255]
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0)
  if (zeros(8)) return false                                                  // ::
  if (zeros(7) && g[7] === 1) return false                                    // ::1
  if (zeros(5) && g[5] === 0xffff) return v4Public(inner(g[6], g[7]))         // ::ffff:a.b.c.d
  if (zeros(6)) return false                                                  // ::a.b.c.d (old form)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4Public(inner(g[6], g[7])) // NAT64
  if (g[0] === 0x2002) return v4Public(inner(g[1], g[2]))                     // 6to4
  if ((g[0] & 0xe000) !== 0x2000) return false                                // not global unicast (fc00::/7, fe80::/10, ff00::/8, 100::/64…)
  if (g[0] === 0x2001 && g[1] < 0x0200) return false                          // 2001::/23 protocol blocks, Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false                        // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return false                          // documentation (3fff::/20)
  return true
}

/* ---------- a followed calendar's events --------------------------------------- */

/** One event of a followed calendar, as a calendar_event row keeps it. A
 *  repeating event is laid out, one row per day it lands on. */
export interface IncomingEvent {
  external_uid: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  title: string
  location: string | null
}
export interface LocalEvent extends IncomingEvent { id: string }

/** The events of a read calendar file that fall in the window, as rows:
 *  times turned into exact moments in the reader's zone, whole days starting
 *  at local midnight (and ending at the start of their last day, the way
 *  Agenda keeps them). An event with no UID gets one made from what it is. */
export function eventsFromIcs(events: ParsedEvent[], o: { zone: string; from: string; to: string; max?: number }): { events: IncomingEvent[]; truncated: boolean } {
  const max = o.max ?? MAX_EVENTS
  const seen = new Set<string>()
  const out: IncomingEvent[] = []
  let truncated = false
  const iso = (ms: number) => new Date(ms).toISOString()
  for (const ev of events) {
    if (!DATE.test(ev.date)) continue
    let days = eventDays(ev, o.from, o.to, max)
    // A single event of several days that began before the window and is
    // still going on in it.
    if (!days.length && !ev.series && !ev.dates.length && ev.date < o.from && ev.endDate && ev.endDate >= o.from) days = [ev.date]
    const uid = (ev.uid || `nouid:${ev.summary}|${ev.date}|${ev.time ?? ''}`).slice(0, 1024)
    const title = (ev.summary || '(no title)').slice(0, 300)
    const location = ev.location ? ev.location.slice(0, 500) : null
    const span = ev.allDay && ev.endDate && ev.endDate > ev.date ? toDayNumber(ev.endDate) - toDayNumber(ev.date) : 0
    for (const day of days) {
      let starts: number
      let ends: number | null = null
      if (ev.allDay || !ev.time) {
        starts = wallToUtc(day, '00:00', o.zone)
        if (span > 0) ends = wallToUtc(addDays(day, span), '00:00', o.zone)
      } else {
        starts = wallToUtc(day, ev.time, o.zone)
        if (ev.minutes !== null && ev.minutes > 0) ends = starts + ev.minutes * 60000
      }
      const row: IncomingEvent = {
        external_uid: uid, starts_at: iso(starts), ends_at: ends === null ? null : iso(ends),
        all_day: ev.allDay || !ev.time, title, location,
      }
      const key = eventKey(row)
      if (seen.has(key)) continue
      if (out.length >= max) { truncated = true; break }
      seen.add(key)
      out.push(row)
    }
    if (truncated) break
  }
  out.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.external_uid.localeCompare(b.external_uid))
  return { events: out, truncated }
}

/** Which event this is: its calendar's UID and its start, compared as a
 *  moment so two spellings of the same time match. */
export function eventKey(e: { external_uid: string; starts_at: string }): string {
  const t = Date.parse(e.starts_at)
  return `${e.external_uid}\u0000${Number.isNaN(t) ? e.starts_at : t}`
}

export interface ReplacePlan {
  add: IncomingEvent[]
  update: { id: string; changes: Partial<IncomingEvent> }[]
  remove: string[]
  unchanged: number
}

const FIELDS: (keyof IncomingEvent)[] = ['ends_at', 'all_day', 'title', 'location']

/** How to make a followed calendar's events on the device match its file:
 *  events found again (same UID, same start) keep their row and change only
 *  what changed; new ones are added; everything else of that calendar goes,
 *  including a second copy of the same event. */
export function planReplace(existing: LocalEvent[], incoming: IncomingEvent[]): ReplacePlan {
  const have = new Map<string, LocalEvent>()
  const remove: string[] = []
  for (const e of existing) {
    const k = eventKey(e)
    if (have.has(k)) remove.push(e.id)
    else have.set(k, e)
  }
  const add: IncomingEvent[] = []
  const update: ReplacePlan['update'] = []
  const kept = new Set<string>()
  let unchanged = 0
  for (const e of incoming) {
    const k = eventKey(e)
    const old = have.get(k)
    if (!old) { add.push(e); continue }
    if (kept.has(old.id)) continue
    kept.add(old.id)
    const changes: Partial<IncomingEvent> = {}
    for (const f of FIELDS) {
      const a = f === 'ends_at' && old.ends_at ? Date.parse(old.ends_at) : old[f] ?? null
      const b = f === 'ends_at' && e.ends_at ? Date.parse(e.ends_at) : e[f] ?? null
      if (a !== b) (changes as Record<string, unknown>)[f] = e[f]
    }
    if (Object.keys(changes).length) update.push({ id: old.id, changes })
    else unchanged++
  }
  for (const e of have.values()) if (!kept.has(e.id)) remove.push(e.id)
  return { add, update, remove, unchanged }
}

/** Whether a followed calendar is due to be fetched again. */
export function refreshDue(lastSyncedAt: string | null | undefined, now: number, every = REFRESH_MS): boolean {
  if (!lastSyncedAt) return true
  const t = Date.parse(lastSyncedAt)
  return Number.isNaN(t) || now - t >= every || t > now + 60000
}

/** How long a calendar that could not be fetched waits before it is tried
 *  again, so a broken address is not asked for at every quarter-hour check. */
export const RETRY_MS = 60 * 60 * 1000

/** Whether to fetch a followed calendar now: when it is due, unless it failed
 *  less than an hour ago. "Refresh now" (force) always fetches. A failure
 *  time in the future (a clock put back) does not hold it up. */
export function fetchDue(o: { lastSyncedAt: string | null | undefined; failedAt?: number | null; now: number; force?: boolean }): boolean {
  if (o.force) return true
  const f = o.failedAt
  if (f != null && o.now - f < RETRY_MS && f <= o.now + 60000) return false
  return refreshDue(o.lastSyncedAt, o.now)
}

/** The start of a whole file: is it a calendar at all? */
export function looksLikeCalendar(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))
}

/* ---------- what may go in a log, or be kept and shown ------------------------ */

/** The server's name in an address, never its path or query: a followed
 *  calendar's secret address works like a password. */
export function hostOf(address: unknown): string {
  try { return new URL(String(address ?? '')).hostname || 'no host' } catch { return 'no host' }
}

/** What kind of error it was (TypeError, TimeoutError, a database code),
 *  never its message: Deno's network errors quote the whole address. */
/** Just the error's name (TimeoutError, TypeError…), when it is a plain word. */
export function errorName(e: unknown): string {
  const n = (e && typeof e === 'object' ? (e as { name?: unknown }).name : null)
  return typeof n === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(n) ? n : 'Error'
}

export function errorKind(e: unknown): string {
  const o = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown }
  const name = typeof o.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(o.name) ? o.name : null
  const code = (typeof o.code === 'string' || typeof o.code === 'number') && /^[A-Za-z0-9_]{1,12}$/.test(String(o.code)) ? String(o.code) : null
  if (name && code) return `${name} ${code}`
  return name ?? (code ? `code ${code}` : 'unknown error')
}

/** One line for the server's log: where, what kind of error, at which server. */
export function logLine(where: string, e: unknown, host?: string | null): string {
  return `${where}: ${errorKind(e)}${host ? ` at ${host}` : ''}`
}

/** A message to keep or show, with any web address in it taken out, in case
 *  one ever carries a calendar's secret address. */
export function withoutAddresses(message: string): string {
  return String(message ?? '')
    .replace(/\b(?:https?|webcals?):\/\/[^\s"'<>()]+/gi, 'the address')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s"'<>()]*/gi, 'the address')
}
