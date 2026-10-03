import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { TaskSheet } from '../ui/TaskSheet'
import { DayRail, useToday } from '../ui/DayRail'
import { AddFab } from '../ui/AddMenu'
import { ExportLink } from '../ui/ExportLink'
import { rangeFor } from '../lib/transfer-rules'
import { BodySection } from '../sections/BodySection'
import { CarryOverRow, ReviewCard } from '../sections/ReviewCard'
import { ModuleDay } from '../sections/ModuleDay'
import { SleepDay } from '../sections/SleepDay'
import { TodayCards } from '../sections/TodayCards'
import { activeTab, dayTabs, isEvening, isWork, type DayTab } from '../lib/day-tabs'
import { isModuleOn, loadDayInput } from '../lib/day'
import { dayTotals } from '../lib/nutrition'
import { readSettings } from '../lib/settings'
import { metricLine } from '../lib/quick-food'
import { holidayMarks, useHolidays } from '../lib/holidays'
import { addDays } from '../lib/review-rules'
import { inbox, type DayItem } from '../lib/day-items-rules'
import { useDayItems } from '../lib/day-items'
import { useModuleColours } from '../lib/colours'
import { HolidayChips } from '../ui/HolidayMark'
import type { Task } from '../lib/types'
import './today.css'

const ONLY_TODAY: DayTab[] = [{ key: 'today', label: 'Today' }]

/** "Saturday 3 October" */
function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Today shows today (TOD-01): what to do now, from every module that is on,
 *  on one rail. Other days are arranged on Plan (its Day view has the same
 *  rail); Today keeps a one-tap look at tomorrow, the Inbox's count, the
 *  carry-over from earlier days, the evening review, the pinned cards and
 *  its tabs. */
export function Today() {
  const profile = useApp((s) => s.profile)
  const { today: day } = useToday()
  const [section, setSection] = useState('today')
  const [peek, setPeek] = useState(false)
  // The day's public holidays, if any countries are chosen (More → Profile).
  const holidays = useHolidays(day, day)
  const tomorrow = addDays(day, 1)

  // The one figure the person chose for this header (Food settings), or
  // nothing: counting protein is not everyone's reason to open a planner.
  const metric = readSettings(profile).today_metric
  const figure = useLiveQuery(async () => {
    if (!profile || metric === 'none') return null
    // A module is on only when its switch says so (the one rule, GEN-01).
    if (!(await isModuleOn(profile.id, 'nutrition'))) return null
    // The targets in force today: the newest one that has started by then.
    const rows = (await db.target.where('profile_id').equals(profile.id).sortBy('from_date'))
      .filter((t) => !t.deleted_at && t.from_date <= day)
    const latest = rows[rows.length - 1] ?? null
    return metricLine(metric, await dayTotals(profile.id, day), latest)
  }, [profile?.id, day, metric], null)

  // Tasks with no day, for the Inbox link's count.
  const waiting = useLiveQuery(async () => {
    if (!profile) return 0
    const rows = await db.task.where('profile_id').equals(profile.id).filter((t) => !t.planned_date).toArray()
    return inbox(rows).length
  }, [profile?.id], 0)

  // The tabs follow the day: Today always, the others only when their part
  // of the app is on and the day has something for it (lib/day-tabs.ts).
  const work = readSettings(profile).work
  const workKey = `${work.on}|${work.days.join(',')}`
  const input = useLiveQuery(
    async () => (profile ? loadDayInput(profile.id, day, day, { work }) : null),
    [profile?.id, day, workKey], null)
  const tabs = useMemo(() => (input ? dayTabs(input) : ONLY_TODAY), [input])
  const tab = activeTab(tabs, section)

  // A tab the day no longer has falls back to Today, and stays there.
  useEffect(() => {
    if (input && input.day === day && tab.key !== section) setSection(tab.key)
  }, [input, day, tab.key, section])

  // What each tab shows on the rail. Body and Sleep have their own sections.
  const filter = useCallback((i: DayItem): boolean => {
    if (tab.key === 'work') return !!i.task && isWork(i.task)
    if (tab.key === 'evening') return i.task ? isEvening(i.task) : (i.time ?? '') >= '18:00'
    if (tab.module) return i.module_key === tab.module
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.key, tab.module])
  const railed = tab.key !== 'body' && tab.key !== 'sleep'

  return (
    <div className="page today-page">
      <div className="page-inner">
        <header className="page-head today-head">
          <h1 className="page-date">{longDate(day)}</h1>
          {figure?.text && <p className="page-sub">{figure.text}</p>}
          {figure && figure.share !== null && (
            <div className="metric-track today-figure" role="progressbar" aria-label={figure.text}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(figure.share * 100)}>
              <div className="metric-fill" style={{ width: `${figure.share * 100}%` }} />
            </div>
          )}
          <HolidayChips marks={holidayMarks(holidays, day)} />
          <nav className="today-links" aria-label="Other days">
            <button type="button" className="today-link" aria-haspopup="dialog" aria-expanded={peek} onClick={() => setPeek(true)}>Tomorrow</button>
            <Link className="today-link" to="/plan?view=inbox">
              Inbox{waiting ? <span className="today-count" aria-label={`, ${waiting} waiting`}>{waiting}</span> : null}
            </Link>
            <Link className="today-link" to={`/plan?view=day&date=${day}`}>Other days</Link>
          </nav>
          {/* With only Today there is nothing to choose between: no tab row. */}
          {tabs.length > 1 && (
            <div className="tabs" role="tablist" aria-label="Parts of today">
              {tabs.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={t.key === tab.key} onClick={() => setSection(t.key)}>{t.label}</button>
              ))}
            </div>
          )}
        </header>

        {/* Pinned cards (TOD-20, TOD-21): filled by the Stats work. */}
        <TodayCards day={day} />

        {/* Two groups, one under the other on an upright phone; side by side
            on a phone turned sideways or a wide screen (today.css). */}
        <div className="today-body">
          <div className="today-side">
            {tab.key === 'today' && profile && <CarryOverRow profileId={profile.id} today={day} />}
            {tab.key === 'today' && profile && <ReviewCard profileId={profile.id} day={day} variant="compact" />}
            {tab.key === 'body' && profile && <BodySection profileId={profile.id} day={day} parts={tab.parts} />}
            {tab.key === 'evening' && profile && <ReviewCard profileId={profile.id} day={day} variant="full" />}
            {tab.key === 'sleep' && profile && <SleepDay profileId={profile.id} day={day} />}
            {tab.module && profile && <ModuleDay profileId={profile.id} day={day} moduleKey={tab.module} label={tab.label} />}
          </div>

          <div className="today-main">
            {railed && (
              <DayRail day={day} where="today" filter={tab.key === 'today' ? undefined : filter}
                emptyText={tab.key === 'today'
                  ? 'Nothing planned for today yet. Add something with the + button.'
                  : `Nothing in ${tab.label} for today.`} />
            )}
            <ExportLink calendar source={{ dataset: 'calendar', range: rangeFor('day', day) }} />
          </div>
        </div>
      </div>

      <AddFab day={day} />
      {peek && <TomorrowPeek day={tomorrow} today={day} onClose={() => setPeek(false)} />}
    </div>
  )
}

