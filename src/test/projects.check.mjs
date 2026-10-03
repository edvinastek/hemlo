// Checks Projects and goals: a project's progress and next task, the order
// of its tasks and milestones, a goal's progress from each kind of measure,
// days left, goal problems, and what the Year view lists.
import {
  taskProgress, nextTask, orderTasks, orderMilestones, nextMilestone, milestonesBetween, describeProgress, projectName,
  projectStatus, projectDue, goalProgress, daysLeft, goalProblems, orderGoals, yearGoals,
} from '../lib/projects-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const t = (id, status, day = null, x = {}) => ({ id, title: id, status, planned_date: day, ...x })

const tasks = [
  t('a', 'done', '2026-09-30'), t('b', 'todo', '2026-10-05', { planned_time: '09:00' }), t('c', 'todo', '2026-10-05', { planned_time: '08:00' }),
  t('d', 'todo', null, { sort_order: 2 }), t('e', 'dropped', '2026-10-01'), t('f', 'todo', '2026-10-02', { deleted_at: 'x' }), t('g', 'todo', null, { sort_order: 1 }),
]
eq('progress counts done of all, dropped and deleted left out', taskProgress(tasks), { done: 1, all: 5, share: 0.2 })
eq('no tasks: nothing to count', taskProgress([]), { done: 0, all: 0, share: null })
eq('next is the earliest dated by time', nextTask(tasks)?.id, 'c')
eq('with none dated, the first undated by order', nextTask(tasks.filter((x) => !x.planned_date))?.id, 'g')
eq('all done: no next', nextTask([t('a', 'done', '2026-10-01')]), null)
eq('the page order: open dated, open undated, then done', orderTasks(tasks).map((x) => x.id), ['c', 'b', 'g', 'd', 'a'])
eq('progress in words', describeProgress({ done: 3, all: 8 }), '3 of 8 tasks done')
eq('one task', describeProgress({ done: 0, all: 1 }), '0 of 1 task done')
eq('none yet', describeProgress({ done: 0, all: 0 }), 'No tasks yet')

const ms = [
  { id: 'm1', title: 'Launch', due_date: '2026-12-01', done: false },
  { id: 'm2', title: 'Draft', due_date: '2026-10-10', done: true },
  { id: 'm3', title: 'Someday', due_date: null, done: false },
  { id: 'm4', title: 'Gone', due_date: '2026-10-11', done: false, deleted_at: 'x' },
]
eq('milestones by date, undated last, deleted gone', orderMilestones(ms).map((m) => m.id), ['m2', 'm1', 'm3'])
eq('the next milestone not reached', nextMilestone(ms)?.id, 'm1')
eq('milestones in a range', milestonesBetween(ms, '2026-10-01', '2026-10-31').map((m) => m.id), ['m2'])

const p = (id, data) => ({ id, data })
eq('a project without a name says so', projectName(p('x', { name: '  ' })), 'Project without a name')
eq('a project without a status is active', projectStatus(p('x', {})), 'active')
eq('a due day must be a day', [projectDue(p('x', { due_date: '2026-11-01' })), projectDue(p('y', { due_date: 'soon' }))], ['2026-11-01', null])

// Goals.
const g = (x) => ({ id: 'g', title: 'Goal', status: 'active', start_date: null, end_date: null, measure_type: 'count', measure_target: null,
  measure_unit: null, measure_source: 'manual', measure_current: null, measure_start: null, ...x })
