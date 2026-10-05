// Checks Health's extras: more body measures (HLT-04) and the weigh-in day
// and its reminder (HLT-05).
import {
  BODY_MEASURE_SET, missingFromSet, measureFields, measureSeries, latestMeasure, describeMeasure, describeMeasureChange, recordOfDay, measureDay,
  readWeighInPlan, isWeighInDay, offerWeighIn, weighInReminderDays, describeWeighInPlan, weighInReminderText,
} from '../lib/body-measure-rules.ts'
import { recordMeasures } from '../lib/stats-builder-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// The ready-made set.
eq('the set: hips, chest, arm, thigh, body fat', BODY_MEASURE_SET.map((f) => f.label), ['Hips', 'Chest', 'Arm', 'Thigh', 'Body fat'])
eq('all averaged in Stats', BODY_MEASURE_SET.every((f) => f.stats === 'average' && f.type === 'number'), true)
const dateField = { name: 'measure_date', label: 'Date', type: 'date', required: true }
eq('nothing yet: the whole set is offered', missingFromSet([dateField]).length, 5)
eq('a field already there (by name or label) is not offered twice',
  missingFromSet([dateField, { name: 'hips_cm', label: 'Hips', type: 'number' }, { name: 'bf', label: 'body fat', type: 'number' }]).map((f) => f.name),
  ['chest_cm', 'arm_cm', 'thigh_cm'])
eq('measures on the page: number fields shown, not the date or hidden ones',
  measureFields({ name: 'measure', label: 'Measure', fields: [dateField, ...BODY_MEASURE_SET.slice(0, 2), { ...BODY_MEASURE_SET[2], hidden: true }, { name: 'n', label: 'Note', type: 'text' }] }).map((f) => f.name),
  ['hips_cm', 'chest_cm'])
eq('no entity: no measures', measureFields(undefined), [])

// Trends in Stats: each measure is an averaged measure of the Health module.
const stats = recordMeasures([{ name: 'measure', label: 'Measure', fields: [dateField, ...BODY_MEASURE_SET] }])
const hips = stats.find((m) => m.name === 'measure:hips_cm')
eq('Stats has hips, averaged, in cm', [hips?.label, hips?.unit, hips?.summary, hips?.combine], ['Hips', 'cm', 'avg', 'mean'])
eq('and body fat in %', stats.find((m) => m.name === 'measure:body_fat_pct')?.unit, '%')

// A measure over time.
const r = (id, day, data, x = {}) => ({ id, data: { measure_date: day, ...data }, record_date: day, updated_at: '2026-10-01T00:00:00Z', ...x })
const recs = [
  r('a', '2026-09-01', { hips_cm: 100, body_fat_pct: '22,5' }),
  r('b', '2026-09-15', { hips_cm: 99.2 }),
  r('c', '2026-09-15', { hips_cm: 99.0 }, { updated_at: '2026-10-02T00:00:00Z' }),
  r('d', '2026-09-29', { hips_cm: '' }),
  r('e', '2026-10-01', { hips_cm: 98.5 }, { deleted_at: 'x' }),
]
eq('a series: one point a day, the latest change wins, blanks and deleted left out',
  measureSeries(recs, 'hips_cm'), [{ day: '2026-09-01', value: 100 }, { day: '2026-09-15', value: 99 }])
eq('a comma decimal reads', measureSeries(recs, 'body_fat_pct'), [{ day: '2026-09-01', value: 22.5 }])
eq('the latest and its change', latestMeasure(measureSeries(recs, 'hips_cm')), { day: '2026-09-15', value: 99, change: -1 })
eq('one point: no change', latestMeasure([{ day: '2026-09-01', value: 22.5 }]).change, null)
eq('nothing: no latest', latestMeasure([]), null)
eq('in words', [describeMeasure(98.5, 'cm'), describeMeasure(21, '%'), describeMeasure(3, undefined)], ['98.5 cm', '21%', '3'])
eq('changes in words', [describeMeasureChange(-1, 'cm'), describeMeasureChange(0.5, '%'), describeMeasureChange(0, 'cm'), describeMeasureChange(null, 'cm')],
  ['−1.0 cm', '+0.5%', 'no change', null])
eq('a day keeps one record: the one changed last', recordOfDay(recs, '2026-09-15')?.id, 'c')
eq('no record that day', recordOfDay(recs, '2026-09-02'), null)
eq('the record day falls back to record_date', measureDay({ id: 'x', data: {}, record_date: '2026-09-03' }), '2026-09-03')

// The weigh-in day.
eq('nothing chosen: any day, no reminder', readWeighInPlan({}), { day: null, time: null })
eq('the server default of 009 is never read here: only the profile own settings count', readWeighInPlan(undefined), { day: null, time: null })
eq('Monday at 07:30', readWeighInPlan({ weigh_in_day: 1, weigh_in_time: '07:30:00' }), { day: 1, time: '07:30' })
eq('nonsense is any day, no reminder', readWeighInPlan({ weigh_in_day: 9, weigh_in_time: '25:00' }), { day: null, time: null })
eq('2026-10-05 is a Monday weigh-in day', isWeighInDay({ day: 1 }, '2026-10-05'), true)
eq('Tuesday is not', isWeighInDay({ day: 1 }, '2026-10-06'), false)
eq('any day is every day', isWeighInDay({ day: null }, '2026-10-06'), true)
eq('Today offers the weigh-in on its day', offerWeighIn({ day: 1 }, '2026-10-05', '2026-10-05', false), true)
eq('not on another day', offerWeighIn({ day: 1 }, '2026-10-06', '2026-10-06', false), false)
eq('but a weigh-in logged that day always shows', offerWeighIn({ day: 1 }, '2026-10-06', '2026-10-06', true), true)
eq('any day: today offers it, as before', offerWeighIn({ day: null }, '2026-10-06', '2026-10-06', false), true)
eq('not on a past day with nothing logged', offerWeighIn({ day: null }, '2026-10-05', '2026-10-06', false), false)
const days = ['2026-10-04', '2026-10-05', '2026-10-06']
eq('reminders: the weigh-in day only', weighInReminderDays({ day: 1, time: '07:30' }, days, new Set()), ['2026-10-05'])
eq('not when weighed already', weighInReminderDays({ day: 1, time: '07:30' }, days, new Set(['2026-10-05'])), [])
eq('no time: no reminder', weighInReminderDays({ day: 1, time: null }, days, new Set()), [])
eq('any day with a time: every day not weighed', weighInReminderDays({ day: null, time: '07:30' }, days, new Set(['2026-10-04'])), ['2026-10-05', '2026-10-06'])
eq('described', [describeWeighInPlan({ day: 1, time: '07:30' }), describeWeighInPlan({ day: null, time: null }), describeWeighInPlan({ day: 0, time: null }), describeWeighInPlan({ day: null, time: '07:00' })],
  ['Mondays at 07:30', 'Any day', 'Sundays', 'Every day at 07:00'])
eq('the reminder says it plainly', weighInReminderText(null), { title: 'Visuma', body: 'Time to weigh in.' })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nbody measures: all ok')
