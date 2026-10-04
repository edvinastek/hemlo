import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { blankTask, deleteTask, saveTask } from './tasks'
import type { Goal, ModuleRecord, Task } from './types'
import type { Milestone } from './projects-types'
import {
  goalProgress, milestonesBetween, projectGoal, readTemplates, yearGoals, type FromTemplate, type GoalProgress, type ProjectTemplate,
} from './projects-rules'
import { queueChange } from './sync'
import { trendLine } from './trend-rules'
import { builtinRuleOn } from '../modules/rule-switch'
import { ensureInstance, instanceFor } from '../modules/defs'

/** Projects and goals on the device. A project is a Projects record (kept in
 *  module_record, so its fields can be shaped in Edit module); its tasks
 *  are ordinary tasks that carry its id; milestones and goals have tables of
 *  their own. The arithmetic is in projects-rules.ts. */

const now = () => new Date().toISOString()
const isOn = async (profileId: string) => !!(await instanceFor(profileId, 'projects'))?.enabled

/* ---------- projects ------------------------------------------------------- */

export async function loadProjects(profileId: string): Promise<ModuleRecord[]> {
  return (await db.module_record.where('[profile_id+module_key]').equals([profileId, 'projects']).toArray())
    .filter((r) => !r.deleted_at && r.entity === 'project')
}

export function useProjects(profileId: string | null | undefined): ModuleRecord[] | undefined {
  return useLiveQuery(async () => (profileId ? loadProjects(profileId) : []), [profileId])
}

/** Every task that belongs to a project, by project. */
export function useProjectTasks(profileId: string | null | undefined): Map<string, Task[]> | undefined {
  return useLiveQuery(async () => {
    const m = new Map<string, Task[]>()
    if (!profileId) return m
    const rows = await db.task.where('profile_id').equals(profileId).filter((t) => !!t.project_id && !t.deleted_at).toArray()
    for (const t of rows) m.set(t.project_id!, [...(m.get(t.project_id!) ?? []), t])
    return m
  }, [profileId])
}

/** A new task in a project, on a day or in the Inbox. It counts as a
 *  Projects task, so it follows Projects' "Show on Today / Plan" switches. */
export async function addProjectTask(profileId: string, projectId: string, title: string, day: string | null, goalId: string | null = null): Promise<Task> {
  const t = blankTask(profileId, day ?? '', { title: title.trim().slice(0, 200), project_id: projectId, module_key: 'projects', goal_id: goalId })
  return saveTask({ ...t, planned_date: day }, undefined)
}

/** Put a task in a project, or take it out (null). */
export async function setTaskProject(task: Task, projectId: string | null): Promise<Task> {
  return saveTask({ ...task, project_id: projectId }, ['project_id'])
}

export { deleteTask }

/* ---------- milestones ------------------------------------------------------- */

const writeMilestone = (row: Milestone, changes: Partial<Milestone>) => edit('milestone' as never, row as never, changes as never) as unknown as Promise<Milestone>

export function useMilestones(profileId: string | null | undefined): Milestone[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.milestone.where('profile_id').equals(profileId).toArray()).filter((m) => !m.deleted_at)
    : [], [profileId])
}

export interface MilestoneDraft { title: string; due_date: string | null; project_id: string | null; goal_id: string | null; note: string | null }

export async function saveMilestone(profileId: string, existing: Milestone | null, d: MilestoneDraft): Promise<Milestone> {
  const fields: Partial<Milestone> = {
    profile_id: profileId, title: d.title.trim().slice(0, 120), due_date: d.due_date, project_id: d.project_id, goal_id: d.goal_id,
    note: d.note?.trim() || null, deleted_at: null,
  }
  if (existing) return writeMilestone(existing, fields)
  const row = { id: crypto.randomUUID(), done: false, sort_order: 0, created_at: now(), updated_at: now() } as Milestone
  return writeMilestone(row, { ...fields, done: false, sort_order: 0 })
}

