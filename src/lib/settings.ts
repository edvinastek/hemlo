import type { Profile } from './types'
import { readBooks, type Book } from './books-rules.ts'
import { readModuleViews, type ModuleView } from './module-view-rules.ts'
import { readNoteTemplates, readTaskTemplates, type NoteTemplate, type TaskTemplate } from './template-rules.ts'
import { readStatsViews, type StatsView } from './stats-view-rules.ts'

/** The choices that shape the app for one person, kept in profile.settings.
 *  Every key is optional in storage and has a default here, so an old or
 *  empty settings value is always valid. Pure: no database, no React. */

export type Nutrient = 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'
export type MealSlotKey = 'breakfast' | 'lunch' | 'snack' | 'dinner'

export const NUTRIENTS: { key: Nutrient; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fiber_g', label: 'Fibre', unit: 'g' },
]

export interface WorkHours {
  on: boolean
  start: string
  end: string
  /** Locked hours keep other tasks out; off by default, a planner's choice. */
  locked: boolean
  /** Weekdays it applies to, 0 (Sunday) to 6. */
  days: number[]
}

export interface Commute {
  on: boolean
  /** Minutes before work starts and after it ends. */
  before_min: number
  after_min: number
  /** One-way distance, if they want it logged. */
  km: number | null
}

/** How the page bar at the bottom is laid out. 'hub' (NAV-20): Today, Plan,
 *  the pinned pages, Stats and the Modules page, which holds the rest. */
export type NavStyle = 'row' | 'two_rows' | 'three_rows' | 'drawer' | 'fan' | 'hub'
export const NAV_STYLES: NavStyle[] = ['row', 'two_rows', 'three_rows', 'drawer', 'fan', 'hub']

export interface NavSettings {
  style: NavStyle
  /** Page keys in the order the bar shows them: 'today', 'plan', 'more',
   *  'food', 'shop', or 'm:<module key>'. Pages not listed follow, in the
   *  app's own order. */
  order: string[]
  /** Pages kept off the bar even though their module is on. */
  hidden: string[]
  /** Swipe sideways on a page to go to the next or previous one. */
  swipe: boolean
  /** Pages pinned to the bar from the Modules page (NAV-21), at most two,
   *  newest last: in the hub style they are the bar's own pages. */
  pinned: string[]
}

export interface ColourSettings {
  /** Mark tasks and calendar days with their module's colour. */
  on: boolean
  /** Module key to a #rrggbb colour; a module not listed uses its default. */
  modules: Record<string, string>
}

/** Public holidays shown on the calendar, per country. */
export interface HolidaySettings {
  /** ISO 3166 two-letter codes, upper case, at most 6. */
  countries: string[]
  /** Country code to a #rrggbb colour; a country not listed gets one picked. */
  colours: Record<string, string>
}

export interface StatsSettings {
  /** Include modules that are switched off. */
  show_disabled: boolean
}

/** Calendar links (More → Profile → Calendar links). */
export interface CalendarSettings {
  /** Put task notes in the feed link Google Calendar reads. Off by default:
   *  a link passed on by mistake would show them to whoever has it. */
  feed_notes: boolean
}

/** How long a finger rests on a task before it drags, and before it opens
 *  in place instead (TOD-10). In milliseconds. */
export interface HoldSettings { drag_ms: number; expand_ms: number }

/** A meal the person names (MEAL-02): none exist until they make some. */
export interface MealName { key: string; name: string; time: string | null }
export interface MealSettings {
  /** Their own meal names, in order. Empty: food is logged by time alone. */
  names: MealName[]
  /** Show a card per named meal on Food's Day tab. */
  cards: boolean
  /** Which meal the size-to-target suggestion fits (MEAL-04); none: off. */
  main: string | null
}

export interface ShoppingTrip {
  /** Put "Shopping (N items)" on the plan when the list has items (SHOP-20). */
  on: boolean
  /** Shopping days, 0 (Sunday) to 6. Empty: the next day. */
  days: number[]
  time: string
  minutes: number
  locked: boolean
}
export interface Shop { name: string; aisles: string[] }
export interface ShoppingSettings {
  trip: ShoppingTrip
  /** How many days of planned meals the list covers when no shopping days are set. */
  window_days: number
  /** The shops they use, each with its aisle order (SHOP-32). */
  shops: Shop[]
}

