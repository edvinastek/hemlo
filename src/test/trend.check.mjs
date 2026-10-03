// Checks trend weight: the time-weighted moving average, the weekly rate,
// the estimated goal date, and the chart's scaling.
import { trendLine, weeklyRate, goalDate, describeRate, chartScale } from '../lib/trend-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// The trend.
eq('nothing logged, no trend', trendLine([]), [])
eq('the first weigh-in is the trend', trendLine([{ log_date: '2026-10-01', weight_kg: 80 }]), [{ day: '2026-10-01', weight: 80, trend: 80 }])
eq('the next day moves it a tenth of the way', trendLine([{ log_date: '2026-10-01', weight_kg: 80 }, { log_date: '2026-10-02', weight_kg: 81 }])[1].trend, 80.1)
// A weigh-in after 3 days closes 1 - 0.9^3 = 27.1% of the gap.
eq('a gap of three days counts three days', trendLine([{ log_date: '2026-10-01', weight_kg: 80 }, { log_date: '2026-10-04', weight_kg: 81 }])[1].trend, 80.27)
eq('order does not matter, deleted and empty are left out',
  trendLine([{ log_date: '2026-10-02', weight_kg: 81 }, { log_date: '2026-10-01', weight_kg: 80 },
    { log_date: '2026-10-03', weight_kg: 50, deleted_at: 'x' }, { log_date: '2026-10-04', weight_kg: null }]).map((p) => p.day),
  ['2026-10-01', '2026-10-02'])
eq('weights given as text still count', trendLine([{ log_date: '2026-10-01', weight_kg: '80.5' }])[0].weight, 80.5)

// The weekly rate: losing half a kilo a week, every day.
const steady = []
for (let i = 0; i < 60; i++) {
  const d = new Date(Date.UTC(2026, 7, 5 + i))
  steady.push({ log_date: d.toISOString().slice(0, 10), weight_kg: 90 - (0.5 / 7) * i })
}
const line = trendLine(steady)
const rate = weeklyRate(line, '2026-10-03')
eq('a steady loss of 0.5 kg a week, weighed for two months, reads as 0.5 from the trend', rate, -0.5)
const fresh = weeklyRate(trendLine(steady.slice(-29)), '2026-10-03')
eq('weighed for four weeks only, the trend still lags but points the same way', fresh !== null && fresh < -0.3 && fresh > -0.5, true)
eq('fewer than two weigh-ins: no rate', weeklyRate(line.slice(0, 1), '2026-10-03'), null)
eq('less than a week of weigh-ins: no rate', weeklyRate(trendLine(steady.slice(-5)), '2026-10-03'), null)
eq('describe a loss', describeRate(-0.454), '−0.45 kg a week')
eq('describe a gain', describeRate(0.2), '+0.20 kg a week')
eq('describe steady', describeRate(0.01), 'steady')
eq('describe unknown', describeRate(null), 'not enough weigh-ins yet')

// The goal date.
eq('losing 0.5 a week with 2 kg to go: four weeks', goalDate(80, -0.5, 78, '2026-10-03'),
  { day: '2026-10-31', note: 'At 0.50 kg a week, 2.0 kg to go.' })
eq('gaining towards a higher goal', goalDate(70, 0.25, 71, '2026-10-03').day, '2026-10-31')
eq('moving away: no date', goalDate(80, 0.3, 78, '2026-10-03').day, null)
eq('no rate yet: no date, and why', goalDate(80, null, 78, '2026-10-03'), { day: null, note: 'Weigh in over at least a week to see a date.' })
eq('no goal: no date', goalDate(80, -0.5, null, '2026-10-03').day, null)
eq('already there', goalDate(78.02, -0.5, 78, '2026-10-03').day, '2026-10-03')
eq('more than ten years: no date', goalDate(80, -0.01, 70, '2026-10-03').day, null)

// The chart.
const c = chartScale(trendLine([{ log_date: '2026-10-01', weight_kg: 80 }, { log_date: '2026-10-11', weight_kg: 79 }]), 100, 50)
eq('dots span the width', [c.dots[0].x, c.dots[1].x], [0, 100])
eq('the heavier day sits higher', c.dots[0].y < c.dots[1].y, true)
eq('a line through the trend', c.line.startsWith('M0,') && c.line.includes(' L100,'), true)
eq('a goal inside the range gets a line', chartScale(trendLine([{ log_date: '2026-10-01', weight_kg: 80 }, { log_date: '2026-10-11', weight_kg: 79 }]), 100, 50, 78).goalY !== null, true)
eq('one weigh-in sits in the middle', chartScale(trendLine([{ log_date: '2026-10-01', weight_kg: 80 }]), 100, 50).dots[0].x, 50)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall trend checks passed')
