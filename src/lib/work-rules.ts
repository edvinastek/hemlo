import type { Series } from './types'
import type { ProfileSettings } from './settings.ts'
import { addDays } from './series-rules.ts'

/** Work hours and the commute, as recurring series. Pure: the times, the
 *  lengths, which weekdays, and which series to keep, stop or start. The
 *  writing is in work.ts.
 *
 *  Each of the three is one series the app looks after. It is recognised by a
 *  marker in its task template rather than by module_key: module_key on the
 *  server must name a real module, and "work" is part of planning, not a
 *  module that can be switched off. */

export type WorkKey = 'work:hours' | 'work:commute-to' | 'work:commute-from'
export const WORK_KEYS: WorkKey[] = ['work:hours', 'work:commute-to', 'work:commute-from']

/** What one managed series should look like. */
export interface WorkSpec {
  key: WorkKey
  title: string
  /** 0 (Sunday) to 6, sorted. */
  weekdays: number[]
  /** 'HH:MM' */
  time_of_day: string
  duration_min: number
  locked: boolean
  notes: string | null
  category: string
}

/** A series' task template with the marker that says the app manages it. */
export type ManagedTemplate = Series['task_template'] & { managed?: WorkKey }

const DAY = 24 * 60

export function toMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Minutes after midnight as 'HH:MM', wrapping round the day either way. */
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Minutes from start to end. An end earlier than the start is the next
 *  morning (a night shift, 22:00 to 06:00, is eight hours); the same time is
 *  no length at all, which is treated as not set. */
export function span(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start) + DAY) % DAY
}

/** The same weekdays moved by whole days: a commute before a 00:30 start is
 *  on the evening before. */
export function shiftDays(days: number[], by: number): number[] {
  return [...new Set(days.map((d) => (((d + by) % 7) + 7) % 7))].sort((a, b) => a - b)
}

export function distanceNote(km: number | null): string | null {
  return km != null && km > 0 ? `${km} km each way` : null
}

/** The series work and commute call for, none when work is off, has no days,
 *  or starts and ends at the same time. The commute takes the lock from work:
 *  the two together are the block the day is planned around. */
export function workSpecs(settings: Pick<ProfileSettings, 'work' | 'commute'>): WorkSpec[] {
  const { work, commute } = settings
  const days = [...new Set(work.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  const length = span(work.start, work.end)
  if (!work.on || days.length === 0 || length === 0) return []

  const out: WorkSpec[] = [{
    key: 'work:hours', title: 'Work', weekdays: days, time_of_day: clock(toMinutes(work.start)),
    duration_min: length, locked: work.locked, notes: null, category: 'Work',
  }]
  if (!commute.on) return out

  const notes = distanceNote(commute.km)
  const start = toMinutes(work.start)
  if (commute.before_min > 0) {
    const leave = start - commute.before_min
    out.push({
      key: 'work:commute-to', title: 'Commute', weekdays: shiftDays(days, leave < 0 ? -1 : 0),
      time_of_day: clock(leave), duration_min: commute.before_min, locked: work.locked, notes, category: 'Work',
    })
  }
  if (commute.after_min > 0) {
    // Counted from the start, so a shift that ends after midnight sends the
    // commute home to the next day.
    const finish = start + length
    out.push({
      key: 'work:commute-from', title: 'Commute', weekdays: shiftDays(days, finish >= DAY ? 1 : 0),
      time_of_day: clock(finish), duration_min: commute.after_min, locked: work.locked, notes, category: 'Work',
    })
  }
  return out
}

/** Which of the three a series is, or null for any other series. */
export function managedKey(s: Pick<Series, 'task_template' | 'module_key'>): WorkKey | null {
  const mark = (s.task_template as ManagedTemplate | null | undefined)?.managed
  if (mark && WORK_KEYS.includes(mark)) return mark
  return s.module_key && (WORK_KEYS as string[]).includes(s.module_key) ? (s.module_key as WorkKey) : null
}

/** Still laying out days. A series stopped today has today as its end and
 *  counts as stopped: its last day stays, nothing after it. */
export function isRunning(s: Pick<Series, 'deleted_at' | 'active' | 'end_date'>, today: string): boolean {
  return !s.deleted_at && s.active && (!s.end_date || s.end_date > today)
}

/** Does a stored series already say what the spec says? Then it is kept as it
 *  is, and the days it has laid out (ticks, moves, notes) are left alone. */
export function matchesSpec(s: Series, spec: WorkSpec): boolean {
  const t = (s.task_template ?? {}) as ManagedTemplate
  const days = [...new Set(s.rule_config?.weekdays ?? [])].sort((a, b) => a - b)
  return s.title === spec.title
    && s.rule === 'weekly'
    && JSON.stringify(days) === JSON.stringify(spec.weekdays)
    && (s.time_of_day ?? '').slice(0, 5) === spec.time_of_day
    && (t.duration_min ?? null) === spec.duration_min
    && (t.locked ?? false) === spec.locked
    && (t.notes ?? null) === spec.notes
    && (t.category ?? null) === spec.category
}

export interface WorkChanges {
  keep: Series[]
  /** Stopped the way "Stop repeating" does: today stays, later days go. */
  stop: Series[]
  /** New series, each with the day it starts. */
  start: { spec: WorkSpec; start_date: string }[]
}

/** From what is stored to what the settings ask for. A series that already
 *  matches is kept. One that does not is stopped today and its replacement
 *  starts tomorrow, so today never ends up with the old and the new side by
 *  side; the same goes for a series stopped earlier today and turned back on.
 *  With nothing before it, a series starts today. A second running copy of
 *  the same one (made on another phone while offline) is stopped too. */
export function planWorkChanges(existing: Series[], specs: WorkSpec[], today: string): WorkChanges {
  const out: WorkChanges = { keep: [], stop: [], start: [] }
  for (const key of WORK_KEYS) {
    const mine = existing.filter((s) => managedKey(s) === key && !s.deleted_at)
    const running = mine.filter((s) => isRunning(s, today))
    const spec = specs.find((s) => s.key === key)
    const keeper = spec ? running.find((s) => matchesSpec(s, spec)) : undefined
    if (keeper) out.keep.push(keeper)
    out.stop.push(...running.filter((s) => s !== keeper))
    if (spec && !keeper) {
      const endedToday = mine.some((s) => s.end_date === today)
      out.start.push({ spec, start_date: running.length || endedToday ? addDays(today, 1) : today })
    }
  }
  return out
}

/** "Mon to Fri, 09:00 to 17:00 (8 h)" for a settings line. */
export function describeWork(settings: Pick<ProfileSettings, 'work'>): string {
  const { work } = settings
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => work.days.includes(d))
  const run = order.length > 2 && order.every((d, i) => i === 0 || d === (order[i - 1] + 1) % 7)
  const days = order.length === 0 ? 'no days'
    : run ? `${names[order[0]]} to ${names[order[order.length - 1]]}` : order.map((d) => names[d]).join(', ')
  const len = span(work.start, work.end)
  const hours = `${Math.floor(len / 60)} h${len % 60 ? ` ${len % 60} min` : ''}`
  return `${days}, ${work.start} to ${work.end} (${hours})`
}
