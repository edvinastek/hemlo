// Checks public holidays: the list of countries matches the library, only
// public holidays come through, known dates land on the right day, colours
// are picked without clashing, and a day with several countries reads right.
import Holidays from 'date-holidays'
import {
  HOLIDAY_CODES, HOLIDAY_COUNTRIES, MAX_COUNTRIES, hasHolidays, countryColours, withCountry, withoutCountry,
  withCountryColour, publicHolidays, addDays, dayKey, yearsInView, mergeHolidays, holidayLabel, holidaysText, countriesIn, byName,
} from '../lib/holidays-rules.ts'
import { SWATCHES, PAPER, contrast, hashColour } from '../lib/colours-rules.ts'
import { readSettings, mergeSettings } from '../lib/settings.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// The library, as the app uses it (holidays.ts).
const year = (code, y) =>
  publicHolidays(new Holidays(code, { languages: ['en'], types: ['public'] }).getHolidays(y, 'en'))
const has = (list, date, name) => list.some((h) => h.date === date && (!name || h.name === name))

// The country list kept in the rules is the library's own.
const lib = Object.keys(new Holidays().getCountries('en')).sort()
is('the kept list of countries matches date-holidays', HOLIDAY_CODES.filter((c) => !lib.includes(c)), [])
// The Canary Islands and Kosovo are not on the app's country list (countries.ts).
is('and the only ones left out are those not on the app\'s list', lib.filter((c) => !HOLIDAY_CODES.includes(c)), ['IC', 'XK'])
is('the picker offers only countries with holidays', HOLIDAY_COUNTRIES.every((c) => hasHolidays(c.code)), true)
is('the Netherlands, Germany and Lithuania are there', ['NL', 'DE', 'LT'].every(hasHolidays), true)
is('Antarctica is not', hasHolidays('AQ'), false)
is('lower case is fine', hasHolidays('nl'), true)
is('nothing is no country', hasHolidays(null), false)

// Known days.
const nl = year('NL', 2026)
const de = year('DE', 2026)
is('NL 2026: King\'s Day (Koningsdag) on 27 April', has(nl, '2026-04-27', "King's Day"), true)
const nlDutch = new Holidays('NL').getHolidays(2026, 'nl').filter((h) => h.type === 'public')
is('and in Dutch it is Koningsdag', nlDutch.some((h) => h.date.startsWith('2026-04-27') && h.name === 'Koningsdag'), true)
is('NL 2026: Christmas Day', has(nl, '2026-12-25'), true)
is('DE 2026: German Unity Day on 3 October', has(de, '2026-10-03'), true)
is('DE 2026: Good Friday on 3 April', has(de, '2026-04-03'), true)
is('King\'s Day moves off a Sunday: 26 April 2025 (27th is a Sunday)', has(year('NL', 2025), '2025-04-26'), true)
is('dates are plain days', nl.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date)), true)

// Only public holidays: observances, school and optional days stay out.
const lt = new Holidays('LT').getHolidays(2026, 'en')
is('Lithuania has an observance (Mother\'s Day) in the raw list', lt.some((h) => h.type === 'observance'), true)
is('which does not come through', publicHolidays(lt).some((h) => h.name === "Mother's Day"), false)
is('Liberation Day (NL, every 5 years a day off) is not public', has(nl, '2026-05-05'), false)

// A holiday lasting several days marks each one.
const kr = year('KR', 2026)
// (date-holidays gives 17 to 19 February for 2026; the dates are its data.)
is('Korean New Year, three days in the library, marks three days in a row',
  kr.filter((h) => h.name === 'Korean New Year').map((h) => h.date), ['2026-02-17', '2026-02-18', '2026-02-19'])
const fake = [{ date: '2026-03-20 00:00:00 -0600', name: 'Eid', type: 'public',
  start: new Date('2026-03-19T18:00:00Z'), end: new Date('2026-03-22T18:00:00Z') }]
is('a three-day holiday starting the evening before', publicHolidays(fake).map((h) => h.date), ['2026-03-20', '2026-03-21', '2026-03-22'])
const half = [{ date: '2026-12-24 14:00:00', name: 'Christmas Eve', type: 'public',
  start: new Date('2026-12-24T13:00:00Z'), end: new Date('2026-12-25T00:00:00Z') }]
