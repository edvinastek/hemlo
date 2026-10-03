// Copy to… (copy-rules.ts): the days a copy lands on, what the copy of a task
// holds, and what a day or week copy brings along.
// 2026-10-03 is a Saturday; 2026-10-05 a Monday; 2026-10-07 a Wednesday.
import {
  DEFAULT_CHOICES, readCopyChoices, shortcutsFor, shortcutDays, shortcutLabel, cleanTargets, toggleTarget,
  toggleShortcut, shownDays, copyNote, copyTime, copyTaskFields, copiesWithDay, mealHasFood, copyMealFields, mealCount,
  planCopy, dayPairs, weekPairs, targetWords, copySummary, mondayOf, MAX_COPY_DAYS,
} from '../lib/copy-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}

const task = (over = {}) => ({
  id: 't1', profile_id: 'p', title: 'Read 30 min', category: 'Learning', module_key: null, horizon: 'day', goal_id: null,
  series_id: null, duration_min: 30, total_effort_min: null, daily_quota_min: null, fixed: false, locked: true,
  planned_date: '2026-10-05', planned_time: '07:30:00', start_date: null, due_date: null, sort_order: 2, status: 'done',
  push_count: 2, extension_count: 1, needs_review: true, source: 'manual', source_ref: null,
  notes: '- [x] Chapter 1\n- [ ] Chapter 2', updated_at: '', completed_at: '2026-10-05T08:00:00Z', deleted_at: null, ...over,
})
const templates = [
  { id: 'reading', name: 'Reading reflection', after_done: true, body: '## {title}' },
  { id: 'meeting', name: 'Meeting notes', after_done: false, body: '## {title}, {date} at {time}' },
]
const range = { first: '2023-10-01', last: '2031-10-31' }

// Choices remembered and read back sanely.
eq('defaults keep section, minutes and lock (TSK-23)', [DEFAULT_CHOICES.keepSection, DEFAULT_CHOICES.keepMinutes, DEFAULT_CHOICES.keepLocked], [true, true, true])
eq('repeats are left out by default', DEFAULT_CHOICES.repeats, false)
eq('nothing stored gives the defaults', readCopyChoices(undefined), DEFAULT_CHOICES)
eq('stored notes choice is kept (TSK-22)', readCopyChoices({ notes: 'template', templateId: 'reading' }).notes, 'template')
eq('a broken choice falls back', readCopyChoices({ notes: 'shred', time: 7, newTime: '25:00', templateId: '../x' }),
  { ...DEFAULT_CHOICES })
eq('a stored new time is kept', readCopyChoices({ time: 'new', newTime: '18:00:00' }).newTime, '18:00')

