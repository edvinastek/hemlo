import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { MonthScroller, type DayHeat } from '../ui/MonthScroller'
import { useDayRange } from '../ui/useDayRange'
import { useExport } from '../ui/ExportLink'
import { PageMenu } from '../ui/PageMenu'
import { rangeFor } from '../lib/transfer-rules'
import { useModuleColours, type ModuleColours } from '../lib/colours'
import { modulesByWeight } from '../lib/colours-rules'
import { usePlannedRepeats } from '../lib/planned'
import type { PlannedRepeat } from '../lib/series-rules'
import { readSettings } from '../lib/settings'
import { useWeekSwap } from '../ui/WeekSwap'
import { useLayout } from '../ui/useLayout'
import { countriesIn, holidayMarks, holidaysText, useHolidays } from '../lib/holidays'
import { HolidayChips, HolidayLegend, HolidayMark } from '../ui/HolidayMark'
import { calendarsIn, useFollowedEvents, useSubscriptions, type FollowedItem } from '../lib/calendar-links'
import { FollowedLegend, FollowedSheet, FollowedWeekItem } from '../ui/FollowedEvents'
import { useDayItems } from '../lib/day-items'
import { inbox as inboxOf, tapRoute, type DayItem } from '../lib/day-items-rules'
import { addDays } from '../lib/schedule-rules'
import { dayLabel, mondayOf } from '../lib/copy-rules'
import {
  busyness, cleanWeekDays, dayCapacity, heatStep, plannedMinutes, readPlanAddress, spanLabel, stepSpan,
  toggleHidden, VIEW_NAMES, weekColumns, weekSpan, type PlanView,
} from '../lib/plan-view-rules'
import { savePlanPrefs, usePlanPrefs } from '../lib/plan-prefs'
import { duplicateTasks } from '../lib/copy'
import { deleteTasks, moveWithUndo } from '../lib/series'
import { blankTask } from '../lib/tasks'
import type { CalendarEvent, Task } from '../lib/types'
import { loadMilestones, loadYearGoals } from '../lib/projects'
import { milestoneLink, milestonesByDay, milestoneWords, yearDateWords } from '../lib/projects-rules'
import { instanceFor } from '../modules/defs'
import { TaskSheet } from '../ui/TaskSheet'
import { CopySheet, type CopyWhat } from '../ui/CopySheet'
import { DayRail, useRailMenu } from '../ui/DayRail'
import { AddFab } from '../ui/AddMenu'
import { MoreMenu, type MenuItem } from '../ui/MoreMenu'
import { DayPickSheet } from '../ui/DayPickSheet'
import { SelectBar } from '../ui/SelectBar'
import { offerUndo } from '../ui/Undo'
import { Inbox } from './plan/Inbox'
import { DropTemplateSheet, SaveTemplateSheet } from './plan/TemplateSheets'
import { DaysShownSheet } from './plan/DaysShown'
import '../ui/colours.css'
import './plan.css'

const SECTIONS = ['Day', 'Week', 'Month', 'Year', 'Inbox']
const viewOf = (s: string) => (s.toLowerCase() as PlanView)
const key = (d: Date) => format(d, 'yyyy-MM-dd')
const NO_ITEMS: DayItem[] = []

/** Plan is for arranging (P3): Day · Week · Month · Year · Inbox (PLN-01).
 *  Year gives the overview, month the load, week the headers, day the
 *  detail, and the Inbox holds what has no day yet. The view and the day
 *  are in the address (/plan?view=week&date=2026-10-05), so Today and
 *  anything else can link straight to a view, and Back goes back a view.
 *
 *  Every view shows the items of every module set to "Show on Plan"
 *  (PLN-11), with module colours, and counts them in the load. Tapping an
 *  item opens it (PLN-04); + adds a task on the day being looked at, or to
 *  the Inbox. Days can be swapped, tasks moved, days and weeks copied and
 *  saved as templates, and everything moved or copied can be undone.
 *
 *  Every view reaches three years back and five ahead. A repeating task is
 *  a real task only eight weeks ahead; past that, the days its series will
 *  land on are shown as "planned repeats", worked out from the series.
 *
 *  Calm (v17): each view shows its content and its one way to step through
 *  time; everything set once or used now and then (days shown, Select, copy
 *  and templates, followed calendars, the layout, Export) is in the one ⋮
 *  on the title line, and the colour keys wait behind one "Key". */