/** A look at tomorrow, to read (TOD-01): its items in order, tasks openable.
 *  Arranging it is Plan's job, one tap away. */
function TomorrowPeek({ day, today, onClose }: { day: string; today: string; onClose: () => void }) {
  const items = useDayItems(day, day, 'today', today)
  const colours = useModuleColours()
  const [editing, setEditing] = useState<Task | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, editing])

  if (editing) return <TaskSheet task={editing} isNew={false} onClose={() => setEditing(null)} />
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet peek" role="dialog" aria-modal="true" aria-labelledby="peek-title" data-no-swipe>
        <h2 id="peek-title">Tomorrow, {longDate(day)}</h2>
        {items && items.length === 0 && <p className="peek-empty">Nothing planned yet.</p>}
        <ul className="peek-list">
          {(items ?? []).map((i) => {
            const c = i.task ? colours.ofTask(i.task) : i.readonly ? i.colour ?? null : colours.on && i.module_key ? colours.of(i.module_key) : null
            const body = (
              <>
                <span className="peek-time">{i.time ?? (i.allDay ? 'All day' : '')}</span>
                <i className="peek-dot" style={c ? ({ '--mod': c } as CSSProperties) : undefined} aria-hidden="true" />
                <span className="peek-main">
                  <span className="peek-name">{i.title || 'Untitled'}</span>
                  {(i.task ? i.task.duration_min : i.meta) ? (
                    <span className="peek-meta">{i.task ? `${i.task.duration_min} min` : i.meta}</span>
                  ) : null}
                </span>
              </>
            )
            return (
              <li key={i.key}>
                {i.task
                  ? <button type="button" className="peek-row" onClick={() => setEditing(i.task!)}>{body}</button>
                  : <div className="peek-row">{body}</div>}
              </li>
            )
          })}
        </ul>
        <div className="sheet-actions">
          <Link className="btn" to={`/plan?view=day&date=${day}`}>Arrange in Plan</Link>
          <button type="button" className="btn btn-primary grow" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </>
  )
}
