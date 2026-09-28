// Checks how far the app lets a person move in time, and how the scrolling
// month calendar lays out its months. 2026-09-27 is a Sunday; 2026-09-01 a
// Tuesday; 2026-02-01 a Sunday; 2027-02-01 a Monday; 2028 is a leap year.
import {
  navRange, clampDay, inRange, moveWeek, addMonths, daysInMonth, monthBlock, monthsBetween, monthTops,
  monthAt, monthIndex, monthDays, YEARS_BACK, YEARS_AHEAD,
} from '../lib/calendar-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// Months.
eq('a month on', addMonths('2026-09', 1), '2026-10')
eq('across the year end', addMonths('2026-12', 1), '2027-01')
eq('back across the year start', addMonths('2026-01', -1), '2025-12')
eq('five years on', addMonths('2026-09', 60), '2031-09')
eq('three years back', addMonths('2026-09', -36), '2023-09')
eq('February in a leap year', daysInMonth('2028-02'), 29)
eq('February otherwise', daysInMonth('2027-02'), 28)
eq('September', daysInMonth('2026-09'), 30)

// The range: whole months, three years back to five ahead.
eq('the years', [YEARS_BACK, YEARS_AHEAD], [3, 5])
const range = navRange('2026-09-27')
eq('range from today', range, { first: '2023-09-01', last: '2031-09-30' })
eq('range from the last day of February', navRange('2028-02-29'), { first: '2025-02-01', last: '2033-02-28' })
eq('a day inside is kept', clampDay('2027-05-10', range), '2027-05-10')
eq('a day too early becomes the first', clampDay('2020-01-01', range), '2023-09-01')
eq('a day too late becomes the last', clampDay('2040-01-01', range), '2031-09-30')
eq('the ends are inside', [inRange('2023-09-01', range), inRange('2031-09-30', range)], [true, true])
eq('a day past the end is outside', inRange('2031-10-01', range), false)

// The week strip.
eq('a week on', moveWeek('2026-09-27', 1, range), '2026-10-04')
eq('a week back', moveWeek('2026-09-27', -1, range), '2026-09-20')
eq('a week on near the end stops at the end', moveWeek('2031-09-27', 1, range), '2031-09-30')
eq('at the end it does not move', moveWeek('2031-09-30', 1, range), null)
eq('near the start it stops at the start', moveWeek('2023-09-03', -1, range), '2023-09-01')
eq('at the start it does not move back', moveWeek('2023-09-01', -1, range), null)
eq('at the start it still moves on', moveWeek('2023-09-01', 1, range), '2023-09-08')

// Month blocks, weeks starting on Monday.
eq('September 2026 starts on a Tuesday', monthBlock('2026-09'), { key: '2026-09', lead: 1, days: 30, weeks: 5 })
eq('February 2026 starts on a Sunday and needs five rows', monthBlock('2026-02'), { key: '2026-02', lead: 6, days: 28, weeks: 5 })
eq('February 2027 starts on a Monday and fits four rows', monthBlock('2027-02'), { key: '2027-02', lead: 0, days: 28, weeks: 4 })
eq('August 2026 starts on a Saturday and needs six rows', monthBlock('2026-08'), { key: '2026-08', lead: 5, days: 31, weeks: 6 })
const all = monthsBetween(range.first, range.last)
eq('the whole range is 97 months', all.length, 97)
eq('first and last month', [all[0].key, all[96].key], ['2023-09', '2031-09'])
eq('month days', monthDays(monthBlock('2028-02')).slice(-2), ['2028-02-28', '2028-02-29'])

// Where months sit when scrolled.
const three = monthsBetween('2026-08-01', '2026-10-31') // 6, 5 and 5 rows
const { tops, total } = monthTops(three, 30, 40)
eq('tops add each month\'s heading and rows', tops, [0, 270, 500])
eq('total height', total, 730)
eq('at the top, the first month', monthAt(tops, 0), 0)
eq('just before the second month', monthAt(tops, 269), 0)
eq('on the second month', monthAt(tops, 270), 1)
eq('past the end, the last month', monthAt(tops, 5000), 2)
// Side by side on a wide screen: two to a row, each row as tall as its tallest month.
const wide = monthTops(three, 30, 40, 2)
eq('two columns: a row\'s months share its top', wide.tops, [0, 0, 270])
eq('two columns: total height', wide.total, 500)
eq('two columns: the first row, found at its foot', monthAt(wide.tops, 269), 1)
eq('two columns: the second row', monthAt(wide.tops, 270), 2)
eq('one column is the same as before', JSON.stringify(monthTops(three, 30, 40, 1)), JSON.stringify({ tops, total }))
eq('index of a day', monthIndex(all, '2026-09-27'), 36)
eq('index of the first month', monthIndex(all, '2023-09-15'), 0)
eq('index before the range is the first', monthIndex(all, '2001-01-01'), 0)
eq('index after the range is the last', monthIndex(all, '2050-01-01'), 96)
eq('index across years', all[monthIndex(all, '2030-02-11')].key, '2030-02')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
