import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { useDayItems } from '../lib/day-items'
import {
  railGroups, nowSlot, noteFinished, finishedChecklist, habitChecklistCount, flipCheck, slotFlips, PART_EDGES,
  tapRoute, tickRoute, type DayItem,
} from '../lib/day-items-rules'
import { useTodayPrefs, saveTodayPrefs } from '../lib/today-prefs'
import { useDayEdges } from '../lib/day-edge'
import { edgeSlots } from '../lib/day-edge-rules'
import { savePlanPrefs, usePlanPrefs } from '../lib/plan-prefs'
import { useToday } from './useToday'
import { useModuleColours } from '../lib/colours'
import { toggleCheck } from '../lib/notes'
import { pendingAfterDone } from '../lib/after-done-rules'
import { toggleHabit, toggleSupplement, setHabitAmount, setHabitChecks } from '../lib/tracking'
import { toggleChore } from '../lib/chores'
import * as act from '../lib/rail-actions'
import { sessionLinkForTask } from '../lib/training'
import type { Task } from '../lib/types'
import { DragList, type MenuAction, type RailEntry } from './DragList'
import { ItemRow, type RowAction } from './ItemRow'
import { PUSH_STEPS, pushWords } from './TaskRow'
import type { MenuItem } from './MoreMenu'
import { TaskSheet } from './TaskSheet'
import { CopySheet } from './CopySheet'
import { NotesPage } from './NotesPage'
import { PlannedDay } from './PlannedDay'
import { offerUndo } from './Undo'
import { FirstTip } from './Tip'
import { TaskSelectBar } from './TaskSelectBar'
import { useSelection } from './useSelection'
import { AfterDoneSheet, AskDoneSheet, MoveToSheet, OpenRecord, PushPickSheet, PushTimeSheet, dayWords } from './RailSheets'
import './itemrow.css'

export { useToday } from './useToday'

/** The rail's set-once choices, for the page's ⋮ on Today and Plan's Day
 *  (CALM-03, CALM-17): the timeline or parts of the day, push buttons on
 *  the rows and the day's start and end (both off by default). Each item
 *  says what it will do. */
export function useRailMenu(): MenuItem[] {
  const profileId = useApp((s) => s.profile?.id ?? null)
  const prefs = useTodayPrefs()
  const plan = usePlanPrefs(profileId)
  if (!profileId) return []
  const items: (MenuItem | false)[] = [
    prefs.layout === 'time'
      ? { label: 'Group by part of the day', onSelect: () => void saveTodayPrefs(profileId, (p) => ({ ...p, layout: 'parts' })) }
      : { label: 'Show as one timeline', onSelect: () => void saveTodayPrefs(profileId, (p) => ({ ...p, layout: 'time' })) },
    {
      label: prefs.push_on_rows ? 'Hide push buttons on rows' : 'Show push buttons on rows',
      onSelect: () => void saveTodayPrefs(profileId, (p) => ({ ...p, push_on_rows: !p.push_on_rows })),
    },
    // GEN-70: where the day starts and ends (Settings → Planning), drawn on
    // the timeline only when something falls outside it. Off by default.
    prefs.layout === 'time' && {
      label: plan.day_edges ? 'Hide day start and end' : 'Show day start and end',
      onSelect: () => void savePlanPrefs(profileId, { day_edges: !plan.day_edges }),
    },
  ]
  return items.filter((x): x is MenuItem => !!x)
}

/** The phone's Back closes a row open in place (TOD-10): opening it adds a
 *  step to the history; Back takes it away, and closing it another way
 *  takes the step back too, so Back never has to be pressed twice. */
