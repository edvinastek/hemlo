import type { HolidaySettings } from './settings.ts'
import { COUNTRIES, type Country } from './countries.ts'
import { SWATCHES, hashColour, isHex } from './colours-rules.ts'

/** Public holidays, as rules with no database, no React and no holiday
 *  library, so every choice can be checked in plain Node
 *  (src/test/holidays.check.mjs). The holiday dates themselves come from the
 *  date-holidays package, loaded only when a country is chosen (holidays.ts).
 *
 *  A holiday is marked in its country's colour, and the name always goes
 *  with it ("King's Day (NL)"), so the colour is never the only signal. */

/** At most this many countries at once: more and a day's marks stop fitting. */
export const MAX_COUNTRIES = 6

/** The years the app plans in: three back and five ahead of this year. */
export const YEARS_BACK = 3
export const YEARS_AHEAD = 5

/** The countries date-holidays knows the public holidays of, as of version
 *  3.37. Kept here rather than read from the package, so the picker can list
 *  them without loading it. The check compares this list with the package,
 *  so an update that adds or drops a country is noticed. Only countries on
 *  the app's own list (countries.ts) are offered. */
export const HOLIDAY_CODES = (
  'AD AE AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BW BY BZ CA CC CD ' +
  'CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FO FR GA GB GD ' +
  'GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IR IS IT JE JM JP KE KM KN KR KY ' +
  'KZ LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MQ MR MS MT MU MW MX MY MZ NA NC NE NF NG NI NL NO NZ ' +
  'PA PE PF PH PK PL PM PR PT PY RE RO RS RU RW SA SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD ' +
  'TG TH TN TO TR TT TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF YT ZA ZM ZW'
).split(' ')

const supported = new Set(HOLIDAY_CODES)

/** Whether holidays can be shown for this country code. */
export function hasHolidays(code: string | null | undefined): boolean {
  return !!code && supported.has(code.toUpperCase())
}

/** The countries a person can pick, by name. */
export const HOLIDAY_COUNTRIES: Country[] = COUNTRIES.filter((c) => supported.has(c.code))

/* ---------- colours ------------------------------------------------------- */

/** Each chosen country's colour: the person's choice, else a stable pick
 *  from the swatches. The pick starts at the country's hashed place and
 *  steps past colours other chosen countries already have (their chosen
 *  colours first, then the picks before it, in the order they were added),
 *  so two countries only share a colour when all sixteen are taken. */
export function countryColours(h: HolidaySettings): Map<string, string> {
  const taken = new Set<string>()
  for (const c of h.countries) {
    const own = h.colours[c]
    if (isHex(own)) taken.add(own.toLowerCase())
  }
  const out = new Map<string, string>()
  for (const c of h.countries) {
    const own = h.colours[c]
    if (isHex(own)) { out.set(c, own.toLowerCase()); continue }
    const pick = freeSwatch(c, taken)
    taken.add(pick)
    out.set(c, pick)
  }
  return out
}

function freeSwatch(code: string, taken: Set<string>): string {
  // 'holiday:' so a country does not land where a module of the same
  // letters would.
  const start = SWATCHES.findIndex((s) => s.hex === hashColour(`holiday:${code}`))
  for (let i = 0; i < SWATCHES.length; i++) {
    const hex = SWATCHES[(start + i) % SWATCHES.length].hex
    if (!taken.has(hex)) return hex
  }
  return SWATCHES[start].hex
}

/** The settings with a country added at the end. Its colour is picked now
 *  and kept, so it stays the same when other countries come and go. Nothing
 *  changes if it is already there, unknown, or six are chosen. */
export function withCountry(h: HolidaySettings, code: string): HolidaySettings {
  const c = code.toUpperCase()
  if (!hasHolidays(c) || h.countries.includes(c) || h.countries.length >= MAX_COUNTRIES) return h
  const countries = [...h.countries, c]
  const colour = countryColours({ countries, colours: h.colours }).get(c)!
  return { countries, colours: { ...h.colours, [c]: colour } }
}

/** The settings without a country, and without its colour. */
export function withoutCountry(h: HolidaySettings, code: string): HolidaySettings {
  const colours = { ...h.colours }
  delete colours[code]
  return { countries: h.countries.filter((c) => c !== code), colours }
}

/** The settings with one country's colour changed, or back to an automatic
 *  pick (hex null). */
export function withCountryColour(h: HolidaySettings, code: string, hex: string | null): HolidaySettings {
  const colours = { ...h.colours }
  if (hex && isHex(hex)) colours[code] = hex.toLowerCase()
  else delete colours[code]
  return { ...h, colours }
}

