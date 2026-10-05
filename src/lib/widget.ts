import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { liveQuery, type Subscription } from 'dexie'
import { db, onResetLocal } from './db'
import { setTaskDone } from './tasks'
import { toggleHabit, toggleSupplement } from './tracking'
import { toggleChore } from './chores'
import { addDays, pickLog } from './tracking-rules'
import { loadDayItems } from './day-items'
import { statsWidgetViews } from './stats-widget'
import { trimStatsSnapshot, type StatsWidgetSnapshot } from './stats-widget-rules'
import { latestTicks, slotIds, snapshotFromItems, widgetPath, type WidgetSnapshot, type WidgetTick } from './widget-rules'
import type { QuickAddItem } from './widget-quickadd-rules'
import { useApp } from './store'
import { planToday } from './day-edge'
import { features } from './native'

/** The Android home-screen widgets (android/…/widget): "GetIt · Today" and
 *  the stats widgets. The app keeps them current by writing snapshots
 *  whenever the data behind them changes (WID-12); the widgets draw from
 *  those without starting the app. Ticks made on the Today widget queue up
 *  on the phone and are applied here, through the same code as a tick in
 *  the app. */

interface VisumaWidget {
  update(options: { snapshot: string }): Promise<void>
  takeTicks(): Promise<{ ticks: WidgetTick[] }>
  clear(): Promise<void>
  /** The app's theme for every widget (WidgetLooks as JSON). */
  setLooks(options: { looks: string }): Promise<void>
  /** Every saved stats view, worked out (StatsWidgetSnapshot as JSON). */
  updateStats(options: { snapshot: string }): Promise<void>
  /** The + menu's first entries (QuickAddItem[] as JSON), for the quick-add
   *  widget and the launcher shortcuts (NAV-24, WID-11). */
  setQuickAdd(options: { items: string }): Promise<void>
  addListener(event: 'tick', listener: () => void): Promise<PluginListenerHandle>
}

const Widget = registerPlugin<VisumaWidget>('VisumaWidget')
const available = () => features().widgets

/** Today and tomorrow, from the same day items Today draws, for the modules
 *  set to "Show on the widget" (WID-02). Tomorrow is there so the widget
 *  turns over at midnight without the app. */
async function snapshotFor(profileId: string): Promise<WidgetSnapshot> {
  const today = planToday()
  const tomorrow = addDays(today, 1)
  const profile = await db.profile.get(profileId)
  const items = profile ? await loadDayItems(profileId, profile.household_id, today, tomorrow, 'widget', today) : []
  return snapshotFromItems([today, tomorrow], items, new Date())
}

let watching: Subscription | undefined
let watchingStats: Subscription | undefined
let lastSent = ''
let lastStats = ''
let timer: number | undefined
let statsTimer: number | undefined
/** Rises whenever what is being watched changes, so a snapshot worked out
 *  for the previous profile, or just before sign-out, is never sent late. */
let generation = 0

/** Follow the open profile: every change to what the widgets show rewrites
 *  their snapshots, a moment after the changes stop. */
export function watchWidget(profileId: string | null) {
  watching?.unsubscribe()
  watchingStats?.unsubscribe()
  watching = undefined
  watchingStats = undefined
  window.clearTimeout(timer)
  window.clearTimeout(statsTimer)
  lastSent = ''
  lastStats = ''
  const gen = ++generation
  if (!available() || !profileId) return
  watching = liveQuery(() => snapshotFor(profileId)).subscribe({
    next: (snap) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void send(snap, gen), 400)
    },
    error: () => undefined,
  })
  // Stats take longer to work out and change in bursts during a sync, so
  // they wait a little longer for the changes to settle.
  watchingStats = liveQuery(() => statsWidgetViews(profileId)).subscribe({
    next: (views) => {
      window.clearTimeout(statsTimer)
      statsTimer = window.setTimeout(() => void sendStats({ v: 1, written_at: new Date().toISOString(), views }, gen), 700)
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

async function sendStats(snap: StatsWidgetSnapshot, gen: number) {
  if (gen !== generation) return
  const trimmed = trimStatsSnapshot(snap)
  const shown = JSON.stringify(trimmed.views)
  if (shown === lastStats) return
  lastStats = shown
  try {
    await Widget.updateStats({ snapshot: JSON.stringify(trimmed) })
  } catch {
    lastStats = ''
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
    } else if (t.kind === 'habit') {
      const habit = await db.habit.get(t.id)
      if (!habit || habit.deleted_at) continue
      const log = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([t.id, t.day]).toArray())
      if ((log?.done ?? false) === t.done) continue
      await toggleHabit(t.id, t.day)
      applied++
    } else if (t.kind === 'chore') {
      const chore = await db.chore.get(t.id)
      if (!chore || chore.deleted_at) continue
      const logs = await db.chore_log.where('[chore_id+done_on]').equals([t.id, t.day]).toArray()
      const log = pickLog(logs)
      if ((!!log && !log.deleted_at) === t.done) continue
      await toggleChore(t.id, t.day, useApp.getState().session?.user.id ?? null)
      applied++
    } else if (t.kind === 'supplements') {
      // A slot ticks each of its supplements to the same state.
      for (const id of slotIds(t.id)) {
        const supplement = await db.supplement.get(id)
        if (!supplement || supplement.deleted_at) continue
        const log = pickLog(await db.supplement_log.where('[supplement_id+log_date]').equals([id, t.day]).toArray())
        if ((log?.done ?? false) === t.done) continue
        await toggleSupplement(id, t.day)
        applied++
      }
    }
  }
  return applied
}

/** Ticks made while the app is open are applied at once, and a tap on a
 *  stats widget, a launcher shortcut or (on the iPhone) a home-screen quick
 *  action opens what it names. */
export function listenForWidgetTicks() {
  if (available()) void Widget.addListener('tick', () => { void applyWidgetTicks() })
  if (!features().openLinks) return
  void NativeApp.addListener('appUrlOpen', ({ url }) => openWidgetLink(url))
  void NativeApp.getLaunchUrl().then((r) => { if (r?.url) openWidgetLink(r.url) }).catch(() => undefined)
}

function openWidgetLink(url: string) {
  const path = widgetPath(url)
  if (!path) return
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  window.history.pushState({}, '', base + path)
  // The router follows the address on popstate, as on Back.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

let lastQuick = ''
let quickTimer: number | undefined

/** The + menu's first entries, for the quick-add widget and the launcher
 *  shortcuts. Sent a moment after they settle (the menu's modules and the
 *  person's order load one after the other), and only when they changed. */
export function sendQuickAdd(items: QuickAddItem[]) {
  if (!features().quickAddSync || items.length === 0) return
  const json = JSON.stringify(items)
  window.clearTimeout(quickTimer)
  quickTimer = window.setTimeout(() => {
    if (json === lastQuick) return
    lastQuick = json
    Widget.setQuickAdd({ items: json }).catch(() => { lastQuick = '' })
  }, 800)
}

/** The theme's colours for the widgets (LOOK-09): they redraw at once. */
export async function sendWidgetLooks(json: string) {
  if (!available()) return
  try { await Widget.setLooks({ looks: json }) } catch { /* an older app build without it */ }
}

// Signing out, or another account signing in, forgets the widgets' copies
// and any ticks still waiting, together with the rest of the device's data.
onResetLocal(async () => {
  watchWidget(null)
  window.clearTimeout(quickTimer)
  lastQuick = ''
  if (!available()) return
  // An update already on its way to the phone lands first, then this clears it.
  await Widget.clear()
})
