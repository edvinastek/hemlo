import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { busyAllDay, busyWords } from './calendar-rules'
import { eventDays } from './day-items-rules'
import { builtinRuleOn } from '../modules/rule-switch'

/** Agenda's rule "Nothing across an all-day event" (AGN-07), carried out as
 *  a warning, never a block: planning a task on a day with a whole-day event
 *  marked busy says so in one line ("Holiday in Spain is marked busy") and
 *  the person plans anyway if they like. Switching the rule off in Agenda's
 *  Edit module stops the warning. Busy comes from the calendars the person
 *  follows (calendar-rules.ts says why). */
export async function busyOn(profileId: string, day: string | null | undefined): Promise<string | null> {
  if (!day) return null
  if (!(await builtinRuleOn(profileId, 'agenda', 'no_overlap'))) return null
  const subs = new Set((await db.calendar_subscription.where('profile_id').equals(profileId).toArray())
    .filter((c) => !c.deleted_at).map((c) => c.id))
  const events = await db.calendar_event.where('profile_id').equals(profileId)
    .filter((e) => e.busy === true && e.all_day && !e.deleted_at && !!e.subscription_id && subs.has(e.subscription_id)).toArray()
  return busyWords(busyAllDay(events, day, eventDays))
}

/** The warning for the first of several days that has one, or null. */
export async function busyOnAny(profileId: string, days: (string | null | undefined)[]): Promise<string | null> {
  for (const d of [...new Set(days)]) {
    const w = await busyOn(profileId, d)
    if (w) return w
  }
  return null
}

/** The same, live, for a sheet that shows it while a day is chosen. */
export function useBusyOn(profileId: string | null | undefined, day: string | null | undefined): string | null {
  return useLiveQuery(async () => (profileId && day ? busyOn(profileId, day) : null), [profileId, day], null) ?? null
}

/** An Undo line with the warning added, for moves that happen at once (a
 *  drag, "Plan for…"): "“Gym” planned for Mon 12 Oct. Holiday in Spain is
 *  marked busy". The move stands; Undo takes it back. */
export async function withBusy(label: string, profileId: string, days: (string | null | undefined)[]): Promise<string> {
  const w = await busyOnAny(profileId, days)
  return w ? `${label}. ${w}` : label
}