export function Plan() {
  const profile = useApp((s) => s.profile)
  const navigate = useNavigate()
  const colours = useModuleColours()
  const layout = useLayout()
  const { range, today } = useDayRange()
  const [params, setParams] = useSearchParams()
  const { view, date } = readPlanAddress(params.get('view'), params.get('date'), today, range)
  const prefs = usePlanPrefs(profile?.id)
  const settings = readSettings(profile)
  const capacity = dayCapacity(profile?.day_start, profile?.day_end)

  /** A new day replaces the address; a new view adds a step, so Back
   *  returns to the view before. */
  const go = useCallback((day: string, v: PlanView = view, step = false) => {
    const d = day < range.first ? range.first : day > range.last ? range.last : day
    setParams({ view: v, date: d }, { replace: !step })
  }, [view, range, setParams])

  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null)
  const [copying, setCopying] = useState<CopyWhat | null>(null)
  const [saving, setSaving] = useState<{ kind: 'day' | 'week'; first: string } | null>(null)
  const [dropping, setDropping] = useState<string | null>(null)
  const [moving, setMoving] = useState<Task[] | null>(null)
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [inboxSelecting, setInboxSelecting] = useState(false)
  const [daysOpen, setDaysOpen] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [sure, setSure] = useState(false)
  // Year: only the months being drawn are worked out.
  const [yearWindow, setYearWindow] = useState<[string, string]>([addDays(date, -100), addDays(date, 160)])

  const weekDays = cleanWeekDays(prefs.week_days)
  const span = useMemo(() => weekSpan(date, weekDays), [date, weekDays])
  const monthGrid = useMemo(() => monthDays(date), [date])
  const [from, to] = view === 'week' ? [span[0], span[span.length - 1]]
    : view === 'month' ? [monthGrid[0], monthGrid[monthGrid.length - 1]]
      : view === 'year' ? yearWindow : [date, date]

  // Items of every module set to show on Plan, for the days in view.
  const items = useDayItems(from, to, 'plan', today) ?? NO_ITEMS
  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    // Followed calendars come through their own reader, with their colours
    // and the chips that hide them.
    for (const it of items) {
      if (it.kind === 'event' && it.readonly) continue
      const list = map.get(it.day) ?? []
      list.push(it)
      map.set(it.day, list)
    }
    return map
  }, [items])
  const itemsOn = (day: string) => itemsByDay.get(day) ?? NO_ITEMS
  /** The tasks shown on a day: what a swap or a move takes. */
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const [day, list] of itemsByDay) map.set(day, list.filter((i) => i.task).map((i) => i.task!))
    return map
  }, [itemsByDay])

  // Public holidays, for the whole year shown (Year: its window).
  const holFrom = view === 'year' ? yearWindow[0] : addDays(`${date.slice(0, 4)}-01-01`, -7)
  const holTo = view === 'year' ? yearWindow[1] : addDays(`${date.slice(0, 4)}-12-31`, 7)
  const holidays = useHolidays(holFrom, holTo)
  const holidayLegend = (days: string[]) =>
    countriesIn(days.map((d) => holidayMarks(holidays, parseISO(d))), settings.holidays.countries)

  // Followed calendars, less the ones hidden with a chip (AGN-06).
  const subs = useSubscriptions(profile?.id) ?? []
  const hidden = prefs.hidden_calendars
  const followedAll = useFollowedEvents(profile?.id, from, to)
  const followedOn = (day: string): FollowedItem[] => (followedAll.get(day) ?? []).filter((f) => !hidden.includes(f.sub.id))
  const followedColours = (day: string) => [...new Set(followedOn(day).map((f) => f.sub.colour))]

  // Milestones of projects and goals on the days in view (only while
  // Projects is on): a quiet line that opens the project or goal.
  const milestones = useLiveQuery(async () => (profile && view !== 'year' && view !== 'inbox'
    ? milestonesByDay(await loadMilestones(profile.id, from, to)) : new Map<string, PlanMilestone[]>()),
  [profile?.id, from, to, view], new Map<string, PlanMilestone[]>())
  const milestonesOn = (day: string): PlanMilestone[] => milestones.get(day) ?? []

  const planned = usePlannedRepeats(profile?.id, from, to)
  const plannedOn = (day: string): PlannedRepeat[] => planned.get(day) ?? []

  // Hold a day to swap it with another, or a task to move it (ui/WeekSwap.tsx).
  const swap = useWeekSwap({ byDay, work: settings.work })

  // Every task without a day: the Inbox (PLN-07).
  const inboxTasks = useLiveQuery(async () => {
    if (!profile) return [] as Task[]
    return inboxOf(await db.task.where('profile_id').equals(profile.id).filter((t) => !t.planned_date).toArray())
  }, [profile?.id], [] as Task[])

  const modulesOnDay = (day: string) =>
    modulesByWeight([...itemsOn(day).map((i) => i.module_key), ...plannedOn(day).map(colours.moduleOf)])

  /** What a day holds, in minutes: its items, the planned repeats, and
   *  timed events from followed calendars. */
  const loadOn = (day: string) => plannedMinutes(itemsOn(day))
    + plannedOn(day).reduce((sum, t) => sum + (t.duration_min ?? 15), 0)
    + followedOn(day).reduce((sum, f) => sum + f.minutes, 0)

  function openItem(it: DayItem) {
    // A shopping trip task opens the list (SHOP-22).
    const route = tapRoute(it)
    if (route) return navigate(route)
    if (it.task) return setEditing({ task: it.task, isNew: false })
    // Everything else opens on its own module's page.
    const page = it.kind === 'habit' ? 'habits' : it.kind === 'chore' ? 'household' : it.kind === 'supplements' ? 'supplements'
      : it.kind === 'event' ? 'agenda' : it.module_key
    if (page) navigate(`/m/${page}`)
  }

  const addOn = (day: string | null) => profile && setEditing({ task: blankTask(profile.id, day ?? today, { planned_date: day }), isNew: true })

  const toggleChosen = (id: string) => setChosen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const shownTasks = span.flatMap((d) => byDay.get(d) ?? [])
  const picked = shownTasks.filter((t) => chosen.has(t.id))
  const endSelect = () => { setSelecting(false); setChosen(new Set()); setSure(false) }

  async function moveTo(list: Task[], day: string | null) {
    const undo = await moveWithUndo(list.map((task) => ({ task, to: day })))
    const words = day ? `planned for ${dayLabel(day)}` : 'sent to the Inbox'
    offerUndo(list.length === 1 ? `“${list[0].title}” ${words}` : `${list.length} tasks ${words}`, undo)
    setChosen(new Set())
  }

  const dayMenu = (day: string) => [
    { label: 'Open this day', onSelect: () => go(day, 'day', true) },
    { label: 'Add a task here', onSelect: () => addOn(day) },
    { label: 'Copy this day…', onSelect: () => setCopying({ kind: 'day', day }) },
    view === 'week' && { label: 'Swap with another day…', onSelect: () => swap.startSwap(day) },
    { label: 'Save day as template…', onSelect: () => setSaving({ kind: 'day', first: day }) },
    { label: 'Add a template to this day…', onSelect: () => setDropping(day) },
  ]

  const showStrip = view === 'day' || view === 'week'
  const inboxCount = inboxTasks.length
  const railMenu = useRailMenu()

  // The page's one ⋮ (CALM-03), per view.
  const exportSource = useMemo(() => (view === 'inbox' ? null : {
    dataset: 'calendar',
    range: view === 'week' ? rangeFor('custom', date, { from: span[0], to: span[span.length - 1] })
      : view === 'day' ? rangeFor('day', date) : rangeFor(view, date),
  }), [view, date, span])
  const exp = useExport(exportSource, true)
  // Followed calendars: shown or hidden on Plan (AGN-06), once chips on the page.
  const calendarItems: MenuItem[] = view === 'inbox' ? [] : subs.map((c) => {
    const on = !hidden.includes(c.id)
    return {
      label: on ? `Hide ${c.name} on Plan` : `Show ${c.name} on Plan`,
      onSelect: () => { if (profile) void savePlanPrefs(profile.id, { hidden_calendars: toggleHidden(hidden, c.id) }) },
    }
  })
  const pageItems: (MenuItem | null | false)[] = view === 'day' ? [
    date !== today && { label: 'Go to today', onSelect: () => go(today) },
    { label: 'Copy this day…', onSelect: () => setCopying({ kind: 'day', day: date }) },
    { label: 'Save day as template…', onSelect: () => setSaving({ kind: 'day', first: date }) },
    { label: 'Add a template to this day…', onSelect: () => setDropping(date) },
    { label: 'See its week', onSelect: () => go(date, 'week', true) },
    ...railMenu,
  ] : view === 'week' ? [
    { label: selecting ? 'Stop selecting' : 'Select tasks', onSelect: () => (selecting ? endSelect() : setSelecting(true)) },
    { label: `Days shown: ${weekDays}…`, onSelect: () => setDaysOpen(true) },
    { label: 'Copy this week…', onSelect: () => setCopying({ kind: 'week', monday: mondayOf(date) }) },
    { label: 'Save week as template…', onSelect: () => setSaving({ kind: 'week', first: mondayOf(date) }) },
    { label: 'Add a template…', onSelect: () => setDropping(date) },
  ] : view === 'year' ? [
    // Year has no +, so its cells stay clear: the add is here.
    { label: `Add a task on ${dayLabel(date)}…`, onSelect: () => addOn(date) },
  ] : view === 'inbox' ? [
    inboxCount > 0 && { label: inboxSelecting ? 'Stop selecting' : 'Select tasks', onSelect: () => setInboxSelecting((x) => !x) },
  ] : []
  const monthSteps = view === 'month' && (
    <>
      <button type="button" className="ph-step" aria-label="Previous month"
        disabled={`${date.slice(0, 7)}-01` <= range.first} onClick={() => go(addMonth(date, -1))}>‹</button>
      <button type="button" className="ph-step" aria-label="Next month"
        disabled={monthEnd(date) >= range.last} onClick={() => go(addMonth(date, 1))}>›</button>
    </>
  )
  const menu = (
    <>
      {monthSteps}
      <PageMenu label={`More for ${VIEW_NAMES[view]}`} items={[...pageItems, ...calendarItems, exp.item]} sheets={exp.sheet} />
    </>
  )

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={parseISO(date)} onPick={(d) => go(key(d))} sections={SECTIONS} active={VIEW_NAMES[view]}
          onSection={(s) => { endSelect(); setInboxSelecting(false); go(date, viewOf(s), true) }}
          heading={view === 'inbox' ? 'Inbox' : undefined}
          title={view === 'month' ? format(parseISO(date), 'MMMM yyyy') : undefined}
          menu={menu}
          strip={showStrip}
          note={view === 'day' ? <HolidayChips marks={holidayMarks(holidays, parseISO(date))} /> : undefined}
          tabLabel={(s) => (s === 'Inbox' && inboxCount > 0
            ? <>Inbox <span className="plan-count" aria-label={`, ${inboxCount} waiting`}>{inboxCount}</span></> : s)} />

        {/* Day: the strip and the date's calendar move between days (and a
            swipe); the pager bar of v16 is gone (CALM-02). */}
        {view === 'day' && (
          <>
            <MilestoneLines list={milestonesOn(date)} onOpen={(m) => navigate(milestoneLink(m))} />
            {/* The one merged rail of the day (it lists the repeats to come
                past the eight weeks too, so Plan adds nothing under it). */}
            <DayRail day={date} where="plan" />
          </>
        )}

        {view === 'week' && (
          <>
            {/* ‹ the days shown ›; how many, Select, copying and templates
                are in the ⋮ on the title line. */}
            <div className="plan-bar">
              <button type="button" className="btn plan-step" aria-label={`Previous ${weekDays === 1 ? 'day' : `${weekDays} days`}`}
                disabled={span[0] <= range.first} onClick={() => go(stepSpan(date, weekDays, -1))}>‹</button>
              <span className="plan-bar-label">{spanLabel(span)}</span>
              <button type="button" className="btn plan-step" aria-label={`Next ${weekDays === 1 ? 'day' : `${weekDays} days`}`}
                disabled={span[span.length - 1] >= range.last} onClick={() => go(stepSpan(date, weekDays, 1))}>›</button>
            </div>
            {!selecting && swap.ui}
            <div className={`week-grid pw-grid${swap.gridClass}`} style={{ '--pw-cols': weekColumns(weekDays) } as CSSProperties}>
              {span.map((day) => {
                const list = itemsOn(day)
                const later = plannedOn(day)
                const followed = followedOn(day)
                const hol = holidayMarks(holidays, parseISO(day))
                const busy = busyness(loadOn(day), capacity)
                const head = swap.headProps(day)
                return (
                  <div key={day} className={`week-col${day === today ? ' is-today' : ''}${day === date ? ' is-chosen' : ''}${swap.colClass(day)}`}
                    {...swap.colProps(day)}>
                    <div className="pw-head">
                      <h3 {...(selecting ? {} : head)} title={[holidaysText(hol), selecting ? '' : head.title].filter(Boolean).join(' · ')}
                        onClick={() => { if (!swap.holding && !selecting) go(day, 'day', true) }}>
                        {format(parseISO(day), 'EEE d')}<HolidayMark marks={hol} variant="bar" />
                      </h3>
                      {!selecting && <MoreMenu label={`More for ${dayLabel(day)}`} items={dayMenu(day)}>Or hold a day to swap it, or a task to move it.</MoreMenu>}
                    </div>
                    <div className={`pw-busy${busy.over ? ' is-over' : ''}`} title={busy.words}>
                      <span className="pw-busy-fill" style={{ width: `${Math.round(busy.share * 100)}%` }} aria-hidden="true" />
                      <span className="visually-hidden">{busy.words}</span>
                    </div>
                    <div className="week-items">
                      {milestonesOn(day).map((m) => (
                        <button key={m.id} type="button" className={`week-item pw-item pw-ms${m.done ? ' is-done' : ''}`} disabled={selecting}
                          onClick={(e) => { if (swap.holding) return; e.stopPropagation(); navigate(milestoneLink(m)) }}>
                          <span className="pw-ms-mark" aria-hidden="true">◆</span><span>{milestoneWords(m)}</span>
                        </button>
                      ))}
                      {list.map((it) => {
                        const c = it.module_key && colours.on ? colours.of(it.module_key) : it.task ? colours.ofTask(it.task) : null
                        const isTask = !!it.task
                        const sel = selecting && isTask
                        return (
                          <button key={it.key} type="button"
                            className={`week-item pw-item${c ? ' has-mod' : ''}${it.done ? ' is-done' : ''}${isTask ? swap.itemClass(it.task!) : ''}`}
                            aria-pressed={sel ? chosen.has(it.task!.id) : undefined}
                            disabled={selecting && !isTask}
                            {...(isTask && !selecting ? swap.itemProps(it.task!) : {})}
                            onClick={(e) => {
                              if (swap.holding) return
                              e.stopPropagation()
                              if (sel) toggleChosen(it.task!.id)
                              else openItem(it)
                            }}>
                            {sel && <span className="pw-tick" aria-hidden="true">{chosen.has(it.task!.id) ? '✓' : ''}</span>}
                            {c && <i className="mod-dot" style={{ '--mod': c } as CSSProperties} aria-hidden="true" />}
                            <span><span className="t">{it.time}</span> {it.title}
                              {it.kind !== 'task' && <span className="visually-hidden">, {kindWords(it, colours)}</span>}
                              {it.done && <span className="visually-hidden">, done</span>}</span>
                          </button>
                        )
                      })}
                      {later.map((r) => <PlannedItem key={`${r.seriesId}:${r.base}`} repeat={r} colours={colours} />)}
                      {followed.map((f) => <FollowedWeekItem key={`${f.event.id}:${day}`} item={f} onOpen={setOpenEvent} />)}
                      {list.length === 0 && later.length === 0 && followed.length === 0 && milestonesOn(day).length === 0 && (
                        <button type="button" className="pw-empty" disabled={selecting} onClick={(e) => { if (swap.holding) return; e.stopPropagation(); addOn(day) }}
                          aria-label={`Add a task on ${dayLabel(day)}`}>—</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {(() => {
              // The colours and marks in one "Key" (CALM-11): ↻ is explained there too.
              const mods = colours.on ? modulesByWeight(span.flatMap(modulesOnDay)) : []
              const hols = holidayLegend(span)
              const cals = calendarsIn(span.map(followedOn))
              const repeats = span.some((d) => plannedOn(d).length > 0)
              if (!mods.length && !hols.length && !cals.length && !repeats) return null
              return (
                <Key>
                  {repeats && (
                    <p className="planned-note">
                      <span className="planned-mark" aria-hidden="true">↻</span> Planned repeat: it becomes a task eight weeks before the day.
                    </p>
                  )}
                  <ModuleLegend colours={colours} keys={mods} />
                  <HolidayLegend countries={hols} />
                  <FollowedLegend calendars={cals} />
                </Key>
              )
            })()}
            {selecting && (
              <SelectBar count={picked.length} noun="tasks" allShown={shownTasks.length > 0 && shownTasks.every((t) => chosen.has(t.id))}
                anyShown={shownTasks.length > 0}
                onAll={() => setChosen((s) => (shownTasks.every((t) => s.has(t.id)) ? new Set() : new Set(shownTasks.map((t) => t.id))))}
                onDone={endSelect} status={null}>
                <button type="button" className="btn" disabled={!picked.length} onClick={() => setCopying({ kind: 'tasks', tasks: picked })}>Copy to day…</button>
                <button type="button" className="btn" disabled={!picked.length} onClick={() => setMoving(picked)}>Move to day…</button>
                <button type="button" className="btn" disabled={!picked.length} onClick={() => void moveTo(picked, null)}>Send to Inbox</button>
                <button type="button" className="btn" disabled={!picked.length}
                  onClick={() => profile && void duplicateTasks(profile.id, picked).then((r) => { offerUndo(r.summary, r.undo); setChosen(new Set()) })}>Duplicate</button>
                <button type="button" className="btn sb-delete" disabled={!picked.length} onBlur={() => setSure(false)}
                  onClick={() => {
                    if (!sure && picked.length > 1) { setSure(true); return }
                    setSure(false)
                    void deleteTasks(picked).then((undo) => { offerUndo(picked.length === 1 ? 'Task deleted' : `${picked.length} tasks deleted`, undo); setChosen(new Set()) })
                  }}>{sure ? `Delete ${picked.length}? Tap again` : 'Delete'}</button>
              </SelectBar>
            )}
          </>
        )}

        {/* Month: the month is the heading, with ‹ › beside it. */}
        {view === 'month' && (
          <>
            <div className="month-grid plan-month">
              {monthGrid.map((d) => {
                const inMonth = d.slice(0, 7) === date.slice(0, 7)
                const marks = holidayMarks(holidays, parseISO(d))
                const fc = followedColours(d)
                return (
                  <button key={d} className={`month-cell${d === today ? ' is-today' : ''}`}
                    onClick={() => go(d, 'week', true)}
                    style={{ opacity: inMonth ? 1 : 0.4, textAlign: 'left' }}
                    aria-label={[format(parseISO(d), 'EEEE d MMMM'), dayWords(loadOn(d), colours.on ? modulesOnDay(d)[0] : undefined, plannedOn(d).length, colours),
                      followedWords(followedOn(d).length), milestonesOn(d).map(milestoneWords).join(', '), holidaysText(marks)].filter(Boolean).join(', ')}
                    title={[holidaysText(marks), followedWords(followedOn(d).length)].filter(Boolean).join(', ') || undefined}>
                    <HolidayMark marks={marks} variant="top" />
                    <span className="d">{Number(d.slice(8, 10))}{milestonesOn(d).length > 0 && <span className="pm-ms" aria-hidden="true"> ◆</span>}</span>
                    <span className="load" style={{ background: `var(--e-heat-${heatStep(loadOn(d))})` }} />
                    {colours.on && (
                      <span className="month-mods" aria-hidden="true">
                        {modulesOnDay(d).slice(0, 4).map((k) => <i key={k} className="mod-dot" style={{ '--mod': colours.of(k) } as CSSProperties} />)}
                      </span>
                    )}
                    {fc.length > 0 && (
                      <span className="fe-marks" aria-hidden="true">
                        {fc.slice(0, 4).map((c) => <i key={c} style={{ '--fe': c } as CSSProperties} />)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <Key>
              <HeatLegend />
              <ModuleLegend colours={colours} keys={modulesByWeight(monthGrid.filter((d) => d.slice(0, 7) === date.slice(0, 7)).flatMap(modulesOnDay))} />
              <HolidayLegend countries={holidayLegend(monthGrid)} />
              <FollowedLegend calendars={calendarsIn(monthGrid.map(followedOn))} />
            </Key>
          </>
        )}

        {view === 'year' && (
          <>
            {/* Months stacked, scrolling from three years back to five ahead;
                it opens on the month being looked at. Only the months drawn
                are worked out. */}
            <div className="plan-year">
              <MonthScroller
                first={range.first} last={range.last} openAt={date} today={today}
                label="Every day, month by month"
                // Sideways or wide, up to three months stand side by side.
                columns={layout === 'bar' ? 1 : 3}
                onShown={(a, b) => setYearWindow((w) => (w[0] === a && w[1] === b ? w : [a, b]))}
                heat={(day): DayHeat => {
                  const step = heatStep(loadOn(day))
                  return { colour: `var(--e-heat-${step})`, strong: step === 4 }
                }}
                marks={(day) => [...(colours.on ? modulesOnDay(day).map(colours.of) : []), ...followedColours(day)]}
                describe={(day) => [dayWords(loadOn(day), colours.on ? modulesOnDay(day)[0] : undefined,
                  plannedOn(day).length, colours), followedWords(followedOn(day).length), holidaysText(holidayMarks(holidays, parseISO(day)))].filter(Boolean).join(', ') || undefined}
                extra={(day) => <HolidayMark marks={holidayMarks(holidays, parseISO(day))} variant="top" />}
                onDayClick={(day) => go(day, 'week', true)}
              />
            </div>
            <Key>
              <HeatLegend />
              <ModuleLegend colours={colours} keys={modulesByWeight([...itemsByDay.keys()].flatMap(modulesOnDay))} />
              <HolidayLegend countries={countriesIn([...holidays.values()], settings.holidays.countries)} />
              <FollowedLegend calendars={calendarsIn([...followedAll.values()].map((l) => l.filter((f) => !hidden.includes(f.sub.id))))} />
            </Key>
            {profile && <YearGoals profileId={profile.id} year={Number(date.slice(0, 4))} onOpen={(link) => navigate(link)} />}
          </>
        )}

        {view === 'inbox' && profile && (
          <Inbox profileId={profile.id} tasks={inboxTasks} onOpen={(t) => setEditing({ task: t, isNew: false })}
            selecting={inboxSelecting} onSelecting={setInboxSelecting} />
        )}
      </div>

      {/* The same + as Today (GEN-50): a task on the day in view, a task to
          the Inbox, food, an event, or any module's add. Not on the Inbox,
          whose capture line is its one add (CALM-01), nor on Year, where it
          would sit over the days (its add is in the ⋮). */}
      {!selecting && view !== 'inbox' && view !== 'year' && <AddFab day={date} label={`Add something on ${dayLabel(date)}`} />}
      {editing && <TaskSheet key={editing.task.id} task={editing.task} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {copying && <CopySheet what={copying} onClose={() => setCopying(null)} onDone={() => setChosen(new Set())} />}
      {saving && <SaveTemplateSheet kind={saving.kind} first={saving.first} onClose={() => setSaving(null)} />}
      {dropping && <DropTemplateSheet day={dropping} onClose={() => setDropping(null)} onSave={() => setSaving({ kind: 'day', first: dropping })} />}
      {moving && (
        <DayPickSheet title={moving.length === 1 ? `Move “${moving[0].title}” to…` : `Move ${moving.length} tasks to…`} inbox
          onPick={(d) => { const list = moving; setMoving(null); void moveTo(list, d) }} onClose={() => setMoving(null)} />
      )}
      {openEvent && <FollowedSheet event={openEvent} onClose={() => setOpenEvent(null)} />}
      {daysOpen && (
        <DaysShownSheet value={weekDays} onClose={() => setDaysOpen(false)}
          onPick={(n) => profile && void savePlanPrefs(profile.id, { week_days: cleanWeekDays(n) })} />
      )}
    </div>
  )
}

/** What a non-task item is, read out after its name. */
function kindWords(it: DayItem, colours: ModuleColours): string {
  const what = it.kind === 'supplements' ? 'supplements' : it.kind === 'event' ? 'event' : it.module_key ? colours.label(it.module_key) : it.kind
  return [what, it.meta].filter(Boolean).join(', ')
}

/** How many events from followed calendars a day has, in words, or nothing. */
const followedWords = (n: number) => (n ? `${n} ${n === 1 ? 'event' : 'events'} from your calendars` : '')

/** Every day of the weeks a month touches, Monday to Sunday. */
function monthDays(date: string): string[] {
  const first = mondayOf(`${date.slice(0, 7)}-01`)
  const last = monthEnd(date)
  const end = addDays(mondayOf(last), 6)
  const out: string[] = []
  for (let d = first; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return `${date.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/** The same day of another month, or that month's last day. */
function addMonth(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

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
function HeatLegend() {
  return (
    <div className="legend">
      <span>Load</span>
      {HEAT_WORDS.map((words, step) => (
        <span key={words}><i style={{ background: `var(--e-heat-${step})` }} /> {words}</span>
      ))}
    </div>
  )
}

/** "Key": the view's colours and marks (load, modules, holidays, followed
 *  calendars), closed until asked for (CALM-11). A colour never has to be
 *  guessed; it just does not take the screen while it is known. */
function Key({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="plan-key">
      <button type="button" className="plan-key-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Key <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="plan-key-body">{children}</div>}
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

type PlanMilestone = Awaited<ReturnType<typeof loadMilestones>>[number]

/** A day's milestones above its rail: one quiet line each. */
function MilestoneLines({ list, onOpen }: { list: PlanMilestone[]; onOpen: (m: PlanMilestone) => void }) {
  if (!list.length) return null
  return (
    <ul className="plan-ms" aria-label="Milestones on this day">
      {list.map((m) => (
        <li key={m.id}>
          <button type="button" className={`plan-ms-item${m.done ? ' is-done' : ''}`} onClick={() => onOpen(m)}>
            <span className="pw-ms-mark" aria-hidden="true">◆</span>
            <span>{milestoneWords(m)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Goals and phases (PLN-12, GEN-36): the goals that touch the year shown,
 *  and projects due in it, each with its progress; a tap opens it. Only
 *  while Projects, where goals live, is on (P1). */
function YearGoals({ profileId, year, onOpen }: { profileId: string; year: number; onOpen: (link: string) => void }) {
  const data = useLiveQuery(async () => ((await instanceFor(profileId, 'projects'))?.enabled
    ? loadYearGoals(profileId, year) : null), [profileId, year])
  if (!data) return null
  return (
    <section className="plan-goals" aria-labelledby="plan-goals-title">
      <p className="section-title" id="plan-goals-title">Goals and phases, {year}</p>
      {data.length === 0 ? (
        <p className="empty">No goals or projects due in {year}.</p>
      ) : (
        <ul className="plan-goal-list">
          {data.map((g) => {
            const share = g.progress.share
            return (
              <li key={`${g.kind}:${g.id}`}>
                <button type="button" className={`plan-goal${g.status === 'done' ? ' is-done' : ''}`} onClick={() => onOpen(g.link)}>
                  <span className="plan-goal-top">
                    <span className="plan-goal-name">{g.title || 'Untitled'}</span>
                    <span className="plan-goal-when">{g.kind === 'project' ? 'Project, ' : ''}{yearDateWords(g.date, year)}</span>
                  </span>
                  <span className="plan-goal-progress">
                    {share !== null && (
                      <span className="plan-goal-bar" aria-hidden="true"><span style={{ width: `${Math.round(share * 100)}%` }} /></span>
                    )}
                    <span className="plan-goal-text">{g.progress.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
