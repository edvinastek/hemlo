/** Tips shown once, when they are useful (ONB-13), the "Make GetIt yours"
 *  line a few days in (ONB-12), and the one-time note on what moved in this
 *  version (NAV-26). Since v17 (CALM-14) a tip is one slim line with ×, at
 *  most one shows in a session app-wide, and once shown it never comes
 *  back until "Show tips again". Pure: what is shown, and when. The screens
 *  keep what was seen on the device (tips.ts). */

export interface TipDef {
  id: string
  /** One short sentence: it has to fit a slim line. */
  text: string
}

/** Every tip, by id. Screens show one with <Tip id="…" />; each appears
 *  once on a device until "Show tips again" in Settings. */
export const TIPS: TipDef[] = [
  { id: 'hub-hold', text: 'Hold a module, or tap its ⋮, to pin it, hide it or change where it shows.' },
  { id: 'records-search', text: 'Type any word from a record to find it, in any order.' },
  { id: 'record-repeat', text: 'Set Repeat, and a record comes round on Today and Plan when it is due.' },
  { id: 'first-hold', text: 'Hold and move to drag an item; hold still longer to open it in place.' },
  { id: 'first-checklist', text: 'Tap a line’s box to tick it; the ticks stay in the note.' },
  { id: 'save-as-meal', text: 'Logged this three times? Save it as a meal: one tap next time.' },
  { id: 'make-yours', text: 'Make GetIt yours: a theme, dark mode, text size and icon.' },
]

/** Longest a tip may be, so it stays one or two short lines at 360 px. */
export const TIP_MAX = 80

export const tipById = (id: string) => TIPS.find((t) => t.id === id)

/** The first time a version of GetIt ran on this device, and for each
 *  profile it met then, whether that profile was already set up. */
export interface VersionRun {
  /** ISO time of the first run of this version here. */
  at: string
  /** Profile id → set up already when this version first met it. */
  met: Record<string, boolean>
}

export interface TipState {
  /** Tips shown (or dismissed) on this device. */
  seen: string[]
  /** The day GetIt was first opened on this device, yyyy-MM-dd. */
  first: string | null
  /** The version whose "what moved" note was read. */
  moved: string | null
  /** Version ("17") → its first run here (v17). Kept for the last three. */
  runs: Record<string, VersionRun>
}

export const NO_TIPS: TipState = { seen: [], first: null, moved: null, runs: {} }

const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/
const MAX_RUNS = 3
const MAX_MET = 20

export function readTipState(v: unknown): TipState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const ids = new Set(TIPS.map((t) => t.id))
  const runs: Record<string, VersionRun> = {}
  if (o.runs && typeof o.runs === 'object' && !Array.isArray(o.runs)) {
    for (const [k, r] of Object.entries(o.runs as Record<string, unknown>).slice(-MAX_RUNS)) {
      const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      if (!/^\d{1,4}$/.test(k) || typeof x.at !== 'string' || !ISO.test(x.at)) continue
      const met: Record<string, boolean> = {}
      if (x.met && typeof x.met === 'object' && !Array.isArray(x.met)) {
        for (const [id, b] of Object.entries(x.met as Record<string, unknown>).slice(0, MAX_MET)) {
          if (/^[0-9a-f-]{36}$/i.test(id) && typeof b === 'boolean') met[id] = b
        }
      }
      runs[k] = { at: x.at, met }
    }
  }
  return {
    seen: Array.isArray(o.seen) ? [...new Set(o.seen.filter((x): x is string => typeof x === 'string' && ids.has(x)))] : [],
    first: typeof o.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.first) ? o.first : null,
    moved: typeof o.moved === 'string' && o.moved.length <= 10 ? o.moved : null,
    runs,
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

/* ---------- the versions run here ------------------------------------------ */

/** "0.17.0" → "17", "1.2.0" → "1": the number people know a version by. */
export function versionKey(v: string): string {
  const [major, minor] = v.split('.')
  return major === '0' ? String(Number(minor) || 0) : String(Number(major) || 0)
}

