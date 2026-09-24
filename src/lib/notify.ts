import { LocalNotifications } from '@capacitor/local-notifications'
import { addDays, format } from 'date-fns'
import { db, getMeta, setMeta } from './db'
import { isNative } from './native'
import { isQuiet, reminderText } from './reminder-text'
import type { Task } from './types'

export { isQuiet, reminderText }

/** Reminder settings belong to the device, not the account: you may want them
 *  on your phone and silent on your laptop. */
export interface ReminderSettings { on: boolean; quietFrom: string; quietTo: string }
const DEFAULTS: ReminderSettings = { on: false, quietFrom: '22:00', quietTo: '07:00' }
const HORIZON_DAYS = 3

export const getReminderSettings = () => getMeta<ReminderSettings>('reminders', DEFAULTS)

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

/** A stable number per task, because Android identifies a scheduled
 *  notification by an integer and GetIt's tasks have text ids. */
function notificationId(taskId: string): number {
  let h = 0
  for (let i = 0; i < taskId.length; i++) h = (Math.imul(31, h) + taskId.charCodeAt(i)) | 0
  return Math.abs(h) % 2_000_000_000 + 1
}

let channelReady = false
async function ensureChannel() {
  if (channelReady) return
  // A private channel: on a locked phone Android shows "Contents hidden", so a
  // reminder naming a meal or a weigh-in is not readable by whoever picks it up.
  await LocalNotifications.createChannel({
    id: 'reminders', name: 'Reminders', description: 'Tasks, meals and training at their time',
    importance: 4, visibility: 0,
  })
  channelReady = true
}

async function upcoming(profileId: string, now: Date, settings: ReminderSettings) {
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => format(addDays(now, i), 'yyyy-MM-dd'))
  const tasks: Task[] = []
  for (const day of days) {
    tasks.push(...await db.task.where('[profile_id+planned_date]').equals([profileId, day]).toArray())
  }
  return tasks
    .filter((t) => !t.deleted_at && t.status !== 'done' && t.status !== 'dropped' && t.planned_time)
    .map((t) => {
      const [h, m] = t.planned_time!.split(':').map(Number)
      const at = new Date(`${t.planned_date}T00:00:00`)
      at.setHours(h, m, 0, 0)
      return { task: t, at }
    })
    .filter(({ at }) => at > now && !isQuiet(at, settings.quietFrom, settings.quietTo))
}

let webTimers: number[] = []

/** Replace every scheduled reminder with the ones the plan implies now. Runs
 *  at start-up, after a sync, after any task change and when the app returns
 *  to the foreground, so a reminder never outlives the task it was for.
 *
 *  On Android the phone's own scheduler fires them with the app closed, within
 *  a few minutes of the time (no exact-alarm permission is used). In a browser
 *  or on Windows they can only fire while GetIt is open. */
export async function rescheduleReminders(profileId: string, persona: string | null, now = new Date()): Promise<number> {
  const settings = await getReminderSettings()

  if (isNative()) {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    }
    if (!settings.on) return 0
    await ensureChannel()
    const due = await upcoming(profileId, now, settings)
    if (due.length === 0) return 0
    await LocalNotifications.schedule({
      notifications: due.map(({ task, at }) => {
        const { title, body } = reminderText(task, persona)
        return {
          id: notificationId(task.id), title, body, channelId: 'reminders',
          schedule: { at, allowWhileIdle: true },
          isExactNotification: false,
          extra: { taskId: task.id },
        }
      }),
    })
    return due.length
  }

  webTimers.forEach((t) => window.clearTimeout(t))
  webTimers = []
  if (!settings.on || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0
  const due = (await upcoming(profileId, now, settings)).filter(({ at }) => at.getTime() - now.getTime() < 24 * 3600_000)
  for (const { task, at } of due) {
    const { title, body } = reminderText(task, persona)
    webTimers.push(window.setTimeout(() => {
      new Notification(title, { body, icon: import.meta.env.BASE_URL + 'favicon.svg', tag: task.id })
    }, at.getTime() - now.getTime()))
  }
  return due.length
}
