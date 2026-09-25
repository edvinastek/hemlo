import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { liveQuery, type Subscription } from 'dexie'
import { db, onResetLocal } from './db'
import { setTaskDone } from './tasks'
import { moduleEnabled, toggleHabit } from './tracking'
import { addDays, pickLog } from './tracking-rules'
import { localDay } from './review-rules'
import { buildSnapshot, latestTicks, type WidgetSnapshot, type WidgetTick } from './widget-rules'

/** The Android home-screen widget (android/…/widget). The app keeps it
 *  current by writing a snapshot of today and tomorrow whenever the tasks or
 *  habits behind it change; ticks made on the widget queue up on the phone
 *  and are applied here, through the same code as a tick in the app. */

interface GetItWidget {
  update(options: { snapshot: string }): Promise<void>
  takeTicks(): Promise<{ ticks: WidgetTick[] }>
  clear(): Promise<void>
  addListener(event: 'tick', listener: () => void): Promise<PluginListenerHandle>
}

const Widget = registerPlugin<GetItWidget>('GetItWidget')
const available = () => Capacitor.getPlatform() === 'android'

async function snapshotFor(profileId: string): Promise<WidgetSnapshot> {
  const today = localDay(new Date())
  const tomorrow = addDays(today, 1)
  const tasks = await db.task
    .where('[profile_id+planned_date]')
    .between([profileId, today], [profileId, tomorrow], true, true)
    .toArray()
  const habitsOn = await moduleEnabled(profileId, 'habits')
  const habits = habitsOn ? await db.habit.where('profile_id').equals(profileId).toArray() : null
  // A weekly habit looks back to the Monday of its week, never further.
  const since = addDays(today, -7)
  const ids = (habits ?? []).map((h) => h.id)
  const logs = ids.length
    ? (await db.habit_log.where('habit_id').anyOf(ids).toArray()).filter((l) => l.log_date >= since)
    : []
  return buildSnapshot([today, tomorrow], tasks, habits, logs, new Date())
}

let watching: Subscription | undefined
let lastSent = ''
let timer: number | undefined
/** Rises whenever what is being watched changes, so a snapshot worked out
 *  for the previous profile, or just before sign-out, is never sent late. */
let generation = 0

/** Follow the open profile: every change to its tasks, habits or ticks
 *  rewrites the snapshot, a moment after the changes stop. */
export function watchWidget(profileId: string | null) {
  watching?.unsubscribe()
  watching = undefined
  window.clearTimeout(timer)
  lastSent = ''
  const gen = ++generation
  if (!available() || !profileId) return
  watching = liveQuery(() => snapshotFor(profileId)).subscribe({
    next: (snap) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void send(snap, gen), 400)
    },
    error: () => undefined,
  })
}

async function send(snap: WidgetSnapshot, gen: number) {
  if (gen !== generation) return
  // The stamp changes every time; only a change in what is shown is sent.
  const shown = JSON.stringify(snap.days)
  if (shown === lastSent) return
  lastSent = shown
  try {
    await Widget.update({ snapshot: JSON.stringify(snap) })
  } catch {
    lastSent = ''
  }
}

/** Apply what was ticked on the widget since the app last looked. Each tick
 *  says what the row should be, not "flip it", so applying one twice, or
 *  after the same change came from another device, changes nothing. */
export async function applyWidgetTicks(): Promise<number> {
  if (!available()) return 0
  let ticks: WidgetTick[] = []
  try {
    ticks = (await Widget.takeTicks()).ticks ?? []
  } catch {
    return 0
  }
  let applied = 0
  for (const t of latestTicks(ticks)) {
    if (t.kind === 'task') {
      const task = await db.task.get(t.id)
      if (!task || task.deleted_at || (task.status === 'done') === t.done) continue
      await setTaskDone(task, t.done)
      applied++
    } else {
      const habit = await db.habit.get(t.id)
      if (!habit || habit.deleted_at) continue
      const log = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([t.id, t.day]).toArray())
      if ((log?.done ?? false) === t.done) continue
      await toggleHabit(t.id, t.day)
      applied++
    }
  }
  return applied
}

/** Ticks made while the app is open are applied at once. */
export function listenForWidgetTicks() {
  if (!available()) return
  void Widget.addListener('tick', () => { void applyWidgetTicks() })
}

// Signing out, or another account signing in, forgets the widget's copy and
// any ticks still waiting, together with the rest of the device's data.
onResetLocal(async () => {
  watchWidget(null)
  if (!available()) return
  // An update already on its way to the phone lands first, then this clears it.
  await Widget.clear()
})