const none = { tasks: [], projects: [], milestones: [] }
eq('a number kept by hand', goalProgress(g({ measure_target: 20, measure_current: 7, measure_unit: 'books' }), none), { share: 0.35, text: '7 of 20 books' })
eq('no target: just how far', goalProgress(g({ measure_current: 3 }), none), { share: null, text: '3 so far' })
eq('past the target is full, not more', goalProgress(g({ measure_target: 10, measure_current: 12 }), none).share, 1)
eq('reached is full whatever the measure', goalProgress(g({ status: 'done', measure_source: 'linked' }), none), { share: 1, text: 'Reached' })
eq('linked with nothing linked', goalProgress(g({ measure_source: 'linked' }), none), { share: null, text: 'Nothing linked yet' })
eq('linked: tasks, a project part done, a milestone',
  goalProgress(g({ measure_source: 'linked' }), {
    tasks: [t('a', 'done'), t('b', 'todo'), t('c', 'dropped')],
    projects: [{ project: p('p1', { status: 'active' }), tasks: [t('x', 'done'), t('y', 'todo')] }, { project: p('p2', { status: 'done' }), tasks: [] }],
    milestones: [{ id: 'm', title: 'm', due_date: null, done: true }],
  }), { share: 0.7, text: '3 of 5 done' })
eq('weight: from the start towards the target', goalProgress(g({ measure_source: 'weight', measure_target: 78, measure_start: 86 }), { ...none, weight: 82 }),
  { share: 0.5, text: '82 kg, 4 kg to go' })
eq('weight: gaining towards a higher target', goalProgress(g({ measure_source: 'weight', measure_target: 75, measure_start: 70 }), { ...none, weight: 71 }).share, 0.2)
eq('weight with no weigh-in', goalProgress(g({ measure_source: 'weight', measure_target: 78 }), none), { share: null, text: 'Target 78 kg · no weigh-in yet' })
eq('done or not', goalProgress(g({ measure_type: 'boolean' }), none), { share: 0, text: 'Not reached yet' })

eq('days left', daysLeft('2026-10-13', '2026-10-03'), '10 days left')
eq('due today', daysLeft('2026-10-03', '2026-10-03'), 'due today')
eq('one day past', daysLeft('2026-10-02', '2026-10-03'), '1 day past')
eq('no date, nothing to say', daysLeft(null, '2026-10-03'), '')
eq('a goal needs a name', Object.keys(goalProblems({ title: ' ' })), ['title'])
eq('a target date before the start', Object.keys(goalProblems({ title: 'x', start_date: '2026-10-05', end_date: '2026-10-01' })), ['end_date'])
eq('a long unit', Object.keys(goalProblems({ title: 'x', measure_unit: 'x'.repeat(17) })), ['measure_unit'])
eq('goals: active by date, then paused, reached, dropped',
  orderGoals([g({ id: 'd', status: 'dropped', title: 'd' }), g({ id: 'a2', end_date: null, title: 'a2' }), g({ id: 'p', status: 'paused', title: 'p' }),
    g({ id: 'a1', end_date: '2026-12-01', title: 'a1' }), g({ id: 'r', status: 'done', title: 'r' })]).map((x) => x.id), ['a1', 'a2', 'p', 'r', 'd'])

// The Year view.
const goals = [
  g({ id: 'in', title: 'In the year', end_date: '2026-06-30' }),
  g({ id: 'span', title: 'Across years', start_date: '2025-06-01', end_date: '2027-03-01' }),
  g({ id: 'before', title: 'Last year', end_date: '2025-12-31' }),
  g({ id: 'open', title: 'Open, no dates' }),
  g({ id: 'drop', title: 'Dropped', status: 'dropped', end_date: '2026-05-01' }),
  g({ id: 'oldopen', title: 'Paused, no dates', status: 'paused' }),
]
const projects = [p('p1', { name: 'Dated', due_date: '2026-09-01' }), p('p2', { name: 'Undated' }), p('p3', { name: 'Next year', due_date: '2027-01-02' })]
eq('the year lists its goals and dated projects, by date',
  yearGoals(goals, projects, 2026, true).map((x) => `${x.kind}:${x.id}`), ['goal:in', 'project:p1', 'goal:span', 'goal:open'])
eq('dated projects only while Projects and its rule are on', yearGoals(goals, projects, 2026, false).map((x) => x.id), ['in', 'span', 'open'])

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall projects checks passed')