/* ---------- days ---------------------------------------------------------- */

/** One public holiday on one day, for one country. */
export interface DayHoliday { date: string; name: string }

/** What a day shows: one entry per country. */
export interface HolidayMark { country: string; name: string; colour: string }

/** What date-holidays hands back, as far as these rules use it. */
export interface LibraryHoliday { date: string; name: string; type: string; start: Date; end: Date }

/** The public holidays in date-holidays' list, one entry per day. Bank
 *  holidays, school days, optional days and observances are left out. A
 *  holiday that lasts several days (Eid, Korean New Year) marks each of
 *  them; the length is rounded to whole days, as some start the evening
 *  before. */
export function publicHolidays(list: LibraryHoliday[]): DayHoliday[] {
  const out: DayHoliday[] = []
  for (const h of list) {
    if (h.type !== 'public') continue
    const first = h.date.slice(0, 10)
    const span = Number(h.end) - Number(h.start)
    const days = Number.isFinite(span) ? Math.max(1, Math.round(span / 864e5)) : 1
    for (let i = 0; i < days; i++) out.push({ date: addDays(first, i), name: h.name })
  }
  return out
}

/** 'yyyy-MM-dd' plus some days, by the calendar (no clock, no time zone). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** A date as the 'yyyy-MM-dd' key the marks are stored under, in local time. */
export function dayKey(day: Date | string): string {
  if (typeof day === 'string') return day.slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`
}

/** The years a span of days touches, within the app's range around today. */
export function yearsInView(from: string, to: string, today: Date): number[] {
  const now = today.getFullYear()
  const lo = Math.max(Number(from.slice(0, 4)), now - YEARS_BACK)
  const hi = Math.min(Number(to.slice(0, 4)), now + YEARS_AHEAD)
  const out: number[] = []
  for (let y = lo; y <= hi; y++) out.push(y)
  return out
}

/** Every day from `from` to `to` (both included) that is a holiday in a
 *  chosen country, with one mark per country in the order they were chosen.
 *  Two holidays of one country on one day share a mark ("Easter Sunday /
 *  Liberation Day"). */
export function mergeHolidays(
  countries: string[],
  perCountry: Map<string, DayHoliday[]>,
  colours: Map<string, string>,
  from: string,
  to: string,
): Map<string, HolidayMark[]> {
  const out = new Map<string, HolidayMark[]>()
  for (const country of countries) {
    const names = new Map<string, string[]>()
    for (const h of perCountry.get(country) ?? []) {
      if (h.date < from || h.date > to) continue
      const list = names.get(h.date) ?? []
      if (!list.includes(h.name)) list.push(h.name)
      names.set(h.date, list)
    }
    const colour = colours.get(country) ?? SWATCHES[0].hex
    for (const [date, list] of names) {
      const marks = out.get(date) ?? []
      marks.push({ country, name: list.join(' / '), colour })
      out.set(date, marks)
    }
  }
  return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

/** "King's Day (NL)". */
export function holidayLabel(mark: Pick<HolidayMark, 'country' | 'name'>): string {
  return `${mark.name} (${mark.country})`
}

/** A day's marks with the same name put together, for Today's chips: with
 *  six countries on Christmas Day, one chip "Christmas Day (NL, DE, …)" in
 *  six colours rather than six chips. First appearance keeps the order. */
export function byName(marks: HolidayMark[]): { name: string; label: string; marks: HolidayMark[] }[] {
  const groups = new Map<string, HolidayMark[]>()
  for (const m of marks) groups.set(m.name, [...(groups.get(m.name) ?? []), m])
  return [...groups.entries()].map(([name, list]) => ({
    name, marks: list, label: `${name} (${list.map((m) => m.country).join(', ')})`,
  }))
}

/** All of a day's holidays in one line, for a title or a screen reader:
 *  "Christmas Day (NL), Christmas Day (DE)". Empty when there are none. */
export function holidaysText(marks: Pick<HolidayMark, 'country' | 'name'>[]): string {
  return marks.map(holidayLabel).join(', ')
}

/** The countries with a holiday somewhere in these days, once each, in the
 *  order they were chosen: for the legend under Week and Month. */
export function countriesIn(marks: HolidayMark[][], countries: string[]): { country: string; colour: string }[] {
  const seen = new Map<string, string>()
  for (const day of marks) for (const m of day) if (!seen.has(m.country)) seen.set(m.country, m.colour)
  return countries.filter((c) => seen.has(c)).map((c) => ({ country: c, colour: seen.get(c)! }))
}
