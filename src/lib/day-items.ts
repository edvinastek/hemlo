import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { enabledModules } from './day'
import { readSettings } from './settings'
import { dayItems, eventMayTouch, type DayItem, type Where } from './day-items-rules'
import { addDays } from './schedule-rules'
import { useApp } from './store'
import type { ModuleRecord } from './types'
// Habits, chores and supplements (engineer B): slots, chore preferences and
// members' names for the day's items.
import { supplementSlots } from './tracking'
import { cachedMembers, chorePrefs } from './household'
import { memberName } from './chore-rules'
import { financeDaySources } from './finance'

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
  const habitIds = habits.map((h) => h.id)
  const choreIds = chores.map((c) => c.id)
  const suppIds = supplements.map((x) => x.id)
  const [habitLogs, choreLogs, supplementLogs, subscriptions] = await Promise.all([
    habitIds.length ? db.habit_log.where('habit_id').anyOf(habitIds).filter((l) => l.log_date >= habitWeekStart && l.log_date <= to).toArray() : [],
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
  return dayItems(days, where, {
    ...finance,
    today, enabled, views: settings.module_views,
    tasks, habits, habitLogs, chores, choreLogs, supplements, supplementLogs,
    events: events.filter((e) => !e.subscription_id || subs.has(e.subscription_id)).map((e) => {
      const sub = e.subscription_id ? subs.get(e.subscription_id) : undefined
      return { ...e, calendar_name: sub?.name ?? null, calendar_colour: sub?.colour ?? null }
    }),
    records,
    recordTitle: recordTitle,
    supplementSlots: slots,
    chorePrefs: prefs,
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
