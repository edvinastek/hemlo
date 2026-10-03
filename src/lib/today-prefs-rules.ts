/** Today's own choices, kept per profile in the core module's settings
 *  (module_instance.settings.today), so they follow the person to every
 *  device without a new key in profile.settings. Pure: stored values in,
 *  clean values out, and the round + menu's order (GEN-50).
 *
 *  - layout: one timeline by the clock, or grouped into morning, afternoon
 *    and evening (TOD-02).
 *  - add: what the + menu offers first. Ordered by how often each is used,
 *    unless the person arranged it themselves; anything they hide is still
 *    under "More", so nothing is lost. */

export type TodayLayout = 'time' | 'parts'

export interface AddPrefs {
  /** How often each entry was used. */
  uses: Record<string, number>
  /** Entries the person took off the short menu. */
  hidden: string[]
  /** Their own order; empty means "by use". */
  order: string[]
}

export interface TodayPrefs {
  layout: TodayLayout
  add: AddPrefs
}

export const DEFAULT_TODAY_PREFS: TodayPrefs = { layout: 'time', add: { uses: {}, hidden: [], order: [] } }

/** The short menu holds this many; the rest are under "More". */
export const MENU_SIZE = 6

const KEY = /^[a-z0-9_:-]{1,60}$/
const keyList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === 'string' && KEY.test(k)))].slice(0, 100) : []

/** Stored choices, checked: anything odd falls back to the default, so an
 *  old or broken value never breaks Today. */
export function readTodayPrefs(v: unknown): TodayPrefs {
  const r = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  const a = (r.add && typeof r.add === 'object' && !Array.isArray(r.add) ? r.add : {}) as Record<string, unknown>
  const uses: Record<string, number> = {}
  if (a.uses && typeof a.uses === 'object' && !Array.isArray(a.uses)) {
    for (const [k, n] of Object.entries(a.uses as Record<string, unknown>)) {
      const x = Number(n)
      if (KEY.test(k) && Number.isFinite(x) && x > 0) uses[k] = Math.min(10000, Math.round(x))
    }
  }
  return {
    layout: r.layout === 'parts' ? 'parts' : 'time',
    add: { uses, hidden: keyList(a.hidden), order: keyList(a.order) },
  }
}

/** One thing the + can add. */
export interface AddEntry {
  key: string
  label: string
  /** A few words under the label: where it goes. */
  hint: string
}

/** The menu as the person sees it: the short list, then the rest. */
export function arrangeAdd<T extends AddEntry>(entries: T[], prefs: AddPrefs, size = MENU_SIZE): { shown: T[]; more: T[]; hidden: T[] } {
  const hidden = entries.filter((e) => prefs.hidden.includes(e.key))
  const visible = entries.filter((e) => !prefs.hidden.includes(e.key))
  const at = new Map(entries.map((e, i) => [e.key, i]))
  const own = new Map(prefs.order.map((k, i) => [k, i]))
  const sorted = [...visible].sort((a, b) => {
    if (own.size) {
      const x = own.get(a.key) ?? Infinity
      const y = own.get(b.key) ?? Infinity
      if (x !== y) return x - y
    } else {
      const d = (prefs.uses[b.key] ?? 0) - (prefs.uses[a.key] ?? 0)
      if (d) return d
    }
    return (at.get(a.key) ?? 0) - (at.get(b.key) ?? 0)
  })
  return { shown: sorted.slice(0, size), more: sorted.slice(size), hidden }
}

/** One more use. Counts are halved now and then so that what is used lately
 *  rises above what was used a lot long ago. */
export function countUse(prefs: AddPrefs, key: string): AddPrefs {
  if (!KEY.test(key)) return prefs
  let uses = { ...prefs.uses, [key]: (prefs.uses[key] ?? 0) + 1 }
  if (uses[key] > 200) uses = Object.fromEntries(Object.entries(uses).map(([k, n]) => [k, Math.ceil(n / 2)]))
  return { ...prefs, uses }
}

/** Move an entry one place up or down in the person's own order. The first
 *  move takes the order as it is shown now, so nothing jumps. */
export function moveEntry(entries: AddEntry[], prefs: AddPrefs, key: string, dir: -1 | 1): AddPrefs {
  const { shown, more } = arrangeAdd(entries, prefs, Infinity)
  const order = [...shown, ...more].map((e) => e.key)
  const i = order.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return prefs
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...prefs, order }
}

/** Take an entry off the short menu, or put it back. */
export function toggleHidden(prefs: AddPrefs, key: string): AddPrefs {
  const hidden = prefs.hidden.includes(key) ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key]
  return { ...prefs, hidden }
}

/** Back to "most used first". */
export const byUse = (prefs: AddPrefs): AddPrefs => ({ ...prefs, order: [] })

/* ---------- what each module adds -------------------------------------------- */

/** The module's main thing, in the words the + menu uses. Modules not here
 *  add a record of their first kind, named by it ("Study block"). Stats and
 *  the planner itself add nothing of their own. */
export const MODULE_ADD: Record<string, { label: string; hint: string } | null> = {
  nutrition: { label: 'Food', hint: 'Log what you ate' },
  agenda: { label: 'Event', hint: 'In your agenda' },
  habits: { label: 'Habit', hint: 'Opens Habits' },
  supplements: { label: 'Supplement', hint: 'Opens Supplements' },
  health: { label: 'Weigh-in', hint: 'Opens Health' },
  shopping: { label: 'Shopping item', hint: 'Opens the list' },
  stats: null,
  custom: null,
  core: null,
  work: null,
  evening: null,
}
