/** What the Android home-screen widget shows, worked out from the local copy.
 *  Pure: no database, no Capacitor, so every rule is checked by hand in
 *  src/test/widget.check.mjs.
 *
 *  The app writes a snapshot of today and tomorrow to the phone; the widget
 *  draws from it without starting the app. Tomorrow is included so that just
 *  after midnight the widget shows the new day, not an empty one. Ticks made
 *  on the widget come back as a queue the app applies the next time it runs. */

import { doneDays } from './tracking-rules.ts'
import { habitDay, type HabitLike } from './schedule-rules.ts'
import type { DayItem } from './day-items-rules.ts'

export interface WidgetTask { id: string; title: string; time: string | null; done: boolean }
export interface WidgetHabit { id: string; name: string; done: boolean }
/** The rest of the day from other modules (WID-02): chores and supplement
 *  slots, which can be ticked, and events and dated records, which are only
 *  shown. Added beside tasks and habits, so a widget built before them still
 *  reads the snapshot. */
export type WidgetItemKind = 'chore' | 'supplements' | 'event' | 'record'
export interface WidgetItem {
  kind: WidgetItemKind
  /** A chore's id; for a supplement slot, the ids of its supplements joined
   *  with commas, so a tick says exactly which ones the person saw. */
  id: string
  title: string
  time: string | null
  done: boolean
  /** Has a tick box on the widget. */
  tick: boolean
  /** A chore that has waited past its day. */
  late?: boolean
}
export interface WidgetDay { tasks: WidgetTask[]; habits: WidgetHabit[]; items?: WidgetItem[] }
export interface WidgetSnapshot { v: 1; updated_at: string; days: Record<string, WidgetDay> }
export type WidgetTickKind = 'task' | 'habit' | 'chore' | 'supplements'
export interface WidgetTick { kind: WidgetTickKind; id: string; day: string; done: boolean; at: string }

interface TaskRow {
  id: string; title: string; planned_date: string | null; planned_time: string | null
  status: string; horizon?: string; deleted_at: string | null
}
interface HabitRow extends HabitLike { id: string; name: string; sort_order: number; active: boolean; deleted_at: string | null }
interface HabitLogRow { habit_id: string; log_date: string; done: boolean; updated_at: string }

/** More than a home screen can show; the widget draws as many as fit. */
export const MAX_TASKS = 30
export const MAX_HABITS = 12
export const MAX_ITEMS = 20
const MAX_TITLE = 80

const clip = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t
}

export function buildDay(
  day: string, tasks: TaskRow[], habits: HabitRow[] | null, logs: HabitLogRow[],
): WidgetDay {
  const dayTasks = tasks
    .filter((t) => t.planned_date === day && !t.deleted_at && t.status !== 'dropped' && (t.horizon ?? 'day') === 'day')
    .map((t): WidgetTask => ({
      id: t.id,
      title: clip(t.title ?? '') || 'Untitled',
      time: t.planned_time ? t.planned_time.slice(0, 5) : null,
      done: t.status === 'done',
    }))
    // By time, with untimed tasks after the timed ones, as on Today.
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title))
    .slice(0, MAX_TASKS)

  // Habits is a module that can be switched off; then the widget has none.
  // Through the one repeat engine: weekends, chosen days, dates and
  // N-times-a-week all count; a habit whose week is already met (once a
  // week, three times a week) shows as done for the rest of that week.
  const dayHabits = (habits ?? [])
    .filter((h) => h.active && !h.deleted_at)
    .map((h) => ({ h, state: habitDay(h, day, doneDays(logs.filter((l) => l.habit_id === h.id))) }))
    .filter((x) => x.state !== 'off')
    .sort((a, b) => a.h.sort_order - b.h.sort_order || a.h.name.localeCompare(b.h.name))
    .slice(0, MAX_HABITS)
    .map(({ h, state }): WidgetHabit => ({ id: h.id, name: clip(h.name), done: state === 'done' || state === 'met' }))

  return { tasks: dayTasks, habits: dayHabits }
}

export function buildSnapshot(
  days: string[], tasks: TaskRow[], habits: HabitRow[] | null, logs: HabitLogRow[], now: Date,
): WidgetSnapshot {
  const out: WidgetSnapshot = { v: 1, updated_at: now.toISOString(), days: {} }
  for (const d of days) out.days[d] = buildDay(d, tasks, habits, logs)
  return out
}

/** One day of the widget from the day's items (day-items-rules.ts, read for
 *  the widget, so only modules set to "Show on the widget" are in it). The
 *  same list Today and Plan draw, so the three never disagree. */
