// Checks repeats counted from the last time it was done (GEN-22): "after
// completion" ("7 days after it was last done") and "flexible" ("about every
// 7 days", never late), in the one repeat control, for tasks (series),
// habits and module records, on the chores' engine. 2026-10-05 is a Monday.
process.env.TZ = 'Europe/Amsterdam'
import { looseOf, looseState, describeSchedule, describeChore, habitDay, cleanRule, MAX_LOOSE_DAYS } from '../lib/schedule-rules.ts'
import { choiceOf, ruleFor, isLooseChoice } from '../lib/repeat-choice-rules.ts'
import { baseDates, plan, nextAfterDone, taskDueness, repeatChanged, seriesRuleFields, plannedRepeats } from '../lib/series-rules.ts'
import { habitStreak, habitStrength, habitMonth, habitKept, looseLimit } from '../lib/tracking-rules.ts'
import { dayItems, carryOver } from '../lib/day-items-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

const MON = '2026-10-05'
const after7 = { rule: 'daily', rule_config: { n: 7, mode: 'after' } }
const flex7 = { rule: 'daily', rule_config: { n: 7, mode: 'flexible' } }

// The rule's shape.
is('after: read back', looseOf(after7), { mode: 'after', every: 7 })
is('flexible: read back', looseOf(flex7), { mode: 'flexible', every: 7 })
is('every 7 days on the calendar is not loose', looseOf({ rule: 'daily', rule_config: { n: 7 } }), null)
is('a mode on another kind is ignored', looseOf({ rule: 'weekly', rule_config: { mode: 'after' } }), null)
is('stored rules keep the mode', cleanRule('daily', { n: 7, mode: 'flexible' }), { rule: 'daily', rule_config: { n: 7, mode: 'flexible' } })
is('a made-up mode is dropped', cleanRule('daily', { n: 7, mode: 'sometimes' }), { rule: 'daily', rule_config: { n: 7 } })
is('the words, after', describeSchedule({ ...after7, start_date: MON }), '7 days after it was last done')
is('the words, flexible, with an end', describeSchedule({ ...flex7, start_date: MON, end_date: '2026-12-31' }), 'About every 7 days until 31 Dec 2026')
is('chores say it the same way', describeChore({ mode: 'flexible', every_days: 10, rule: null, rule_config: {} }), 'About every 10 days')
is('one day', describeSchedule({ rule: 'daily', rule_config: { n: 1, mode: 'after' }, start_date: MON }), '1 day after it was last done')

// The one repeat control.
is('the control shows "after"', choiceOf(after7), 'after')
is('…and "flexible"', choiceOf(flex7), 'flexible')
is('picking "after" from "every 3 days" keeps the 3', ruleFor('after', MON, { n: 3 }), { rule: 'daily', rule_config: { n: 3, mode: 'after' } })
is('picking "flexible" from scratch: a week', ruleFor('flexible', MON, {}), { rule: 'daily', rule_config: { n: 7, mode: 'flexible' } })
is('the number is kept in range', ruleFor('after', MON, { n: 5000 }).rule_config.n, MAX_LOOSE_DAYS)
is('back to every day drops the mode', ruleFor('daily', MON, after7.rule_config), { rule: 'daily', rule_config: {} })
is('loose choices', [isLooseChoice('after'), isLooseChoice('flexible'), isLooseChoice('daily')], [true, true, false])

// The engine: the chores' one.
is('never done: due from the start', looseState({ mode: 'after', every: 7 }, MON, null, MON, []).shows, true)
is('done Monday: not due on Sunday', looseState({ mode: 'after', every: 7 }, MON, null, '2026-10-11', [MON]).shows, false)
is('…due the Monday after', looseState({ mode: 'after', every: 7 }, MON, null, '2026-10-12', [MON]).next, '2026-10-12')
is('after: late days are counted', looseState({ mode: 'after', every: 7 }, MON, null, '2026-10-14', [MON]).overdueDays, 2)
is('flexible: never counted late', looseState({ mode: 'flexible', every: 7 }, MON, null, '2026-10-14', [MON]).overdueDays, 0)
is('flexible: more due as it waits', looseState({ mode: 'flexible', every: 7 }, MON, null, '2026-10-14', [MON]).dueness, 1.29)

// Habits.
const h = (rule_config, extra = {}) => ({ rule: 'daily', rule_config, start_date: '2026-09-01', ...extra })
is('habit, after: due on its day', habitDay(h({ n: 3, mode: 'after' }), '2026-10-08', [MON]), 'due')
is('habit, after: off before', habitDay(h({ n: 3, mode: 'after' }), '2026-10-07', [MON]), 'off')
is('habit, done that day', habitDay(h({ n: 3, mode: 'after' }), MON, [MON]), 'done')
is('habit, flexible: still due days later', habitDay(h({ n: 3, mode: 'flexible' }), '2026-10-20', [MON]), 'due')
is('the limit of a run: after its own days, flexible half as long again', [looseLimit({ mode: 'after', every: 7 }), looseLimit({ mode: 'flexible', every: 7 })], [7, 11])
const weekly = ['2026-09-07', '2026-09-14', '2026-09-22', '2026-09-28', MON]
is('flexible run: a day late still counts', habitStreak(h({ n: 7, mode: 'flexible' }), weekly, MON), { n: 5, unit: 'time' })
is('after run: a day late breaks it', habitStreak(h({ n: 7, mode: 'after' }), weekly, MON), { n: 3, unit: 'time' })
is('a run gone quiet too long is over', habitStreak(h({ n: 7, mode: 'flexible' }), weekly, '2026-10-20'), { n: 0, unit: 'time' })
is('strength: kept every week is strong', habitStrength(h({ n: 7, mode: 'flexible' }, { start_date: '2026-09-07' }), weekly, MON) > 30, true)
is('strength: a long gap costs', habitStrength(h({ n: 7, mode: 'flexible' }, { start_date: '2026-09-07' }), weekly, '2026-11-30')
  < habitStrength(h({ n: 7, mode: 'flexible' }, { start_date: '2026-09-07' }), weekly, MON), true)
