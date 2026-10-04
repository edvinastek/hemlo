import { db, getMeta, setMeta } from './db'
import { carryOver, type DayItem } from './day-items-rules'
import { loadDayItems } from './day-items'
import { enabledModules } from './day'
import { choresFor, choreLogs } from './chores'
import { choreState } from './schedule-rules'
import { flexibleSeriesIds, moveWithUndo, deleteTasks } from './series'
import { carry } from './rail-actions'
import { blankTask, saveTask } from './tasks'
import { loadPlanPrefs, savePlanPrefs } from './plan-prefs'
import { capacityOf, pinnedOn, plannedMinutes } from './plan-view-rules'
import { addDays } from './schedule-rules'
import { reviewsDue } from './study-review-rules'
import { instanceFor } from '../modules/defs'
import { suggestions, planDayActions, planDayWords, type LeftoverChoice, type Suggestion } from './plan-day-rules'
import type { Profile, Task } from './types'

/** Plan my day (TOD-22), against the local copy: what the sheet shows and
 *  what "Start the day" does. The decisions are in plan-day-rules.ts. */

export interface PlanDayData {
  leftovers: Task[]
  suggestions: Suggestion[]
  /** Minutes already on today, as Plan counts them. */
  planned: number
  /** What the day can hold: the person's capacity, or their waking day. */
  capacity: number
}

const SHOWN_KEY = 'plan_day_shown'

/** The day Plan my day last opened by itself on this device. */
export const lastShown = () => getMeta<string | null>(SHOWN_KEY, null)
export const markShown = (day: string) => setMeta(SHOWN_KEY, day)

export async function loadPlanDay(profile: Profile, today: string): Promise<PlanDayData> {
  const [flexible, prefs, enabled] = await Promise.all([
    flexibleSeriesIds(profile.id),
    loadPlanPrefs(profile.id),
    enabledModules(profile.id, (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)),
  ])
  // What was left on earlier days, as Today's carry-over row has it.
  const before = await db.task.where('[profile_id+planned_date]')
    .between([profile.id, ''], [profile.id, addDays(today, -1)], true, true).toArray()
  const leftovers = carryOver(before, today, flexible)
  // Tasks that may be suggested: with a due date, or of a flexible repeat.
  const open = await db.task.where('profile_id').equals(profile.id)
    .filter((t) => !t.deleted_at && t.status !== 'done' && t.status !== 'dropped' && (!!t.due_date || (!!t.series_id && flexible.has(t.series_id))))
    .toArray()
  const items: DayItem[] = await loadDayItems(profile.id, profile.household_id, today, today, 'today', today)
  // Flexible chores nearly due that today's list does not have.
  let chores: Parameters<typeof suggestions>[0]['chores'] = []
  if (enabled.includes('household')) {
    const list = (await choresFor(profile.household_id)).filter((c) => c.mode === 'flexible' && !c.paused)
    const logs = await choreLogs(list.map((c) => c.id))
    const onToday = new Set(items.filter((i) => i.kind === 'chore').map((i) => i.ref.id))
    chores = list.map((c) => {
      const st = choreState(c, today, logs.filter((l) => l.chore_id === c.id))
      return { id: c.id, name: c.name, mode: c.mode, minutes: c.minutes ?? null, dueness: st.dueness, doneToday: st.doneToday, onToday: onToday.has(c.id) }
    })
  }
  // Study reviews (LRN-05), when Learning and its review schedule are on.
  let reviews: { subject: string; due: string }[] = []
  if (enabled.includes('learning') && (await instanceFor(profile.id, 'learning'))?.settings?.review_schedule === true) {
    const records = await db.module_record.where('profile_id').equals(profile.id)
      .filter((r) => r.module_key === 'learning' && !r.deleted_at).toArray()
    reviews = reviewsDue(records, today)
  }
  return {
    leftovers,
    suggestions: suggestions({ today, tasks: open, flexibleSeries: flexible, chores, reviews }),
    planned: plannedMinutes(items),
    capacity: capacityOf(prefs, profile.day_start, profile.day_end),
  }
}

/** "Start the day": everything chosen, in one go, with one Undo. Returns
 *  the Undo line and the Undo, or null when nothing was chosen. */
export async function startTheDay(profile: Profile, today: string, data: PlanDayData,
  choices: Record<string, LeftoverChoice>, taken: ReadonlySet<string>): Promise<{ words: string; undo: () => Promise<void> } | null> {
  const a = planDayActions(data.leftovers, choices, data.suggestions, taken)
  const words = planDayWords(a)
  if (!words) return null
  const undos: (() => Promise<void> | void)[] = []
  if (a.toToday.length) undos.push(await carry(a.toToday, 'today', today))
  if (a.toInbox.length) undos.push(await carry(a.toInbox, 'inbox', today))
  if (a.planToday.length) undos.push(await moveWithUndo(a.planToday.map((task) => ({ task, to: today }))))
  if (a.chores.length) {
    const prefs = await loadPlanPrefs(profile.id)
    const before = prefs.today_chores
    await savePlanPrefs(profile.id, { today_chores: { day: today, ids: [...new Set([...pinnedOn(prefs, today), ...a.chores])] } })
    undos.push(() => savePlanPrefs(profile.id, { today_chores: before }))
  }
  if (a.reviews.length) {
    const made: Task[] = []
    for (const subject of a.reviews) {
      made.push(await saveTask(blankTask(profile.id, today, { title: `Review ${subject}`, duration_min: 30, category: 'Learning' })))
    }
    undos.push(async () => { await deleteTasks(made) })
  }
  return { words, undo: async () => { for (const u of undos.reverse()) await u() } }
}
