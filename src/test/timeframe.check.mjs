// Checks the maths behind giving a task an end time instead of minutes.
import { toMinutes, fromMinutes, durationBetween, endFrom, fitsInDay, shortSpan } from '../lib/timeframe.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

is('a time reads as minutes after midnight', toMinutes('09:30'), 570)
is('the server’s seconds are ignored', toMinutes('09:30:00'), 570)
is('an hour without its leading zero reads', toMinutes('7:05'), 425)
is('nothing, junk and impossible times are none', [toMinutes(null), toMinutes(''), toMinutes('late'), toMinutes('24:00'), toMinutes('12:60')], [null, null, null, null, null])
is('minutes turn back into a time', fromMinutes(570), '09:30')
is('past midnight wraps round', [fromMinutes(1500), fromMinutes(-30)], ['01:00', '23:30'])

is('nine until half ten is ninety minutes', durationBetween('09:00', '10:30'), 90)
is('start with seconds works too', durationBetween('09:00:00', '09:45'), 45)
is('an end before the start is the next morning', durationBetween('22:00', '01:00'), 180)
is('one minute to midnight is one minute', durationBetween('23:59', '00:00'), 1)
is('the same time is nothing, not a day', durationBetween('08:00', '08:00'), 0)
is('never more than a day', durationBetween('00:00', '23:59') <= 1440, true)
is('no start or no end gives no length', [durationBetween(null, '10:00'), durationBetween('09:00', ''), durationBetween('09:00', null)], [null, null, null])

is('the end for a start and a length', endFrom('09:00', 90), '10:30')
is('the end can fall after midnight', endFrom('23:00', 120), '01:00')
is('the end works from a start with seconds', endFrom('07:15:00', 45), '08:00')
is('no start, no end', endFrom(null, 60), null)
is('no length, no end', [endFrom('09:00', null), endFrom('09:00', 0)], [null, null])
is('a day or more has no end on the clock', [endFrom('09:00', 1440), endFrom('09:00', 3000)], [null, null])
is('what fits in a day', [fitsInDay(1), fitsInDay(1439), fitsInDay(1440), fitsInDay(0), fitsInDay(null), fitsInDay(NaN)], [true, true, false, false, false, false])

// Round trip: the end a length gives, read back, is the same length.
let round = true
for (const start of ['00:00', '06:45', '12:00', '23:30']) {
  for (const mins of [1, 15, 59, 60, 95, 600, 1439]) {
    if (durationBetween(start, endFrom(start, mins)) !== mins) round = false
  }
}
is('every length that fits comes back unchanged through an end time', round, true)

is('short lengths for a label', [shortSpan(45), shortSpan(60), shortSpan(90), shortSpan(125), shortSpan(0), shortSpan(null)],
  ['45 min', '1 h', '1 h 30', '2 h 05', '', ''])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
