import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { saveTask, setTaskDone } from '../lib/tasks'
import {
  deleteGoal, linkHabit, linkProject, linkTask, restoreGoal, saveGoal, setGoalCurrent, setGoalStatus,
  toggleMilestone, useGoalLinks, useGoalProgress, useGoals, useProjects,
} from '../lib/projects'
import { daysLeft, goalProblems, orderGoals, orderMilestones, projectName, taskProgress, describeProgress, type GoalProgress } from '../lib/projects-rules'
import type { Goal } from '../lib/types'
import type { Milestone } from '../lib/projects-types'
import { blankTask } from '../lib/tasks'
import { Dropdown } from '../ui/Dropdown'
import { offerUndo } from '../ui/Undo'
import { DeleteButton, Sheet, localToday, useSearch } from './ModuleKit'
import { MilestoneSheet } from './Projects'

const short = (d: string) => format(parseISO(d), 'd MMM yyyy')
const STATUS: { value: Goal['status']; label: string }[] = [
  { value: 'active', label: 'Working on it' }, { value: 'paused', label: 'Paused' }, { value: 'done', label: 'Reached' }, { value: 'dropped', label: 'Dropped' },
]
const statusLabel = (s: string) => STATUS.find((x) => x.value === s)?.label ?? s

/** Goals (PRJ-06, GEN-36): what the person is working towards, by a date,
 *  with a measure; projects, tasks, habits and milestones link to them.
 *  The Year view lists them (loadYearGoals in lib/projects.ts). */
