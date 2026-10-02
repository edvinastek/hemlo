// The repeat control's choices and the rules they stand for (repeat-choice-rules.ts).
import { choiceOf, ruleFor } from '../lib/repeat-choice-rules.ts'
import { occursOn } from '../lib/schedule-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const start = '2026-10-14' // a Wednesday, the 2nd Wednesday of October
eq('never', ruleFor('never', start), { rule: null, rule_config: {} })
eq('every few days defaults to 2', ruleFor('every_n_days', start), { rule: 'daily', rule_config: { n: 2 } })
eq('every few days keeps a number already set', ruleFor('every_n_days', start, { n: 5 }), { rule: 'daily', rule_config: { n: 5 } })
eq('weekly starts on the first day\'s weekday', ruleFor('weekly', start), { rule: 'weekly', rule_config: { weekdays: [3] } })
eq('weekly keeps days already picked', ruleFor('weekly', start, { weekdays: [1, 5] }), { rule: 'weekly', rule_config: { weekdays: [1, 5] } })
eq('every few weeks: 2 and the weekday', ruleFor('every_n_weeks', start), { rule: 'every_n_weeks', rule_config: { n: 2, weekdays: [3] } })
eq('every few weeks caps at 52', ruleFor('every_n_weeks', start, { n: 99 }).rule_config.n, 52)
eq('monthly on the day of the month', ruleFor('monthly', start), { rule: 'monthly', rule_config: { day_of_month: 14 } })
eq('monthly nth weekday', ruleFor('monthly_nth', start), { rule: 'monthly_nth', rule_config: { nth: 2, weekday: 3 } })
eq('monthly on the 29th-31st counts as the 4th at most', ruleFor('monthly_nth', '2026-10-30').rule_config.nth, 4)
eq('monthly last weekday', ruleFor('monthly_last', start), { rule: 'monthly_nth', rule_config: { nth: -1, weekday: 3 } })
eq('yearly', ruleFor('yearly', start), { rule: 'yearly', rule_config: { month: 10, day: 14 } })
eq('times a week defaults to 3', ruleFor('times_per_week', start), { rule: 'times_per_week', rule_config: { times: 3 } })
eq('picked days start with the first day', ruleFor('dates', start, {}, '2026-10-01'), { rule: 'dates', rule_config: { dates: [start] } })
eq('picked days: a past first day is not picked', ruleFor('dates', '2026-09-01', {}, '2026-10-01'), { rule: 'dates', rule_config: { dates: [] } })
eq('choice of nothing', choiceOf({ rule: null, rule_config: {} }), 'never')
eq('choice of daily n 3', choiceOf({ rule: 'daily', rule_config: { n: 3 } }), 'every_n_days')
eq('choice of last weekday', choiceOf({ rule: 'monthly_nth', rule_config: { nth: -1 } }), 'monthly_last')
eq('choice of weekly', choiceOf({ rule: 'weekly', rule_config: { weekdays: [1] } }), 'weekly')
eq('last Wednesday from the 14th lands on the 28th', occursOn({ ...ruleFor('monthly_last', start), start_date: start }, '2026-10-28'), true)
// Round trip: every choice's rule lands on its first day.
for (const c of ['daily', 'every_n_days', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'monthly_last', 'yearly', 'dates']) {
  const r = ruleFor(c, start, {}, '2026-10-01')
  // The last Wednesday is a choice from any Wednesday; it starts at the month's last one.
  eq(`${c} happens on its first day`, occursOn({ ...r, start_date: start }, start), c !== 'monthly_last')
  eq(`${c} reads back as itself`, choiceOf(r), c)
}

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall passed')
