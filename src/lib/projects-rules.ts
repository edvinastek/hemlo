/** Projects and goals, worked out with no database and no React (checked in
 *  src/test/projects.check.mjs): a project's progress and next task, its
 *  milestones, a goal's progress from where it is measured (a number kept by
 *  hand, the tasks, projects and milestones linked to it, or the body
 *  weight), and what the Year view lists. Days are 'yyyy-MM-dd'. */

export interface TaskLike {
  id: string
  title: string
  status: string
  planned_date: string | null
  planned_time?: string | null
  sort_order?: number
  project_id?: string | null
  goal_id?: string | null
  deleted_at?: string | null
}

export interface ProjectLike { id: string; data: Record<string, unknown>; record_date?: string | null; deleted_at?: string | null }
export interface MilestoneLike { id: string; title: string; due_date: string | null; done: boolean; goal_id?: string | null; project_id?: string | null; deleted_at?: string | null; sort_order?: number }

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

/* ---------- a project ------------------------------------------------------ */

export const projectName = (p: ProjectLike) => (typeof p.data.name === 'string' && p.data.name.trim() ? p.data.name.trim() : 'Project without a name')
export const projectStatus = (p: ProjectLike) => (typeof p.data.status === 'string' && p.data.status ? p.data.status : 'active')
export const projectDue = (p: ProjectLike) => (typeof p.data.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.data.due_date) ? p.data.due_date : null)
export const projectGoal = (p: ProjectLike) => (typeof p.data.goal_id === 'string' && p.data.goal_id ? p.data.goal_id : null)

export interface Progress {
  done: number
  all: number
  /** 0 to 1, or null when there is nothing to count. */
  share: number | null
}

const share = (done: number, all: number) => (all ? Math.round((done / all) * 1000) / 1000 : null)

/** The tasks that count for a project: its own, not deleted, not dropped. */
export const countable = <T extends TaskLike>(tasks: T[]) => live(tasks).filter((t) => t.status !== 'dropped')

/** Done of all, the project's tasks only. */
export function taskProgress(tasks: TaskLike[]): Progress {
  const list = countable(tasks)
  const done = list.filter((t) => t.status === 'done').length
  return { done, all: list.length, share: share(done, list.length) }
}

/** The task to do next: the earliest dated one not done (by day, then time,
 *  then order), else the first undated one. */
export function nextTask<T extends TaskLike>(tasks: T[]): T | null {
  const open = countable(tasks).filter((t) => t.status !== 'done')
  const dated = open.filter((t) => t.planned_date).sort((a, b) => a.planned_date!.localeCompare(b.planned_date!)
    || (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (dated.length) return dated[0]
  return open.filter((t) => !t.planned_date).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title))[0] ?? null
}

/** A project's tasks in the order its page lists them: open ones (dated by
 *  day, then undated), then done ones, newest done last. */
export function orderTasks<T extends TaskLike>(tasks: T[]): T[] {
  const list = countable(tasks)
  const open = list.filter((t) => t.status !== 'done')
  const done = list.filter((t) => t.status === 'done')
  const byDay = (a: T, b: T) => (a.planned_date ?? '9999').localeCompare(b.planned_date ?? '9999')
    || (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title)
  return [...open.sort(byDay), ...done.sort(byDay)]
}

/** Milestones in date order, undated last. */
export function orderMilestones<T extends MilestoneLike>(ms: T[]): T[] {
  return live(ms).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title))
}

/** The next milestone not reached yet. */
export const nextMilestone = <T extends MilestoneLike>(ms: T[]) => orderMilestones(ms).find((m) => !m.done) ?? null

/** Milestones due from `from` to `to` (both included), for Plan and the Year view. */
export const milestonesBetween = <T extends MilestoneLike>(ms: T[], from: string, to: string) =>
  orderMilestones(ms).filter((m) => m.due_date && m.due_date >= from && m.due_date <= to)

/** "3 of 8 done", "No tasks yet". */
export function describeProgress(p: Progress, noun = 'task'): string {
  if (!p.all) return `No ${noun}s yet`
  return `${p.done} of ${p.all} ${p.all === 1 ? noun : `${noun}s`} done`
}

/* ---------- a goal --------------------------------------------------------- */

export interface GoalLike {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  measure_type: string | null
  measure_target: number | null
  measure_unit: string | null
  measure_source?: string | null
  measure_current?: number | null
  measure_start?: number | null
  deleted_at?: string | null
}

export interface GoalLinks {
  tasks: TaskLike[]
  projects: { project: ProjectLike; tasks: TaskLike[] }[]
  milestones: MilestoneLike[]
  /** The body weight now (the trend), for a weight goal. */
  weight?: number | null
}