is('an afternoon still marks its day', publicHolidays(half).map((h) => h.date), ['2026-12-24'])

// Dates.
is('adding days across a month', addDays('2026-01-30', 3), '2026-02-02')
is('across a year', addDays('2026-12-31', 1), '2027-01-01')
is('across the clocks changing', addDays('2026-03-28', 2), '2026-03-30')
is('a day key from a date', dayKey(new Date(2026, 3, 27, 23, 30)), '2026-04-27')
is('a day key from a string', dayKey('2026-04-27T10:00'), '2026-04-27')

// Years worked out: those in view, within 3 back and 5 ahead of today.
const now = new Date(2026, 8, 27)
is('one year', yearsInView('2026-01-01', '2026-12-31', now), [2026])
is('a span across new year', yearsInView('2026-12-28', '2027-01-03', now), [2026, 2027])
is('not before three years back', yearsInView('2019-01-01', '2024-12-31', now), [2023, 2024])
is('not after five years ahead', yearsInView('2030-06-01', '2034-01-01', now), [2030, 2031])
is('nothing outside the range', yearsInView('2040-01-01', '2040-12-31', now), [])

// Colours.
const one = { countries: ['NL'], colours: {} }
is('a country with no choice gets a swatch', SWATCHES.some((s) => s.hex === countryColours(one).get('NL')), true)
is('the same one every time', countryColours(one).get('NL'), countryColours({ countries: ['NL'], colours: {} }).get('NL'))
is('its hashed place when free', countryColours(one).get('NL'), hashColour('holiday:NL'))
is('the person\'s choice wins', countryColours({ countries: ['NL'], colours: { NL: '#4777D2' } }).get('NL'), '#4777d2')
const six = { countries: ['NL', 'DE', 'LT', 'BE', 'FR', 'GB'], colours: {} }
const sixColours = [...countryColours(six).values()]
is('six countries, six different colours', new Set(sixColours).size, 6)
is('all readable on both pages', sixColours.every((h) => contrast(h, PAPER.light) >= 3 && contrast(h, PAPER.dark) >= 3), true)
// A pick steps past a colour another country chose.
const nlHash = hashColour('holiday:NL')
const taken = countryColours({ countries: ['DE', 'NL'], colours: { DE: nlHash } })
is('a pick steps past a colour another country chose', taken.get('NL') !== nlHash, true)
is('and keeps the other\'s', taken.get('DE'), nlHash)
// Every one of 16 swatches taken: a pick still gives a colour.
const codes = HOLIDAY_CODES.slice(0, 17)
const crowd = countryColours({ countries: codes, colours: {} })
is('more countries than swatches still all get one', [...crowd.values()].every((h) => SWATCHES.some((s) => s.hex === h)), true)
is('and the first sixteen are all different', new Set(codes.slice(0, 16).map((c) => crowd.get(c))).size, 16)

// Adding and removing.
let h = { countries: [], colours: {} }
h = withCountry(h, 'nl')
is('adding a country', h.countries, ['NL'])
is('its colour is picked and kept', h.colours.NL, countryColours({ countries: ['NL'], colours: {} }).get('NL'))
h = withCountry(h, 'DE')
is('added at the end', h.countries, ['NL', 'DE'])
is('a different colour from the first', h.colours.DE !== h.colours.NL, true)
is('adding it again changes nothing', withCountry(h, 'DE'), h)
is('an unknown code changes nothing', withCountry(h, 'AQ'), h)
let full = { countries: [], colours: {} }
for (const c of ['NL', 'DE', 'LT', 'BE', 'FR', 'GB', 'PL']) full = withCountry(full, c)
is(`at most ${MAX_COUNTRIES}`, full.countries.length, MAX_COUNTRIES)
is('the seventh is left out', full.countries.includes('PL'), false)
const deColour = h.colours.DE
const noNl = withoutCountry(h, 'NL')
is('removing one', noNl.countries, ['DE'])
is('takes its colour with it', 'NL' in noNl.colours, false)
is('and leaves the others\' colours alone', noNl.colours.DE, deColour)
is('changing a colour', withCountryColour(h, 'DE', '#C43F3E').colours.DE, '#c43f3e')
is('back to automatic', 'DE' in withCountryColour(h, 'DE', null).colours, false)
is('a bad colour counts as automatic', 'DE' in withCountryColour(h, 'DE', 'red').colours, false)

