import { useMemo, useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { useModuleDef } from '../modules/defs'
import { useLookups, type Rec } from '../modules/records'
import { RecordSheet } from '../modules/RecordSheet'
import { saveTask, setTaskDone } from '../lib/tasks'
import {
  addProjectTask, createFromTemplate, deleteMilestone, deleteProjectTemplate, deleteTask, restoreMilestone, saveMilestone, saveProjectTemplate,
  setTaskProject, toggleMilestone, undoFromTemplate, useGoals, useMilestones, useProjectTasks, useProjectTemplates, useProjects,
} from '../lib/projects'
import {
  allTemplates, describeProgress, describeTemplate, fromTemplate, nextMilestone, nextTask, orderMilestones, orderTasks, projectDue, projectGoal,
  projectName, projectStatus, taskProgress, templateFromProject, type ProjectTemplate,
} from '../lib/projects-rules'
import type { ModuleRecord, Task } from '../lib/types'
import type { Milestone } from '../lib/projects-types'
import { search } from '../lib/search-rules'
import { TaskSheet } from '../ui/TaskSheet'
import { offerUndo } from '../ui/Undo'
import { DefView, DeleteButton, ModuleTabs, Sheet, defTabs, localToday, useSearch, useTab } from './ModuleKit'
import { ModuleMenu, QuietAdd, useHideModuleHead } from '../modules/ModuleHead'
import { MoreMenu } from '../ui/MoreMenu'
import { Goals } from './Goals'
import './projects.css'

const short = (d: string) => format(parseISO(d), 'EEE d MMM')
const STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', done: 'Done' }
const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1)

/** The Projects page: projects with their tasks, progress and next task
 *  (PRJ-02), milestones (PRJ-03), a board by status (PRJ-04), goals
 *  (PRJ-06), and the module's own views. A project opens in place. v19:
 *  "New from template…" in the ⋮ and "Save as template" in a project's ⋮
 *  (PRJ-05). */
