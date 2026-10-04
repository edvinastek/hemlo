import { LocalNotifications } from '@capacitor/local-notifications'
import { create } from 'zustand'
import { addDays, format } from 'date-fns'
import { db, getMeta, setMeta } from './db'
import { isNative } from './native'
import { useApp } from './store'
import { enabledModules } from './day'
import { readSettings } from './settings'
import { dayItems, eventMayTouch, type DayItem } from './day-items-rules'
import { reviewSettings } from './review'
import { setTaskDone } from './tasks'
import { toggleHabit } from './tracking'
import { toggleChore } from './chores'
import {
  canTickFromReminder, isQuiet, itemReminderText, itemRoute, notificationId, placeReminder, reminderText, reminderViews,
} from './reminder-text'
import type { ModuleRecord } from './types'

export { isQuiet, reminderText }

/** Reminder settings belong to the device, not the account: you may want them
 *  on your phone and silent on your laptop. `quietDelay`: a reminder that
 *  falls in quiet hours arrives when they end, instead of not at all (REM-04). */
export interface ReminderSettings { on: boolean; quietFrom: string; quietTo: string; quietDelay: boolean }
const DEFAULTS: ReminderSettings = { on: false, quietFrom: '22:00', quietTo: '07:00', quietDelay: false }
const HORIZON_DAYS = 3
const SNOOZE_MIN = 15

/** Stored settings with every key there: older devices stored three. */
export const getReminderSettings = async (): Promise<ReminderSettings> => ({ ...DEFAULTS, ...(await getMeta<Partial<ReminderSettings>>('reminders', DEFAULTS)) })

export async function setReminderSettings(next: ReminderSettings, profileId: string | null, persona: string | null) {
  await setMeta('reminders', next)
  if (profileId) await rescheduleReminders(profileId, persona)
}

/** Ask the phone for permission to show notifications (Android 13 and later
 *  ask the person; earlier versions allow it by default). */
export async function requestPermission(): Promise<boolean> {
  if (isNative()) {
    const now = await LocalNotifications.checkPermissions()
    if (now.display === 'granted') return true
    return (await LocalNotifications.requestPermissions()).display === 'granted'
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  return (await Notification.requestPermission()) === 'granted'
}

let channelReady = false
async function ensureChannel() {
  if (channelReady) return
  // A private channel: on a locked phone Android shows "Contents hidden", so a
  // reminder naming a meal or a weigh-in is not readable by whoever picks it up.
  await LocalNotifications.createChannel({
    id: 'reminders', name: 'Reminders', description: 'Tasks, habits, chores and events at their time',
    importance: 4, visibility: 0,
  })
  // "Done" and "In 15 min" on the notification itself (REM-03).
  await LocalNotifications.registerActionTypes({
    types: [
      { id: 'tick', actions: [{ id: 'done', title: 'Done' }, { id: 'snooze', title: `In ${SNOOZE_MIN} min` }] },
      { id: 'later', actions: [{ id: 'snooze', title: `In ${SNOOZE_MIN} min` }] },
    ],
  })
  channelReady = true
}

/** One reminder to schedule: what it says, when, and what it is about. */
interface Due { key: string; at: Date; title: string; body: string; item: Pick<DayItem, 'kind' | 'ref' | 'day' | 'module_key'>; route: string }

/** Everything timed in the next three days whose module sends reminders
 *  (REM-02): tasks as before, and now habits, chores, the person's own
 *  events and dated records, each following its module's "Send reminders"
 *  switch, by the same day list Today and Plan draw. */
async function upcoming(profileId: string, now: Date, settings: ReminderSettings, persona: string | null): Promise<Due[]> {
  const profile = await db.profile.get(profileId)
  if (!profile) return []
  const from = format(now, 'yyyy-MM-dd')
  const to = format(addDays(now, HORIZON_DAYS - 1), 'yyyy-MM-dd')
  const built = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const enabled = await enabledModules(profileId, built)
  const views = reminderViews(enabled, readSettings(profile).module_views)
  const [tasks, habits, chores, events, records, habitLogs, choreLogs] = await Promise.all([
    db.task.where('[profile_id+planned_date]').between([profileId, from], [profileId, to], true, true).toArray(),
    db.habit.where('profile_id').equals(profileId).toArray(),
    db.chore.where('household_id').equals(profile.household_id).toArray(),
    db.calendar_event.where('profile_id').equals(profileId)
      .filter((e) => !e.deleted_at && !e.subscription_id && eventMayTouch(e, from, to)).toArray(),
    db.module_record.where('record_date').between(from, to, true, true).filter((r) => r.profile_id === profileId).toArray(),
    db.habit_log.where('log_date').between(format(addDays(now, -7), 'yyyy-MM-dd'), to, true, true).toArray(),
    db.chore_log.toArray(),
  ])
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => format(addDays(now, i), 'yyyy-MM-dd'))
  const items = dayItems(days, 'plan', {
    today: from, enabled, views,
    tasks, habits, habitLogs, chores, choreLogs, supplements: [], supplementLogs: [],
    events, records, recordTitle: (r: ModuleRecord) => recordTitle(r),
  })
  const { limit } = await reviewSettings()
  const out: Due[] = []
  for (const item of items) {
    if (!item.time || item.done || item.readonly) continue
    if (item.kind === 'task' && (item.task?.status === 'dropped' || item.task?.status === 'done')) continue
    const at = new Date(`${item.day}T00:00:00`)
    const [h, m] = item.time.split(':').map(Number)
    at.setHours(h, m, 0, 0)
    if (at <= now) continue
    const when = placeReminder(at, settings)
    if (!when) continue
    const text = item.kind === 'task' && item.task ? reminderText(item.task, persona, limit) : itemReminderText(item, persona)
    out.push({ key: item.key, at: when, ...text, item, route: itemRoute(item, from) })
  }
  return out
}