export function dayFromItems(dayItems: DayItem[], day: string): WidgetDay {
  const own = dayItems.filter((i) => i.day === day)
  const byTime = <T extends { time: string | null; title?: string; name?: string }>(a: T, b: T) =>
    (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')

  const tasks = own
    .filter((i) => i.kind === 'task' && i.task && i.task.status !== 'dropped' && (i.task.horizon ?? 'day') === 'day')
    .map((i): WidgetTask => ({ id: i.ref.id, title: clip(i.title ?? '') || 'Untitled', time: i.time, done: i.done }))
    .sort(byTime)
    .slice(0, MAX_TASKS)

  const habits = own
    .filter((i) => i.kind === 'habit')
    .slice(0, MAX_HABITS)
    .map((i): WidgetHabit => ({ id: i.ref.id, name: clip(i.title), done: i.done }))

  const items: WidgetItem[] = []
  for (const i of own) {
    if (i.kind === 'chore') {
      items.push({ kind: 'chore', id: i.ref.id, title: clip(i.title) || 'Chore', time: i.time, done: i.done, tick: true, late: i.state === 'overdue' })
    } else if (i.kind === 'supplements' && i.parts?.length) {
      items.push({ kind: 'supplements', id: i.parts.map((p) => p.id).join(','), title: clip(i.title), time: i.time, done: i.done, tick: true })
    } else if (i.kind === 'event' || i.kind === 'record') {
      items.push({ kind: i.kind, id: i.ref.id, title: clip(i.title) || 'Untitled', time: i.time, done: false, tick: false })
    }
  }
  return { tasks, habits, items: items.sort(byTime).slice(0, MAX_ITEMS) }
}

export function snapshotFromItems(days: string[], dayItems: DayItem[], now: Date): WidgetSnapshot {
  const out: WidgetSnapshot = { v: 1, updated_at: now.toISOString(), days: {} }
  for (const d of days) out.days[d] = dayFromItems(dayItems, d)
  return out
}

/** The supplements a slot's tick names. */
export const slotIds = (id: string) => id.split(',').filter((x) => /^[0-9a-f-]{8,40}$/i.test(x))

/** Ticks as the app should apply them: one per row and day, the last one made.
 *  A tick and an untick in a row on the widget cancel out to the second. */
export function latestTicks(ticks: WidgetTick[]): WidgetTick[] {
  const last = new Map<string, WidgetTick>()
  for (const t of [...ticks].sort((a, b) => a.at.localeCompare(b.at))) last.set(`${t.kind}:${t.id}:${t.day}`, t)
  return [...last.values()]
}

/** A stats widget's tap: app.hemlo.planner://open/stats?view=… becomes
 *  /stats?view=…, a path inside the app. Anything else is not ours. */
export function widgetPath(url: string): string | null {
  const prefix = 'app.hemlo.planner://open'
  if (!url.startsWith(prefix)) return null
  const path = url.slice(prefix.length) || '/'
  return path.startsWith('/') && !path.startsWith('//') ? path : null
}

/* ---------- the widgets' colours (LOOK-09, WID-13) ------------------------- */

/** The colours a home-screen widget draws with, as '#rrggbb'. */
export interface WidgetPalette {
  paper: string; ink: string; soft: string; rule: string; rail: string
  accent: string; done: string; warn: string; tint: string
}

/** The app's theme for the widgets: both shades, so a widget on "follow the
 *  phone" can switch with the home screen without the app running. */
export interface WidgetLooks {
  v: 1
  mode: 'system' | 'light' | 'dark' | 'black'
  light: WidgetPalette
  /** The dark shade, or the black one when the person chose black. */
  dark: WidgetPalette
}

const HEX6 = /^#[0-9a-f]{6}$/i
/** A theme's tokens as a widget palette; anything not a plain colour falls
 *  back to the default theme's, so the widget never draws with garbage. */
export function widgetPalette(t: Partial<Record<keyof WidgetPalette, string>>, fallback: WidgetPalette): WidgetPalette {
  const out = { ...fallback }
  for (const k of Object.keys(fallback) as (keyof WidgetPalette)[]) {
    const v = t[k]
    if (typeof v === 'string' && HEX6.test(v)) out[k] = v.toLowerCase()
  }
  return out
}

/** The default theme's colours, the ones the widget had before themes. */
export const WIDGET_LIGHT: WidgetPalette = {
  paper: '#f8f4ed', ink: '#201e1b', soft: '#6c665b', rule: '#e4ddcd', rail: '#cfc6b3',
  accent: '#b4442a', done: '#3f6b4a', warn: '#975809', tint: '#efe9dd',
}
export const WIDGET_DARK: WidgetPalette = {
  paper: '#15141b', ink: '#f0eae0', soft: '#9b9489', rule: '#2b2a2f', rail: '#3a3842',
  accent: '#d9674a', done: '#7fb389', warn: '#e0a049', tint: '#221f27',
}