export function Goals({ profileId }: { profileId: string }) {
  const goals = useGoals(profileId)
  const progress = useGoalProgress(profileId, goals)
  const [params, setParams] = useSearch()
  const openId = params.get('goal')
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const today = localToday()
  if (!goals || !progress) return null
  const open = goals.find((g) => g.id === openId)
  if (openId && open) return <GoalPage profileId={profileId} goal={open} progress={progress.get(open.id)} onClose={() => setParams({ goal: null })} />

  const list = orderGoals(goals)
  return (
    <>
      {list.length === 0 ? (
        <p className="empty">A goal is what you are working towards, by a date: run 10 km, read 20 books, finish the course, reach 78 kg.
          Link projects, tasks and habits to it and its progress follows them. Tap the round + button to set one.</p>
      ) : (
        <ul className="kit-list" aria-label="Goals">
          {list.map((g) => {
            const pr = progress.get(g.id)
            return (
              <li key={g.id} className="kit-row prj-row">
                <button type="button" className="kit-open" onClick={() => setParams({ goal: g.id })}>
                  <span className="row-name">{g.title}</span>
                  <span className="row-meta">{[g.status !== 'active' ? statusLabel(g.status) : null, g.end_date ? `by ${short(g.end_date)}` : null,
                    g.status === 'active' ? daysLeft(g.end_date, today) : null].filter(Boolean).join(' · ') || 'No date'}</span>
                  <span className="prj-progress">
                    <span className={`kit-bar${pr?.share === 1 ? ' is-done' : ''}`} aria-hidden><span style={{ width: `${(pr?.share ?? 0) * 100}%` }} /></span>
                    <span className="row-meta">{pr?.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New goal" onClick={() => setEditing('new')}>+</button>
      {editing && <GoalSheet profileId={profileId} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GoalPage({ profileId, goal, progress, onClose }: { profileId: string; goal: Goal; progress: GoalProgress | undefined; onClose: () => void }) {
  const links = useGoalLinks(profileId, goal.id)
  const projects = useProjects(profileId)
  const habits = useLiveQuery(async () => (await db.habit.where('profile_id').equals(profileId).toArray()).filter((h) => !h.deleted_at && h.active), [profileId])
  const habitsOn = useLiveQuery(async () => !!(await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'habits').first())?.enabled, [profileId])
  const [editing, setEditing] = useState(false)
  const [milestone, setMilestone] = useState<Milestone | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const today = localToday()
  if (!links || !projects || !habits) return null

  const manual = (goal.measure_source ?? 'manual') === 'manual' && goal.measure_type !== 'boolean'
  const step = (by: number) => setGoalCurrent(goal, Math.max(0, Math.round(((goal.measure_current ?? 0) + by) * 100) / 100))

  async function addTask(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const t = blankTask(profileId, day || '', { title: title.trim().slice(0, 200), goal_id: goal.id })
    await saveTask({ ...t, planned_date: day || null })
    setTitle('')
  }
  const unlinked = projects.filter((p) => !links.projects.some((x) => x.project.id === p.id))
  const freeHabits = habits.filter((h) => !links.habits.some((x) => x.id === h.id))

  return (
    <div className="prj-page">
      <header className="trn-session-head">
        <button type="button" className="btn" onClick={onClose}>‹ Goals</button>
        <div className="trn-session-title">
          <h2>{goal.title}</h2>
          <p className="row-meta">{[statusLabel(goal.status), goal.end_date ? `by ${short(goal.end_date)}` : null,
            goal.status === 'active' ? daysLeft(goal.end_date, today) : null].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="kit-toolbar">
        <button type="button" className="btn" onClick={() => setEditing(true)}>Edit goal</button>
        {goal.status !== 'done'
          ? <button type="button" className="btn" onClick={() => void setGoalStatus(goal, 'done')}>Mark reached</button>
          : <button type="button" className="btn" onClick={() => void setGoalStatus(goal, 'active')}>Not reached after all</button>}
      </div>
      <div className="prj-progress is-big">
        <span className={`kit-bar${progress?.share === 1 ? ' is-done' : ''}`} aria-hidden><span style={{ width: `${(progress?.share ?? 0) * 100}%` }} /></span>
        <span className="row-meta">{progress?.text}{progress?.share != null ? ` (${Math.round(progress.share * 100)}%)` : ''}</span>
      </div>
      {manual && goal.status !== 'done' && (
        <div className="kit-toolbar">
          <span className="kit-step">
            <button type="button" aria-label="One less" onClick={() => void step(-1)}>−</button>
            <span className="kit-num prj-current">{goal.measure_current ?? 0}{goal.measure_unit ? ` ${goal.measure_unit}` : ''}</span>
            <button type="button" aria-label="One more" onClick={() => void step(1)}>+</button>
          </span>
        </div>
      )}
      {goal.note && <p className="trn-session-note">{goal.note}</p>}

      <h2 className="section-title">Projects</h2>
      {links.projects.length === 0 && <p className="kit-note">No project linked.</p>}
      <ul className="kit-list">
        {links.projects.map(({ project, tasks }) => (
          <li key={project.id} className="kit-row">
            <div className="kit-open"><span className="row-name">{projectName(project)}</span><span className="row-meta">{describeProgress(taskProgress(tasks))}</span></div>
            <button type="button" className="btn" onClick={() => { void linkProject(project.id, null); offerUndo(`${projectName(project)} unlinked`, () => linkProject(project.id, goal.id)) }}>Unlink</button>
          </li>
        ))}
      </ul>
      {unlinked.length > 0 && (
        <div className="kit-toolbar">
          <div className="grow"><Dropdown label="Link a project" placeholder="Link a project" value={null}
            options={unlinked.map((p) => ({ value: p.id, label: projectName(p) }))} onChange={(id) => void linkProject(id, goal.id)} /></div>
        </div>
      )}

      <h2 className="section-title">Tasks</h2>
      <form className="prj-add" onSubmit={(e) => void addTask(e)} aria-label="Add a task towards this goal">
        <input value={title} maxLength={200} placeholder="Add a task" aria-label="New task" onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={day} aria-label="Day (none puts it in the Inbox)" onChange={(e) => setDay(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Add</button>
      </form>
      <ul className="kit-list">
        {links.tasks.filter((t) => t.status !== 'dropped').map((t) => (
          <li key={t.id} className={`kit-row prj-task${t.status === 'done' ? ' is-done' : ''}`}>
            <div className="prj-task-main">
              <button type="button" className="trn-tick" aria-pressed={t.status === 'done'} aria-label={`${t.title}: ${t.status === 'done' ? 'done, untick' : 'mark done'}`}
                onClick={() => void setTaskDone(t, t.status !== 'done')}>✓</button>
              <div className="kit-open"><span className="row-name">{t.title}</span><span className="row-meta">{t.planned_date ? short(t.planned_date) : 'No day'}</span></div>
            </div>
            <button type="button" className="btn" onClick={() => { void linkTask(t, null); offerUndo(`${t.title} unlinked`, () => linkTask(t, goal.id)) }}>Unlink</button>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Milestones</h2>
      <ul className="kit-list">
        {orderMilestones(links.milestones).map((m) => (
          <li key={m.id} className={`kit-row prj-task${m.done ? ' is-done' : ''}`}>
            <div className="prj-task-main">
              <button type="button" className="trn-tick" aria-pressed={m.done} aria-label={`${m.title}: ${m.done ? 'reached, untick' : 'mark reached'}`} onClick={() => void toggleMilestone(m)}>✓</button>
              <button type="button" className="kit-open" onClick={() => setMilestone(m)}><span className="row-name">{m.title}</span><span className="row-meta">{m.due_date ? short(m.due_date) : 'No date'}</span></button>
            </div>
          </li>
        ))}
      </ul>
      <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setMilestone('new')}>Add a milestone</button></div>

      {(habitsOn || links.habits.length > 0) && (
        <>
          <h2 className="section-title">Habits</h2>
          <ul className="kit-list">
            {links.habits.map((h) => (
              <li key={h.id} className="kit-row">
                <span className="row-name">{h.name}</span>
                <button type="button" className="btn" onClick={() => { void linkHabit(h.id, null); offerUndo(`${h.name} unlinked`, () => linkHabit(h.id, goal.id)) }}>Unlink</button>
              </li>
            ))}
          </ul>
          {habitsOn && freeHabits.length > 0 && (
            <div className="kit-toolbar">
              <div className="grow"><Dropdown label="Link a habit" placeholder="Link a habit" value={null}
                options={freeHabits.map((h) => ({ value: h.id, label: h.name }))} onChange={(id) => void linkHabit(id, goal.id)} /></div>
            </div>
          )}
        </>
      )}
      {links.routines.length > 0 && (
        <>
          <h2 className="section-title">Training routines</h2>
          <ul className="kit-list">{links.routines.map((r) => <li key={r.id} className="kit-row"><span className="row-name">{r.name}</span></li>)}</ul>
        </>
      )}
      <div className="kit-gap" />
      {editing && <GoalSheet profileId={profileId} goal={goal} onClose={() => setEditing(false)} onDeleted={onClose} />}
      {milestone && <MilestoneSheet profileId={profileId} milestone={milestone === 'new' ? null : milestone} projectId={null} goalId={goal.id} onClose={() => setMilestone(null)} />}
    </div>
  )
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')))

function GoalSheet({ profileId, goal, onClose, onDeleted }: { profileId: string; goal: Goal | null; onClose: () => void; onDeleted?: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [start, setStart] = useState(goal?.start_date ?? '')
  const [end, setEnd] = useState(goal?.end_date ?? '')
  const [source, setSource] = useState<NonNullable<Goal['measure_source']> | 'boolean'>(goal?.measure_type === 'boolean' ? 'boolean' : goal?.measure_source ?? 'manual')
  const [target, setTarget] = useState(goal?.measure_target != null ? String(goal.measure_target) : '')
  const [unit, setUnit] = useState(goal?.measure_unit ?? '')
  const [current, setCurrent] = useState(goal?.measure_current != null ? String(goal.measure_current) : '')
  const [from, setFrom] = useState(goal?.measure_start != null ? String(goal.measure_start) : '')
  const [status, setStatus] = useState<Goal['status']>(goal?.status ?? 'active')
  const [note, setNote] = useState(goal?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const draft = {
      title, start_date: start || null, end_date: end || null, status, note: note.trim() || null,
      measure_source: source === 'boolean' ? 'manual' as const : source,
      measure_type: source === 'boolean' ? 'boolean' as const : source === 'weight' ? 'weight' as const : (goal?.measure_type && goal.measure_type !== 'boolean' && goal.measure_type !== 'weight' ? goal.measure_type : 'count' as const),
      measure_target: source === 'manual' || source === 'weight' ? num(target) : null,
      measure_unit: source === 'manual' ? unit.trim() || null : source === 'weight' ? 'kg' : null,
      measure_current: source === 'manual' ? num(current) : null,
      measure_start: source === 'weight' ? num(from) : null,
    }
    const problems = goalProblems(draft)
    if (Object.keys(problems).length) return setError(Object.values(problems)[0])
    setBusy(true)
    await saveGoal(profileId, goal, draft)
    onClose()
  }
  async function remove() {
    if (!goal) return
    setBusy(true)
    await deleteGoal(goal)
    offerUndo(`${goal.title} deleted`, () => restoreGoal(goal))
    onClose()
    onDeleted?.()
  }

  return (
    <Sheet title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {goal && <DeleteButton onDelete={() => void remove()} disabled={busy} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        <label>Goal<input value={title} maxLength={120} autoFocus={!goal} placeholder="Run 10 km, read 20 books" onChange={(e) => { setTitle(e.target.value); setError(null) }} /></label>
        <div className="two">
          <label>From<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>By<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label>Measured by
          <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="manual">A number I keep (books read, km run)</option>
            <option value="linked">The projects, tasks and milestones linked to it</option>
            <option value="weight">My body weight</option>
            <option value="boolean">Reached or not</option>
          </select>
        </label>
        {source === 'manual' && (
          <div className="two">
            <label>Target<input inputMode="decimal" value={target} placeholder="20" onChange={(e) => setTarget(e.target.value)} /></label>
            <label>Unit<input value={unit} maxLength={16} placeholder="books" onChange={(e) => setUnit(e.target.value)} /></label>
            <label>So far<input inputMode="decimal" value={current} placeholder="0" onChange={(e) => setCurrent(e.target.value)} /></label>
          </div>
        )}
        {source === 'weight' && (
          <div className="two">
            <label>Target weight, kg<input inputMode="decimal" value={target} placeholder="78" onChange={(e) => setTarget(e.target.value)} /></label>
            <label>Starting weight, kg<input inputMode="decimal" value={from} placeholder="From the trend" onChange={(e) => setFrom(e.target.value)} /></label>
          </div>
        )}
        {source === 'linked' && <p className="kit-hint">Link projects, tasks, milestones and habits on the goal's page; each one done moves it on.</p>}
        {goal && (
          <label>Where it stands
            <select value={status} onChange={(e) => setStatus(e.target.value as Goal['status'])}>
              {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label>Note<textarea value={note} maxLength={4000} placeholder="Why it matters, how you will get there" onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
