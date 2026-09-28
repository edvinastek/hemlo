import { addDays, toDayNumber } from './series-rules.ts'
import {
  buildCalendar, calendarEvent, eventDays, seriesEvents, taskEvent, utcToWall, wallToUtc,
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
 *  notes only when the person asks for them.
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
 *  back to twelve months ahead, both days included. Repeating tasks go out as
 *  one repeating event, so they carry on past the end. */
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
}
export interface FeedSeries extends SeriesLike {
  active?: boolean
  deleted_at?: string | null
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
}

export interface FeedInput {
  profileName: string
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

/** The calendar's name in Google: "GetIt – Anna". */
export function feedName(profileName: string): string {
  const name = profileName.trim().slice(0, 60)
  return name ? `GetIt – ${name}` : 'GetIt'
}

/** What a feed holds, as events: every task with a day in the window (with
 *  or without a time, not dropped, not deleted), each repeating series once
 *  with its repeat rule, and the person's own agenda events. Events that came
 *  from a calendar they follow are left out, so Google's own events are never
 *  sent back to Google. */
export function feedEvents(i: FeedInput): IcsEvent[] {
  const { from, to } = feedWindow(i.today)
  const zone = i.timezone || 'UTC'
  const strip = (e: IcsEvent): IcsEvent => (i.notes ? e : { ...e, description: null })
  const byParent = new Map<string, FeedException[]>()
  for (const x of i.exceptions) byParent.set(x.series_id, [...(byParent.get(x.series_id) ?? []), x])

  const out: IcsEvent[] = []
  const repeating = new Set<string>()
  for (const s of i.series) {
    if (s.deleted_at || s.active === false) continue
    const evs = seriesEvents(s, byParent.get(s.id) ?? [])
    if (evs.length) { out.push(...evs.map(strip)); repeating.add(s.id) }
  }
  for (const t of i.tasks) {
    if (t.deleted_at || !t.planned_date || t.planned_date < from || t.planned_date > to) continue
    if (t.series_id && repeating.has(t.series_id)) continue
    const e = taskEvent(t)
    if (e) out.push(strip(e))
  }
  for (const e of i.events) {
    if (e.deleted_at || e.subscription_id) continue
    const start = Date.parse(e.starts_at)
    if (Number.isNaN(start)) continue
    const startDay = utcToWall(start, zone).date
    if (startDay < from || startDay > to) continue
    const end = e.ends_at ? Date.parse(e.ends_at) : NaN
    const ev = calendarEvent({ ...e, start_day: startDay, end_day: Number.isNaN(end) ? null : utcToWall(end, zone).date })
    if (ev) out.push(ev)
  }
  return out
}

/** The whole feed file. */
export function buildFeed(i: FeedInput): string {
  return buildCalendar(feedEvents(i), { stamp: i.stamp, name: feedName(i.profileName), timezone: i.timezone })
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

/** The start of a whole file: is it a calendar at all? */
export function looksLikeCalendar(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ''))
}