function recordTitle(r: ModuleRecord): string {
  for (const [k, v] of Object.entries(r.data ?? {})) if (!k.startsWith('_') && typeof v === 'string' && v.trim() && !/^\d{4}-\d{2}-\d{2}/.test(v)) return v.trim()
  return r.module_key
}

let webTimers: number[] = []

/** Replace every scheduled reminder with the ones the plan implies now. Runs
 *  at start-up, after a sync, after any task change and when the app returns
 *  to the foreground, so a reminder never outlives the item it was for.
 *
 *  On Android the phone's own scheduler fires them with the app closed, within
 *  a few minutes of the time (no exact-alarm permission is used). In a browser
 *  or on Windows they can only fire while GetIt is open. */
export async function rescheduleReminders(profileId: string, persona: string | null, now = new Date()): Promise<number> {
  const settings = await getReminderSettings()

  if (isNative()) {
    const pending = await LocalNotifications.getPending()
    // A snoozed reminder is the person's own "later": it stays.
    const drop = pending.notifications.filter((n) => !(n.extra as { snoozed?: boolean } | undefined)?.snoozed)
    if (drop.length) await LocalNotifications.cancel({ notifications: drop.map((n) => ({ id: n.id })) })
    if (!settings.on) return 0
    await ensureChannel()
    const due = await upcoming(profileId, now, settings, persona)
    if (due.length === 0) return 0
    await LocalNotifications.schedule({
      notifications: due.map((d) => ({
        id: notificationId(d.key), title: d.title, body: d.body, channelId: 'reminders',
        schedule: { at: d.at, allowWhileIdle: true },
        isExactNotification: false,
        actionTypeId: canTickFromReminder(d.item.kind) ? 'tick' : 'later',
        extra: { profileId, kind: d.item.kind, id: d.item.ref.id, day: d.item.day, route: d.route, title: d.title, body: d.body },
      })),
    })
    return due.length
  }

  webTimers.forEach((t) => window.clearTimeout(t))
  webTimers = []
  if (!settings.on || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0
  const due = (await upcoming(profileId, now, settings, persona)).filter((d) => d.at.getTime() - now.getTime() < 24 * 3600_000)
  for (const d of due) {
    webTimers.push(window.setTimeout(() => {
      const n = new Notification(d.title, { body: d.body, icon: import.meta.env.BASE_URL + 'favicon.svg', tag: d.key })
      // Tapping it opens the item (REM-03).
      n.onclick = () => { window.focus(); openRoute(d.route); n.close() }
    }, d.at.getTime() - now.getTime()))
  }
  return due.length
}

/* ---------- tapping a reminder, and its two buttons (REM-03) -------------------- */

/** Where a tapped reminder asks the app to go; the page bar follows it. */
export const useReminderRoute = create<{ route: string | null }>(() => ({ route: null }))
export const openRoute = (route: string) => useReminderRoute.setState({ route })

type Extra = { profileId?: string; kind?: DayItem['kind']; id?: string; day?: string; route?: string; title?: string; body?: string }

/** Tick the item a reminder was about, if it is not ticked already. */
export async function tickFromReminder(e: Extra): Promise<void> {
  if (!e.id || !e.day) return
  if (e.kind === 'task') {
    const t = await db.task.get(e.id)
    if (t && t.status !== 'done' && !t.deleted_at) await setTaskDone(t, true)
  } else if (e.kind === 'habit') {
    const log = await db.habit_log.where('[habit_id+log_date]').equals([e.id, e.day]).first()
    if (!log?.done) await toggleHabit(e.id, e.day)
  } else if (e.kind === 'chore') {
    const done = await db.chore_log.where('[chore_id+done_on]').equals([e.id, e.day]).filter((l) => !l.deleted_at).first()
    if (!done) {
      const { data } = await import('./supabase').then((m) => m.supabase.auth.getSession())
      await toggleChore(e.id, e.day, data.session?.user.id ?? null)
    }
  }
}

let listening = false
let soon: number | undefined
/** Listen for taps and buttons on reminders, and set reminders again when a
 *  habit, chore, event or record changes (tasks are watched in lifecycle.ts).
 *  Called once at start-up. */
export function listenForReminderActions() {
  if (listening) return
  listening = true
  const again = () => {
    window.clearTimeout(soon)
    soon = window.setTimeout(() => {
      const { profile } = useApp.getState()
      if (profile) void rescheduleReminders(profile.id, profile.ai_persona_name)
    }, 1000)
  }
  for (const t of [db.habit, db.habit_log, db.chore, db.chore_log, db.calendar_event, db.module_record] as const) {
    ;(t as unknown as { hook: (e: string, fn: () => void) => void }).hook('creating', again)
    ;(t as unknown as { hook: (e: string, fn: () => void) => void }).hook('updating', again)
  }
  if (!isNative()) return
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const e = (a.notification.extra ?? {}) as Extra
    if (a.actionId === 'done') { void tickFromReminder(e); return }
    if (a.actionId === 'snooze') {
      const at = new Date(Date.now() + SNOOZE_MIN * 60_000)
      void LocalNotifications.schedule({
        notifications: [{
          id: notificationId(`snooze:${e.id}:${Date.now()}`), title: e.title ?? 'GetIt', body: e.body ?? '', channelId: 'reminders',
          schedule: { at, allowWhileIdle: true }, isExactNotification: false,
          actionTypeId: e.kind && canTickFromReminder(e.kind) ? 'tick' : 'later',
          extra: { ...e, snoozed: true },
        }],
      })
      return
    }
    // A tap on the reminder itself.
    if (e.route) openRoute(e.route)
  })
}