export function Projects({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('projects')
  const [params, setParams] = useSearch()
  const projectId = params.get('project')
  const goalId = params.get('goal')
  const tabs = [{ key: 'overview', name: 'Overview' }, { key: 'goals', name: 'Goals' }]
  // The table and the board are under ⋮ → Views (CALM-05).
  const views = defTabs(def, ['cards'])
  const [tab, setTab] = useTab('projects', [...tabs, ...views])
  // One project or one goal is a page of its own, with its own way back.
  useHideModuleHead(!!(projectId && def) || !!goalId)

  const [templates, setTemplates] = useState(false)
  if (projectId && def) return <ProjectPage profileId={profileId} projectId={projectId} onClose={() => setParams({ project: null })} />
  // A goal opened from elsewhere (the Year view) lands on the Goals tab.
  const active = goalId ? 'goals' : tab
  return (
    <>
      <ModuleMenu views={views} active={active} onView={setTab} items={[{ label: 'New from template…', onSelect: () => setTemplates(true) }]} />
      {templates && <TemplateSheet profileId={profileId} onClose={() => setTemplates(false)} onMade={(id) => { setTemplates(false); setParams({ project: id }) }} />}
      {!goalId && <ModuleTabs tabs={tabs} active={active} onTab={setTab} />}
      {active === 'overview' && <Overview profileId={profileId} onOpen={(id) => setParams({ project: id })} />}
      {active === 'goals' && <Goals profileId={profileId} />}
      {active.startsWith('view:') && def && <DefView def={def} viewKey={active.slice(5)} profileId={profileId} onClose={() => setTab('overview')} />}
    </>
  )
}

function Overview({ profileId, onOpen }: { profileId: string; onOpen: (id: string) => void }) {
  const def = useModuleDef('projects')
  const projects = useProjects(profileId)
  const tasks = useProjectTasks(profileId)
  const milestones = useMilestones(profileId)
  const goals = useGoals(profileId)
  const entity = def?.entities.find((e) => e.name === 'project')
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const goalTitle = new Map((goals ?? []).map((g) => [g.id, g.title]))

  const list = useMemo(() => search((projects ?? []).map((p) => ({ ...p, name: projectName(p), extra: String(p.data.status ?? '') })), query), [projects, query])
  if (!projects || !tasks || !milestones || !def || !entity) return null
  const open = list.filter((p) => projectStatus(p) !== 'done')
  const done = list.filter((p) => projectStatus(p) === 'done')

  const row = (p: ModuleRecord) => {
    const ts = tasks.get(p.id) ?? []
    const prog = taskProgress(ts)
    const next = nextTask(ts)
    const ms = nextMilestone(milestones.filter((m) => m.project_id === p.id))
    const due = projectDue(p)
    const goal = projectGoal(p)
    return (
      <li key={p.id} className="kit-row prj-row">
        <button type="button" className="kit-open" onClick={() => onOpen(p.id)}>
          <span className="row-name">{projectName(p)}</span>
          <span className="row-meta">{[statusLabel(projectStatus(p)), due ? `due ${short(due)}` : null, goal ? `goal: ${goalTitle.get(goal) ?? '—'}` : null].filter(Boolean).join(' · ')}</span>
          {prog.all > 0 && (
            <span className="prj-progress">
              <span className={`kit-bar${prog.share === 1 ? ' is-done' : ''}`} aria-hidden><span style={{ width: `${(prog.share ?? 0) * 100}%` }} /></span>
              <span className="row-meta">{describeProgress(prog)}</span>
            </span>
          )}
          {(next || ms) && (
            <span className="row-meta">{[next ? `Next: ${next.title}${next.planned_date ? ` (${short(next.planned_date)})` : ''}` : null,
              ms ? `Milestone: ${ms.title}${ms.due_date ? ` (${short(ms.due_date)})` : ''}` : null].filter(Boolean).join(' · ')}</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <>
      {projects.length > 6 && (
        <div className="kit-toolbar">
          <input className="kit-search grow" type="search" value={query} placeholder="Search projects" aria-label="Search projects" onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {projects.length === 0 ? (
        <p className="empty">A project gathers the tasks towards one result. Tap the round + button to start one.</p>
      ) : (
        <>
          <ul className="kit-list" aria-label="Projects">{open.map(row)}</ul>
          {open.length === 0 && <p className="kit-note">{query ? 'No open project matches.' : 'Every project is done.'}</p>}
          {done.length > 0 && (
            <>
              <div className="kit-toolbar">
                <button type="button" className="btn" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                  {showDone ? 'Hide' : 'Show'} {done.length} done {done.length === 1 ? 'project' : 'projects'}
                </button>
              </div>
              {showDone && <ul className="kit-list" aria-label="Done projects">{done.map(row)}</ul>}
            </>
          )}
        </>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New project" onClick={() => setAdding(true)}>+</button>
      {adding && <RecordSheet def={def} entity={entity} profileId={profileId} lookups={lookups} onClose={() => setAdding(false)} />}
    </>
  )
}

/* ---------- one project ------------------------------------------------------- */

function ProjectPage({ profileId, projectId, onClose }: { profileId: string; projectId: string; onClose: () => void }) {
  const def = useModuleDef('projects')
  const projects = useProjects(profileId)
  const tasksBy = useProjectTasks(profileId)
  const milestones = useMilestones(profileId)
  const goals = useGoals(profileId)
  const entity = def?.entities.find((e) => e.name === 'project')
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [editing, setEditing] = useState(false)
  const [task, setTask] = useState<Task | null>(null)
  const [milestone, setMilestone] = useState<Milestone | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const today = localToday()

  if (!projects || !tasksBy || !milestones || !def || !entity) return null
  const p = projects.find((x) => x.id === projectId)
  if (!p) {
    return (
      <>
        <p className="empty">This project is no longer here. It may have been deleted on another device.</p>
        <div className="kit-toolbar"><button type="button" className="btn" onClick={onClose}>‹ Projects</button></div>
      </>
    )
  }
  const ts = orderTasks(tasksBy.get(p.id) ?? [])
  const prog = taskProgress(ts)
  const ms = orderMilestones(milestones.filter((m) => m.project_id === p.id))
  const due = projectDue(p)
  const goal = (goals ?? []).find((g) => g.id === projectGoal(p))
  const rec: Rec = { id: p.id, entity: 'project', values: { ...p.data }, date: p.record_date, row: p as unknown as Rec['row'] }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addProjectTask(profileId, p!.id, title, day || null)
    setTitle('')
  }
  async function remove(t: Task) {
    setMenu(null)
    await deleteTask(t)
    offerUndo(`${t.title} deleted`, () => saveTask({ ...t, deleted_at: null }, ['deleted_at']))
  }
  // The project's tasks and milestones, days counted from its start (PRJ-05).
  async function saveAsTemplate() {
    const tpl = templateFromProject(crypto.randomUUID(), projectName(p!), p!, tasksBy!.get(p!.id) ?? [], ms, today)
    await saveProjectTemplate(profileId, tpl)
    offerUndo(`"${tpl.name}" saved as a template`, () => deleteProjectTemplate(profileId, tpl.id))
  }
  async function takeOut(t: Task) {
    setMenu(null)
    await setTaskProject(t, null)
    offerUndo(`${t.title} taken out of the project`, () => setTaskProject(t, p!.id))
  }

  return (
    <div className="prj-page">
      <header className="trn-session-head">
        <button type="button" className="btn" onClick={onClose}>‹ Projects</button>
        <div className="trn-session-title">
          <h2>{projectName(p)}</h2>
          <p className="row-meta">{[statusLabel(projectStatus(p)), due ? `due ${short(due)}` : null, goal ? `towards ${goal.title}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <MoreMenu className="prj-menu" label={`More for ${projectName(p)}`} items={[
          { label: 'Edit project', onSelect: () => setEditing(true) },
          { label: 'Save as template', onSelect: () => void saveAsTemplate() },
        ]} />
      </header>
      {prog.all > 0 && (
        <div className="prj-progress is-big">
          <span className={`kit-bar${prog.share === 1 ? ' is-done' : ''}`} aria-hidden><span style={{ width: `${(prog.share ?? 0) * 100}%` }} /></span>
          <span className="row-meta">{describeProgress(prog)}{prog.share != null ? ` (${Math.round(prog.share * 100)}%)` : ''}</span>
        </div>
      )}

      <h2 className="section-title">Tasks</h2>
      <form className="prj-add" onSubmit={(e) => void add(e)} aria-label="Add a task to this project">
        <input value={title} maxLength={200} placeholder="Add a task" aria-label="New task" onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={day} aria-label="Day (none puts it in the Inbox)" onChange={(e) => setDay(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Add</button>
      </form>
      {ts.length === 0 ? null : (
        <ul className="kit-list" aria-label="Tasks of this project">
          {ts.map((t) => (
            <li key={t.id} className={`kit-row prj-task${t.status === 'done' ? ' is-done' : ''}`}>
              <div className="prj-task-main">
                <button type="button" className="trn-tick" aria-pressed={t.status === 'done'} aria-label={`${t.title}: ${t.status === 'done' ? 'done, untick' : 'mark done'}`}
                  onClick={() => void setTaskDone(t, t.status !== 'done')}>✓</button>
                <button type="button" className="kit-open" onClick={() => setTask(t)}>
                  <span className="row-name">{t.title}</span>
                  <span className={`row-meta${t.status !== 'done' && t.planned_date && t.planned_date < today ? ' kit-warn' : ''}`}>
                    {t.planned_date ? `${short(t.planned_date)}${t.planned_time ? ` at ${t.planned_time.slice(0, 5)}` : ''}` : 'No day (in the Inbox)'}
                    {t.status !== 'done' && t.planned_date && t.planned_date < today ? ' · overdue' : ''}
                  </span>
                </button>
              </div>
              <div className="kit-more">
                <button type="button" className="kit-dots" aria-label={`More for ${t.title}`} aria-expanded={menu === t.id} onClick={() => setMenu(menu === t.id ? null : t.id)}>⋮</button>
                {menu === t.id && (
                  <ul className="kit-menu">
                    <li><button type="button" onClick={() => { setMenu(null); setTask(t) }}>Open</button></li>
                    <li><button type="button" onClick={() => void takeOut(t)}>Take out of the project</button></li>
                    <li><button type="button" onClick={() => void remove(t)}>Delete</button></li>
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {ms.length > 0 && <h2 className="section-title">Milestones</h2>}
      {ms.length > 0 && <ul className="kit-list" aria-label="Milestones">
        {ms.map((m) => (
          <li key={m.id} className={`kit-row prj-task${m.done ? ' is-done' : ''}`}>
            <div className="prj-task-main">
              <button type="button" className="trn-tick" aria-pressed={m.done} aria-label={`${m.title}: ${m.done ? 'reached, untick' : 'mark reached'}`}
                onClick={() => void toggleMilestone(m)}>✓</button>
              <button type="button" className="kit-open" onClick={() => setMilestone(m)}>
                <span className="row-name">{m.title}</span>
                <span className="row-meta">{m.due_date ? short(m.due_date) : 'No date'}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>}
      <QuietAdd label="Add a milestone" onClick={() => setMilestone('new')} />
      <div className="kit-gap" />

      {editing && (
        <RecordSheet def={def} entity={entity} profileId={profileId} rec={rec} lookups={lookups}
          onClose={() => { setEditing(false) }} />
      )}
      {task && <TaskSheet task={task} isNew={false} onClose={() => setTask(null)} />}
      {milestone && (
        <MilestoneSheet profileId={profileId} milestone={milestone === 'new' ? null : milestone} projectId={p.id} goalId={null}
          onClose={() => setMilestone(null)} />
      )}
    </div>
  )
}

export function MilestoneSheet({ profileId, milestone, projectId, goalId, onClose }: {
  profileId: string; milestone: Milestone | null; projectId: string | null; goalId: string | null; onClose: () => void
}) {
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [due, setDue] = useState(milestone?.due_date ?? '')
  const [note, setNote] = useState(milestone?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!title.trim()) return setError('Give the milestone a name.')
    setBusy(true)
    await saveMilestone(profileId, milestone, { title, due_date: due || null, note,
      project_id: milestone ? milestone.project_id : projectId, goal_id: milestone ? milestone.goal_id : goalId })
    onClose()
  }
  async function remove() {
    if (!milestone) return
    await deleteMilestone(milestone)
    offerUndo(`${milestone.title} deleted`, () => restoreMilestone(milestone))
    onClose()
  }
  return (
    <Sheet title={milestone ? 'Change milestone' : 'New milestone'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {milestone && <DeleteButton onDelete={() => void remove()} disabled={busy} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        <label>Milestone<input value={title} maxLength={120} autoFocus={!milestone} placeholder="First draft sent" onChange={(e) => { setTitle(e.target.value); setError(null) }} /></label>
        <label>Day<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label>Note<textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- new from template (PRJ-05) --------------------------------------------- */

/** Pick a template, then the start day: every task and milestone moves with
 *  it. One sheet, two steps (never a sheet on a sheet). */
function TemplateSheet({ profileId, onClose, onMade }: { profileId: string; onClose: () => void; onMade: (projectId: string) => void }) {
  const own = useProjectTemplates(profileId)
  const [pick, setPick] = useState<ProjectTemplate | null>(null)
  const [name, setName] = useState('')
  const [start, setStart] = useState(localToday())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!own) return null
  const list = allTemplates(own)

  if (!pick) {
    return (
      <Sheet title="New from template" onClose={onClose} actions={<button type="button" className="btn grow" onClick={onClose}>Cancel</button>}>
        <ul className="kit-list prj-templates" aria-label="Templates">
          {list.map((tpl) => (
            <li key={tpl.id} className="kit-row">
              <button type="button" className="kit-open" onClick={() => { setPick(tpl); setName(tpl.name) }}>
                <span className="row-name">{tpl.name}</span>
                <span className="row-meta">{describeTemplate(tpl)}{tpl.builtin ? '' : ' · yours'}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    )
  }

  const made = /^\d{4}-\d{2}-\d{2}$/.test(start) ? fromTemplate(pick, start, name) : null
  async function make() {
    if (!made) return setError('Pick the day it starts.')
    setBusy(true)
    const done = await createFromTemplate(profileId, made)
    offerUndo(`"${made.project.name}" made from a template`, () => undoFromTemplate(done))
    onMade(done.project.id)
  }
  async function remove() {
    const tpl = pick!
    await deleteProjectTemplate(profileId, tpl.id)
    offerUndo(`Template "${tpl.name}" deleted`, () => saveProjectTemplate(profileId, tpl))
    setPick(null)
  }
  return (
    <Sheet title={pick.name} onClose={onClose} onSubmit={() => void make()}
      actions={<>
        {!pick.builtin && <DeleteButton label="Delete template" onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={() => setPick(null)}>Back</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Make it</button>
      </>}>
      <div className="form-grid">
        <label>Project<input value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(null) }} /></label>
        <label>Starts<input type="date" value={start} autoFocus onChange={(e) => { setStart(e.target.value); setError(null) }} /></label>
        {made && <p className="kit-hint">{[describeTemplate(pick).split(' · ').slice(0, 2).join(' · '), made.project.due_date ? `due ${short(made.project.due_date)}` : null].filter(Boolean).join(' · ')}</p>}
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
