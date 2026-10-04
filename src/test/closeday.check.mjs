// Close the day (TOD-23, close-day-rules.ts) and Plan my day (TOD-22,
// plan-day-rules.ts): what is left of today and where it goes, what stays and
// why; when Plan my day is offered, its leftovers, suggestions, workload bar
// and what "Start the day" does. 2026-10-05 is a Monday.
import { closePlan, closeWords, leftToday, whyStays } from '../lib/close-day-rules.ts'
import {
  leftoverChoices, offerPlanDay, planDayActions, planDayWords, suggestions, workload, leftoverMinutes,
} from '../lib/plan-day-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const MON = '2026-10-05'
const task = (id, extra = {}) => ({
  id, profile_id: 'p', title: id, category: null, module_key: null, planned_date: MON, planned_time: null, due_date: null,
  duration_min: null, sort_order: 0, status: 'todo', locked: false, fixed: false, source: 'manual', source_ref: null,
  notes: null, deleted_at: null, series_id: null, push_count: 0, extension_count: 0, needs_review: false, ...extra,
})

// ---------- Close the day ------------------------------------------------------------
const rows = [
  task('late', { planned_time: '20:00' }),
  task('early', { planned_time: '08:00' }),
  task('any'),
  task('done', { status: 'done' }),
  task('dropped', { status: 'dropped' }),
  task('gone', { deleted_at: 'x' }),
  task('tomorrow', { planned_date: '2026-10-06' }),
  task('theirs', { profile_id: 'q' }),
  task('locked', { locked: true }),
  task('fixed', { fixed: true }),
  task('meal', { source: 'meal' }),
  task('repeat', { series_id: 's1' }),
  task('flex', { series_id: 'f1' }),
  task('pushed', { status: 'pushed', planned_time: '12:00' }),
]
const left = leftToday(rows, 'p', MON)
eq('what is left of today, in the day’s order', left.map((t) => t.id), ['early', 'pushed', 'late', 'any', 'fixed', 'flex', 'locked', 'meal', 'repeat'])
const flex = new Set(['f1'])
const toTomorrow = closePlan(left, 'tomorrow', flex)
eq('to tomorrow: what moves', toTomorrow.move.map((t) => t.id), ['early', 'pushed', 'late', 'any', 'repeat'])
eq('to tomorrow: what stays, and why', toTomorrow.stay.map((s) => [s.task.id, s.why]),
  [['fixed', 'Fixed to this day'], ['flex', 'Comes back until done'], ['locked', 'Locked'], ['meal', 'Follows the meal plan']])
const toInbox = closePlan(left, 'inbox', flex)
eq('to the Inbox: a repeat stays too', toInbox.stay.map((s) => [s.task.id, s.why]).filter(([id]) => id === 'repeat'), [['repeat', 'Repeats keep a day']])
eq('to the Inbox: the rest moves', toInbox.move.map((t) => t.id), ['early', 'pushed', 'late', 'any'])
eq('one task alone', [whyStays(task('x'), 'inbox'), whyStays(task('x', { locked: true, fixed: true }), 'tomorrow')], [null, 'Locked'])
eq('the Undo line', [closeWords(toTomorrow.move, 'tomorrow', toTomorrow.stay.length), closeWords([task('Gym')], 'inbox'), closeWords([task('a'), task('b')], 'inbox', 1)],
  ['5 tasks moved to tomorrow, 4 stay', '“Gym” sent to the Inbox', '2 tasks sent to the Inbox, 1 stays'])
eq('nothing left', closePlan([], 'tomorrow'), { move: [], stay: [] })

// ---------- Plan my day: when it is offered ---------------------------------------------
eq('switched on, first open, something to decide', offerPlanDay({ on: true, lastShown: '2026-10-04', today: MON, leftovers: 2, suggestions: 0 }), true)
eq('off: never by itself', offerPlanDay({ on: false, lastShown: null, today: MON, leftovers: 2, suggestions: 3 }), false)
eq('already shown today', offerPlanDay({ on: true, lastShown: MON, today: MON, leftovers: 2, suggestions: 3 }), false)
eq('nothing to decide: an empty morning is not interrupted', offerPlanDay({ on: true, lastShown: null, today: MON, leftovers: 0, suggestions: 0 }), false)

// ---------- leftovers ---------------------------------------------------------------------
eq('a leftover: today, Inbox or leave', leftoverChoices(task('x')), ['today', 'inbox', 'leave'])
eq('a repeat cannot go to the Inbox', leftoverChoices(task('x', { series_id: 's' })), ['today', 'leave'])
eq('a leftover with no length adds a quarter of an hour', [leftoverMinutes(task('x')), leftoverMinutes(task('x', { duration_min: 50 }))], [15, 50])