export const toggleMilestone = (m: Milestone) => writeMilestone(m, { done: !m.done })
export const deleteMilestone = (m: Milestone) => writeMilestone(m, { deleted_at: now() })
export const restoreMilestone = async (m: Milestone) => writeMilestone((await db.milestone.get(m.id)) ?? m, { deleted_at: null })

/** Milestones due in a range, for Plan's days and the Year view (PRJ-03).
 *  None while Projects is switched off: what is off shows nowhere. */
export async function loadMilestones(profileId: string, from: string, to: string): Promise<(Milestone & { project_name: string | null; goal_title: string | null })[]> {
  if (!(await isOn(profileId))) return []
  const all = (await db.milestone.where('profile_id').equals(profileId).toArray()).filter((m) => !m.deleted_at)
  const projects = new Map((await loadProjects(profileId)).map((p) => [p.id, p]))
  const goals = new Map((await db.goal.where('profile_id').equals(profileId).toArray()).map((g) => [g.id, g]))
  return milestonesBetween(all, from, to)
    // A milestone of a deleted project or goal goes with it.
    .filter((m) => (!m.project_id || projects.has(m.project_id)) && (!m.goal_id || !goals.get(m.goal_id)?.deleted_at))
    .map((m) => ({
      ...m,
      project_name: m.project_id ? String(projects.get(m.project_id)?.data.name ?? '') || null : null,
      goal_title: m.goal_id ? goals.get(m.goal_id)?.title ?? null : null,
    }))
}

/* ---------- goals ---------------------------------------------------------- */

export function useGoals(profileId: string | null | undefined): Goal[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.goal.where('profile_id').equals(profileId).toArray()).filter((g) => !g.deleted_at)
    : [], [profileId])
}

export type GoalDraft = Pick<Goal, 'title' | 'start_date' | 'end_date' | 'measure_type' | 'measure_target' | 'measure_unit' | 'status'>
  & Pick<Goal, 'measure_source' | 'measure_current' | 'measure_start' | 'note'>

const GOAL_FIELDS = ['title', 'start_date', 'end_date', 'measure_type', 'measure_target', 'measure_unit', 'status', 'measure_source',
  'measure_current', 'measure_start', 'note'] as const

/** The horizon a goal's dates span, which older screens group goals by. */
function horizonOf(start: string | null, end: string | null): Goal['horizon'] {
  if (!end) return 'year'
  const from = start ?? new Date().toISOString().slice(0, 10)
  const days = (Date.parse(end) - Date.parse(from)) / 86_400_000
  return days <= 8 ? 'week' : days <= 32 ? 'month' : days <= 95 ? 'quarter' : days <= 370 ? 'year' : 'multi_year'
}

export async function saveGoal(profileId: string, existing: Goal | null, d: GoalDraft): Promise<Goal> {
  const fields: Partial<Goal> = Object.fromEntries(GOAL_FIELDS.map((k) => [k, d[k] ?? null])) as Partial<Goal>
  fields.title = d.title.trim()
  fields.status = d.status ?? 'active'
  fields.measure_source = d.measure_source ?? 'manual'
  fields.horizon = horizonOf(d.start_date, d.end_date)
  // A weight goal starts from the trend weight when it is set up.
  if (fields.measure_source === 'weight' && fields.measure_start == null) fields.measure_start = await currentWeight(profileId)
  if (existing) return edit('goal', existing, fields)
  const row = { id: crypto.randomUUID(), profile_id: profileId, sort_order: 0, updated_at: now(), deleted_at: null } as unknown as Goal
  return edit('goal', row, { ...fields, profile_id: profileId, sort_order: 0, deleted_at: null })
}

export const deleteGoal = (g: Goal) => edit('goal', g, { deleted_at: now() })
export const restoreGoal = async (g: Goal) => edit('goal', (await db.goal.get(g.id)) ?? g, { deleted_at: null })
export const setGoalCurrent = async (g: Goal, value: number | null) => edit('goal', (await db.goal.get(g.id)) ?? g, { measure_current: value })
export const setGoalStatus = async (g: Goal, status: Goal['status']) => edit('goal', (await db.goal.get(g.id)) ?? g, { status })