export type ThemeMode = 'system' | 'light' | 'dark' | 'black'
export interface LookSettings {
  /** A theme key from looks-rules.ts, or 'custom' (built from `seed`). */
  theme: string
  mode: ThemeMode
  seed: string | null
  icon: string
  text_size: 'small' | 'default' | 'large' | 'larger'
}

/** A card pinned to Today (TOD-20): a module's summary or a saved stats view. */
export interface TodayCard {
  kind: 'module' | 'stats'
  key: string
  size: 'small' | 'large'
  show: 'always' | 'weekdays' | 'weekends'
}

export interface ProfileSettings {
  /** Set when first-run setup is finished; targets are no longer the sign. */
  onboarded: boolean
  /** The starting layout they picked, for reference and "reset to template". */
  template: string | null
  work: WorkHours
  commute: Commute
  /** Nutrients tracked on the Food pages. */
  nutrients: Nutrient[]
  /** The one figure Today's header shows, or none. */
  today_metric: Nutrient | 'none'
  /** Default meal times. Empty means meals have no time unless given one. */
  meal_times: Partial<Record<MealSlotKey, string>>
  /** Take ingredients out of stock when a planned meal is marked eaten. */
  stock_auto: boolean
  nav: NavSettings
  colours: ColourSettings
  holidays: HolidaySettings
  stats: StatsSettings
  calendar: CalendarSettings
  /** Recipe and food books: named lists on the Recipes and Foods tabs, at
   *  most 50. Checked strictly in books-rules.ts. */
  books: Book[]
  /** Where each module shows itself (GEN-03); missing switches take the default. */
  module_views: Record<string, Partial<ModuleView>>
  hold: HoldSettings
  note_templates: NoteTemplate[]
  task_templates: TaskTemplate[]
  meals: MealSettings
  shopping: ShoppingSettings
  looks: LookSettings
  today_cards: TodayCard[]
  stats_views: StatsView[]
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  onboarded: false,
  template: null,
  work: { on: false, start: '09:00', end: '17:00', locked: false, days: [1, 2, 3, 4, 5] },
  commute: { on: false, before_min: 30, after_min: 30, km: null },
  nutrients: ['kcal'],
  today_metric: 'kcal',
  meal_times: {},
  stock_auto: false,
  nav: { style: 'row', order: [], hidden: [], swipe: true, pinned: [] },
  colours: { on: true, modules: {} },
  holidays: { countries: [], colours: {} },
  stats: { show_disabled: false },
  calendar: { feed_notes: false },
  books: [],
  module_views: {},
  hold: { drag_ms: 350, expand_ms: 800 },
  note_templates: readNoteTemplates(undefined),
  task_templates: [],
  meals: { names: [], cards: false, main: null },
  shopping: { trip: { on: false, days: [], time: '10:00', minutes: 45, locked: false }, window_days: 4, shops: [] },
  looks: { theme: 'notebook', mode: 'system', seed: null, icon: 'classic', text_size: 'default' },
  today_cards: [],
  stats_views: [],
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME.test(v.slice(0, 5)) ? v.slice(0, 5) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const minutes = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 600 ? Math.round(n) : fallback
}

/** A profile's settings with every key filled in and every value checked:
 *  what another device or an old version wrote can never break a screen. */
