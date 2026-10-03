/** Plan's views (PLN-01, PLN-03, PLN-07, AGN-06): which view and day the
 *  address asks for, how many days the week shows, how full a day is, the
 *  Inbox's order, and the person's Plan choices kept in the core module's
 *  settings. Pure: no database, no React, no clock. */
import { addDays, isDay, weekdayOf } from './schedule-rules.ts'
import { readCopyChoices, type CopyChoices } from './copy-rules.ts'
import { readPlanTemplates, type PlanTemplate } from './plan-templates-rules.ts'

export type PlanView = 'day' | 'week' | 'month' | 'year' | 'inbox'
export const PLAN_VIEWS: PlanView[] = ['day', 'week', 'month', 'year', 'inbox']
export const VIEW_NAMES: Record<PlanView, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', inbox: 'Inbox' }

/** What `/plan?view=…&date=…` asks for. An unknown view is the week; a day
 *  that is not a real day, or is outside the range, is today or the nearest end. */
export function readPlanAddress(view: string | null, date: string | null, today: string, range: { first: string; last: string }): { view: PlanView; date: string } {
  const v = PLAN_VIEWS.includes(view as PlanView) ? (view as PlanView) : 'week'
  let d = isDay(date) ? date : today
  if (d < range.first) d = range.first
  if (d > range.last) d = range.last
  return { view: v, date: d }
}

/* ---------- the week, 1 to 14 days ----------------------------------------- */

export const MIN_WEEK_DAYS = 1
export const MAX_WEEK_DAYS = 14
export const DEFAULT_WEEK_DAYS = 7

/** The number of days the week view shows, 1 to 14; 7 when unset or broken. */
export function cleanWeekDays(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= MIN_WEEK_DAYS && n <= MAX_WEEK_DAYS ? n : DEFAULT_WEEK_DAYS
}

const mondayOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

/** The days the week view shows around a day. Seven and fourteen are whole
 *  weeks from Monday, as a paper diary is; any other length starts on the
 *  day itself (three days: today and the next two). */
export function weekSpan(day: string, n: number): string[] {
  const len = cleanWeekDays(n)
  const first = len % 7 === 0 ? mondayOf(day) : day
  return Array.from({ length: len }, (_, i) => addDays(first, i))
}

/** Where the arrows go: a whole span on or back. */
export const stepSpan = (day: string, n: number, dir: 1 | -1) => addDays(day, dir * cleanWeekDays(n))

/** The columns a wide screen gives the week: at most seven side by side, so
 *  a fortnight is two rows of seven. */
export const weekColumns = (n: number) => Math.min(7, cleanWeekDays(n))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
/** "5 – 11 Oct", "28 Sep – 4 Oct", or one day "Mon 5 Oct". */
export function spanLabel(days: string[]): string {
  if (days.length === 0) return ''
  const a = days[0]
  const b = days[days.length - 1]
  if (a === b) return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(a)]} ${short(a)}`
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))} – ${short(b)}`
  return `${short(a)} – ${short(b)}`
}

/* ---------- how full a day is ---------------------------------------------- */

const toMin = (t: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  return h < 24 && mm < 60 ? h * 60 + mm : null
}

/** The waking day the person set (profile day_start to day_end), in
 *  minutes: what a day can hold. A day that ends after midnight wraps. When
 *  either is missing or they are the same, sixteen hours. */
export function dayCapacity(start: string | null | undefined, end: string | null | undefined): number {
  const a = toMin(start)
  const b = toMin(end)
  if (a === null || b === null || a === b) return 16 * 60
  return (b - a + 1440) % 1440
}

/** What counts towards how full a day is: anything with a length. A task
 *  with no length counts a quarter of an hour (it still takes some time), a
 *  whole-day event nothing, and something already done still counts: it
 *  was part of the day. */
export function plannedMinutes(items: { kind: string; minutes: number | null; time?: string | null }[]): number {
  let sum = 0
  for (const it of items) {
    if (typeof it.minutes === 'number' && Number.isFinite(it.minutes) && it.minutes > 0) sum += Math.min(it.minutes, 1440)
    else if (it.kind === 'task') sum += 15
  }
  return sum
}

/** Minutes of the day's items as a step on the load heat ramp, 0 to 4. */
export function heatStep(minutes: number): number {
  return minutes <= 0 ? 0 : minutes < 60 ? 1 : minutes < 180 ? 2 : minutes < 360 ? 3 : 4
}