const cells = (rc) => habitMonth(h(rc), ['2026-10-01'], '2026-10', '2026-10-20').flat().filter((c) => c.cell === 'missed').map((c) => c.day)
is('history, after: missed once, on the day it fell due', cells({ n: 7, mode: 'after' }), ['2026-10-08'])
is('history, flexible: never missed', cells({ n: 7, mode: 'flexible' }), [])
is('kept, after: 1 of 2', habitKept(h({ n: 7, mode: 'after' }), ['2026-10-01'], '2026-10-01', '2026-10-20'), { done: 1, due: 2, unit: 'day' })

// Tasks: the series lays out only its first day.
const s = (extra = {}) => ({ id: 's1', ...after7, start_date: MON, end_date: null, occurrence_count: null, active: true, deleted_at: null, ...extra })
is('only the first day is laid out', baseDates(s(), '2026-12-31'), [MON])
is('…and nothing from the window ahead', plan(s(), '2026-10-06', '2026-12-31'), [])
is('no planned repeats past the eight weeks', plannedRepeats([{ ...s(), title: 't', time_of_day: null, task_template: {}, module_key: null }], [], [], '2026-12-01', '2026-12-31', '2026-11-30'), [])
is('ticked Wednesday: the next goes 7 days later', nextAfterDone(s(), '2026-10-07', 1), '2026-10-14')
is('…not past the last day', nextAfterDone(s({ end_date: '2026-10-10' }), '2026-10-07', 1), null)
is('…not past its number of times', nextAfterDone(s({ occurrence_count: 3 }), '2026-10-07', 3), null)
is('…not for a stopped series', nextAfterDone(s({ active: false }), '2026-10-07', 1), null)
is('…not for a fixed rule', nextAfterDone(s({ rule: 'weekly', rule_config: { weekdays: [1] } }), '2026-10-07', 1), null)
is('a series from the control keeps the mode', seriesRuleFields({ ...flex7, end_date: null, count: 5 }, MON),
  { rule: 'daily', rule_config: { n: 7, mode: 'flexible' }, start_date: MON, end_date: null, occurrence_count: 5 })
is('after to flexible is a new rule', repeatChanged(s(), { ...flex7, end_date: null, count: null }), true)
is('every 7 days to after 7 days is a new rule', repeatChanged(s({ rule_config: { n: 7 } }), { ...after7, end_date: null, count: null }), true)
is('the same rule is not', repeatChanged(s(), { ...after7, end_date: null, count: null }), false)
is('dueness of a flexible task on its day', taskDueness(flex7, MON, MON), 1)
is('…three days on', taskDueness(flex7, MON, '2026-10-08'), 1.43)
is('…none for an "after" task', taskDueness(after7, MON, MON), null)

// On the day's list.
const task = (id, extra = {}) => ({
  id, profile_id: 'p', title: id, category: null, module_key: null, planned_date: MON, planned_time: null,
  duration_min: null, sort_order: 0, status: 'todo', locked: false, fixed: false, source: 'manual', source_ref: null,
  notes: null, deleted_at: null, series_id: null, push_count: 0, needs_review: false, ...extra,
})
const src = {
  today: '2026-10-08', enabled: [], views: {}, tasks: [], habits: [], habitLogs: [], chores: [], choreLogs: [],
  supplements: [], supplementLogs: [], events: [], records: [],
  series: [{ id: 'flex', ...flex7 }, { id: 'aft', ...after7 }],
}
const flexTask = task('water plants', { series_id: 'flex' })
const aftTask = task('descale', { series_id: 'aft' })
const items = dayItems(['2026-10-08'], 'today', { ...src, tasks: [flexTask, aftTask] })
is('a flexible task from Monday waits on today', items.map((i) => i.title), ['water plants'])
is('…in plain words, never "late"', items[0].meta, 'About every 7 days · last done 10 days ago')
is('…with how due it is', items[0].dueness, 1.43)
is('on its own day it reads like the rule', dayItems([MON], 'today', { ...src, today: MON, tasks: [aftTask] })[0].meta, '7 days after it was last done')
is('a flexible task waits only on today, not on other days', dayItems(['2026-10-09'], 'plan', { ...src, tasks: [flexTask] }).length, 0)
is('done, it does not wait', dayItems(['2026-10-08'], 'today', { ...src, tasks: [{ ...flexTask, status: 'done' }] }).length, 0)
is('carry-over leaves flexible tasks out, and keeps "after" ones',
  carryOver([flexTask, aftTask], '2026-10-08', new Set(['flex'])).map((t) => t.title), ['descale'])

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nloose: all passed')
