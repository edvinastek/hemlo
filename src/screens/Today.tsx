import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { TaskRow } from '../ui/TaskRow'
import { saveTask, blankTask, setTaskDone } from '../lib/tasks'
import { TaskSheet } from '../ui/TaskSheet'
import { BodySection } from '../sections/BodySection'
import { ReviewCard } from '../sections/ReviewCard'
import { dayTotals } from '../lib/nutrition'
import { readSettings } from '../lib/settings'
import { metricLine } from '../lib/quick-food'
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

  // The one figure the person chose for this header (Food settings), or
  // nothing: counting protein is not everyone's reason to open a planner.
  const metric = readSettings(profile).today_metric
  const figure = useLiveQuery(async () => {
    if (!profile || metric === 'none') return null
    const nutrition = await db.module_instance.where('profile_id').equals(profile.id)
      .filter((m) => m.module_key === 'nutrition').first()
    // Nutrition is on unless switched off; a profile without the row has it.
    if (nutrition && !nutrition.enabled) return null
    // The targets in force on the day shown: the newest one that has started
    // by then and was not deleted.
    const rows = (await db.target.where('profile_id').equals(profile.id).sortBy('from_date'))
      .filter((t) => !t.deleted_at && t.from_date <= day)
    const latest = rows[rows.length - 1] ?? null
    return metricLine(metric, await dayTotals(profile.id, day), latest)
  }, [profile?.id, day, metric], null)

  async function tick(task: Task) {
    await setTaskDone(task, task.status !== 'done')
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

  // The tabs filter the day: Work is the Work section, Night is anything from
  // 18:00 or marked Night, Body is the body-and-habits page instead of the rail.
  const shown = useMemo(() => {
    if (section === 'Work') return tasks.filter((t) => t.category === 'Work')
    if (section === 'Night') return tasks.filter((t) => t.category === 'Night' || (t.planned_time ?? '') >= '18:00')
    return tasks
  }, [tasks, section])


  return (
    <div className="page">
      <div className="page-inner">
        <PageHead
          date={date}
          onPick={setDate}
          sections={SECTIONS}
          active={section}
          onSection={setSection}
          sub={figure?.text}
        />

        {figure && figure.share !== null && (
          <div className="metrics" style={{ padding: '0 var(--space-4)' }}>
            <div className="metric">
              <div className="metric-track" role="progressbar" aria-label={figure.text}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(figure.share * 100)}>
                <div className="metric-fill" style={{ width: `${figure.share * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* The review card now carries slipped tasks too; one prompt, not two. */}
        {section === 'Today' && profile && <ReviewCard profileId={profile.id} day={day} variant="compact" />}

        {section === 'Body' && profile && <BodySection profileId={profile.id} day={day} />}
        {section === 'Night' && profile && <ReviewCard profileId={profile.id} day={day} variant="full" />}

        {section !== 'Body' && (
          <div className="rail">
            {shown.length === 0 && (
              <p className="empty">
                {section === 'Today'
                  ? 'Nothing planned for this day yet. Add something with the + button.'
                  : `Nothing in ${section} for this day.`}
              </p>
            )}
            {shown.map((t) => (
              <TaskRow key={t.id} task={t} onTick={tick} onPush={push}
                onEdit={(task) => setEditing({ task, isNew: false })} />
            ))}
          </div>
        )}
      </div>

      {profile && (
        <button className="fab" aria-label="Add a task"
          onClick={() => setEditing({ task: blankTask(profile.id, day), isNew: true })}>+</button>
      )}
      {editing && <TaskSheet task={editing.task} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}
