/** Tips shown once, when they are useful (ONB-13), the "Make GetIt yours"
 *  card a few days in (ONB-12), and the one-time note on what moved in this
 *  version (NAV-26). Pure: what is shown, and when. The screens keep what
 *  was seen on the device (tips.ts). */

export interface TipDef {
  id: string
  /** One or two plain sentences. */
  text: string
}

/** Every tip, by id. Screens show one with <Tip id="…" />; each appears
 *  once on a device until "Show tips again" in Settings. */
export const TIPS: TipDef[] = [
  { id: 'hub-hold', text: 'Hold a module, or tap its ⋮, to pin it to the bar or to Today, hide it, or change where it shows.' },
  { id: 'records-search', text: 'Type any word from a record to find it: a name, a note, a tag, in any order.' },
  { id: 'record-repeat', text: 'A record can come round again: set Repeat, and each time it is due it is an item on Today and Plan.' },
  { id: 'first-hold', text: 'A short hold and a move drags an item. Hold still a little longer to open it in place.' },
  { id: 'first-checklist', text: 'Tap a line’s box to tick it. Ticks stay in the note, so the list is there next time.' },
  { id: 'save-as-meal', text: 'Logged this by hand three times? Save it as a meal and it is one tap next time.' },
  { id: 'make-yours', text: 'Make GetIt yours: a theme, dark or black, the text size and the app’s icon are in Settings, Looks.' },
]

export const tipById = (id: string) => TIPS.find((t) => t.id === id)

export interface TipState {
  /** Tips dismissed on this device. */
  seen: string[]
  /** The day GetIt was first opened on this device, yyyy-MM-dd. */
  first: string | null
  /** The version whose "what moved" note was read. */
  moved: string | null
}

export const NO_TIPS: TipState = { seen: [], first: null, moved: null }

export function readTipState(v: unknown): TipState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const ids = new Set(TIPS.map((t) => t.id))
  return {
    seen: Array.isArray(o.seen) ? [...new Set(o.seen.filter((x): x is string => typeof x === 'string' && ids.has(x)))] : [],
    first: typeof o.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.first) ? o.first : null,
    moved: typeof o.moved === 'string' && o.moved.length <= 10 ? o.moved : null,
  }
}

/** Days from one yyyy-MM-dd to another. */
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

/** "Make GetIt yours" waits a few days (ONB-12): first the planner, then the
 *  looks, as the research found people only bother once they use an app. */
export const MAKE_YOURS_AFTER_DAYS = 3

/** Whether a tip shows now. */
export function tipShows(id: string, s: TipState, today: string): boolean {
  if (!tipById(id) || s.seen.includes(id)) return false
  if (id === 'make-yours') return !!s.first && days(s.first, today) >= MAKE_YOURS_AFTER_DAYS
  return true
}

export function dismissTip(s: TipState, id: string): TipState {
  return s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] }
}

/** The day first seen, once. */
export function noteFirstDay(s: TipState, today: string): TipState {
  return s.first ? s : { ...s, first: today }
}

/** Every tip again (Settings → Tips). The first day stays. */
export const resetTips = (s: TipState): TipState => ({ ...s, seen: [] })

/* ---------- what moved where (NAV-26) ---------------------------------------- */

export const MOVED_VERSION = '16'
/** People who started with this version have nothing that moved. */
export const MOVED_SINCE = '2026-10-04'

export const WHAT_MOVED: { was: string; now: string }[] = [
  { was: 'Other days on Today (the week strip)', now: 'Plan → Day: the same list and actions, for any day. Today shows today, with a look at tomorrow.' },
  { was: 'Tasks without a day', now: 'Plan → Inbox, until you give them one.' },
  { was: 'Holding a task to move it', now: 'A short hold and a move drags it; holding still longer opens it in place. Every action is also in its ⋮ menu.' },
  { was: 'Four fixed meals', now: 'Food is logged at a time, or under meals you name yourself in Settings → Food.' },
  { was: 'Habits, chores and supplements in tabs', now: 'Items in Today’s list on the days they are due; each module decides where it shows under Edit module → Show.' },
  { was: 'A crowded page bar', now: 'The Modules page holds every module, with search; the Hub bar style keeps the bar to five.' },
]

/** Whether the note shows: once per version, and only to someone who used
 *  an earlier one (their profile is older than this version). */
export function movedShows(s: TipState, profileSince: string | null | undefined): boolean {
  if (s.moved === MOVED_VERSION) return false
  return !!profileSince && profileSince.slice(0, 10) < MOVED_SINCE
}

export const readMoved = (s: TipState): TipState => ({ ...s, moved: MOVED_VERSION })