function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  const pushed = useRef(false)
  useEffect(() => {
    if (!open) {
      if (pushed.current) {
        pushed.current = false
        if ((window.history.state as { railOpen?: boolean } | null)?.railOpen) window.history.back()
      }
      return
    }
    if (!pushed.current) {
      window.history.pushState({ ...(window.history.state ?? {}), railOpen: true }, '')
      pushed.current = true
    }
    const pop = () => {
      if (!pushed.current) return
      pushed.current = false
      closeRef.current()
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [open])
  // Leaving the screen with a row open: take the extra step back off.
  useEffect(() => () => {
    if (pushed.current && (window.history.state as { railOpen?: boolean } | null)?.railOpen) window.history.back()
  }, [])
}

/** What sheet the rail has open, if any. One at a time: never a sheet on a sheet. */
type Sheet =
  | { kind: 'edit'; task: Task; isNew: boolean }
  | { kind: 'copy'; task: Task }
  | { kind: 'move'; task: Task }
  | { kind: 'note'; task: Task }
  | { kind: 'push'; task: Task; minutes: number }
  | { kind: 'pushpick'; task: Task }
  | { kind: 'ask'; title: string; yes: () => void }
  | { kind: 'after'; task: Task }
  | { kind: 'record'; moduleKey: string; id?: string; day?: string }

/** Where a module's items are looked after, for "Open …" and a tap. */
const MODULE_PAGE: Record<string, { to: string; label: string }> = {
  habits: { to: '/m/habits', label: 'Open Habits' },
  supplements: { to: '/m/supplements', label: 'Open Supplements' },
  household: { to: '/m/household', label: 'Open Household' },
  finance: { to: '/m/finance', label: 'Open Finance' },
}

/** One day's items from every module, on one time rail (PLN-02, TOD-02): the
 *  single merged timeline that Today and Plan's Day view both draw. All-day
 *  events at the top, then by the clock (events first at their time), then
 *  "Any time"; or grouped into morning, afternoon and evening if the person
 *  picks that. Every row: a tap opens it, a short hold and a move drags a
 *  task, a longer hold opens it in place; the same actions in its ⋮ menu. */
export function DayRail({ day, where, filter, emptyText, selecting = false, onSelecting }: {
  day: string
  where: 'today' | 'plan'
  /** Today's tabs show part of the day (Work, Evening, a module). */
  filter?: (item: DayItem) => boolean
  /** Said when there is nothing to show. */
  emptyText?: string
  /** Select mode (GEN-52), started from the page's ⋮ ("Select tasks"):
   *  holding a row here drags it or opens it in place (TOD-10), so the hold
   *  does not start it. The page keeps the switch; Done, Back and Escape
   *  hand it back through onSelecting(false). */
  selecting?: boolean
  onSelecting?: (on: boolean) => void
}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const navigate = useNavigate()
  const { today, now, late } = useToday()
  const items = useDayItems(day, day, where, today)
  const prefs = useTodayPrefs()
  // The person's day start and end (GEN-70): the order after midnight, and
  // the two edge lines when switched on in the ⋮.
  const { start: edgeStart, end: edgeEnd, cutoff } = useDayEdges()
  const showEdges = usePlanPrefs(profile?.id).day_edges && prefs.layout === 'time'
  const colours = useModuleColours()
  const settings = readSettings(profile)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)

  const collapse = useCallback(() => setExpanded(null), [])
  useBackClose(expanded !== null, collapse)
  // Another day is another list.
  useEffect(() => { setExpanded(null) }, [day])

  const shown = useMemo(() => (items ? (filter ? items.filter(filter) : items) : null), [items, filter])
  const dayTasks = useMemo(() => (items ?? []).flatMap((i) => (i.task ? [i.task] : [])), [items])
  // The tasks that can be picked: the ones shown, in the rail's order.
  const selectable = useMemo(() => (shown ?? []).flatMap((i) => (i.task && !i.readonly ? [i.task] : [])), [shown])
  const sel = useSelection(selectable, { hold: false, onChange: (on) => { if (!on) onSelecting?.(false) } })
  useEffect(() => {
    if (selecting && !sel.selecting) sel.start()
    else if (!selecting && sel.selecting) sel.stop()
    // Only the page's switch starts or ends it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting])
  // An item open in place that has gone (deleted, another tab) closes.
  useEffect(() => {
    if (expanded && shown && !shown.some((i) => i.key === expanded)) setExpanded(null)
  }, [shown, expanded])

  const layout = prefs.layout
  const entries = useMemo<RailEntry[]>(() => {
    if (!shown) return []
    const out: RailEntry[] = []
    const groups = railGroups(shown, layout, cutoff)
    // After midnight in a day that runs past it, the clock is its evening (GEN-70).
    const nowGroup = layout === 'time' ? 'timed' : late || now >= PART_EDGES.evening ? 'evening' : now < PART_EDGES.afternoon ? 'morning' : 'afternoon'
    for (const g of groups) {
      if (g.label) out.push({ type: 'heading', key: `h:${g.key}`, label: g.label })
      const at = day === today && g.key === nowGroup ? nowSlot(g.items, now, cutoff) : null
      // Day start and day end, where something falls outside them (GEN-70),
      // when the person chose to see them (the ⋮); a day inside its edges
      // looks as it always did.
      const edge = showEdges && g.key === 'timed' ? edgeSlots(g.items.map((i) => i.time), { start: edgeStart, end: edgeEnd, cutoff }) : null
      const edgeLine = (k: number) => {
        if (edge?.start === k) out.push({ type: 'edge', key: 'edge:start', label: `Day starts ${edgeStart}` })
        if (edge?.end === k) out.push({ type: 'edge', key: 'edge:end', label: `Day ends ${edgeEnd}` })
      }
      g.items.forEach((i, k) => {
        edgeLine(k)
        if (k === at) out.push({ type: 'now', key: 'now', label: now })
        out.push({ type: 'item', key: i.key, task: i.task, label: i.title, static: i.readonly })
      })
      edgeLine(g.items.length)
      if (at === g.items.length) out.push({ type: 'now', key: 'now', label: now })
    }
    return out
  }, [shown, layout, day, today, now, late, cutoff, showEdges, edgeStart, edgeEnd])
  const byKey = useMemo(() => new Map((shown ?? []).map((i) => [i.key, i])), [shown])

  if (!profile || !shown) return null

  /* ---------- what the buttons do ---------- */

  async function tickTask(task: Task) {
    const done = task.status !== 'done'
    await act.tick(task, done)
    // A template waiting for "after done" opens now (NOT-14).
    if (done && pendingAfterDone(task.notes)) setSheet({ kind: 'after', task })
  }

  async function tickItem(item: DayItem) {
    if (item.task) {
      // A planned training session opens its session; finishing it there
      // ticks the task (GEN-38). "Mark done" in ⋮ ticks it plainly.
      const session = tickRoute(item, item.task.status === 'done' ? null : await sessionLinkForTask(item.task))
      if (session) return navigate(session)
      return tickTask(item.task)
    }
    if (item.kind === 'payment') {
      const r = await act.tickPayment(profile!.id, item.ref.id, item.day, today)
      if (r) offerUndo(`${item.title.replace(/ (due|expected)$/, '')} ${r.paid ? 'marked paid' : 'no longer paid'}`, r.undo)
      return
    }
    if (item.kind === 'habit') return void toggleHabit(item.ref.id, item.day)
    if (item.kind === 'chore') return void toggleChore(item.ref.id, item.day, userId)
    if (item.kind === 'supplements') {
      for (const id of slotFlips(item.parts ?? [])) await toggleSupplement(id, item.day)
    }
  }

  async function push(task: Task, minutes: number) {
    const r = await act.pushBy(task, minutes, day)
    if (!r) return setSheet({ kind: 'push', task, minutes })
    const time = r.to.planned_time?.slice(0, 5)
    offerUndo(r.to.planned_date !== task.planned_date
      ? `${task.title || 'Task'} pushed to ${dayWords(r.to.planned_date!, today)}, ${time}`
      : `${task.title || 'Task'} pushed to ${time}`, r.undo)
  }

  async function check(item: DayItem, at: number) {
    if (item.task) {
      const before = item.task.notes ?? ''
      const after = toggleCheck(before, at)
      const saved = await act.saveNote(item.task, after)
      // The last line ticked: ask, never tick the task by itself (TOD-13).
      if (noteFinished(before, after) && saved.status !== 'done') {
        setSheet({ kind: 'ask', title: item.title, yes: () => void tickTask(saved) })
      }
      return
    }
    if (item.kind === 'habit') {
      const total = habitChecklistCount(item.note)
      const was = item.checks ?? []
      const next = flipCheck(was, at, total)
      await setHabitChecks(item.ref.id, item.day, next)
      if (!item.done && finishedChecklist({ done: was.length, total }, { done: next.length, total })) {
        setSheet({ kind: 'ask', title: item.title, yes: () => void setHabitChecks(item.ref.id, item.day, next, true) })
      }
    }
  }

  function open(item: DayItem) {
    if (expanded === item.key) return setExpanded(null)
    const route = tapRoute(item)
    if (route) return navigate(route)
    if (item.task) return setSheet({ kind: 'edit', task: item.task, isNew: false })
    if (item.kind === 'event') return setSheet({ kind: 'record', moduleKey: 'agenda', id: item.ref.id })
    // A record, or Sleep's "Log last night" (no id yet: a new night on the day).
    if (item.kind === 'record' && item.module_key) return setSheet({ kind: 'record', moduleKey: item.module_key, id: item.ref.id || undefined, day: item.day })
    const page = item.module_key ? MODULE_PAGE[item.module_key] : undefined
    if (page) navigate(page.to)
  }

  function duplicate(task: Task) {
    const copy: Task = {
      ...task, id: crypto.randomUUID(), series_id: null, status: 'todo', completed_at: null, push_count: 0,
      extension_count: 0, needs_review: false, source: 'manual', source_ref: null, deleted_at: null,
      updated_at: new Date().toISOString(),
    }
    setSheet({ kind: 'edit', task: copy, isNew: true })
  }

  /** The row's quick actions, the same in the open row and in its ⋮ menu.
   *  The everyday ones are `main`: the open row shows them as buttons and
   *  keeps the rest under "More…". Push 15 / 30 / 60 live here since v17,
   *  not on the collapsed row (CALM-06). */
  function actionsOf(item: DayItem): RowAction[] {
    const t = item.task
    if (t) {
      const skipped = t.status === 'dropped'
      const route = tapRoute(item)
      const canPush = !t.locked && t.status !== 'done' && !skipped
      return [
        ...(route ? [{ label: 'Open the shopping list', main: true, run: () => navigate(route) }] : []),
        // A session task's tick opens the session; this ticks it without one.
        ...(t.module_key === 'training' || t.source === 'workout'
          ? [{ label: t.status === 'done' ? 'Mark not done' : 'Mark done', main: true, run: () => void tickTask(t) }] : []),
        { label: 'Edit', main: true, run: () => setSheet({ kind: 'edit', task: t, isNew: false }) },
        ...(canPush ? PUSH_STEPS.map((m) => ({ label: `Push ${pushWords(m)}`, push: pushWords(m), main: true, run: () => void push(t, m) })) : []),
        { label: 'Move to…', main: true, run: () => setSheet({ kind: 'move', task: t }) },
        skipped
          ? { label: 'Bring back', main: true, run: async () => offerUndo(`${t.title || 'Task'} brought back`, await act.unskip(t)) }
          : { label: 'Skip', main: true, run: async () => offerUndo(`${t.title || 'Task'} skipped`, await act.skip(t)) },
        { label: 'Copy to…', run: () => setSheet({ kind: 'copy', task: t }) },
        { label: 'Duplicate', run: () => duplicate(t) },
        { label: 'Open note as page', run: () => setSheet({ kind: 'note', task: t }) },
        { label: 'Delete', danger: true, run: async () => { setExpanded(null); offerUndo(`${t.title || 'Task'} deleted`, await act.remove(t)) } },
      ]
    }
    if (item.kind === 'event') {
      return [{ label: item.readonly ? 'Show event' : 'Edit event', run: () => setSheet({ kind: 'record', moduleKey: 'agenda', id: item.ref.id }) }]
    }
    if (item.kind === 'record' && item.module_key) {
      const key = item.module_key
      return [
        { label: item.ref.id ? 'Open record' : item.title, run: () => setSheet({ kind: 'record', moduleKey: key, id: item.ref.id || undefined, day: item.day }) },
        { label: `Open ${colours.label(key)}`, run: () => navigate(`/m/${key}`) },
      ]
    }
    const page = item.module_key ? MODULE_PAGE[item.module_key] : undefined
    return page ? [{ label: page.label, run: () => navigate(page.to) }] : []
  }

  function menuOf(entry: Extract<RailEntry, { type: 'item' }>): MenuAction[] {
    const item = byKey.get(entry.key)
    if (!item) return []
    const isOpen = expanded === item.key
    // The three pushes are one "Push…" here, so the menu stays short; the
    // open row shows them as buttons.
    const actions = actionsOf(item)
    const at = actions.findIndex((a) => a.push)
    const listed = actions.filter((a) => !a.push)
    if (at >= 0 && item.task) listed.splice(at, 0, { label: 'Push…', run: () => setSheet({ kind: 'pushpick', task: item.task! }) })
    return [
      { label: isOpen ? 'Close' : 'Open here', run: () => setExpanded(isOpen ? null : item.key) },
      ...listed,
    ]
  }

  const templates = settings.note_templates
  const empty = shown.length === 0

  // The timeline / parts of day switch is in the page's ⋮ (useRailMenu).
  return (
    <div className="day-rail">
      {/* Tips, one at a time (ONB-12, ONB-13): holding, the first time
          there is a task to hold; on Today, a few days in, Make Hemlo yours. */}
      {!sel.selecting && <FirstTip ids={[...(entries.some((e) => e.type === 'item' && e.task && !e.static) ? ['first-hold'] : []), ...(where === 'today' ? ['make-yours'] : [])]} />}
      {sel.selecting && (
        <ul className="rail-select" aria-label="Tasks to select">
          {selectable.length === 0 && <li className="empty">No tasks on this day.</li>}
          {selectable.map((t) => (
            <li key={t.id}>
              <label className={`rail-pick${t.status === 'done' ? ' is-done' : ''}`}>
                <input type="checkbox" checked={sel.has(t.id)} onChange={() => sel.toggle(t.id)} />
                <span className="rail-pick-time">{t.planned_time?.slice(0, 5) ?? ''}</span>
                <span className="rail-pick-name">{t.title || 'Untitled task'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className={`rail${colours.on ? ' is-coloured' : ''}`} hidden={sel.selecting}>
        {empty && <p className="empty rail-empty">{emptyText ?? 'Nothing planned for this day yet.'}</p>}
        <DragList
          entries={entries} day={dayTasks} date={day} work={settings.work}
          expanded={expanded}
          onExpand={(key) => setExpanded((k) => (k === key ? null : key))}
          actionsFor={menuOf}
          renderItem={(entry, more) => {
            const item = byKey.get(entry.key)!
            const key = item.module_key
            const colour = item.kind === 'event' && item.readonly
              ? item.colour ?? null
              : item.task ? colours.ofTask(item.task) : colours.on && key ? colours.of(key) : null
            const waiting = item.task ? pendingAfterDone(item.task.notes) : null
            return (
              <ItemRow
                item={item} colour={colour} moduleName={key ? colours.label(key) : null} more={more}
                expanded={expanded === item.key}
                onTitle={() => open(item)}
                onTick={() => void tickItem(item)}
                onPush={(m) => item.task && void push(item.task, m)}
                onAmount={(n) => void setHabitAmount(item.ref.id, item.day, n, item.target ?? null)}
                onCheck={(at) => void check(item, at)}
                onPart={(id) => void toggleSupplement(id, item.day)}
                actions={actionsOf(item)}
                showPush={prefs.push_on_rows}
                afterDoneName={waiting ? templates.find((x) => x.id === waiting)?.name ?? null : null}
              />
            )
          }}
        />
      </div>
      {/* Past the eight weeks the series have filled: what will repeat here. */}
      {!sel.selecting && <PlannedDay profileId={profile.id} day={day} />}
      {sel.selecting && <TaskSelectBar sel={sel} shown={selectable} profileId={profile.id} />}

      {sheet?.kind === 'edit' && <TaskSheet task={sheet.task} isNew={sheet.isNew} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'copy' && <CopySheet what={{ kind: 'task', task: sheet.task }} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'move' && <MoveToSheet task={sheet.task} today={today} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'note' && (
        <NotesPage title={sheet.task.title} notes={sheet.task.notes}
          onKeep={(n) => void act.saveNote(sheet.task, n)} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'push' && (
        <PushTimeSheet task={sheet.task} minutes={sheet.minutes} onClose={() => setSheet(null)}
          onSet={async (time) => {
            const r = await act.pushToTime(sheet.task, time)
            offerUndo(`${sheet.task.title || 'Task'} set for ${time}`, r.undo)
          }} />
      )}
      {sheet?.kind === 'pushpick' && (
        <PushPickSheet task={sheet.task} onClose={() => setSheet(null)}
          onPush={(m) => { const t = sheet.task; setSheet(null); void push(t, m) }} />
      )}
      {sheet?.kind === 'ask' && <AskDoneSheet title={sheet.title} onYes={sheet.yes} onClose={() => setSheet((s) => (s?.kind === 'ask' ? null : s))} />}
      {sheet?.kind === 'after' && <AfterDoneSheet task={sheet.task} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'record' && <OpenRecord moduleKey={sheet.moduleKey} id={sheet.id} day={sheet.day} onClose={() => setSheet(null)} />}
    </div>
  )
}