/** The first run of a version on this device, noted once. */
export function noteRun(s: TipState, version: string, nowIso: string): TipState {
  if (s.runs[version]) return s
  const keep = Object.entries(s.runs).slice(-(MAX_RUNS - 1))
  return { ...s, runs: { ...Object.fromEntries(keep), [version]: { at: nowIso, met: {} } } }
}

/** A profile met by this version for the first time: was it set up already?
 *  Noted once per profile; a new account is met during its first-run setup,
 *  so it is noted as not set up and stays that way. */
export function meetProfile(s: TipState, version: string, id: string, setUp: boolean): TipState {
  const run = s.runs[version]
  if (!run || id in run.met || Object.keys(run.met).length >= MAX_MET) return s
  return { ...s, runs: { ...s.runs, [version]: { ...run, met: { ...run.met, [id]: setUp } } } }
}

/* ---------- what moved where (NAV-26, CALM-18) ---------------------------------- */

/** The version whose moves WHAT_MOVED lists. */
export const MOVED_VERSION = '17'
/** Accounts made on or after this day started with this version: nothing
 *  moved for them, whichever device they open it on. Set to the release day. */
export const MOVED_SINCE = '2026-10-04'

/** Every function version 17 moved, and where it is now (CALM-18). */
export const WHAT_MOVED: { was: string; now: string }[] = [
  { was: 'A page bar that scrolled', now: 'Five places at most, never scrolling. With more than five pages: Today, Plan, up to two pins and Modules, which holds the rest. A style you chose stays.' },
  { was: 'More', now: 'Called Settings everywhere. With the hub bar it is at the top of the Modules page.' },
  { was: 'Tabs in Settings (Modules, Profile, Looks, Reminders, Data)', now: 'One list of pages: Profile, Looks, Page bar, Modules, Planning, Food and body, Shopping and household, Calendars, Reminders and tips, Data and account, About. The search still finds every setting.' },
  { was: 'Work hours, hold times, Today’s cards, note templates', now: 'Settings → Planning, with the evening review (it was under Reminders).' },
  { was: 'Body and goal, food and meals', now: 'Settings → Food and body.' },
  { was: 'Calendar links and public holidays', now: 'Settings → Calendars.' },
  { was: 'Shopping trip and the household', now: 'Settings → Shopping and household.' },
  { was: 'Starting layout (templates)', now: 'Settings → Modules.' },
  { was: 'Privacy policy, and the data credits on lists', now: 'Settings → About, with the version and every data source.' },
  { was: 'A module’s description on its Modules page tile', now: 'In the tile’s ⋮ (or hold the tile).' },
  { was: 'Tips as cards with Got it', now: 'One slim line with ×, at most one at a time. Settings → Reminders and tips → Show tips again.' },
  { was: 'Export on a note page', now: 'The page’s ⋮ → Export.' },
  { was: 'How many tasks wait in the Inbox', now: 'A small count on Plan in the page bar.' },
  { was: 'Push 15 / 30 / 60 on every task', now: 'Open the task (hold it) or its ⋮ → Push…. Today’s ⋮ → Show push buttons on rows brings them back.' },
  { was: 'Copy to…, Duplicate, Open note as page, Delete on an open task', now: 'More… in the open task, and its ⋮.' },
  { was: 'Today’s Inbox and Other days buttons', now: 'The Inbox count is on Plan in the page bar and in Today’s ⋮; other days are Plan.' },
  { was: 'Timeline / Parts of day, and Export on Today and Plan', now: 'The page’s ⋮ at the top right.' },
  { was: 'Carry-over: Pick a day, Inbox, Done, Drop and the All of them buttons', now: 'Each task’s ⋮ and the card’s ⋮; Today and Tomorrow stay as buttons.' },
  { was: 'Plan: the ‹ Today › bar, 7 days, Select, copying and templates', now: 'The week strip and date picker move between days; the rest is in Plan’s ⋮.' },
  { was: 'Plan’s colour legends and hints', now: 'One Key ▾ under each view.' },
  { was: 'The + on Plan’s Year and Inbox', now: 'Year: Plan’s ⋮ → Add a task. Inbox: the line at the top adds.' },
  { was: 'Task sheet: Until, Section, Project, Goal, Fixed, Locked, Start from a saved task', now: 'More options in the sheet (open by itself when something is set). Copy to…, Duplicate and Save as template are in the sheet’s ⋮.' },
  { was: 'The note editor’s buttons', now: 'They show while you write; Insert ▾ holds templates and recipes.' },
  { was: 'Food: + Add food, Copy day to… and a meal’s eaten tick', now: 'The round + adds food; Copy day to… and Export are in the page’s ⋮; tick a meal’s items or use its ⋮ → Mark all eaten.' },
  { was: 'Recipes: Your recipes list, New, Import, Export, Sort, New book, Select', now: 'One list (the Mine chip shows your own); New recipe is the round +; the rest is in the page’s ⋮, or hold a recipe to select.' },
  { was: 'Foods: Find in stores, Scan, Figures, New food, New book, Select', now: 'Scan is the icon in the search field, New food the round +, the rest the page’s ⋮; a search that finds nothing offers the shops.' },
  { was: 'The add-food sheet’s first step and its tabs', now: 'It opens on the food with its guess (Change for meal and time); Recent and Search; Just the numbers is a link; Copy from another day is in its ⋮.' },
  { was: 'Buttons under a recipe or a food', now: 'The ⋮ by its name; Plan as a meal / Add to a meal stay at the foot.' },
  { was: 'Edit module, Export, the summary and extra view tabs on module pages', now: 'The ⋮ at the top right of each module page: Views…, Export…, Edit module, About this module.' },
  { was: 'Add a habit, chore or supplement rows', now: 'The round + on each page.' },
  { was: 'Chores: By room, Starter packs, Holiday and light days, Names; Supplements: Time slots', now: 'The page’s ⋮.' },
  { was: 'Stats: New view, Ready-made, Show switched-off modules, the second figure', now: 'The Stats page’s ⋮; a card’s second figure shows when you tap it.' },
  { was: 'Training: Log a session without a routine; Edit goal, Mark reached, Edit project', now: 'The page’s ⋮, or the ⋮ beside the name.' },
  { was: 'Health: the weigh-in day arrows; Learning and reading', now: 'Another day above the weigh-in; the module is now called Learning.' },
  { was: 'Shop: subtitles, the round +, Scan, From recipes, New list, Export', now: 'The field at the top adds; Scan is the icon in it; the rest is in the page’s ⋮.' },
  { was: 'Shop: the figures under the list', now: 'One line, “5 to get · €12.40 + 2 unpriced”; tap it for the rest.' },
  { was: 'Stock: Scan, filter, grouping, take from stock when eating', now: 'Scan is in the field; the filter shows from 16 items; grouping and the switch are in the page’s ⋮.' },
  { was: 'Stores: thirteen shop buttons', now: 'Four, and More shops; each shop has Offers ↗.' },
]

/** Whether the note shows: once, for the version whose moves it lists, and
 *  only on a profile that was already set up when this version first ran
 *  here and first met it (someone who used an earlier version). A brand-new
 *  account never sees it: it is met during its first-run setup, its
 *  profile is newer than the first run, and it is newer than MOVED_SINCE. */
export function movedShows(s: TipState, profile: { id: string; created_at?: string | null } | null | undefined): boolean {
  if (!profile || s.moved === MOVED_VERSION) return false
  const run = s.runs[MOVED_VERSION]
  if (!run || run.met[profile.id] !== true) return false
  const made = profile.created_at
  if (made && (Date.parse(made) >= Date.parse(run.at) || made.slice(0, 10) >= MOVED_SINCE)) return false
  return true
}

export const readMoved = (s: TipState): TipState => ({ ...s, moved: MOVED_VERSION })
