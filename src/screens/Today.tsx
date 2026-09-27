import { useEffect, useMemo, useState } from 'react'
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
import { ModuleDay } from '../sections/ModuleDay'
import { SleepDay } from '../sections/SleepDay'
import { activeTab, dayTabs, tabTasks, type DayTab } from '../lib/day-tabs'
import { loadDayInput } from '../lib/day'
import { useModuleColours } from '../lib/colours'
import { dayTotals } from '../lib/nutrition'
import { readSettings } from '../lib/settings'
import { metricLine } from '../lib/quick-food'
import type { Task } from '../lib/types'
import './today.css'

const ONLY_TODAY: DayTab[] = [{ key: 'today', label: 'Today' }]

export function Today() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('today')
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null)
  const day = format(date, 'yyyy-MM-dd')
  const today = format(new Date(), 'yyyy-MM-dd')
  const colours = useModuleColours()

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

  // The tabs follow the day: Today always, the others only when their part
  // of the app is on and the day has something for it (lib/day-tabs.ts has
  // the rules). Until the day is read, only Today, so no tab flickers in and
  // straight back out.
  const work = readSettings(profile).work
  const workKey = `${work.on}|${work.days.join(',')}`
  const input = useLiveQuery(
    async () => (profile ? loadDayInput(profile.id, day, today, { work }) : null),
    [profile?.id, day, today, workKey], null)
  const tabs = useMemo(() => (input ? dayTabs(input) : ONLY_TODAY), [input])
  const tab = activeTab(tabs, section)

  // A tab the new day does not have falls back to Today, and stays there:
  // coming back to a day with Work does not jump back to Work unasked.
  useEffect(() => {
    if (input && input.day === day && tab.key !== section) setSection(tab.key)
  }, [input, day, tab.key, section])

  const shown = useMemo(() => tabTasks(tab, tasks), [tasks, tab])

  return (
    <div className="page today-page">
      <div className="page-inner">
        {/* With only Today there is nothing to choose between: no tab row. */}
        <PageHead
          date={date}
          onPick={setDate}
          sections={tabs.length > 1 ? tabs.map((t) => t.label) : []}
          active={tab.label}
          onSection={(label) => setSection(tabs.find((t) => t.label === label)?.key ?? 'today')}
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
        {tab.key === 'today' && profile && <ReviewCard profileId={profile.id} day={day} variant="compact" />}

        {tab.key === 'body' && profile && <BodySection profileId={profile.id} day={day} parts={tab.parts} />}
        {tab.key === 'evening' && profile && <ReviewCard profileId={profile.id} day={day} variant="full" />}
        {tab.key === 'sleep' && profile && <SleepDay profileId={profile.id} day={day} />}
        {tab.module && profile && <ModuleDay profileId={profile.id} day={day} moduleKey={tab.module} label={tab.label} />}

        {/* A module tab may hold only records; its rail shows when it has tasks. */}
        {shown && !(tab.module && shown.length === 0) && (
          <div className={`rail${colours.on ? ' is-coloured' : ''}`}>
            {shown.length === 0 && (
              <p className="empty">
                {tab.key === 'today'
                  ? 'Nothing planned for this day yet. Add something with the + button.'
                  : `Nothing in ${tab.label} for this day.`}
              </p>
            )}
            {shown.map((t) => {
              const key = colours.moduleOf(t)
              return (
                <TaskRow key={t.id} task={t} onTick={tick} onPush={push}
                  colour={colours.ofTask(t)} moduleName={key ? colours.label(key) : null}
                  onEdit={(task) => setEditing({ task, isNew: false })} />
              )
            })}
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