export function readSettings(profile: Pick<Profile, 'settings'> | null | undefined): ProfileSettings {
  const s = (profile?.settings ?? {}) as Partial<ProfileSettings>
  const d = DEFAULT_SETTINGS
  const w = (s.work ?? {}) as Partial<WorkHours>
  const c = (s.commute ?? {}) as Partial<Commute>
  const nutrientKeys = NUTRIENTS.map((n) => n.key)
  const nutrients = Array.isArray(s.nutrients)
    ? nutrientKeys.filter((k) => (s.nutrients as unknown[]).includes(k))
    : d.nutrients
  const metric = s.today_metric === 'none' || nutrientKeys.includes(s.today_metric as Nutrient)
    ? (s.today_metric as Nutrient | 'none') : d.today_metric
  const mealTimes: Partial<Record<MealSlotKey, string>> = {}
  for (const k of ['breakfast', 'lunch', 'snack', 'dinner'] as MealSlotKey[]) {
    const v = s.meal_times?.[k]
    if (typeof v === 'string' && TIME.test(v.slice(0, 5))) mealTimes[k] = v.slice(0, 5)
  }
  const kmRaw = Number(c.km)
  return {
    onboarded: bool(s.onboarded, d.onboarded),
    template: typeof s.template === 'string' ? s.template : null,
    work: {
      on: bool(w.on, d.work.on),
      start: time(w.start, d.work.start),
      end: time(w.end, d.work.end),
      locked: bool(w.locked, d.work.locked),
      days: Array.isArray(w.days) ? w.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : d.work.days,
    },
    commute: {
      on: bool(c.on, d.commute.on),
      before_min: minutes(c.before_min, d.commute.before_min),
      after_min: minutes(c.after_min, d.commute.after_min),
      km: c.km == null || !Number.isFinite(kmRaw) || kmRaw < 0 || kmRaw > 2000 ? null : Math.round(kmRaw * 10) / 10,
    },
    nutrients,
    today_metric: metric,
    meal_times: mealTimes,
    stock_auto: bool(s.stock_auto, d.stock_auto),
    nav: readNav(s.nav, d.nav),
    colours: readColours(s.colours, d.colours),
    holidays: readHolidays(s.holidays),
    stats: { show_disabled: bool((s.stats as Partial<StatsSettings> | undefined)?.show_disabled, d.stats.show_disabled) },
    calendar: { feed_notes: bool((s.calendar as Partial<CalendarSettings> | undefined)?.feed_notes, d.calendar.feed_notes) },
    books: readBooks(s.books),
    module_views: readModuleViews(s.module_views),
    hold: readHold(s.hold),
    note_templates: readNoteTemplates(s.note_templates),
    task_templates: readTaskTemplates(s.task_templates),
    meals: readMeals(s.meals, mealTimes),
    shopping: readShopping(s.shopping),
    looks: readLooks(s.looks),
    today_cards: readTodayCards(s.today_cards),
    stats_views: readStatsViews(s.stats_views),
  }
}

function readHold(v: unknown): HoldSettings {
  const h = (v ?? {}) as Partial<HoldSettings>
  const ms = (x: unknown, lo: number, hi: number, d: number) => {
    const n = Number(x)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
  }
  const drag_ms = ms(h.drag_ms, 150, 1500, 350)
  // Expanding always takes longer than starting a drag, or the drag could never begin.
  const expand_ms = Math.max(drag_ms + 200, ms(h.expand_ms, 300, 3000, 800))
  return { drag_ms, expand_ms }
}

const MEAL_KEY = /^[a-z0-9_-]{1,24}$/
const LEGACY_MEALS: { key: MealSlotKey; name: string }[] = [
  { key: 'breakfast', name: 'Breakfast' }, { key: 'lunch', name: 'Lunch' }, { key: 'snack', name: 'Snack' }, { key: 'dinner', name: 'Dinner' },
]
function readMeals(v: unknown, legacyTimes: Partial<Record<MealSlotKey, string>>): MealSettings {
  const m = v as Partial<MealSettings> | undefined
  if (!m || typeof m !== 'object' || !Array.isArray(m.names)) {
    // Before named meals existed, default meal times named the four old
    // meals; whoever set them keeps them, as cards, so nothing disappears.
    const kept = LEGACY_MEALS.filter((x) => legacyTimes[x.key])
    return kept.length
      ? { names: kept.map((x) => ({ key: x.key, name: x.name, time: legacyTimes[x.key] ?? null })), cards: true, main: kept.some((x) => x.key === 'dinner') ? 'dinner' : null }
      : { names: [], cards: false, main: null }
  }
  const seen = new Set<string>()
  const names: MealName[] = []
  for (const x of m.names) {
    if (!x || typeof x !== 'object') continue
    const r = x as unknown as Record<string, unknown>
    const key = typeof r.key === 'string' && MEAL_KEY.test(r.key) ? r.key : null
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 30) : null
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    names.push({ key, name, time: time(r.time, '') || null })
    if (names.length >= 12) break
  }
  return {
    names,
    cards: bool(m.cards, names.length > 0),
    main: typeof m.main === 'string' && seen.has(m.main) ? m.main : null,
  }
}