const span = (m: number) => {
  const r = Math.round(m)
  const h = Math.floor(r / 60)
  const rest = r % 60
  return h ? (rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`) : `${rest} min`
}

/** How full a day is (PLN-03): the share of the waking day planned, never
 *  drawn past full, and words for it that do not rely on the colour. */
export function busyness(minutes: number, capacity: number): { share: number; over: boolean; words: string } {
  const cap = capacity > 0 ? capacity : 16 * 60
  const share = Math.max(0, Math.min(1, minutes / cap))
  const over = minutes > cap
  const words = minutes <= 0 ? 'Nothing planned'
    : over ? `${span(minutes)} planned, ${span(minutes - cap)} more than the day holds`
      : `${span(minutes)} of ${span(cap)} planned`
  return { share, over, words }
}

/* ---------- the Inbox ------------------------------------------------------- */

/** Moving one row of a hand-sorted list: the new order of ids. */
export function moveInList(ids: string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length) return ids
  const t = Math.max(0, Math.min(ids.length - 1, to))
  const out = [...ids]
  const [x] = out.splice(from, 1)
  out.splice(t, 0, x)
  return out
}

/** The sort numbers a new order needs, only for the rows whose number changes. */
export function sortChanges(order: string[], current: Map<string, number>): { id: string; sort_order: number }[] {
  return order.map((id, i) => ({ id, sort_order: i })).filter((c) => current.get(c.id) !== c.sort_order)
}

/** The sort number for something new at the top of the Inbox. */
export const topOfList = (orders: number[]) => (orders.length ? Math.min(...orders) - 1 : 0)

/* ---------- sections in the task sheet (GEN-05) ---------------------------- */

/** The task sheet's built-in sections and the module each belongs to. Work
 *  and Night are the planner's own (work hours, the evening): always there. */
export const SECTION_MODULES: [string, string | null][] = [
  ['Work', null], ['Meal', 'nutrition'], ['Training', 'training'], ['Learning', 'learning'],
  ['Home', 'household'], ['Body', 'health'], ['Night', null],
]

/** The sections offered: the built-in ones whose module is on, then the
 *  person's own, then the task's own section if it is none of these (so it
 *  never shows as blank). A switched-off module's section is not offered,
 *  and choosing a section never switches its module on. */
export function sectionChoices(enabled: string[], own: string[], current: string | null): string[] {
  const out = SECTION_MODULES.filter(([, m]) => !m || enabled.includes(m)).map(([s]) => s)
  for (const s of own) if (!out.includes(s)) out.push(s)
  if (current && !out.includes(current)) out.push(current)
  return out
}

/** A section the person typed: trimmed, at most 30 characters, sentence as typed. */
export function cleanSection(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, 30)
  return s || null
}

/* ---------- the person's Plan choices (core module settings) ---------------- */

export interface PlanPrefs {
  /** Days the week view shows, 1 to 14. */
  week_days: number
  /** Followed calendars hidden on Plan (AGN-06), by their id; still followed. */
  hidden_calendars: string[]
  /** The copy dialog's last choices (TSK-22: the notes choice is remembered). */
  copy: CopyChoices
  /** Sections the person made in the task sheet. */
  own_sections: string[]
  /** Day and week templates (PLN-08). */
  plan_templates: PlanTemplate[]
}

const UUIDISH = /^[0-9a-z-]{1,64}$/i

/** The Plan choices in a core module_instance.settings object, checked: an
 *  old or broken value never breaks a screen (GEN-68). */
export function readPlanPrefs(settings: unknown): PlanPrefs {
  const r = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {}
  const ids = Array.isArray(r.hidden_calendars) ? r.hidden_calendars.filter((x): x is string => typeof x === 'string' && UUIDISH.test(x)) : []
  const own: string[] = []
  if (Array.isArray(r.own_sections)) {
    for (const s of r.own_sections) {
      const c = cleanSection(s)
      if (c && !own.includes(c) && !SECTION_MODULES.some(([b]) => b === c)) own.push(c)
      if (own.length >= 20) break
    }
  }
  return {
    week_days: cleanWeekDays(r.week_days),
    hidden_calendars: [...new Set(ids)].slice(0, 100),
    copy: readCopyChoices(r.copy),
    own_sections: own,
    plan_templates: readPlanTemplates(r.plan_templates),
  }
}

/** Show or hide one followed calendar on Plan. */
export function toggleHidden(hidden: string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]
}