export interface GoalProgress {
  share: number | null
  /** One line: "6 of 10 done", "7 of 20 books", "84.2 kg, 2.8 kg to go". */
  text: string
}

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const fmt = (n: number) => String(Math.round(n * 10) / 10)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** How far a goal has come, from where it is measured. */
export function goalProgress(g: GoalLike, links: GoalLinks): GoalProgress {
  if (g.status === 'done') return { share: 1, text: 'Reached' }
  const source = g.measure_source ?? 'manual'
  if (source === 'linked') {
    // Each linked task, project and milestone counts as one; a project part
    // way through counts for the share of its tasks done.
    let done = 0
    let whole = 0
    let all = 0
    for (const t of countable(links.tasks)) { all++; if (t.status === 'done') { done++; whole++ } }
    for (const p of links.projects) {
      all++
      if (projectStatus(p.project) === 'done') { done++; whole++ }
      else { const tp = taskProgress(p.tasks); if (tp.all) done += tp.done / tp.all }
    }
    for (const m of live(links.milestones)) { all++; if (m.done) { done++; whole++ } }
    if (!all) return { share: null, text: 'Nothing linked yet' }
    return { share: clamp01(Math.round((done / all) * 1000) / 1000), text: `${whole} of ${all} done` }
  }
  if (source === 'weight') {
    const target = num(g.measure_target)
    const start = num(g.measure_start)
    const now = num(links.weight)
    if (target == null) return { share: null, text: 'Set a target weight' }
    if (now == null) return { share: null, text: `Target ${fmt(target)} kg · no weigh-in yet` }
    const left = Math.abs(now - target)
    const text = `${fmt(now)} kg, ${left < 0.05 ? 'at the target' : `${fmt(left)} kg to go`}`
    if (start == null || start === target) return { share: left < 0.05 ? 1 : null, text }
    return { share: clamp01(Math.round(((start - now) / (start - target)) * 1000) / 1000), text }
  }
  if (g.measure_type === 'boolean') return { share: 0, text: 'Not reached yet' }
  const target = num(g.measure_target)
  const current = num(g.measure_current) ?? 0
  const unit = g.measure_unit ? ` ${g.measure_unit}` : ''
  if (target == null || target <= 0) return { share: null, text: `${fmt(current)}${unit} so far` }
  return { share: clamp01(Math.round((current / target) * 1000) / 1000), text: `${fmt(current)} of ${fmt(target)}${unit}` }
}

/** Days from `today` to the goal's date: "12 days left", "due today", "3 days past". */
export function daysLeft(end: string | null, today: string): string {
  if (!end) return ''
  const d = Math.round((Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000)
  if (d === 0) return 'due today'
  if (d > 0) return `${d} ${d === 1 ? 'day' : 'days'} left`
  return `${-d} ${d === -1 ? 'day' : 'days'} past`
}

/** Problems with a goal as typed, by field. */
export function goalProblems(g: Partial<GoalLike>): Record<string, string> {
  const out: Record<string, string> = {}
  const t = (g.title ?? '').trim()
  if (!t) out.title = 'Give the goal a name.'
  else if (t.length > 120) out.title = 'Keep the name to 120 characters.'
  if (g.start_date && g.end_date && g.end_date < g.start_date) out.end_date = 'The target date is before the start.'
  for (const k of ['measure_target', 'measure_current', 'measure_start'] as const) {
    const v = g[k]
    if (v != null && !(Number.isFinite(v) && Math.abs(v) < 1e10)) out[k] = 'A number, please.'
  }
  if ((g.measure_unit ?? '').length > 16) out.measure_unit = 'Keep the unit to 16 characters.'
  return out
}

/** Goals in date order for the Goals page: active first (soonest date
 *  first, undated after), then paused, then reached, then dropped. */
export function orderGoals<T extends GoalLike & { sort_order?: number }>(goals: T[]): T[] {
  const rank: Record<string, number> = { active: 0, paused: 1, done: 2, dropped: 3 }
  return live(goals).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    || (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999') || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title))
}

/** What the Year view's "Goals and phases" lists for a year (PLN-12,
 *  GEN-35): goals whose time touches the year (or that are still open with
 *  no date), and dated projects ("a project with a date becomes a goal on the
 *  year view", when that rule is on), each with its date. */
export function yearGoals<G extends GoalLike, P extends ProjectLike>(goals: G[], projects: P[], year: number, projectsOn: boolean):
  { kind: 'goal' | 'project'; id: string; title: string; date: string | null; status: string; row: G | P }[] {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const out: { kind: 'goal' | 'project'; id: string; title: string; date: string | null; status: string; row: G | P }[] = []
  for (const g of live(goals)) {
    if (g.status === 'dropped') continue
    const starts = g.start_date ?? g.end_date
    const touches = (g.end_date ? g.end_date >= from : true) && (starts ? starts <= to : true)
    if (!g.end_date && !g.start_date ? g.status === 'active' : touches) {
      out.push({ kind: 'goal', id: g.id, title: g.title, date: g.end_date, status: g.status, row: g })
    }
  }
  if (projectsOn) {
    for (const p of live(projects)) {
      const due = projectDue(p)
      if (!due || due < from || due > to) continue
      out.push({ kind: 'project', id: p.id, title: projectName(p), date: due, status: projectStatus(p), row: p })
    }
  }
  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.title.localeCompare(b.title))
}

/* ---------- on Plan (PLN-12) ------------------------------------------------ */

/** Where a milestone opens from Plan: its project, else its goal, else the
 *  Projects page. */
export function milestoneLink(m: { project_id: string | null; goal_id: string | null }): string {
  if (m.project_id) return `/m/projects?project=${m.project_id}`
  if (m.goal_id) return `/m/projects?goal=${m.goal_id}`
  return '/m/projects'
}

/** A milestone's quiet line on Plan: "Milestone: Launch · Website", with
 *  "reached" once done. */
export function milestoneWords(m: { title: string; done: boolean; project_name?: string | null; goal_title?: string | null }): string {
  const of = m.project_name || m.goal_title
  return `Milestone: ${m.title || 'untitled'}${of ? ` · ${of}` : ''}${m.done ? ' · reached' : ''}`
}

/** Milestones by their day, for the days Plan shows. */
export function milestonesByDay<T extends { due_date: string | null }>(ms: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const m of ms) {
    if (!m.due_date) continue
    const list = out.get(m.due_date) ?? []
    list.push(m)
    out.set(m.due_date, list)
  }
  return out
}

