import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { enabledModules } from './day'
import { readSettings } from './settings'
import { dayItems, eventMayTouch, type DayItem, type DayItemSources, type Where } from './day-items-rules'
import { clockOf, minutesOf, readSleepSettings } from './sleep-rules'
import { instanceFor } from '../modules/defs'
import { addDays, looseOf } from './schedule-rules'
import { useApp } from './store'
import type { ModuleRecord } from './types'
// Habits, chores and supplements (engineer B): slots, chore preferences and
// members' names for the day's items.
import { supplementSlots } from './tracking'
import { cachedMembers, chorePrefs } from './household'
import { memberName, mineOnly } from './chore-rules'
import { financeDaySources } from './finance'
import { dayEdges } from './day-edge-rules'
import { loadPlanPrefs } from './plan-prefs'
import { pinnedOn } from './plan-view-rules'

/** Reads everything the day-items rules need for a range of days from the
 *  local copy, and lays the days out (day-items-rules.ts). One reader for
 *  Today, Plan and the widget, so they show the same things. */
export async function loadDayItems(profileId: string, householdId: string, from: string, to: string, where: Where, today: string): Promise<DayItem[]> {
  const profile = await db.profile.get(profileId)
  const settings = readSettings(profile)
  const built = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const habitWeekStart = addDays(from, -7)
  const [enabled, tasks, habits, chores, supplements, events, records] = await Promise.all([
    enabledModules(profileId, built),
    db.task.where('[profile_id+planned_date]').between([profileId, from], [profileId, to], true, true).toArray(),
    db.habit.where('profile_id').equals(profileId).toArray(),
    db.chore.where('household_id').equals(householdId).toArray(),
    db.supplement.where('profile_id').equals(profileId).toArray(),
    // Stored in UTC: a day either side, and the rules sort out the local days.
    // A repeating one from its first day on (eventMayTouch).
    db.calendar_event.where('profile_id').equals(profileId)
      .filter((e) => !e.deleted_at && eventMayTouch(e, from, to)).toArray(),
    db.module_record.where('record_date').between(from, to, true, true).filter((r) => r.profile_id === profileId).toArray(),
  ])
  // Repeats counted from the last time (GEN-22): the series of the tasks
  // shown, and a flexible task from an earlier day that waits on today.
  const allSeries = await db.series.where('profile_id').equals(profileId).filter((x) => !x.deleted_at).toArray()
  const flexible = new Set(allSeries.filter((x) => looseOf(x)?.mode === 'flexible').map((x) => x.id))
  if (flexible.size && today >= from && today <= to) {
    const waiting = await db.task.where('[profile_id+planned_date]').between([profileId, ''], [profileId, from], true, false)
      .filter((t) => !!t.series_id && flexible.has(t.series_id) && !t.deleted_at && t.status !== 'done' && t.status !== 'dropped').toArray()
    tasks.push(...waiting)
  }
  const habitIds = habits.map((h) => h.id)
  // A habit due some days after it was last done needs to know when that was.
  const looseHabits = new Set(habits.filter((h) => looseOf(h)).map((h) => h.id))
  const choreIds = chores.map((c) => c.id)
  const suppIds = supplements.map((x) => x.id)
  const [habitLogs, choreLogs, supplementLogs, subscriptions] = await Promise.all([
    habitIds.length ? db.habit_log.where('habit_id').anyOf(habitIds).filter((l) => (l.log_date >= habitWeekStart || looseHabits.has(l.habit_id)) && l.log_date <= to).toArray() : [],
    // Chores need their whole history: when one was last done decides when it is next due.
    choreIds.length ? db.chore_log.where('chore_id').anyOf(choreIds).toArray() : [],
    suppIds.length ? db.supplement_log.where('supplement_id').anyOf(suppIds).filter((l) => l.log_date >= from && l.log_date <= to).toArray() : [],
    db.calendar_subscription.where('profile_id').equals(profileId).toArray(),
  ])
  // A calendar no longer followed takes its events with it.
  const subs = new Map(subscriptions.filter((c) => !c.deleted_at).map((c) => [c.id, c]))
  const [slots, prefs, members] = await Promise.all([supplementSlots(profileId), chorePrefs(profileId), cachedMembers(householdId)])
  const me = profile?.user_id ?? null
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  // Finance's planned payments and the days already paid (engineer H).
  const finance = await financeDaySources(profileId, from, to)
  // Sleep's morning item: today's night, while Sleep is on (5.1 #2).
  let sleep: DayItemSources['sleep'] = null
  if (today >= from && today <= to && enabled.includes('sleep')) {
    const night = (await db.sleep_log.where('[profile_id+log_date]').equals([profileId, today]).toArray()).find((r) => !r.deleted_at) ?? null
    const s = readSleepSettings((await instanceFor(profileId, 'sleep'))?.settings)
    sleep = { day: today, row: night, wake: clockOf(minutesOf(s.bedtime) + Math.round(s.target_hours * 60)) }
  }
  // Plan my day's chores for today (TOD-22), and the day's cut-off (GEN-70).
  const pinnedChores = today >= from && today <= to ? pinnedOn(await loadPlanPrefs(profileId), today) : []
  return dayItems(days, where, {
    ...finance,
    cutoff: dayEdges(profile).cutoff,
    pinnedChores,
    today, enabled, views: settings.module_views,
    tasks, habits, habitLogs, chores, choreLogs, supplements, supplementLogs,
    events: events.filter((e) => !e.subscription_id || subs.has(e.subscription_id)).map((e) => {
      const sub = e.subscription_id ? subs.get(e.subscription_id) : undefined
      return { ...e, calendar_name: sub?.name ?? null, calendar_colour: sub?.colour ?? null }
    }),
    records,
    series: allSeries,
    sleep,
    recordTitle: recordTitle,
    supplementSlots: slots,
    chorePrefs: prefs,
    // A shared household's Today shows each member their own chores (v18).
    choresFor: mineOnly(prefs, members.length) ? me : null,
    memberName: (id) => memberName(members, id, me),
  })
}

/** A dated record's title: its first text value, else the module's key. */
function recordTitle(r: ModuleRecord): string {
  for (const v of Object.values(r.data ?? {})) if (typeof v === 'string' && v.trim() && !/^\d{4}-\d{2}-\d{2}/.test(v)) return v.trim()
  return r.module_key
}

/** The items for a range, kept live: the list redraws as rows change or
 *  arrive from the sync. */
export function useDayItems(from: string, to: string, where: Where, today: string): DayItem[] | null {
  const profile = useApp((s) => s.profile)
  return useLiveQuery(
    async () => (profile ? loadDayItems(profile.id, profile.household_id, from, to, where, today) : null),
    [profile?.id, profile?.household_id, profile?.updated_at, from, to, where, today], null)
}
