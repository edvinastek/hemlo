import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, startOfMonth, startOfWeek, startOfYear,
} from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import type { Task } from '../lib/types'

const SECTIONS = ['Week', 'Month', 'Year']

/** Year gives the overview, month the load, week the headers, day the detail.
 *  Each level answers one question and hands the next one down. */
export function Plan() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Week')

  const tasks = useLiveQuery(async () => {
    if (!profile) return []
    return (await db.task.where('profile_id').equals(profile.id).toArray()).filter((t) => !t.deleted_at)
  }, [profile?.id], [] as Task[])

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.planned_date) continue
      const list = map.get(t.planned_date) ?? []
      list.push(t)
      map.set(t.planned_date, list)
    }
    return map
  }, [tasks])

  const load = (d: Date) => (byDay.get(format(d, 'yyyy-MM-dd')) ?? [])
    .reduce((sum, t) => sum + (t.duration_min ?? 15), 0)

  /** The heat ramp belongs to Month and Year, and never appears without its
   *  legend, so a colour never has to be guessed at. */
  const heat = (minutes: number) =>
    minutes === 0 ? 'var(--e-heat-0)'
    : minutes < 60 ? 'var(--e-heat-1)'
    : minutes < 180 ? 'var(--e-heat-2)'
    : minutes < 360 ? 'var(--e-heat-3)' : 'var(--e-heat-4)'

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection} />

        {section === 'Week' && (
          <div className="week-grid" style={{ margin: 'var(--space-3) var(--space-4) 0' }}>
            {eachDayOfInterval({
              start: startOfWeek(date, { weekStartsOn: 1 }),
              end: endOfWeek(date, { weekStartsOn: 1 }),
            }).map((d) => {
              const items = (byDay.get(format(d, 'yyyy-MM-dd')) ?? [])
                .sort((a, b) => (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99'))
              return (
                <div key={d.toISOString()} className={`week-col${isSameDay(d, new Date()) ? ' is-today' : ''}`}>
                  <h3>{format(d, 'EEE d')}</h3>
                  {items.map((t) => (
                    <div key={t.id} className="week-item">
                      <span className="t">{t.planned_time?.slice(0, 5)}</span> {t.title}
                    </div>
                  ))}
                  {items.length === 0 && <span className="t" style={{ color: 'var(--e-ink-soft)' }}>—</span>}
                </div>
              )
            })}
          </div>
        )}

        {section === 'Month' && (
          <>
            <div className="legend">
              <span>Load</span>
              <i style={{ background: 'var(--e-heat-0)' }} /> none
              <i style={{ background: 'var(--e-heat-1)' }} /> under 1 h
              <i style={{ background: 'var(--e-heat-2)' }} /> to 3 h
              <i style={{ background: 'var(--e-heat-3)' }} /> to 6 h
              <i style={{ background: 'var(--e-heat-4)' }} /> more
            </div>
            <div className="month-grid">
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
                end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
              }).map((d) => (
                <button
                  key={d.toISOString()}
                  className="month-cell"
                  onClick={() => { setDate(d); setSection('Week') }}
                  style={{ opacity: isSameMonth(d, date) ? 1 : 0.4, textAlign: 'left' }}
                >
                  <span className="d">{format(d, 'd')}</span>
                  <span className="load" style={{ background: heat(load(d)) }} />
                </button>
              ))}
            </div>
          </>
        )}

        {section === 'Year' && (
          <>
            <div className="legend"><span>{format(date, 'yyyy')} · one square a day, colour is the load</span></div>
            <div className="year-grid">
              {eachDayOfInterval({
                start: startOfYear(date),
                end: addDays(startOfYear(date), 364),
              }).map((d) => (
                <span
                  key={d.toISOString()}
                  className="year-cell"
                  title={`${format(d, 'd MMM')} · ${load(d)} min`}
                  style={{ background: heat(load(d)) }}
                />
              ))}
            </div>
            <p className="section-title">Goals and phases</p>
            <Goals />
          </>
        )}
      </div>
    </div>
  )
}

function Goals() {
  const profile = useApp((s) => s.profile)
  const goals = useLiveQuery(async () => {
    if (!profile) return []
    return []
  }, [profile?.id], [])

  if (goals.length === 0) {
    return <p className="empty">No goals yet. A goal gives the year something to measure against, and every task can hang off one.</p>
  }
  return null
}
