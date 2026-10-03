/** What the Android home-screen widget shows, worked out from the local copy.
 *  Pure: no database, no Capacitor, so every rule is checked by hand in
 *  src/test/widget.check.mjs.
 *
 *  The app writes a snapshot of today and tomorrow to the phone; the widget
 *  draws from it without starting the app. Tomorrow is included so that just
 *  after midnight the widget shows the new day, not an empty one. Ticks made
 *  on the widget come back as a queue the app applies the next time it runs. */

import { doneDays, doneThisWeek, isScheduled, type HabitSchedule } from './tracking-rules.ts'

export interface WidgetTask { id: string; title: string; time: string | null; done: boolean }
export interface WidgetHabit { id: string; name: string; done: boolean }
export interface WidgetDay { tasks: WidgetTask[]; habits: WidgetHabit[] }
export interface WidgetSnapshot { v: 1; updated_at: string; days: Record<string, WidgetDay> }
export interface WidgetTick { kind: 'task' | 'habit'; id: string; day: string; done: boolean; at: string }

interface TaskRow {
  id: string; title: string; planned_date: string | null; planned_time: string | null
  status: string; horizon?: string; deleted_at: string | null
}
interface HabitRow { id: string; name: string; schedule: HabitSchedule; sort_order: number; active: boolean; deleted_at: string | null }
interface HabitLogRow { habit_id: string; log_date: string; done: boolean; updated_at: string }

/** More than a home screen can show; the widget draws as many as fit. */
export const MAX_TASKS = 30
export const MAX_HABITS = 12
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
  const dayHabits = (habits ?? [])
    .filter((h) => h.active && !h.deleted_at && isScheduled(h.schedule, day))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .slice(0, MAX_HABITS)
    .map((h): WidgetHabit => {
      const days = doneDays(logs.filter((l) => l.habit_id === h.id))
      // A weekly habit is done for the whole week once it is done on any day of it.
      const done = h.schedule === 'weekly' ? doneThisWeek(days, day) : days.includes(day)
      return { id: h.id, name: clip(h.name), done }
    })

  return { tasks: dayTasks, habits: dayHabits }
}

export function buildSnapshot(
  days: string[], tasks: TaskRow[], habits: HabitRow[] | null, logs: HabitLogRow[], now: Date,
): WidgetSnapshot {
  const out: WidgetSnapshot = { v: 1, updated_at: now.toISOString(), days: {} }
  for (const d of days) out.days[d] = buildDay(d, tasks, habits, logs)
  return out
}

/** Ticks as the app should apply them: one per row and day, the last one made.
 *  A tick and an untick in a row on the widget cancel out to the second. */
export function latestTicks(ticks: WidgetTick[]): WidgetTick[] {
  const last = new Map<string, WidgetTick>()
  for (const t of [...ticks].sort((a, b) => a.at.localeCompare(b.at))) last.set(`${t.kind}:${t.id}:${t.day}`, t)
  return [...last.values()]
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
