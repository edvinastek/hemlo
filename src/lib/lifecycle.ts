import { App as NativeApp } from '@capacitor/app'
import { db } from './db'
import { isNative } from './native'
import { rescheduleReminders } from './notify'
import { sync } from './sync'
import { useApp } from './store'

let timer: number | undefined

/** Recompute reminders a moment after tasks stop changing. A sync can write
 *  dozens of rows in a burst; this schedules once at the end, not per row. */
export function remindersSoon() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    const { profile } = useApp.getState()
    if (profile) void rescheduleReminders(profile.id, profile.ai_persona_name)
  }, 800)
}

/** Keep the phone current: any change to a task — made here, pulled from
 *  another device, or ticked from a notification — reschedules reminders, and
 *  coming back to the app syncs first. */
export function watchLifecycle() {
  db.task.hook('creating', () => { remindersSoon() })
  db.task.hook('updating', () => { remindersSoon() })
  db.task.hook('deleting', () => { remindersSoon() })

  if (isNative()) {
    void NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      const ids = useApp.getState().profiles.map((p) => p.id)
      void sync(ids).then(remindersSoon)
    })
  }
}