/** A goal's or project's date on the Year view: "by 31 Dec", with the year
 *  only when it is not the year shown; "no end date" without one. */
export function yearDateWords(date: string | null, year: number): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'no end date'
  const [y, m, d] = date.split('-').map(Number)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `by ${d} ${MON[m - 1]}${y === year ? '' : ` ${y}`}`
}

/* ---------- project templates (PRJ-05) --------------------------------------- */

/** A project kept as a pattern: its tasks and milestones with days counted
 *  from the project's start (null: no day, so the task goes to the Inbox),
 *  and its due day the same way. "New from template" asks only the start.
 *  Two come with the app; the person's own are kept in Projects' settings
 *  (module_instance.settings.templates), saved from any project. */
export interface TemplateItem { title: string; offset: number | null }
export interface ProjectTemplate {
  id: string
  name: string
  builtin?: boolean
  due_offset: number | null
  tasks: TemplateItem[]
  milestones: TemplateItem[]
}

export const TEMPLATE_LIMITS = { templates: 30, items: 100, title: 200, name: 80, offset: 3650 }

const t = (offset: number | null, title: string): TemplateItem => ({ title, offset })

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'builtin:move-house', name: 'Move house', builtin: true, due_offset: 56,
    tasks: [
      t(0, 'Agree the moving day'),
      t(3, 'Get quotes from removal firms'),
      t(7, 'Book the removal firm or a van'),
      t(14, 'Clear out one room at a time'),
      t(21, 'Get boxes and packing tape'),
      t(28, 'Give the new address to the bank, employer, doctor and insurers'),
      t(35, 'Arrange energy, water and internet at the new place'),
      t(42, 'Set up post forwarding'),
      t(49, 'Pack everything but the essentials'),
      t(55, 'Pack a box of essentials for the first night'),
      t(56, 'Take meter readings and hand over the keys'),
      t(60, 'Register the new address with the council'),
    ],
    milestones: [t(56, 'Moving day')],
  },
  {
    id: 'builtin:exam-prep', name: 'Exam prep', builtin: true, due_offset: 42,
    tasks: [
      t(0, 'List every topic on the syllabus'),
      t(1, 'Make a revision timetable'),
      t(2, 'Gather notes, past papers and mark schemes'),
      t(7, 'Revise the first third of the topics'),
      t(14, 'Revise the second third of the topics'),
      t(21, 'Revise the last third of the topics'),
      t(28, 'Do a timed past paper and mark it'),
      t(31, 'Go over the weakest topics again'),
      t(35, 'Do a second timed past paper'),
      t(41, 'Light review, pack what the exam needs, rest'),
    ],
    milestones: [t(42, 'Exam')],
  },
]

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const dayNum = (d: string) => { const [y, m, x] = d.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, x) / 86400000) }
const fromNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
/** The day `offset` days after `start`. */
export const plusDays = (start: string, offset: number) => fromNum(dayNum(start) + offset)

/** Where a project starts, for saving it as a template: its own start day
 *  if it has one, else its earliest dated task or milestone, else today. */