function readShopping(v: unknown): ShoppingSettings {
  const s = (v ?? {}) as Partial<ShoppingSettings>
  const t = (s.trip ?? {}) as Partial<ShoppingTrip>
  const d = DEFAULT_SETTINGS.shopping
  const days = Array.isArray(t.days) ? [...new Set(t.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : []
  const mins = Number(t.minutes)
  const win = Number(s.window_days)
  const shops: Shop[] = []
  if (Array.isArray(s.shops)) {
    const seen = new Set<string>()
    for (const x of s.shops) {
      const name = typeof x?.name === 'string' ? x.name.trim().slice(0, 60) : ''
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      const aisles = Array.isArray(x.aisles)
        ? [...new Set(x.aisles.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim().slice(0, 40)))].slice(0, 40)
        : []
      shops.push({ name, aisles })
      if (shops.length >= 20) break
    }
  }
  return {
    trip: {
      on: bool(t.on, d.trip.on), days,
      time: time(t.time, d.trip.time),
      minutes: Number.isFinite(mins) && mins >= 5 && mins <= 600 ? Math.round(mins) : d.trip.minutes,
      locked: bool(t.locked, d.trip.locked),
    },
    window_days: Number.isFinite(win) && win >= 1 && win <= 28 ? Math.round(win) : d.window_days,
    shops,
  }
}

const MODES: ThemeMode[] = ['system', 'light', 'dark', 'black']
const TEXT_SIZES: LookSettings['text_size'][] = ['small', 'default', 'large', 'larger']
function readLooks(v: unknown): LookSettings {
  const l = (v ?? {}) as Partial<LookSettings>
  const d = DEFAULT_SETTINGS.looks
  const word = (x: unknown, fb: string) => (typeof x === 'string' && /^[a-z0-9_-]{1,24}$/.test(x) ? x : fb)
  return {
    theme: word(l.theme, d.theme),
    mode: MODES.includes(l.mode as ThemeMode) ? (l.mode as ThemeMode) : d.mode,
    seed: typeof l.seed === 'string' && HEX.test(l.seed) ? l.seed.toLowerCase() : null,
    icon: word(l.icon, d.icon),
    text_size: TEXT_SIZES.includes(l.text_size as LookSettings['text_size']) ? (l.text_size as LookSettings['text_size']) : d.text_size,
  }
}

function readTodayCards(v: unknown): TodayCard[] {
  if (!Array.isArray(v)) return []
  const out: TodayCard[] = []
  const seen = new Set<string>()
  for (const x of v) {
    const r = (x ?? {}) as Record<string, unknown>
    const kind = r.kind === 'module' || r.kind === 'stats' ? r.kind : null
    const key = typeof r.key === 'string' && /^[a-z0-9_:-]{1,60}$/i.test(r.key) ? r.key : null
    if (!kind || !key || seen.has(kind + key)) continue
    seen.add(kind + key)
    out.push({
      kind, key,
      size: r.size === 'large' ? 'large' : 'small',
      show: r.show === 'weekdays' || r.show === 'weekends' ? r.show : 'always',
    })
    if (out.length >= 6) break
  }
  return out
}

const PAGE_KEY = /^(today|plan|more|food|shop|m:[a-z0-9_]{1,40})$/
const pageKeys = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && PAGE_KEY.test(x)))] : []

function readNav(v: unknown, d: NavSettings): NavSettings {
  const n = (v ?? {}) as Partial<NavSettings>
  return {
    style: NAV_STYLES.includes(n.style as NavStyle) ? (n.style as NavStyle) : d.style,
    order: pageKeys(n.order),
    // Today, Plan and More can never be hidden: without them there is no way back.
    hidden: pageKeys(n.hidden).filter((k) => k !== 'today' && k !== 'plan' && k !== 'more'),
    swipe: bool(n.swipe, d.swipe),
    pinned: pageKeys(n.pinned).filter((k) => k !== 'today' && k !== 'plan' && k !== 'more').slice(-2),
  }
}

