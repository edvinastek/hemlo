// Checks the weigh-in arithmetic against figures worked out by hand.
import {
  parseWeight, parseWaist, isFutureDay, dayNumber, newestFirst, withChanges,
  movingAverage, trendPoints, formatChange, missingForTargets,
} from '../lib/body-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Validation: 30 to 300 kg, a decimal comma reads as a point.
is('weight 82.4', parseWeight('82.4'), { ok: true, value: 82.4 })
is('weight with comma', parseWeight(' 82,45 '), { ok: true, value: 82.45 })
is('weight rounds to 2 decimals', parseWeight('82.456'), { ok: true, value: 82.46 })
is('weight 30 is allowed', parseWeight('30').ok, true)
is('weight 300 is allowed', parseWeight('300').ok, true)
is('weight 29.9 is refused', parseWeight('29.9').ok, false)
is('weight 300.1 is refused', parseWeight('300.1').ok, false)
is('weight empty is refused', parseWeight('').ok, false)
is('weight text is refused', parseWeight('eighty').ok, false)
is('weight negative is refused', parseWeight('-80').ok, false)
is('waist empty means none', parseWaist(''), { ok: true, value: null })
is('waist 84.55 rounds to 1 decimal', parseWaist('84.55'), { ok: true, value: 84.6 })
is('waist 20 is refused', parseWaist('20').ok, false)

// Future days: compared as calendar days.
is('tomorrow is future', isFutureDay('2026-09-25', '2026-09-24'), true)
is('today is not future', isFutureDay('2026-09-24', '2026-09-24'), false)
is('last year is not future', isFutureDay('2025-12-31', '2026-01-01'), false)

// Day numbers: across the end of March, where the clocks change in NL.
is('days across DST', dayNumber('2026-03-30') - dayNumber('2026-03-28'), 2)

const logs = [
  { log_date: '2026-09-10', weight_kg: 84.0 },
  { log_date: '2026-09-12', weight_kg: 83.6 },
  { log_date: '2026-09-13', weight_kg: 83.8 },
  { log_date: '2026-09-20', weight_kg: 83.0 },
  { log_date: '2026-09-21', weight_kg: 82.6 },
]

// Newest first, one per day.
is('newest first', newestFirst(logs).map((r) => r.log_date)[0], '2026-09-21')
is('duplicate day dropped', newestFirst([...logs, { log_date: '2026-09-21', weight_kg: 90 }]).length, 5)

// Change against the previous weigh-in: 82.6 - 83.0 = -0.4; 83.8 - 83.6 = +0.2.
const ch = withChanges(logs)
is('change newest', ch[0].change, -0.4)
is('change 13th', ch[2].change, 0.2)
is('oldest has no previous', ch[4].change, null)

// Moving average by calendar day, window of 7 ending that day:
// 10th: 84.0
// 13th: 10th, 12th, 13th -> (84.0 + 83.6 + 83.8) / 3 = 83.8
// 20th: window 14th..20th -> only 83.0
// 21st: 20th, 21st -> 82.8
const ma = movingAverage(logs)
is('ma oldest first', ma.map((p) => p.log_date)[0], '2026-09-10')
is('ma 10th', ma[0].avg, 84)
is('ma 13th', ma[2].avg, 83.8)
is('ma 20th leaves the 13th out', ma[3].avg, 83)
is('ma 21st', ma[4].avg, 82.8)
is('ma empty', movingAverage([]), [])

// Trend: highest weight at the top (y = pad), lowest at the bottom.
const pts = trendPoints([{ log_date: '2026-09-01', avg: 84 }, { log_date: '2026-09-11', avg: 82 }], 102, 22, 1)
is('trend points', pts, '1,1 101,21')
is('flat trend sits in the middle', trendPoints([{ log_date: '2026-09-01', avg: 80 }], 100, 20), '50,10')
is('trend empty', trendPoints([], 100, 20), '')

// Wording.
is('change down', formatChange(-0.4), '−0.4 kg')
is('change up', formatChange(0.25), '+0.3 kg')
is('change none', formatChange(0.01), 'no change')
is('change first', formatChange(null), 'first entry')

// What the targets still need.
is('profile complete', missingForTargets({ height_cm: 180, birth_date: '1996-02-01' }), null)
is('height missing', missingForTargets({ height_cm: null, birth_date: '1996-02-01' }),
  'Targets need your height. Add it under More, then save a weigh-in to work them out.')
is('both missing', missingForTargets({ height_cm: 0, birth_date: null }),
  'Targets need your height and date of birth. Add them under More, then save a weigh-in to work them out.')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