export function projectStart(p: ProjectLike, tasks: TaskLike[], milestones: MilestoneLike[], today: string): string {
  if (typeof p.data.start_date === 'string' && DAY_RE.test(p.data.start_date)) return p.data.start_date
  const days = [...countable(tasks).map((x) => x.planned_date), ...live(milestones).map((m) => m.due_date)].filter((d): d is string => !!d && DAY_RE.test(d)).sort()
  return days[0] ?? today
}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/** A project as a template: every task (done or not, dropped ones left out)
 *  and milestone, with days counted from the start. */
export function templateFromProject(id: string, name: string, p: ProjectLike, tasks: TaskLike[], milestones: MilestoneLike[], today: string): ProjectTemplate {
  const start = projectStart(p, tasks, milestones, today)
  const off = (d: string | null | undefined) => (d && DAY_RE.test(d) ? dayNum(d) - dayNum(start) : null)
  const due = projectDue(p)
  return {
    id,
    name: clean(name, TEMPLATE_LIMITS.name) || projectName(p),
    due_offset: off(due),
    tasks: orderTasks(tasks).slice(0, TEMPLATE_LIMITS.items).map((x) => ({ title: clean(x.title, TEMPLATE_LIMITS.title), offset: off(x.planned_date) })),
    milestones: orderMilestones(milestones).slice(0, TEMPLATE_LIMITS.items).map((m) => ({ title: clean(m.title, TEMPLATE_LIMITS.title), offset: off(m.due_date) })),
  }
}

export interface FromTemplate {
  project: { name: string; status: 'active'; due_date: string | null; start_date: string }
  tasks: { title: string; day: string | null }[]
  milestones: { title: string; day: string | null }[]
}

/** A new project from a template on a start day: every day moved with it. */
export function fromTemplate(tpl: ProjectTemplate, start: string, name?: string): FromTemplate {
  const at = (o: number | null) => (o == null ? null : plusDays(start, o))
  return {
    project: { name: clean(name ?? '', TEMPLATE_LIMITS.name) || tpl.name, status: 'active', due_date: at(tpl.due_offset), start_date: start },
    tasks: tpl.tasks.map((x) => ({ title: x.title, day: at(x.offset) })),
    milestones: tpl.milestones.map((m) => ({ title: m.title, day: at(m.offset) })),
  }
}

/** "12 tasks · a milestone · about 8 weeks". */
export function describeTemplate(tpl: ProjectTemplate): string {
  const n = tpl.tasks.length
  const m = tpl.milestones.length
  const span = Math.max(tpl.due_offset ?? 0, ...tpl.tasks.map((x) => x.offset ?? 0), ...tpl.milestones.map((x) => x.offset ?? 0))
  const weeks = Math.round(span / 7)
  return [`${n} ${n === 1 ? 'task' : 'tasks'}`, m ? `${m} ${m === 1 ? 'milestone' : 'milestones'}` : null,
    span ? (weeks >= 2 ? `about ${weeks} weeks` : `${span + 1} days`) : null].filter(Boolean).join(' · ')
}

/** The person's own templates as kept, checked: anything odd is left out. */
export function readTemplates(settings: unknown): ProjectTemplate[] {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).templates : null
  if (!Array.isArray(raw)) return []
  const item = (v: unknown): TemplateItem | null => {
    if (!v || typeof v !== 'object') return null
    const r = v as Record<string, unknown>
    const title = typeof r.title === 'string' ? clean(r.title, TEMPLATE_LIMITS.title) : ''
    const o = r.offset == null ? null : Number(r.offset)
    if (!title || (o != null && (!Number.isInteger(o) || Math.abs(o) > TEMPLATE_LIMITS.offset))) return null
    return { title, offset: o }
  }
  const out: ProjectTemplate[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object' || out.length >= TEMPLATE_LIMITS.templates) continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(r.id) ? r.id : null
    const name = typeof r.name === 'string' ? clean(r.name, TEMPLATE_LIMITS.name) : ''
    if (!id || !name || out.some((x) => x.id === id)) continue
    const list = (x: unknown) => (Array.isArray(x) ? x.map(item).filter((i): i is TemplateItem => !!i).slice(0, TEMPLATE_LIMITS.items) : [])
    const due = r.due_offset == null ? null : Number(r.due_offset)
    out.push({ id, name, due_offset: Number.isInteger(due) && Math.abs(due!) <= TEMPLATE_LIMITS.offset ? due : null, tasks: list(r.tasks), milestones: list(r.milestones) })
  }
  return out
}

/** Every template to offer: the app's two, then the person's own by name. */
export const allTemplates = (own: ProjectTemplate[]) => [...BUILTIN_TEMPLATES, ...[...own].sort((a, b) => a.name.localeCompare(b.name))]