// Stored settings: what the panel writes survives readSettings.
const stored = mergeSettings(readSettings({ settings: {} }), { holidays: h })
is('the settings keep countries and colours', [stored.holidays.countries, stored.holidays.colours], [h.countries, h.colours])
is('an empty profile has no countries', readSettings({ settings: {} }).holidays, { countries: [], colours: {} })

// Several countries on one day.
const colours = new Map([['NL', '#4777d2'], ['DE', '#c43f3e']])
const per = new Map([
  ['NL', [{ date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-04-27', name: "King's Day" },
    { date: '2026-05-05', name: 'Liberation Day' }, { date: '2026-05-05', name: 'Other' }, { date: '2026-05-05', name: 'Other' }]],
  ['DE', [{ date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-10-03', name: 'National Holiday' }]],
])
// Chosen DE first, then NL: that order on every shared day.
const merged = mergeHolidays(['DE', 'NL'], per, colours, '2026-01-01', '2026-12-31')
is('one entry per country on a shared day, in the order chosen', merged.get('2026-12-25'),
  [{ country: 'DE', name: 'Christmas Day', colour: '#c43f3e' }, { country: 'NL', name: 'Christmas Day', colour: '#4777d2' }])
is('a day of one country', merged.get('2026-04-27'), [{ country: 'NL', name: "King's Day", colour: '#4777d2' }])
is('two holidays of one country share its entry, each name once', merged.get('2026-05-05'), [{ country: 'NL', name: 'Liberation Day / Other', colour: '#4777d2' }])
is('days come out in date order', [...merged.keys()], ['2026-04-27', '2026-05-05', '2026-10-03', '2026-12-25'])
is('only days in the span', [...mergeHolidays(['DE', 'NL'], per, colours, '2026-10-01', '2026-10-31').keys()], ['2026-10-03'])
is('a country not chosen is left out', [...mergeHolidays(['NL'], per, colours, '2026-10-01', '2026-10-31').keys()], [])
is('nothing chosen, nothing marked', mergeHolidays([], per, colours, '2026-01-01', '2026-12-31').size, 0)

// Real data, merged: NL and DE share Christmas and Whit Monday.
const real = mergeHolidays(['NL', 'DE'], new Map([['NL', nl], ['DE', de]]), countryColours({ countries: ['NL', 'DE'], colours: {} }), '2026-01-01', '2026-12-31')
is('NL and DE on 25 December 2026', real.get('2026-12-25').map((m) => m.country), ['NL', 'DE'])
is('only DE on 3 October', real.get('2026-10-03').map((m) => m.country), ['DE'])

// Names.
is('a holiday\'s label', holidayLabel({ country: 'NL', name: "King's Day" }), "King's Day (NL)")
is('a day\'s line', holidaysText(merged.get('2026-12-25')), 'Christmas Day (DE), Christmas Day (NL)')
is('an ordinary day has no line', holidaysText([]), '')
const chips = byName([...merged.get('2026-12-25'), { country: 'GB', name: 'Boxing Day', colour: '#1e8347' }])
is('Today\'s chips: a shared holiday is one chip', chips.map((c) => c.label), ['Christmas Day (DE, NL)', 'Boxing Day (GB)'])
is('carrying each country\'s colour', chips[0].marks.map((m) => m.colour), ['#c43f3e', '#4777d2'])
is('the legend: countries seen, in the order chosen',
  countriesIn([merged.get('2026-04-27'), merged.get('2026-12-25')], ['DE', 'NL']).map((c) => c.country), ['DE', 'NL'])
is('the legend leaves out countries with nothing in view',
  countriesIn([merged.get('2026-04-27')], ['DE', 'NL']), [{ country: 'NL', colour: '#4777d2' }])

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)
