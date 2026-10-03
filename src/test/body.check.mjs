// Checks the weigh-in arithmetic against figures worked out by hand.
import {
  parseWeight, parseWaist, isFutureDay, dayNumber, newestFirst, withChanges,
  movingAverage, trendPoints, formatChange, missingForTargets,
  missingFields, parseHeight, parseBirthDate, latestOnOrBefore, pickProfile,
  readBodySettings, recalcReason,
} from '../lib/body-rules.ts'
import { DEFAULT_PLAN } from '../lib/calc.ts'
import { NO_ANSWERS } from '../lib/activity.ts'

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
  'Targets need your height.')
is('both missing', missingForTargets({ height_cm: 0, birth_date: null }),
  'Targets need your height and date of birth.')
// More saves Number(text), so an emptied height box arrives as 0 or NaN.
is('NaN height is missing', missingFields({ height_cm: NaN, birth_date: '1996-02-01' }), ['height'])
is('height from the server as text is fine', missingFields({ height_cm: '180.0', birth_date: '1996-02-01' }), [])
is('birth date missing field', missingFields({ height_cm: 180, birth_date: null }), ['birth_date'])

// Filling in the profile from the weigh-in.
is('height 180', parseHeight('180'), { ok: true, value: 180 })
is('height with comma', parseHeight('172,5'), { ok: true, value: 172.5 })
is('height in metres is refused', parseHeight('1.80').ok, false)
is('height empty is refused', parseHeight('').ok, false)
is('birth date', parseBirthDate('1996-02-01', '2026-09-24'), { ok: true, value: '1996-02-01' })
is('31 February is refused', parseBirthDate('1996-02-31', '2026-09-24').ok, false)
is('birth date after today is refused', parseBirthDate('2026-09-25', '2026-09-24').ok, false)
is('birth date today is allowed', parseBirthDate('2026-09-24', '2026-09-24').ok, true)
is('birth date 121 years back is refused', parseBirthDate('1905-01-01', '2026-09-24').ok, false)
is('birth date in another format is refused', parseBirthDate('01-02-1996', '2026-09-24').ok, false)
is('latest on the day', latestOnOrBefore(logs, '2026-09-21')?.log_date, '2026-09-21')
is('latest before the day', latestOnOrBefore(logs, '2026-09-19')?.log_date, '2026-09-13')
is('nothing before the first', latestOnOrBefore(logs, '2026-09-01'), null)

// Which profile: the live list wins over an old active copy, and another
// profile is never used in its place.
const stale = { id: 'a', height_cm: null }
const fresh = { id: 'a', height_cm: 180 }
is('live list beats a stale active profile', pickProfile([fresh], stale, 'a'), fresh)
is('active used before the list loads', pickProfile([], stale, 'a'), stale)
is('no other profile stands in', pickProfile([{ id: 'b' }], { id: 'b' }, 'a'), null)

// The sliding moving average agrees with a plain count over the window, on a
// long history with gaps.
const long = []
for (let i = 0, n = 0; i < 400; i++) {
  n += 1 + ((i * 7) % 5 === 0 ? 3 : 0)
  // Built from UTC parts on purpose: these are counters, not a person's day.
  const d = new Date(Date.UTC(2025, 0, 1 + n))
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  long.push({ log_date: iso, weight_kg: 80 + ((i * 13) % 17) / 10 })
}
const slow = long.map((r) => {
  const end = dayNumber(r.log_date)
  const w = long.filter((o) => dayNumber(o.log_date) <= end && dayNumber(o.log_date) > end - 7)
  return { log_date: r.log_date, avg: Math.round((w.reduce((s, o) => s + o.weight_kg, 0) / w.length) * 100) / 100 }
})
is('sliding average matches the plain count', JSON.stringify(movingAverage(long)) === JSON.stringify(slow), true)

// Sex is asked for, not guessed (BODY-05), when the profile carries the field.
is('sex missing on a profile row', missingFields({ sex: null, height_cm: 180, birth_date: '1996-02-01' }), ['sex'])
is('an odd sex value is missing', missingFields({ sex: 'x', height_cm: 180, birth_date: '1996-02-01' }), ['sex'])
is('female is complete', missingFields({ sex: 'female', height_cm: 180, birth_date: '1996-02-01' }), [])
is('all three missing, in the user\'s words', missingForTargets({ sex: null, height_cm: null, birth_date: null }),
  'Targets need your sex, height and date of birth.')

// The body settings kept with Health (BODY-03, BODY-16).
is('nothing stored gives the defaults', readBodySettings(undefined), { plan: DEFAULT_PLAN, activity: NO_ANSWERS })
is('a stored plan and answers are read', readBodySettings({ plan: { adjust: { cut: -400 } }, activity: { work: 'standing', training: '3-4', mode: 'added' } }),
  { plan: { ...DEFAULT_PLAN, adjust: { ...DEFAULT_PLAN.adjust, cut: -400 } }, activity: { work: 'standing', training: '3-4', walks: false, mode: 'added' } })
is('rubbish is ignored', readBodySettings({ plan: 'x', activity: { work: 'astronaut', mode: 'both' } }), { plan: DEFAULT_PLAN, activity: NO_ANSWERS })
is('the reason says what changed', recalcReason('goal'), 'recalculated after the goal changed')
is('a weigh-in needs no reason', recalcReason('weigh-in'), '')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
