import { useMemo, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, startOfMonth, startOfWeek, startOfYear,
} from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { ExportLink } from '../ui/ExportLink'
import { rangeFor } from '../lib/transfer-rules'
import { useModuleColours, type ModuleColours } from '../lib/colours'
import { modulesByWeight } from '../lib/colours-rules'
import type { Task } from '../lib/types'
import '../ui/colours.css'

const SECTIONS = ['Week', 'Month', 'Year']

/** Year gives the overview, month the load, week the headers, day the detail.
 *  Each level answers one question and hands the next one down. */
export function Plan() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Week')
  const colours = useModuleColours()

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

  /** The modules present on a day, most items first: for the month dots,
   *  the legends and the year square's title. */
  const modulesOn = (d: Date) => modulesByWeight((byDay.get(format(d, 'yyyy-MM-dd')) ?? []).map(colours.moduleOf))

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
          <>
            <div className="week-grid" style={{ margin: 'var(--space-3) var(--space-4) 0' }}>
              {weekDays(date).map((d) => {
                const items = (byDay.get(format(d, 'yyyy-MM-dd')) ?? [])
                  .sort((a, b) => (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99'))
                return (
                  <div key={d.toISOString()} className={`week-col${isSameDay(d, new Date()) ? ' is-today' : ''}`}>
                    <h3>{format(d, 'EEE d')}</h3>
                    <div className="week-items">
                      {items.map((t) => {
                        const c = colours.ofTask(t)
                        return (
                          <div key={t.id} className={`week-item${c ? ' has-mod' : ''}`}>
                            {c && <i className="mod-dot" style={{ '--mod': c } as CSSProperties} aria-hidden="true" />}
                            <span><span className="t">{t.planned_time?.slice(0, 5)}</span> {t.title}</span>
                          </div>
                        )
                      })}
                      {items.length === 0 && <span className="t" style={{ color: 'var(--e-ink-soft)' }}>—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <ModuleLegend colours={colours} keys={modulesByWeight(weekDays(date).flatMap(modulesOn))} />
          </>
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
              {monthDays(date).map((d) => (
                <button
                  key={d.toISOString()}
                  className="month-cell"
                  onClick={() => { setDate(d); setSection('Week') }}
                  style={{ opacity: isSameMonth(d, date) ? 1 : 0.4, textAlign: 'left' }}
                >
                  <span className="d">{format(d, 'd')}</span>
                  <span className="load" style={{ background: heat(load(d)) }} />
                  {/* Under the heat, up to four of the day's modules; the
                      legend below names each colour. */}
                  {colours.on && (
                    <span className="month-mods" aria-hidden="true">
                      {modulesOn(d).slice(0, 4).map((k) => (
                        <i key={k} className="mod-dot" style={{ '--mod': colours.of(k) } as CSSProperties} />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <ModuleLegend colours={colours}
              keys={modulesByWeight(monthDays(date).filter((d) => isSameMonth(d, date)).flatMap(modulesOn))} />
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
                  title={yearTitle(d, load(d), colours.on ? modulesOn(d)[0] : undefined, colours)}
                  style={{ background: heat(load(d)) }}
                />
              ))}
            </div>
            <p className="section-title">Goals and phases</p>
            <Goals />
          </>
        )}
        <ExportLink calendar source={{ dataset: 'calendar', range: rangeFor(section === 'Week' ? 'week' : section === 'Month' ? 'month' : 'year', format(date, 'yyyy-MM-dd')) }} />
      </div>
    </div>
  )
}

const weekDays = (date: Date) => eachDayOfInterval({
  start: startOfWeek(date, { weekStartsOn: 1 }),
  end: endOfWeek(date, { weekStartsOn: 1 }),
})

const monthDays = (date: Date) => eachDayOfInterval({
  start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
  end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
})

/** The year square stays a heat square, readable at 9 px; the module that
 *  filled most of the day is named in its title instead of drawn on it. */
function yearTitle(d: Date, minutes: number, top: string | undefined, colours: ModuleColours): string {
  return [format(d, 'd MMM'), `${minutes} min`, top ? `mostly ${colours.label(top)}` : null].filter(Boolean).join(' · ')
}

/** Every colour on the page with its name, so a colour is never guessed. */
function ModuleLegend({ colours, keys }: { colours: ModuleColours; keys: string[] }) {
  if (!colours.on || keys.length === 0) return null
  return (
    <div className="mod-legend" aria-label="Module colours">
      {keys.map((k) => (
        <span key={k}><i className="mod-dot" style={{ '--mod': colours.of(k) } as CSSProperties} />{colours.label(k)}</span>
      ))}
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
