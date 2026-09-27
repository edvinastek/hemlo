import { useEffect, useMemo, useState } from 'react'
import { useApp } from './store'
import { readSettings } from './settings'
import {
  countryColours, dayKey, mergeHolidays, publicHolidays, yearsInView,
  type DayHoliday, type HolidayMark, type LibraryHoliday,
} from './holidays-rules'

export type { HolidayMark } from './holidays-rules'
export { holidayLabel, holidaysText, countriesIn } from './holidays-rules'

/** Public holidays for the calendar, worked out on the phone: no network,
 *  so they show offline too. The holiday library is big, so it is loaded
 *  only once a country is chosen, and never for anyone who has none. */

type Library = typeof import('date-holidays').default
type Calendar = InstanceType<Library>

let library: Promise<Library | null> | null = null
function loadLibrary(): Promise<Library | null> {
  // A failed load (an old app version whose files are gone) leaves the
  // calendar without holidays rather than breaking it, and is tried again
  // next time.
  library ??= import('date-holidays').then((m) => m.default).catch(() => { library = null; return null })
  return library
}

/** One library calendar per country, and each year's holidays once worked
 *  out, kept for as long as the app is open. Keys are 'NL' and 'NL-2026'. */
const calendars = new Map<string, Calendar>()
const cache = new Map<string, DayHoliday[]>()

async function fill(keys: string[]): Promise<void> {
  const Holidays = await loadLibrary()
  if (!Holidays) return
  for (const key of keys) {
    if (cache.has(key)) continue
    const [country, year] = key.split('-')
    let cal = calendars.get(country)
    if (!cal) {
      cal = new Holidays(country, { languages: ['en'], types: ['public'] })
      calendars.set(country, cal)
    }
    let list: DayHoliday[] = []
    try {
      list = publicHolidays(cal.getHolidays(Number(year), 'en') as unknown as LibraryHoliday[])
    } catch {
      // A country the library cannot work out for a year: no marks, no error.
    }
    cache.set(key, list)
  }
}

const EMPTY: Map<string, HolidayMark[]> = new Map()

/** The public holidays from `from` to `to` ('yyyy-MM-dd', both included)
 *  in the countries the person chose (More → Profile → Public holidays), by
 *  day. Each day has one mark per country, in the order they were chosen.
 *  With no country chosen it is always the same empty map and loads nothing.
 *  Holidays arrive a moment after the first render, when the library loads. */
export function useHolidays(from: string, to: string): Map<string, HolidayMark[]> {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile).holidays
  const countries = settings.countries
  const settingsKey = JSON.stringify(settings)
  const years = yearsInView(from, to, new Date())
  const missing = countries.flatMap((c) => years.map((y) => `${c}-${y}`)).filter((k) => !cache.has(k))
  const missingKey = missing.join(',')
  const [loaded, setLoaded] = useState(0)

  useEffect(() => {
    if (!missingKey) return
    let live = true
    fill(missingKey.split(',')).then(() => { if (live) setLoaded((n) => n + 1) })
    return () => { live = false }
  }, [missingKey])

  return useMemo(() => {
    if (countries.length === 0) return EMPTY
    const perCountry = new Map(countries.map((c) => [c, years.flatMap((y) => cache.get(`${c}-${y}`) ?? [])]))
    return mergeHolidays(countries, perCountry, countryColours(settings), from, to)
    // settingsKey stands for countries and colours; loaded is bumped when
    // the cache has filled in.
  }, [settingsKey, from, to, loaded, missingKey])
}

/** A day's holiday marks from what useHolidays returned: none is []. */
export function holidayMarks(holidays: Map<string, HolidayMark[]>, day: Date | string): HolidayMark[] {
  return holidays.get(dayKey(day)) ?? NONE
}

const NONE: HolidayMark[] = []
