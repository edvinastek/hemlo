import type { Profile } from './types'

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

/** How the page bar at the bottom is laid out. */
export type NavStyle = 'row' | 'two_rows' | 'three_rows' | 'drawer' | 'fan'
export const NAV_STYLES: NavStyle[] = ['row', 'two_rows', 'three_rows', 'drawer', 'fan']

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
  nav: { style: 'row', order: [], hidden: [], swipe: true },
  colours: { on: true, modules: {} },
  holidays: { countries: [], colours: {} },
  stats: { show_disabled: false },
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
  }
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
 *  objects merge one level deep, so changing the work start keeps the end. */
export type SettingsChange = Partial<Omit<ProfileSettings, 'work' | 'commute' | 'nav' | 'colours' | 'holidays' | 'stats'>> & {
  holidays?: Partial<HolidaySettings>
  stats?: Partial<StatsSettings>
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
  return readSettings({ settings: next })
}

/** The time a meal has on a day: its own, else the default, else none. */
export function mealTime(slot: { slot: string; slot_time?: string | null }, settings: ProfileSettings): string | null {
  if (slot.slot_time) return slot.slot_time.slice(0, 5)
  return settings.meal_times[slot.slot as MealSlotKey] ?? null
}
