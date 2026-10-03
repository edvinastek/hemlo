import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { useDayItems } from '../lib/day-items'
import {
  railGroups, nowSlot, noteFinished, finishedChecklist, habitChecklistCount, flipCheck, slotFlips, PART_EDGES,
  type DayItem,
} from '../lib/day-items-rules'
import { useTodayPrefs, saveTodayPrefs } from '../lib/today-prefs'
import { localDay } from '../lib/review-rules'
import { useModuleColours } from '../lib/colours'
import { toggleCheck } from '../lib/notes'
import { pendingAfterDone } from '../lib/after-done-rules'
import { toggleHabit, toggleSupplement, setHabitAmount, setHabitChecks } from '../lib/tracking'
import { toggleChore } from '../lib/chores'
import * as act from '../lib/rail-actions'
import type { Task } from '../lib/types'
import { DragList, type MenuAction, type RailEntry } from './DragList'
import { ItemRow, type RowAction } from './ItemRow'
import { TaskSheet } from './TaskSheet'
import { CopySheet } from './CopySheet'
import { NotesPage } from './NotesPage'
import { PlannedDay } from './PlannedDay'
import { offerUndo } from './Undo'
import { AfterDoneSheet, AskDoneSheet, MoveToSheet, OpenRecord, PushTimeSheet, dayWords } from './RailSheets'
import './itemrow.css'

/** Today's date on this phone, kept fresh: past midnight it moves on by
 *  itself, and on coming back to the app it is read again. */
export function useToday(): { today: string; now: string } {
  const read = () => {
    const d = new Date()
    return { today: localDay(d), now: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  }
  const [state, setState] = useState(read)
  useEffect(() => {
    const tick = () => setState((s) => { const n = read(); return n.today === s.today && n.now === s.now ? s : n })
    const id = window.setInterval(tick, 30_000)
    const seen = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', seen)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', seen) }
  }, [])
  return state
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
  | { kind: 'ask'; title: string; yes: () => void }
  | { kind: 'after'; task: Task }
  | { kind: 'record'; moduleKey: string; id: string }

/** Where a module's items are looked after, for "Open …" and a tap. */
const MODULE_PAGE: Record<string, { to: string; label: string }> = {
  habits: { to: '/m/habits', label: 'Open Habits' },
  supplements: { to: '/m/supplements', label: 'Open Supplements' },
  household: { to: '/m/household', label: 'Open Household' },
}

/** One day's items from every module, on one time rail (PLN-02, TOD-02): the
 *  single merged timeline that Today and Plan's Day view both draw. All-day
 *  events at the top, then by the clock (events first at their time), then
 *  "Any time"; or grouped into morning, afternoon and evening if the person
 *  picks that. Every row: a tap opens it, a short hold and a move drags a
 *  task, a longer hold opens it in place; the same actions in its ⋮ menu. */
export function DayRail({ day, where, filter, emptyText }: {
  day: string
  where: 'today' | 'plan'
  /** Today's tabs show part of the day (Work, Evening, a module). */
  filter?: (item: DayItem) => boolean
  /** Said when there is nothing to show. */
  emptyText?: string
}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const navigate = useNavigate()
  const { today, now } = useToday()
  const items = useDayItems(day, day, where, today)
  const prefs = useTodayPrefs()
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
  // An item open in place that has gone (deleted, another tab) closes.
  useEffect(() => {
    if (expanded && shown && !shown.some((i) => i.key === expanded)) setExpanded(null)
  }, [shown, expanded])

  const layout = prefs.layout
  const entries = useMemo<RailEntry[]>(() => {
    if (!shown) return []
    const out: RailEntry[] = []
    const groups = railGroups(shown, layout)
    const nowGroup = layout === 'time' ? 'timed' : now < PART_EDGES.afternoon ? 'morning' : now < PART_EDGES.evening ? 'afternoon' : 'evening'
    for (const g of groups) {
      if (g.label) out.push({ type: 'heading', key: `h:${g.key}`, label: g.label })
      const at = day === today && g.key === nowGroup ? nowSlot(g.items, now) : null
      g.items.forEach((i, k) => {
        if (k === at) out.push({ type: 'now', key: 'now', label: now })
        out.push({ type: 'item', key: i.key, task: i.task, label: i.title, static: i.readonly })
      })
      if (at === g.items.length) out.push({ type: 'now', key: 'now', label: now })
    }
    return out
  }, [shown, layout, day, today, now])
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
    if (item.task) return tickTask(item.task)
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
    if (item.task) return setSheet({ kind: 'edit', task: item.task, isNew: false })
    if (item.kind === 'event') return setSheet({ kind: 'record', moduleKey: 'agenda', id: item.ref.id })
    if (item.kind === 'record' && item.module_key) return setSheet({ kind: 'record', moduleKey: item.module_key, id: item.ref.id })
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

  /** The row's quick actions, the same in the open row and in its ⋮ menu. */
  function actionsOf(item: DayItem): RowAction[] {
    const t = item.task
    if (t) {
      const skipped = t.status === 'dropped'
      return [
        { label: 'Edit', run: () => setSheet({ kind: 'edit', task: t, isNew: false }) },
        { label: 'Copy to…', run: () => setSheet({ kind: 'copy', task: t }) },
        { label: 'Duplicate', run: () => duplicate(t) },
        { label: 'Move to…', run: () => setSheet({ kind: 'move', task: t }) },
        skipped
          ? { label: 'Bring back', run: async () => offerUndo(`${t.title || 'Task'} brought back`, await act.unskip(t)) }
          : { label: 'Skip', run: async () => offerUndo(`${t.title || 'Task'} skipped`, await act.skip(t)) },
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
        { label: 'Open record', run: () => setSheet({ kind: 'record', moduleKey: key, id: item.ref.id }) },
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
    return [
      { label: isOpen ? 'Close' : 'Open here', run: () => setExpanded(isOpen ? null : item.key) },
      ...actionsOf(item),
    ]
  }

  const templates = settings.note_templates
  const empty = shown.length === 0

  return (
    <div className="day-rail">
      {!empty && (
        <div className="rail-bar">
          <span className="rail-bar-title" id={`rail-layout-${where}`}>Show the day</span>
          <div className="seg" role="group" aria-labelledby={`rail-layout-${where}`}>
            <button type="button" aria-pressed={layout === 'time'}
              onClick={() => void saveTodayPrefs(profile.id, (p) => ({ ...p, layout: 'time' }))}>Timeline</button>
            <button type="button" aria-pressed={layout === 'parts'}
              onClick={() => void saveTodayPrefs(profile.id, (p) => ({ ...p, layout: 'parts' }))}>Parts of day</button>
          </div>
        </div>
      )}
      <div className={`rail${colours.on ? ' is-coloured' : ''}`}>
        {empty && <p className="empty rail-empty">{emptyText ?? 'Nothing planned for this day yet. Add something with the + button.'}</p>}
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
                afterDoneName={waiting ? templates.find((x) => x.id === waiting)?.name ?? null : null}
              />
            )
          }}
        />
      </div>
      {/* Past the eight weeks the series have filled: what will repeat here. */}
      <PlannedDay profileId={profile.id} day={day} />

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
      {sheet?.kind === 'ask' && <AskDoneSheet title={sheet.title} onYes={sheet.yes} onClose={() => setSheet((s) => (s?.kind === 'ask' ? null : s))} />}
      {sheet?.kind === 'after' && <AfterDoneSheet task={sheet.task} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'record' && <OpenRecord moduleKey={sheet.moduleKey} id={sheet.id} onClose={() => setSheet(null)} />}
    </div>
  )
}
