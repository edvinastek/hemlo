import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { loadProjects } from '../lib/projects'
import { projectName, projectStatus } from '../lib/projects-rules'
import { instanceFor } from '../modules/defs'
import { Dropdown, type Option } from '../ui/Dropdown'

/** The project a task belongs to (PRJ-02), for the task sheet: "No project",
 *  or one of the projects that are not done (the task's own project stays in
 *  the list even when it is done). Shown only while Projects is switched on
 *  (P1); the task keeps its project either way.
 *
 *  <ProjectField value={task.project_id ?? null} onChange={(id) => set({ project_id: id })} /> */
export function ProjectField({ value, onChange, label = 'Project' }: { value: string | null; onChange: (id: string | null) => void; label?: string }) {
  const profileId = useApp((s) => s.profile?.id ?? null)
  const data = useLiveQuery(async () => {
    if (!profileId || !(await instanceFor(profileId, 'projects'))?.enabled) return null
    return loadProjects(profileId)
  }, [profileId])
  if (!data) return null
  const options: Option[] = [{ value: '', label: 'No project' },
    ...data.filter((p) => projectStatus(p) !== 'done' || p.id === value)
      .map((p) => ({ value: p.id, label: projectName(p), hint: projectStatus(p) === 'active' ? undefined : projectStatus(p) }))
      .sort((a, b) => a.label.localeCompare(b.label))]
  return (
    <div className="ts-field">
      <span className="ts-field-name">{label}</span>
      <Dropdown label={label} value={value ?? ''} options={options} onChange={(v) => onChange(v || null)} />
    </div>
  )
}

/** The goal something works towards (GEN-36): for the task and habit sheets.
 *  Shown only while Projects (where goals live) is switched on.
 *
 *  <GoalField value={task.goal_id} onChange={(id) => set({ goal_id: id })} /> */
export function GoalField({ value, onChange, label = 'Goal' }: { value: string | null; onChange: (id: string | null) => void; label?: string }) {
  const profileId = useApp((s) => s.profile?.id ?? null)
  const goals = useLiveQuery(async () => {
    if (!profileId || !(await instanceFor(profileId, 'projects'))?.enabled) return null
    return (await db.goal.where('profile_id').equals(profileId).toArray()).filter((g) => !g.deleted_at)
  }, [profileId])
  if (!goals) return null
  const options: Option[] = [{ value: '', label: 'No goal' },
    ...goals.filter((g) => g.status === 'active' || g.id === value)
      .map((g) => ({ value: g.id, label: g.title, hint: g.end_date ? `by ${g.end_date}` : undefined }))
      .sort((a, b) => a.label.localeCompare(b.label))]
  return (
    <div className="ts-field">
      <span className="ts-field-name">{label}</span>
      <Dropdown label={label} value={value ?? ''} options={options} onChange={(v) => onChange(v || null)} />
    </div>
  )
}
