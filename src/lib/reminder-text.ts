import type { Task } from './types'
import type { DayItem } from './day-items-rules'
import { moduleView, type ModuleView } from './module-view-rules.ts'

export function isQuiet(now: Date, from: string, to: string): boolean {
  const mins = now.getHours() * 60 + now.getMinutes()
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const start = fh * 60 + fm
  const end = th * 60 + tm
  // Quiet hours normally run past midnight, so the window wraps.
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end
}

/** The moment quiet hours end after `at` (which is inside them). */
export function quietEnd(at: Date, to: string): Date {
  const [th, tm] = to.split(':').map(Number)
  const end = new Date(at)
  end.setHours(th, tm, 0, 0)
  if (end <= at) end.setDate(end.getDate() + 1)
  return end
}

/** When a reminder due at `at` arrives (REM-04): at its time; in quiet hours,
 *  when they end if the person chose that, else not at all (null). */
export function placeReminder(at: Date, s: { quietFrom: string; quietTo: string; quietDelay?: boolean }): Date | null {
  if (!isQuiet(at, s.quietFrom, s.quietTo)) return at
  return s.quietDelay ? quietEnd(at, s.quietTo) : null
}

/** Written the way a person would say it: what, when, and an offer you can
 *  decline. Never a status code. `limit` is how many moves make a task
 *  worth asking about (the extension limit, SET-08). */
export function reminderText(task: Pick<Task, 'title' | 'planned_time' | 'push_count'>, persona: string | null, limit = 3): { title: string; body: string } {
  const at = task.planned_time?.slice(0, 5)
  const who = persona ? `${persona}` : 'Hemlo'
  if (task.push_count >= limit) {
    return { title: who, body: `${task.title} has moved ${task.push_count} times. Want a new time for it?` }
  }
  return { title: who, body: at ? `${task.title} at ${at}.` : `${task.title} is next.` }
}

/** The same for anything else on the day (REM-02): a habit, a chore, an
 *  event, a record of a module. */
export function itemReminderText(item: Pick<DayItem, 'kind' | 'title' | 'time' | 'meta'> & { parts?: { name: string; done: boolean }[] }, persona: string | null): { title: string; body: string } {
  const who = persona || 'Hemlo'
  const at = item.time ? ` at ${item.time}` : ''
  switch (item.kind) {
    case 'habit': return { title: who, body: `Time for ${item.title}.` }
    case 'chore': return { title: who, body: `${item.title} is due${at}.` }
    case 'event': return { title: who, body: `${item.title}${at}.` }
    // A slot's supplements still to take, by name (REM-02).
    case 'supplements': {
      const names = (item.parts ?? []).filter((p) => !p.done).map((p) => p.name)
      return { title: who, body: names.length ? `${item.title}: ${names.join(', ')}.` : `${item.title}.` }
    }
    // A planned payment on its day, with its amount (FIN-04).
    case 'payment': {
      const amount = item.meta.split(' · ')[0]
      return { title: who, body: `${item.title} today${amount && /\d/.test(amount) ? ` (${amount})` : ''}.` }
    }
    default: return { title: who, body: `${item.title}${at}.` }
  }
}

/** A planned payment with no time of its own reminds in the morning of its day. */
export const PAYMENT_TIME = '09:00'
/** A refill reminder with no slot time comes then too. */
export const REFILL_TIME = '09:00'

/** "Vitamin D: 7 left, enough for 7 days. Time to get more." (SUP-05) */
export function refillText(name: string, left: number, daysLeft: number, persona: string | null): { title: string; body: string } {
  const lasts = daysLeft <= 1 ? 'enough for today' : `enough for ${daysLeft} days`
  return { title: persona || 'Hemlo', body: `${name}: ${left} left, ${lasts}. Time to get more.` }
}

/** Where a reminder opens (REM-03): the item's own page. */
export function itemRoute(item: Pick<DayItem, 'kind' | 'module_key' | 'ref' | 'day'>, today: string): string {
  switch (item.kind) {
    case 'task': return item.day === today ? '/' : '/plan'
    case 'habit': return '/m/habits'
    case 'chore': return '/m/household'
    case 'event': return `/m/agenda?open=${item.ref.id}`
    case 'record': return `/m/${item.module_key}?open=${item.ref.id}`
    case 'supplements': return '/m/supplements'
    case 'payment': return '/m/finance'
    default: return '/'
  }
}

/** Only items that can be ticked from a notification offer "Done" (a
 *  planned payment offers "Paid"). */
export const canTickFromReminder = (kind: DayItem['kind']) =>
  kind === 'task' || kind === 'habit' || kind === 'chore' || kind === 'supplements' || kind === 'payment'

/** The buttons a reminder carries: Done and later, Paid and later, or later only. */
export const reminderActions = (kind: DayItem['kind']): 'tick' | 'pay' | 'later' =>
  kind === 'payment' ? 'pay' : canTickFromReminder(kind) ? 'tick' : 'later'

/** The module switches, turned so that "shows on Plan" means "sends
 *  reminders" (REM-02): the day list then holds exactly the items whose
 *  module reminds, by the same rules as everywhere else. */
export function reminderViews(enabled: string[], views: Record<string, Partial<ModuleView>>): Record<string, Partial<ModuleView>> {
  const out: Record<string, Partial<ModuleView>> = {}
  for (const k of enabled) out[k] = { plan: moduleView(views, k).reminders }
  return out
}

/** A stable number per item and day, because Android identifies a scheduled
 *  notification by an integer and Hemlo's rows have text ids. */
export function notificationId(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return Math.abs(h) % 2_000_000_000 + 1
}