// Shortcuts.
eq('task and day shortcuts', shortcutsFor('task'), ['next_day', 'weekdays', 'next_week_day'])
eq('week shortcuts', shortcutsFor('week'), ['next_week', 'next_4_weeks'])
eq('the day after a future day', shortcutDays('next_day', '2026-10-07', '2026-10-03'), ['2026-10-08'])
eq('a past day copies to tomorrow', shortcutDays('next_day', '2026-09-28', '2026-10-03'), ['2026-10-04'])
eq('"Tomorrow" only when it is', shortcutLabel('next_day', '2026-10-03', '2026-10-03'), 'Tomorrow')
eq('otherwise "The day after"', shortcutLabel('next_day', '2026-10-07', '2026-10-03'), 'The day after')
eq('weekdays of a Wednesday\'s week, not itself', shortcutDays('weekdays', '2026-10-07', '2026-10-03'),
  ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'])
eq('weekdays never in the past', shortcutDays('weekdays', '2026-10-07', '2026-10-07'), ['2026-10-08', '2026-10-09'])
eq('on a Saturday no weekdays are left this week', shortcutDays('weekdays', '2026-10-03', '2026-10-03'), [])
eq('same day next week', shortcutDays('next_week_day', '2026-10-07', '2026-10-03'), ['2026-10-14'])
eq('same day next week from a long-past day lands ahead', shortcutDays('next_week_day', '2026-09-01', '2026-10-03'), ['2026-10-10'])
eq('next week is a Monday', shortcutDays('next_week', '2026-10-05', '2026-10-03'), ['2026-10-12'])
eq('the next four weeks', shortcutDays('next_4_weeks', '2026-10-05', '2026-10-03'), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'])
eq('Monday of a Sunday', mondayOf('2026-10-11'), '2026-10-05')

// Picking days.
eq('clean: sorted, once, real days', cleanTargets(['2026-10-09', '2026-10-08', '2026-10-08', '2026-02-30', 'x'], 'task', '2026-10-07', range),
  ['2026-10-08', '2026-10-09'])
eq('a task may be copied onto its own day', cleanTargets(['2026-10-07'], 'task', '2026-10-07', range), ['2026-10-07'])
eq('a day is never copied onto itself', cleanTargets(['2026-10-07', '2026-10-08'], 'day', '2026-10-07', range), ['2026-10-08'])
eq('weeks become Mondays, never their own', cleanTargets(['2026-10-07', '2026-10-15', '2026-10-13'], 'week', '2026-10-05', range), ['2026-10-12'])
eq('outside the range is dropped', cleanTargets(['2040-01-01', '2026-10-08'], 'task', '2026-10-07', range), ['2026-10-08'])
const many = Array.from({ length: 400 }, (_, i) => `2027-${String(1 + Math.floor(i / 28) % 12).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`)
eq('at most a year of days', cleanTargets(many, 'task', '2026-10-07', range).length <= MAX_COPY_DAYS, true)
eq('tap a day on', toggleTarget(['2026-10-09'], '2026-10-08', 'task'), ['2026-10-08', '2026-10-09'])
eq('tap it off', toggleTarget(['2026-10-08', '2026-10-09'], '2026-10-08', 'task'), ['2026-10-09'])
eq('tap a week by any of its days', toggleTarget([], '2026-10-15', 'week'), ['2026-10-12'])
eq('a picked week shows all seven days', shownDays(['2026-10-12'], 'week').length, 7)
eq('a shortcut adds its days', toggleShortcut(['2026-10-20'], 'next_day', '2026-10-07', '2026-10-03'), ['2026-10-08', '2026-10-20'])
eq('and takes them away when on', toggleShortcut(['2026-10-08', '2026-10-20'], 'next_day', '2026-10-07', '2026-10-03'), ['2026-10-20'])
eq('an empty shortcut changes nothing', toggleShortcut(['2026-10-20'], 'weekdays', '2026-10-03', '2026-10-03'), ['2026-10-20'])

// One task.
const t = task()
eq('same notes', copyNote(t, '2026-10-08', null, DEFAULT_CHOICES, templates), t.notes)
eq('ticks cleared', copyNote(t, '2026-10-08', null, { ...DEFAULT_CHOICES, notes: 'cleared' }, templates), '- [ ] Chapter 1\n- [ ] Chapter 2')
eq('no notes', copyNote(t, '2026-10-08', null, { ...DEFAULT_CHOICES, notes: 'none' }, templates), null)
eq('a template, filled in', copyNote(t, '2026-10-08', '18:00', { ...DEFAULT_CHOICES, notes: 'template', templateId: 'meeting' }, templates),
  '## Read 30 min, 8 October 2026 at 18:00')
eq('an ask-after-done template leaves its marker', copyNote(t, '2026-10-08', null, { ...DEFAULT_CHOICES, notes: 'template', templateId: 'reading' }, templates),
  '{after-done:reading}')
eq('a template that is gone keeps the notes', copyNote(t, '2026-10-08', null, { ...DEFAULT_CHOICES, notes: 'template', templateId: 'gone' }, templates), t.notes)
eq('keep the time', copyTime(t, DEFAULT_CHOICES), '07:30')
eq('a new time', copyTime(t, { ...DEFAULT_CHOICES, time: 'new', newTime: '18:15' }), '18:15')
eq('a new time not given is none', copyTime(t, { ...DEFAULT_CHOICES, time: 'new', newTime: null }), null)
eq('no time', copyTime(t, { ...DEFAULT_CHOICES, time: 'none' }), null)
const f = copyTaskFields(task({ series_id: 's1', source: 'module', source_ref: 'r1' }), '2026-10-08', DEFAULT_CHOICES, templates)
eq('a copy is a fresh one-off (TSK-25)', [f.series_id, f.status, f.push_count, f.extension_count, f.needs_review, f.completed_at, f.source, f.source_ref],
  [null, 'todo', 0, 0, false, null, 'manual', null])
eq('a copy keeps section, minutes and lock', [f.category, f.duration_min, f.locked, f.planned_date, f.planned_time], ['Learning', 30, true, '2026-10-08', '07:30'])
const g = copyTaskFields(t, '2026-10-08', { ...DEFAULT_CHOICES, keepSection: false, keepMinutes: false, keepLocked: false })
eq('or leaves them', [g.category, g.module_key, g.duration_min, g.locked, g.fixed], [null, null, null, false, false])
eq('a copy has no id of its own yet', 'id' in f, false)

// A day.
const day = '2026-10-05'
const rows = [
  task({ id: 'a', title: 'Gym', planned_time: '18:00', sort_order: 0, status: 'todo', notes: null }),
  task({ id: 'b', title: 'Standup', series_id: 'work', planned_time: '09:00', sort_order: 1 }),
  task({ id: 'c', title: 'Breakfast: oats', source: 'meal', source_ref: 'm1' }),
  task({ id: 'd', title: 'Shopping (5 items)', source: 'shopping' }),
  task({ id: 'e', title: 'Old', deleted_at: '2026-10-01' }),
  task({ id: 'f', title: 'Dropped', status: 'dropped' }),
  task({ id: 'g', title: 'Call', planned_time: null, sort_order: 5 }),
  task({ id: 'h', title: 'Other day', planned_date: '2026-10-06' }),
]
eq('which tasks a day copy brings', rows.filter((r) => copiesWithDay(r, DEFAULT_CHOICES)).map((r) => r.id), ['a', 'g', 'h'])
eq('with repeats ticked', rows.filter((r) => copiesWithDay(r, { ...DEFAULT_CHOICES, repeats: true })).map((r) => r.id), ['a', 'b', 'g', 'h'])
eq('tasks off brings none', rows.filter((r) => copiesWithDay(r, { ...DEFAULT_CHOICES, tasks: false })).length, 0)
const slot = (over = {}) => ({ id: 'm1', profile_id: 'p', slot_date: day, slot: 'breakfast', recipe_id: 'r', portion_multiplier: 1.5,
  status: 'eaten', slot_time: '08:00', sort_order: 0, updated_at: '', deleted_at: null, ...over })
eq('a meal with a recipe has food', mealHasFood(slot()), true)
eq('a slot holding only a time has none', mealHasFood(slot({ recipe_id: null })), false)
eq('a quick meal has food', mealHasFood(slot({ recipe_id: null, label: 'Sandwich', kcal: 450 })), true)
eq('a single food has food', mealHasFood(slot({ recipe_id: null, food_id: 'f' })), true)
eq('two foods in one meal are one meal', mealCount([slot({ id: 'a', slot: 'lunch' }), slot({ id: 'b', slot: 'lunch', recipe_id: null, food_id: 'f' })]), 1)
eq('two meals, a time-only row not counted', mealCount([slot({ id: 'a', slot: 'lunch' }), slot({ id: 'b', slot: 'dinner' }), slot({ id: 'c', slot: 'breakfast', recipe_id: null })]), 2)
eq('the same meal on two days is two', mealCount([slot({ id: 'a', slot: 'lunch' }), slot({ id: 'b', slot: 'lunch', slot_date: '2026-10-09' })]), 2)
const mf = copyMealFields(slot({ unit: 'slice', unit_qty: 2 }), '2026-10-09')
eq('a copied meal is planned again, same portions and unit', [mf.slot_date, mf.status, mf.portion_multiplier, mf.recipe_id, mf.unit, mf.unit_qty, mf.slot_time],
  ['2026-10-09', 'planned', 1.5, 'r', 'slice', 2, '08:00'])
eq('no unit columns when the meal had none', 'unit' in copyMealFields(slot(), '2026-10-09'), false)

const meals = [slot(), slot({ id: 'm2', recipe_id: null }), slot({ id: 'm3', slot: 'dinner', slot_date: '2026-10-06' })]
const there = { '2026-10-07': [task({ id: 'x', series_id: 'work', sort_order: 4, planned_date: '2026-10-07' })] }
const plan = planCopy(dayPairs(day, ['2026-10-07', '2026-10-08']), { tasks: rows, meals }, { ...DEFAULT_CHOICES, repeats: true }, templates,
  (d) => there[d] ?? [])
eq('day copy: tasks per day, in the day\'s order', plan.tasks.map((x) => `${x.day}:${x.from.id}`),
  ['2026-10-07:a', '2026-10-07:g', '2026-10-08:b', '2026-10-08:a', '2026-10-08:g'])
eq('a repeat is not copied onto a day its series fills', plan.skippedRepeats, 1)
eq('copies go after what the day holds', plan.tasks.filter((x) => x.day === '2026-10-07').map((x) => x.fields.sort_order), [5, 6])
eq('day copy: the meals with food', plan.meals.map((x) => `${x.day}:${x.from.id}`), ['2026-10-07:m1', '2026-10-08:m1'])
eq('meals off', planCopy(dayPairs(day, ['2026-10-07']), { tasks: rows, meals }, { ...DEFAULT_CHOICES, meals: false }, templates).meals.length, 0)

// A week.
eq('week pairs map weekday to weekday', weekPairs('2026-10-05', ['2026-10-12', '2026-10-26'])[2],
  { from: '2026-10-07', to: ['2026-10-14', '2026-10-28'] })
const wk = planCopy(weekPairs('2026-10-05', ['2026-10-12']), { tasks: rows, meals }, DEFAULT_CHOICES, templates)
eq('week copy keeps each task on its weekday', wk.tasks.map((x) => `${x.from.id}:${x.day}`), ['a:2026-10-12', 'g:2026-10-12', 'h:2026-10-13'])
eq('week copy brings each day\'s meals', wk.meals.map((x) => `${x.from.id}:${x.day}`), ['m1:2026-10-12', 'm3:2026-10-13'])

// Words.
eq('one day', targetWords(['2026-10-06'], 'task'), 'Tue 6 Oct')
eq('several days', targetWords(['2026-10-06', '2026-10-07'], 'day'), '2 days')
eq('one week', targetWords(['2026-10-12'], 'week'), 'the week of 12 Oct')
eq('several weeks', targetWords(['2026-10-12', '2026-10-19'], 'week'), '2 weeks')
eq('summary', copySummary({ tasks: 3, meals: 2 }, ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], 'day'), 'Copied 3 tasks and 2 meals to 4 days')
eq('summary, one task', copySummary({ tasks: 1, meals: 0 }, ['2026-10-06'], 'task'), 'Copied 1 task to Tue 6 Oct')
eq('nothing', copySummary({ tasks: 0, meals: 0 }, ['2026-10-06'], 'day'), 'Nothing to copy')

if (fail) { console.log(`\n${fail} copy check(s) failed`); process.exit(1) }
console.log('\nall copy checks passed')