/** The body weight now: the trend of the weigh-ins, or null without any. */
export async function currentWeight(profileId: string): Promise<number | null> {
  const rows = await db.body_log.where('profile_id').equals(profileId).toArray()
  return trendLine(rows).at(-1)?.trend ?? null
}

export interface GoalLinked {
  tasks: Task[]
  projects: { project: ModuleRecord; tasks: Task[] }[]
  milestones: Milestone[]
  habits: { id: string; name: string }[]
  routines: { id: string; name: string }[]
  weight: number | null
}

/** Everything linked to a goal: tasks, projects (with their tasks),
 *  milestones, habits and training routines, and the weight now. */
export async function goalLinks(profileId: string, goalId: string): Promise<GoalLinked> {
  const tasks = await db.task.where('profile_id').equals(profileId).filter((t) => !t.deleted_at && (t.goal_id === goalId || !!t.project_id)).toArray()
  const projects = (await loadProjects(profileId)).filter((p) => projectGoal(p) === goalId)
  return {
    tasks: tasks.filter((t) => t.goal_id === goalId),
    projects: projects.map((p) => ({ project: p, tasks: tasks.filter((t) => t.project_id === p.id) })),
    milestones: (await db.milestone.where('goal_id').equals(goalId).toArray()).filter((m) => !m.deleted_at),
    habits: (await db.habit.where('profile_id').equals(profileId).toArray()).filter((h) => !h.deleted_at && h.goal_id === goalId).map((h) => ({ id: h.id, name: h.name })),
    routines: (await db.routine.where('profile_id').equals(profileId).toArray()).filter((r) => !r.deleted_at && r.goal_id === goalId).map((r) => ({ id: r.id, name: r.name })),
    weight: await currentWeight(profileId),
  }
}

export function useGoalLinks(profileId: string | null | undefined, goalId: string | null): GoalLinked | undefined {
  return useLiveQuery(async () => (profileId && goalId ? goalLinks(profileId, goalId) : undefined), [profileId, goalId])
}

/** Every goal's progress, live, for the Goals page. */
export function useGoalProgress(profileId: string | null | undefined, goals: Goal[] | undefined): Map<string, GoalProgress> | undefined {
  const key = (goals ?? []).map((g) => `${g.id}:${g.updated_at}`).join(',')
  return useLiveQuery(async () => {
    const m = new Map<string, GoalProgress>()
    if (!profileId) return m
    for (const g of goals ?? []) m.set(g.id, goalProgress(g, await goalLinks(profileId, g.id)))
    return m
  }, [profileId, key])
}

/** Link a habit to a goal, or unlink it (null). */
export async function linkHabit(habitId: string, goalId: string | null): Promise<void> {
  const h = await db.habit.get(habitId)
  if (h) await edit('habit', h, { goal_id: goalId })
}

/** Link a project to a goal, or unlink it (null). The link is the project's
 *  "Goal" field, so it shows and can be changed in the project's own form. */
export async function linkProject(projectId: string, goalId: string | null): Promise<void> {
  const p = await db.module_record.get(projectId)
  if (p) await edit('module_record', p, { data: { ...(p.data ?? {}), goal_id: goalId } })
}

/** Link a task to a goal, or unlink it. */
export async function linkTask(task: Task, goalId: string | null): Promise<Task> {
  return saveTask({ ...task, goal_id: goalId }, ['goal_id'])
}

/** What the Year view's "Goals and phases" lists for a year (PLN-12): the
 *  goals touching it and, while the rule "a project with a date becomes a
 *  goal on the year view" is on, dated projects; each with its progress.
 *  Nothing while Projects is switched off. */