// ---------- suggestions -----------------------------------------------------------------------
const list = suggestions({
  today: MON,
  tasks: [
    task('report', { planned_date: null, due_date: '2026-10-06', duration_min: 60 }),
    task('taxes', { planned_date: '2026-10-09', due_date: '2026-10-05' }),
    task('far', { planned_date: null, due_date: '2026-10-20' }),
    task('on today', { due_date: MON }),
    task('late leftover', { planned_date: '2026-10-04', due_date: MON }),
    task('locked', { planned_date: null, due_date: MON, locked: true }),
    task('done', { planned_date: null, due_date: MON, status: 'done' }),
    task('overdue', { planned_date: null, due_date: '2026-10-02' }),
    task('fridge', { planned_date: '2026-10-07', series_id: 'flex' }),
    task('fridge far', { planned_date: '2026-10-20', series_id: 'flex' }),
    task('weekly', { planned_date: '2026-10-07', series_id: 'fixed-series' }),
  ],
  flexibleSeries: new Set(['flex']),
  chores: [
    { id: 'hoover', name: 'Hoover', mode: 'flexible', minutes: 20, dueness: 0.9, doneToday: false, onToday: false },
    { id: 'windows', name: 'Windows', mode: 'flexible', minutes: null, dueness: 1.4, doneToday: false, onToday: true },
    { id: 'plants', name: 'Plants', mode: 'flexible', minutes: null, dueness: 0.3, doneToday: false, onToday: false },
    { id: 'bins', name: 'Bins', mode: 'fixed', minutes: null, dueness: 1, doneToday: false, onToday: false },
    { id: 'bath', name: 'Bath', mode: 'flexible', minutes: null, dueness: 1.2, doneToday: false, onToday: false },
  ],
  reviews: [{ subject: 'Biology', due: '2026-10-03' }, { subject: 'Dutch', due: MON }],
})
eq('suggestions in order: due soon, flexible repeats, chores, reviews', list.map((s) => s.key), [
  'due:overdue', 'due:taxes', 'due:report', 'flex:fridge', 'chore:bath', 'chore:hoover', 'review:biology', 'review:dutch'])
eq('why each is suggested', list.map((s) => s.meta), [
  'Was due Fri 2 Oct', 'Due today', 'Due tomorrow', 'Comes up Wed 7 Oct', 'Chore, due', 'Chore, nearly due', 'Review due since Sat 3 Oct', 'Review due today'])
eq('what each adds', list.map((s) => s.minutes), [15, 15, 60, 15, 15, 20, 30, 30])
eq('a review’s title', list.at(-1).title, 'Review Dutch')
eq('at most eight', suggestions({ today: MON, tasks: Array.from({ length: 12 }, (_, i) => task(`t${i}`, { planned_date: null, due_date: MON })), flexibleSeries: new Set(), chores: [], reviews: [] }).length, 8)

// ---------- the workload bar ---------------------------------------------------------------
eq('under what the day holds', workload(120, [60], 480), { minutes: 180, share: 0.375, over: false, words: '3 h of 8 h planned' })
eq('over: it warns', workload(420, [60, 30], 480), { minutes: 510, share: 1, over: true, words: '8 h 30 planned, 30 min more than the day holds' })
eq('nothing planned', workload(0, [], 480).words, 'Nothing planned')

// ---------- Start the day --------------------------------------------------------------------
const leftovers = [task('a', { planned_date: '2026-10-04' }), task('b', { planned_date: '2026-10-04' }), task('c', { planned_date: '2026-10-03', series_id: 's' }), task('d', { planned_date: '2026-10-04' })]
const acts = planDayActions(leftovers, { a: 'today', b: 'inbox', c: 'inbox', d: 'leave' }, list, new Set(['due:report', 'chore:hoover', 'review:dutch']))
eq('leftovers: today and the Inbox; a repeat sent to the Inbox is left', [acts.toToday.map((t) => t.id), acts.toInbox.map((t) => t.id)], [['a'], ['b']])
eq('suggestions taken', [acts.planToday.map((t) => t.id), acts.chores, acts.reviews], [['report'], ['hoover'], ['Dutch']])
eq('the Undo line', planDayWords(acts), '3 tasks on today, 1 task to the Inbox, 1 chore on today')
eq('nothing chosen: nothing to say', planDayWords(planDayActions(leftovers, {}, list, new Set())), null)

if (fail) { console.log(`\n${fail} close/plan day check(s) failed`); process.exit(1) }
console.log('\nall close the day and plan my day checks passed')
