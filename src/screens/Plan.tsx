import { useMemo, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { MonthScroller, type DayHeat } from '../ui/MonthScroller'
import { useDayRange } from '../ui/useDayRange'
import { useModuleColours, type ModuleColours } from '../lib/colours'
import { modulesByWeight } from '../lib/colours-rules'
import { usePlannedRepeats } from '../lib/planned'
import type { PlannedRepeat } from '../lib/series-rules'
import { readSettings } from '../lib/settings'
import { useWeekSwap } from '../ui/WeekSwap'
import type { Task } from '../lib/types'
import '../ui/colours.css'

const SECTIONS = ['Week', 'Month', 'Year']
const key = (d: Date) => format(d, 'yyyy-MM-dd')

/** Year gives the overview, month the load, week the headers, day the detail.
 *  Each level answers one question and hands the next one down.
 *
 *  Every view reaches three years back and five ahead. A repeating task is
 *  a real task only eight weeks ahead; past that, the days its series will
 *  land on are shown as "planned repeats", worked out from the series, in
 *  the load and colours as well as in the week list. */
export function Plan() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Week')
  const colours = useModuleColours()
  const { range, clamp, today } = useDayRange()
  const go = (d: Date) => setDate(clamp(d))

  const tasks = useLiveQuery(async () => {
    if (!profile) return []
    return (await db.task.where('profile_id').equals(profile.id).toArray()).filter((t) => !t.deleted_at)
  }, [profile?.id], [] as Task[])

  // Worked out once for the whole reach ahead; every view reads from it.
  const planned = usePlannedRepeats(profile?.id, today, range.last)

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

  const plannedOn = (day: string): PlannedRepeat[] => planned.get(day) ?? []

  // Hold a day to swap it with another, or a task to move it (ui/WeekSwap.tsx).
  const swap = useWeekSwap({ byDay, work: readSettings(profile).work })

  /** The modules present on a day, most items first: for the month dots,
   *  the legends and the year's days. Planned repeats count. */
  const modulesOnDay = (day: string) =>
    modulesByWeight([...(byDay.get(day) ?? []), ...plannedOn(day)].map(colours.moduleOf))
  const modulesOn = (d: Date) => modulesOnDay(key(d))

  const loadOn = (day: string) => [...(byDay.get(day) ?? []), ...plannedOn(day)]
    .reduce((sum, t) => sum + (t.duration_min ?? 15), 0)
  const load = (d: Date) => loadOn(key(d))

  /** The heat ramp belongs to Month and Year, and never appears without its
   *  legend, so a colour never has to be guessed at. */
  const heat = (minutes: number) => `var(--e-heat-${heatStep(minutes)})`

  const yearLegend = useMemo(() => modulesByWeight(
    [...tasks, ...[...planned.values()].flat()].map(colours.moduleOf)), [tasks, planned, colours])

  const month = startOfMonth(date)
  const monthStep = (n: number) => go(addMonths(date, n))

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={go} sections={SECTIONS} active={section} onSection={setSection} />

        {section === 'Week' && (
          <>
            {swap.ui}
            <div className={`week-grid${swap.gridClass}`} style={{ margin: 'var(--space-3) var(--space-4) 0' }}>
              {weekDays(date).map((d) => {
                const day = key(d)
                const items = (byDay.get(day) ?? [])
                  .sort((a, b) => (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99'))
                const later = plannedOn(day)
                return (
                  <div key={d.toISOString()} className={`week-col${isSameDay(d, new Date()) ? ' is-today' : ''}${swap.colClass(day)}`}
                    {...swap.colProps(day)}>
                    <h3 {...swap.headProps(day)}>{format(d, 'EEE d')}</h3>
                    <div className="week-items">
                      {items.map((t) => {
                        const c = colours.ofTask(t)
                        return (
                          <div key={t.id} className={`week-item${c ? ' has-mod' : ''}${swap.itemClass(t)}`}
                            {...swap.itemProps(t)}>
                            {c && <i className="mod-dot" style={{ '--mod': c } as CSSProperties} aria-hidden="true" />}
                            <span><span className="t">{t.planned_time?.slice(0, 5)}</span> {t.title}</span>
                          </div>
                        )
                      })}
                      {later.map((r) => <PlannedItem key={`${r.seriesId}:${r.base}`} repeat={r} colours={colours} />)}
                      {items.length === 0 && later.length === 0 && <span className="t" style={{ color: 'var(--e-ink-soft)' }}>—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            {weekDays(date).some((d) => plannedOn(key(d)).length > 0) && (
              <p className="planned-note">
                <span className="planned-mark" aria-hidden="true">↻</span> Planned repeat: worked out from its
                series, it becomes a task you can tick eight weeks before the day.
              </p>
            )}
            <ModuleLegend colours={colours} keys={modulesByWeight(weekDays(date).flatMap(modulesOn))} />
          </>
        )}

        {section === 'Month' && (
          <>
            <div className="plan-monthnav">
              <button type="button" className="btn" aria-label="Previous month"
                disabled={key(month) <= range.first} onClick={() => monthStep(-1)}>‹</button>
              <span>{format(date, 'MMMM yyyy')}</span>
              <button type="button" className="btn" aria-label="Next month"
                disabled={key(endOfMonth(date)) >= range.last} onClick={() => monthStep(1)}>›</button>
            </div>
            <HeatLegend />
            <div className="month-grid">
              {monthDays(date).map((d) => (
                <button
                  key={d.toISOString()}
                  className="month-cell"
                  onClick={() => { go(d); setSection('Week') }}
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
            <HeatLegend note="Tap a day for its week" />
            {/* Months stacked, scrolling from three years back to five ahead;
                it opens on the month being looked at. */}
            <div className="plan-year">
              <MonthScroller
                first={range.first} last={range.last} openAt={key(date)} today={today}
                label="Every day, month by month"
                heat={(day): DayHeat => {
                  const step = heatStep(loadOn(day))
                  return { colour: `var(--e-heat-${step})`, strong: step === 4 }
                }}
                marks={(day) => (colours.on ? modulesOnDay(day).map(colours.of) : [])}
                describe={(day) => dayWords(loadOn(day), colours.on ? modulesOnDay(day)[0] : undefined,
                  plannedOn(day).length, colours)}
                onDayClick={(day) => { go(parseISO(day)); setSection('Week') }}
              />
            </div>
            <ModuleLegend colours={colours} keys={yearLegend} />
            <p className="section-title">Goals and phases</p>
            <Goals />
          </>
        )}
      </div>
    </div>
  )
}

/** Minutes of the day's tasks as a step on the heat ramp, 0 to 4. */
function heatStep(minutes: number): number {
  return minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 180 ? 2 : minutes < 360 ? 3 : 4
}

const weekDays = (date: Date) => eachDayOfInterval({
  start: startOfWeek(date, { weekStartsOn: 1 }),
  end: endOfWeek(date, { weekStartsOn: 1 }),
})

const monthDays = (date: Date) => eachDayOfInterval({
  start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
  end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
})

/** What a year day says when read out: its load, the module that filled
 *  most of it, and how much of it is planned repeats. */
function dayWords(minutes: number, top: string | undefined, planned: number, colours: ModuleColours): string {
  return [
    minutes ? `${minutes} min` : 'nothing planned',
    top ? `mostly ${colours.label(top)}` : null,
    planned ? `${planned} planned ${planned === 1 ? 'repeat' : 'repeats'}` : null,
  ].filter(Boolean).join(', ')
}

const HEAT_WORDS = ['none', 'under 1 h', 'to 3 h', 'to 6 h', 'more']

/** The heat ramp with a name for every step. It wraps on a phone. */
function HeatLegend({ note }: { note?: string }) {
  return (
    <div className="legend">
      <span>Load</span>
      {HEAT_WORDS.map((words, step) => (
        <span key={words}><i style={{ background: `var(--e-heat-${step})` }} /> {words}</span>
      ))}
      {note && <span className="legend-note">{note}</span>}
    </div>
  )
}

/** A day a series will land on that is too far ahead to be a task yet. It
 *  reads like the task it will become, a little quieter, with a mark saying
 *  so; it cannot be ticked or moved until it is a real task. */
function PlannedItem({ repeat, colours }: { repeat: PlannedRepeat; colours: ModuleColours }) {
  const c = colours.ofTask(repeat)
  return (
    <div className={`week-item is-planned${c ? ' has-mod' : ''}`}
      title="Planned repeat. It becomes a task eight weeks before the day.">
      {c && <i className="mod-dot" style={{ '--mod': c } as CSSProperties} aria-hidden="true" />}
      <span>
        <span className="t">{repeat.time}</span> {repeat.title}{' '}
        <span className="planned-mark">↻<span className="visually-hidden"> planned repeat</span></span>
      </span>
    </div>
  )
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