const HEX = /^#[0-9a-f]{6}$/i
function readColours(v: unknown, d: ColourSettings): ColourSettings {
  const c = (v ?? {}) as Partial<ColourSettings>
  const modules: Record<string, string> = {}
  if (c.modules && typeof c.modules === 'object') {
    for (const [k, x] of Object.entries(c.modules)) {
      if (/^[a-z0-9_]{1,40}$/.test(k) && typeof x === 'string' && HEX.test(x)) modules[k] = x.toLowerCase()
    }
  }
  return { on: bool(c.on, d.on), modules }
}

const COUNTRY = /^[A-Z]{2}$/
function readHolidays(v: unknown): HolidaySettings {
  const h = (v ?? {}) as Partial<HolidaySettings>
  const countries = Array.isArray(h.countries)
    ? [...new Set(h.countries.filter((x): x is string => typeof x === 'string').map((x) => x.toUpperCase()).filter((x) => COUNTRY.test(x)))].slice(0, 6)
    : []
  const colours: Record<string, string> = {}
  if (h.colours && typeof h.colours === 'object') {
    for (const [k, x] of Object.entries(h.colours)) {
      if (countries.includes(k) && typeof x === 'string' && HEX.test(x)) colours[k] = x.toLowerCase()
    }
  }
  return { countries, colours }
}

/** Settings with a change laid over them, as the value to store. Nested
 *  objects merge one level deep, so changing the work start keeps the end.
 *  Lists (nutrients, books) are replaced whole: `books` is the full new list. */
export type SettingsChange = Partial<Omit<ProfileSettings, 'work' | 'commute' | 'nav' | 'colours' | 'holidays' | 'stats' | 'calendar' | 'hold' | 'meals' | 'shopping' | 'looks'>> & {
  hold?: Partial<HoldSettings>
  meals?: Partial<MealSettings>
  shopping?: Partial<Omit<ShoppingSettings, 'trip'>> & { trip?: Partial<ShoppingTrip> }
  looks?: Partial<LookSettings>
  holidays?: Partial<HolidaySettings>
  stats?: Partial<StatsSettings>
  calendar?: Partial<CalendarSettings>
  work?: Partial<WorkHours>
  commute?: Partial<Commute>
  nav?: Partial<NavSettings>
  colours?: Partial<ColourSettings>
}

export function mergeSettings(current: ProfileSettings, change: SettingsChange): ProfileSettings {
  const next = { ...current, ...change } as ProfileSettings
  if (change.work) next.work = { ...current.work, ...change.work }
  if (change.commute) next.commute = { ...current.commute, ...change.commute }
  if (change.meal_times) next.meal_times = { ...change.meal_times }
  if (change.nav) next.nav = { ...current.nav, ...change.nav }
  if (change.colours) next.colours = { ...current.colours, ...change.colours }
  if (change.holidays) next.holidays = { ...current.holidays, ...change.holidays }
  if (change.stats) next.stats = { ...current.stats, ...change.stats }
  if (change.calendar) next.calendar = { ...current.calendar, ...change.calendar }
  if (change.hold) next.hold = { ...current.hold, ...change.hold }
  if (change.meals) next.meals = { ...current.meals, ...change.meals }
  if (change.shopping) {
    next.shopping = { ...current.shopping, ...change.shopping, trip: { ...current.shopping.trip, ...(change.shopping.trip ?? {}) } }
  }
  if (change.looks) next.looks = { ...current.looks, ...change.looks }
  // module_views merges per module, so switching one switch keeps the others.
  if (change.module_views) {
    const merged = { ...current.module_views }
    for (const [k, v] of Object.entries(change.module_views)) merged[k] = { ...(merged[k] ?? {}), ...v }
    next.module_views = merged
  }
  return readSettings({ settings: next })
}

/** The time a meal has on a day: its own, else the default, else none. */
export function mealTime(slot: { slot: string; slot_time?: string | null }, settings: ProfileSettings): string | null {
  if (slot.slot_time) return slot.slot_time.slice(0, 5)
  return settings.meals.names.find((m) => m.key === slot.slot)?.time
    ?? settings.meal_times[slot.slot as MealSlotKey] ?? null
}