export async function loadYearGoals(profileId: string, year: number) {
  if (!(await isOn(profileId))) return []
  const goals = (await db.goal.where('profile_id').equals(profileId).toArray()).filter((g) => !g.deleted_at)
  const projects = await loadProjects(profileId)
  const toGoal = await builtinRuleOn(profileId, 'projects', 'to_goal')
  const tasks = await db.task.where('profile_id').equals(profileId).filter((t) => !t.deleted_at && !!t.project_id).toArray()
  const out = []
  for (const item of yearGoals(goals, projects, year, toGoal)) {
    const progress = item.kind === 'goal'
      ? goalProgress(item.row as Goal, await goalLinks(profileId, item.id))
      : goalProgress({ id: item.id, title: item.title, status: item.status === 'done' ? 'done' : 'active', start_date: null, end_date: item.date,
        measure_type: null, measure_target: null, measure_unit: null, measure_source: 'linked' },
        { tasks: tasks.filter((t) => t.project_id === item.id), projects: [], milestones: [] })
    out.push({ kind: item.kind, id: item.id, title: item.title, date: item.date, status: item.status, progress,
      link: item.kind === 'goal' ? `/m/projects?goal=${item.id}` : `/m/projects?project=${item.id}` })
  }
  return out
}

/* ---------- project templates (PRJ-05) ------------------------------------------ */

/** The person's own templates (Projects' settings), live; the app's two are
 *  added by allTemplates in projects-rules.ts. */
export function useProjectTemplates(profileId: string | null | undefined): ProjectTemplate[] | undefined {
  return useLiveQuery(async () => (profileId ? readTemplates((await instanceFor(profileId, 'projects'))?.settings) : []), [profileId])
}

async function keepTemplates(profileId: string, change: (list: ProjectTemplate[]) => ProjectTemplate[]): Promise<void> {
  const inst = await ensureInstance(profileId, 'projects', true)
  const row = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', row, { settings: { ...(row.settings ?? {}), templates: change(readTemplates(row.settings)) } })
}

/** Save a project as a template of the person's own (a new one each time). */
export async function saveProjectTemplate(profileId: string, tpl: ProjectTemplate): Promise<void> {
  await keepTemplates(profileId, (list) => [...list.filter((x) => x.id !== tpl.id), tpl])
}

export async function deleteProjectTemplate(profileId: string, id: string): Promise<void> {
  await keepTemplates(profileId, (list) => list.filter((x) => x.id !== id))
}

/** A new project from a template: the project, its tasks on their days (or
 *  in the Inbox), its milestones. Returns what was made, for Undo. */
export async function createFromTemplate(profileId: string, made: FromTemplate): Promise<{ project: ModuleRecord; tasks: Task[]; milestones: Milestone[] }> {
  const project: ModuleRecord = {
    id: crypto.randomUUID(), profile_id: profileId, module_key: 'projects', entity: 'project',
    data: { ...made.project }, record_date: null, created_at: now(), updated_at: now(), deleted_at: null,
  }
  await db.module_record.put(project)
  await queueChange('module_record', project, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  const tasks: Task[] = []
  for (const [i, x] of made.tasks.entries()) {
    const t = blankTask(profileId, x.day ?? '', { title: x.title.slice(0, 200), project_id: project.id, module_key: 'projects', sort_order: i })
    tasks.push(await saveTask({ ...t, planned_date: x.day }, undefined))
  }
  const milestones: Milestone[] = []
  for (const m of made.milestones) {
    milestones.push(await saveMilestone(profileId, null, { title: m.title, due_date: m.day, project_id: project.id, goal_id: null, note: null }))
  }
  return { project, tasks, milestones }
}

/** Undo a project made from a template: it and everything it made. */
export async function undoFromTemplate(made: { project: ModuleRecord; tasks: Task[]; milestones: Milestone[] }): Promise<void> {
  await edit('module_record', (await db.module_record.get(made.project.id)) ?? made.project, { deleted_at: now() })
  for (const t of made.tasks) { const cur = await db.task.get(t.id); if (cur && !cur.deleted_at) await deleteTask(cur) }
  for (const m of made.milestones) { const cur = await db.milestone.get(m.id); if (cur && !cur.deleted_at) await deleteMilestone(cur) }
}
