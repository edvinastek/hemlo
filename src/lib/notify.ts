import { db } from './db'
import { isQuiet, reminderText } from './reminder-text'

export { isQuiet, reminderText }

/** Reminders that sound like a person, not a system. Off until switched on,
 *  silent inside quiet hours, and never sent for a task that is already done.
 *
 *  One interface, three implementations: the browser's Notification API on the
 *  web and on Windows through Tauri's wrapper, and Capacitor's scheduler on
 *  Android, which is the only one that can fire while the app is closed. */

export interface Channel {
  available: boolean
  request(): Promise<boolean>
  send(title: string, body: string): Promise<void>
}

const webChannel: Channel = {
  get available() { return typeof Notification !== 'undefined' },
  async request() {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    return (await Notification.requestPermission()) === 'granted'
  },
  async send(title, body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification(title, { body, icon: '/favicon.svg' })
  },
}

async function capacitorChannel(): Promise<Channel | null> {
  // Only present in the Android build; the web bundle never loads it.
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  try {
    const mod = await import(/* @vite-ignore */ '@capacitor/local-notifications' as string)
    const LocalNotifications = (mod as { LocalNotifications: {
      requestPermissions: () => Promise<{ display: string }>
      schedule: (o: unknown) => Promise<unknown>
    } }).LocalNotifications
    return {
      available: true,
      async request() { return (await LocalNotifications.requestPermissions()).display === 'granted' },
      async send(title, body) {
        await LocalNotifications.schedule({
          notifications: [{ id: Date.now() % 2147483647, title, body }],
        })
      },
    }
  } catch { return null }
}

let channel: Channel = webChannel
void capacitorChannel().then((c) => { if (c) channel = c })

export async function requestPermission(): Promise<boolean> {
  return channel.request()
}

/** Called when the app opens and when the day changes. Anything already past
 *  is not fired retroactively — a reminder for 09:00 is useless at 14:00. */
export async function sendDue(profileId: string, persona: string | null, now = new Date()): Promise<number> {
  const setting = await db.meta.get(`channels:${profileId}`)
  const config = (setting?.value ?? {}) as { push_on?: boolean; quiet_from?: string; quiet_to?: string }
  if (!config.push_on) return 0
  if (isQuiet(now, config.quiet_from ?? '22:00', config.quiet_to ?? '07:00')) return 0

  const day = now.toISOString().slice(0, 10)
  const due = (await db.task.where('[profile_id+planned_date]').equals([profileId, day]).toArray())
    .filter((t) => t.status === 'todo' && t.planned_time)
    .filter((t) => {
      const [h, m] = t.planned_time!.split(':').map(Number)
      const minutes = h * 60 + m
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      return minutes <= nowMinutes && nowMinutes - minutes < 15
    })

  for (const task of due) {
    const { title, body } = reminderText(task, persona)
    await channel.send(title, body)
  }
  return due.length
}
