// Checks Sleep's rules: the stored target, nights against it, sleep debt,
// how regular bed and wake times are, and the bedtime block.
import {
  readSleepSettings, hoursSlept, wakeFrom, bedFrom, clockDiff, compareNight, describeVsTarget, describeLate,
  sleepDebt, spread, regularity, middle, describeSpread, bedtimeSeries, sleepSeries, nightHours, SLEEP_DEFAULTS,
} from '../lib/sleep-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// Settings.
eq('nothing stored gives the server defaults', readSleepSettings(null), SLEEP_DEFAULTS)
eq('stored values are kept', readSleepSettings({ target_hours: 7.5, bedtime: '23:15', wind_down: 45, block: true, locked: false, block_series: 's1' }),
  { target_hours: 7.5, bedtime: '23:15', wind_down: 45, block: true, locked: false, block_series: 's1' })
eq('nonsense falls back', readSleepSettings({ target_hours: 30, bedtime: '25:00', wind_down: -5, block: 'yes' }), SLEEP_DEFAULTS)
eq('seconds on a stored time are dropped', readSleepSettings({ bedtime: '22:30:00' }).bedtime, '22:30')
eq('target rounded to a quarter hour', readSleepSettings({ target_hours: 7.6 }).target_hours, 7.5)

// Clocks.
eq('hours across midnight', hoursSlept('23:00', '07:00'), 8)
eq('hours not across midnight', hoursSlept('01:30', '08:00'), 6.5)
eq('wake from bed and hours', wakeFrom('23:00', 8), '07:00')
eq('bed from wake and hours', bedFrom('06:30', 7.5), '23:00')
eq('late by 30 min', clockDiff('23:30', '23:00'), 30)
eq('early by 20 min', clockDiff('22:40', '23:00'), -20)
eq('after midnight is late, not 23 hours early', clockDiff('00:15', '23:00'), 75)
eq('well before is early', clockDiff('21:00', '23:00'), -120)

// One night.
const s = { target_hours: 8, bedtime: '23:00' }
eq('a short night, late to bed, up on time', compareNight({ log_date: '2026-10-03', went_to_bed: '23:40:00', woke_at: '07:00:00', hours: null, quality: 3 }, s),
  { hours: 7.33, vsTarget: -0.67, bedLate: 40, wakeLate: 0 })
eq('a stored hours figure wins', nightHours({ went_to_bed: '23:00', woke_at: '07:00', hours: 7.25 }), 7.25)
eq('no times, no hours: unknown', compareNight({ log_date: 'x', went_to_bed: null, woke_at: null, hours: null, quality: null }, s),
  { hours: null, vsTarget: null, bedLate: null, wakeLate: null })
eq('short', describeVsTarget(-0.67), '0.7 h short')
eq('over', describeVsTarget(0.5), '0.5 h over')
eq('on target', describeVsTarget(0.02), 'on target')
eq('late', describeLate(40, 'bed'), 'bed 40 min late')
eq('early by more than an hour', describeLate(-75), '1 h 15 min early')
eq('within five minutes is on time', describeLate(4, 'up'), 'up on time')

// Debt.
const nights = [
  { log_date: '2026-10-03', went_to_bed: '23:30', woke_at: '06:30', hours: 7, quality: 3 },
  { log_date: '2026-10-02', went_to_bed: '23:00', woke_at: '06:00', hours: 7, quality: 4 },
  { log_date: '2026-10-01', went_to_bed: '22:30', woke_at: '07:30', hours: 9, quality: 5 },
  { log_date: '2026-09-27', went_to_bed: '00:30', woke_at: '06:00', hours: 5.5, quality: 2 },
  { log_date: '2026-09-26', went_to_bed: '23:00', woke_at: '07:00', hours: 8, quality: 4 },
  { log_date: '2026-09-20', went_to_bed: '23:00', woke_at: '07:00', hours: 2, quality: 1 },
  { log_date: '2026-10-02', went_to_bed: '20:00', woke_at: '04:00', hours: 1, quality: 1, deleted_at: 'x' },
]
eq('debt over 7 days: short nights less long ones, deleted and older left out', sleepDebt(nights, 8, '2026-10-03'),
  { hours: 3.5, nights: 4, days: 7 })
eq('no nights: unknown, not zero', sleepDebt([], 8, '2026-10-03'), { hours: null, nights: 0, days: 7 })
eq('more sleep than the target is no debt, not a negative', sleepDebt([{ log_date: '2026-10-03', hours: 10 }], 8, '2026-10-03').hours, 0)

// Regularity.
eq('the same time every night does not wander', spread(['23:00', '23:00', '23:00']), 0)
eq('either side of midnight counts as close', spread(['23:50', '00:10', '00:00']), 8)
eq('fewer than three: not enough to say', spread(['23:00', '23:30']), null)
eq('the usual time across midnight', middle(['23:50', '00:10']), '00:00')
const reg = regularity(nights, '2026-10-03', 14)
eq('regularity over 14 days', [reg.nights, reg.bed, reg.wake, reg.averageBed, reg.averageWake], [6, 38, 33, '23:15', '06:40'])
eq('steady', describeSpread(12), 'steady (± 12 min)')
eq('irregular past an hour', describeSpread(80), 'irregular (± 1 h 20 min)')
eq('not enough nights', describeSpread(null), 'needs three nights')

// The bedtime block.
const set = { ...SLEEP_DEFAULTS, bedtime: '23:00', wind_down: 30, block: true, locked: true }
eq('the block starts the wind-down before bed, every night, locked', bedtimeSeries(set, true, '2026-10-03'),
  { title: 'Wind down, bed at 23:00', rule: 'daily', rule_config: {}, start_date: '2026-10-03', end_date: null, time_of_day: '22:30',
    task_template: { category: 'Night', duration_min: 30, locked: true, notes: null } })
eq('no wind-down: a quarter of an hour at bedtime', bedtimeSeries({ ...set, wind_down: 0, bedtime: '00:10', locked: false }, true, '2026-10-03'),
  { title: 'Bed at 00:10', rule: 'daily', rule_config: {}, start_date: '2026-10-03', end_date: null, time_of_day: '00:10',
    task_template: { category: 'Night', duration_min: 15, locked: false, notes: null } })
eq('wind-down across midnight', bedtimeSeries({ ...set, bedtime: '00:15', wind_down: 45 }, true, '2026-10-03').time_of_day, '23:30')
eq('block off: none', bedtimeSeries({ ...set, block: false }, true, '2026-10-03'), null)
eq('rule off: none', bedtimeSeries(set, false, '2026-10-03'), null)

// Stats series.
eq('hours per night for Stats', sleepSeries(nights.slice(0, 3), 'hours', s), { '2026-10-03': 7, '2026-10-02': 7, '2026-10-01': 9 })
eq('bedtime against the target', sleepSeries(nights.slice(0, 3), 'bed_late', s), { '2026-10-03': 30, '2026-10-02': 0, '2026-10-01': -30 })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall sleep checks passed')
