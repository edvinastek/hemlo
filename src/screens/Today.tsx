import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { TaskRow } from '../ui/TaskRow'
import { saveTask, blankTask } from '../lib/tasks'
import { TaskSheet } from '../ui/TaskSheet'
import { dayTotals } from '../lib/nutrition'
import type { Task } from '../lib/types'

const SECTIONS = ['Today', 'Body', 'Work', 'Night']

export function Today() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Today')
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null)
  const day = format(date, 'yyyy-MM-dd')

  // Live queries: the screen re-reads itself as rows land from the sync, so
  // there is no moment where the data is there and the page still says empty.
  const tasks = useLiveQuery(async () => {
    if (!profile) return []
    const rows = await db.task.where('[profile_id+planned_date]').equals([profile.id, day]).toArray()
    return rows
      .filter((t) => !t.deleted_at)
      .sort((a, b) =>
        (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || a.sort_order - b.sort_order)
  }, [profile?.id, day], [] as Task[])

  const targets = useLiveQuery(async () => {
    if (!profile) return null
    const rows = await db.target.where('profile_id').equals(profile.id).sortBy('from_date')
    const latest = rows[rows.length - 1]
    return latest ? { kcal: Number(latest.kcal ?? 0), protein: Number(latest.protein_g ?? 0) } : null
  }, [profile?.id], null)

  const eaten = useLiveQuery(async () => {
    if (!profile) return { kcal: 0, protein: 0 }
    const totals = await dayTotals(profile.id, day)
    return { kcal: totals.kcal, protein: totals.protein_g }
  }, [profile?.id, day], { kcal: 0, protein: 0 })

  async function tick(task: Task) {
    const next: Task = {
      ...task,
      status: task.status === 'done' ? 'todo' : 'done',
      completed_at: task.status === 'done' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await saveTask(next, ['status', 'completed_at'])
  }

  async function push(task: Task, minutes: number) {
    const [h, m] = (task.planned_time ?? '09:00').split(':').map(Number)
    const at = new Date(date)
    at.setHours(h, m + minutes, 0, 0)
    const next: Task = {
      ...task,
      planned_time: format(at, 'HH:mm'),
      push_count: task.push_count + 1,
      status: 'pushed',
      needs_review: task.push_count + 1 >= 3,
      updated_at: new Date().toISOString(),
    }
    await saveTask(next, ['planned_time', 'push_count', 'status', 'needs_review'])
  }

  const needsReview = useMemo(() => tasks.filter((t) => t.needs_review).length, [tasks])
  const persona = profile?.ai_persona_name

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead
          date={date}
          onPick={setDate}
          sections={SECTIONS}
          active={section}
          onSection={setSection}
          sub={targets ? `Protein ${Math.round(eaten.protein)} / ${targets.protein} g · ${Math.max(0, targets.kcal - Math.round(eaten.kcal))} kcal left` : undefined}
        />

        {targets && (
          <div className="metrics" style={{ padding: '0 var(--space-4)' }}>
            <div className="metric">
              <span className="metric-label">Protein</span>
              <span>{Math.round(eaten.protein)} / {targets.protein} g</span>
              <div className="metric-track">
                <div className="metric-fill" style={{ width: `${Math.min(100, (eaten.protein / (targets.protein || 1)) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {persona && needsReview > 0 && (
          <p className="assistant">
            {persona}: {needsReview} {needsReview === 1 ? 'task has' : 'tasks have'} slipped. Want new slots?
          </p>
        )}

        <div className="rail">
          {tasks.length === 0 && (
            <p className="empty">Nothing planned for this day yet. Add something with the + button.</p>
          )}
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onTick={tick} onPush={push}
              onEdit={(task) => setEditing({ task, isNew: false })} />
          ))}
        </div>
      </div>

      {profile && (
        <button className="fab" aria-label="Add a task"
          onClick={() => setEditing({ task: blankTask(profile.id, day), isNew: true })}>+</button>
      )}
      {editing && <TaskSheet task={editing.task} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}
