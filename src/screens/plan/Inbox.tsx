import { useMemo, useRef, useState } from 'react'
import { blankTask, saveTask } from '../../lib/tasks'
import { writeBatch } from '../../lib/batch'
import { deleteTasks, moveWithUndo, startSeriesWith } from '../../lib/series'
import { readQuickAdd, type ReadingKind } from '../../lib/quick-add-rules'
import { withBusy } from '../../lib/busy'
import { moveInList, sortChanges, topOfList } from '../../lib/plan-view-rules'
import { dayLabel } from '../../lib/copy-rules'
import { addDays } from '../../lib/schedule-rules'
import { search } from '../../lib/search-rules'
import { shortSpan } from '../../lib/timeframe'
import type { Task } from '../../lib/types'
import { useLongPress } from '../../ui/useLongPress'
import { MoreMenu } from '../../ui/MoreMenu'
import { DayPickSheet } from '../../ui/DayPickSheet'
import { CopySheet, type CopyWhat } from '../../ui/CopySheet'
import { TaskSelectBar } from '../../ui/TaskSelectBar'
import type { Selection } from '../../ui/useSelection'
import { offerAction, offerUndo } from '../../ui/Undo'
import { QuickChips, useQuickAdd } from '../../ui/TaskSheetChips'
import { useDayRange } from '../../ui/useDayRange'

/** Where a held task is over: a day to plan it for, or a place in the list. */
type Over = { kind: 'day'; day: string } | { kind: 'row'; index: number } | null

/** A search field earns its place only once the list is this long (CALM-02). */
const SEARCH_FROM = 8

/** The Inbox (PLN-07, TSK-01): every task without a day, in one place that
 *  is not a module of its own. Capture with one line at the top (its one
 *  add: no + here, CALM-01); find with the one search once the list is
 *  long; put in order by hand; and give a task a day with "Plan for…", or by
 *  holding it and dropping it on a day. Several at once (GEN-53): hold a
 *  task and let go without moving it, or "Select tasks" in Plan's ⋮
 *  (CALM-16); the bar is the one every task list has (TaskSelectBar).
 *  Every move, plan and delete can be undone. */
export function Inbox({ profileId, tasks, onOpen, sel }: {
  profileId: string; tasks: Task[]; onOpen: (t: Task) => void
  /** Select mode, kept by Plan so its ⋮ can start it (useSelection). */
  sel: Selection<Task>
}) {
  const selecting = sel.selecting
  const { today } = useDayRange()
  const [text, setText] = useState('')
  // Quick add (TSK-07): a day, time, length, repeat or #section typed in
  // the line is read and shown as chips; a tap takes one away.
  const quick = useQuickAdd()
  const [off, setOff] = useState<ReadingKind[]>([])
  const reading = useMemo(() => (quick.on && text.trim() ? readQuickAdd(text, { today, base: null, sections: quick.sections, off }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quick.on, text, today, quick.sections.join('|'), off])
  const [query, setQuery] = useState('')
  const [planning, setPlanning] = useState<Task[] | null>(null)
  const [copying, setCopying] = useState<CopyWhat | null>(null)
  // Where a hold began, to tell a hold-and-let-go (select) from a drag.
  const holdFrom = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [over, setOver] = useState<Over>(null)
  const input = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => (query.trim()
    ? search(tasks.map((t) => ({ ...t, name: t.title, extra: [t.category, t.notes].filter(Boolean).join(' ') })), query)
    : tasks), [tasks, query])
  const sorting = !query.trim()
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today])

  async function capture(e: React.FormEvent) {
    e.preventDefault()
    const r = reading
    const title = (r ? r.title : text).trim()
    if (!title) return
    setText('')
    setOff([])
    // A repeat needs a day: with none typed it starts today.
    const day = r?.day ?? (r?.repeat ? today : null)
    const task = blankTask(profileId, today, {
      title, planned_date: day, planned_time: r?.time ?? null, duration_min: r?.minutes ?? null, category: r?.section ?? null,
      sort_order: topOfList(tasks.map((t) => t.sort_order)),
    })
    if (r?.repeat && day) await startSeriesWith(task, { ...r.repeat, end_date: null }, true)
    else await saveTask(task)
    input.current?.focus()
    // Read as a day: it leaves the Inbox, so say where it went (and warn of
    // a busy all-day event there, AGN-07), with a way to open it.
    if (day) offerAction(await withBusy(`“${title}” planned for ${dayLabel(day)}`, profileId, [day]), 'Open', () => onOpen(task))
  }

  /** Put the list in a new order: only the numbers that change are written. */
  async function reorder(order: string[]) {
    const current = new Map(tasks.map((t) => [t.id, t.sort_order]))
    const changes = sortChanges(order, current)
    if (!changes.length) return
    const byId = new Map(tasks.map((t) => [t.id, t]))
    await writeBatch(changes.map((c) => ({ table: 'task' as const, row: { ...byId.get(c.id)!, sort_order: c.sort_order }, fields: ['sort_order'] as (keyof Task & string)[] })))
    offerUndo('Inbox order changed', () => writeBatch(changes.map((c) => ({
      table: 'task' as const, row: { ...byId.get(c.id)!, sort_order: current.get(c.id) ?? 0 }, fields: ['sort_order'] as (keyof Task & string)[],
    }))))
  }

  const step = (t: Task, dir: -1 | 1) => {
    const ids = tasks.map((x) => x.id)
    const i = ids.indexOf(t.id)
    void reorder(moveInList(ids, i, i + dir))
  }

  async function planFor(list: Task[], day: string | null) {
    if (!day) return
    const undo = await moveWithUndo(list.map((task) => ({ task, to: day })))
    // A busy all-day event there is said with the Undo (AGN-07): the move stands.
    offerUndo(await withBusy(list.length === 1 ? `“${list[0].title}” planned for ${dayLabel(day)}` : `${list.length} tasks planned for ${dayLabel(day)}`, profileId, [day]), undo)
  }

  async function remove(list: Task[]) {
    const undo = await deleteTasks(list)
    offerUndo(list.length === 1 ? 'Task deleted' : `${list.length} tasks deleted`, undo)
  }

  const hold = useLongPress<string>({
    onStart: (id, at) => {
      if (selecting) return false
      holdFrom.current = { x: at.x, y: at.y, moved: false }
      setHeld(id)
    },
    onMove: (_, at) => {
      const from = holdFrom.current
      if (from && Math.hypot(at.x - from.x, at.y - from.y) > 12) from.moved = true
      const el = document.elementFromPoint(at.x, at.y)
      const day = el?.closest('[data-inbox-day]')?.getAttribute('data-inbox-day')
      if (day) return setOver({ kind: 'day', day })
      const row = el?.closest('[data-inbox-row]')?.getAttribute('data-inbox-row')
      setOver(row != null && sorting ? { kind: 'row', index: Number(row) } : null)
    },
    onDrop: (id) => {
      const t = tasks.find((x) => x.id === id)
      const o = over
      const still = !holdFrom.current?.moved
      holdFrom.current = null
      setHeld(null)
      setOver(null)
      // Held and let go where it was: select it, and start selecting.
      if (t && still && (!o || (o.kind === 'row' && tasks[o.index]?.id === t.id))) {
        sel.start(t.id)
        return
      }
      if (!t || !o) return
      if (o.kind === 'day') void planFor([t], o.day)
      else void reorder(moveInList(tasks.map((x) => x.id), tasks.indexOf(t), o.index))
    },
    onCancel: () => { holdFrom.current = null; setHeld(null); setOver(null) },
  })

  const toggle = (id: string) => sel.toggle(id)
  const heldTask = tasks.find((t) => t.id === held)

  return (
    <div className="pi">
      <form className="pi-capture" onSubmit={(e) => void capture(e)}>
        <input ref={input} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setOff([]) }} placeholder="Add to the Inbox"
          aria-label="New task for the Inbox" enterKeyHint="done" />
        <button type="submit" className="btn btn-primary" disabled={!(reading ? reading.title : text).trim()}>Add</button>
      </form>
      {reading && reading.chips.length > 0 && (
        <div className="pi-chips"><QuickChips chips={reading.chips} onRemove={(k) => setOff((o) => (o.includes(k) ? o : [...o, k]))} /></div>
      )}

      {(tasks.length >= SEARCH_FROM || query) && (
        <div className="pi-tools">
          <input type="search" className="pi-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find in ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`} aria-label="Find in the Inbox" />
        </div>
      )}

      {/* While a task is held: the next two weeks to drop it on. */}
      {heldTask && (
        <div className="pi-drop" role="status">
          <p className="pi-drop-say">Drop “{heldTask.title}” on a day to plan it{sorting ? ', or between tasks to move it in the list' : ''}.</p>
          <div className="pi-days">
            {days.map((d) => (
              <span key={d} data-inbox-day={d} className={`pi-day${over?.kind === 'day' && over.day === d ? ' is-over' : ''}`}>
                {d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : dayLabel(d).slice(0, -4)}
              </span>
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="empty pi-empty">Nothing waiting.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No task in the Inbox has those words.</p>
      ) : (
        <ul className={`pi-list${held ? ' is-holding' : ''}`}>
          {shown.map((t, i) => {
            const meta = [shortSpan(t.duration_min), t.category, t.planned_time ? t.planned_time.slice(0, 5) : ''].filter(Boolean).join(' · ')
            const isOver = over?.kind === 'row' && over.index === i && held !== t.id
            const index = tasks.indexOf(t)
            return (
              <li key={t.id} data-inbox-row={i} className={`pi-row${held === t.id ? ' is-held' : ''}${isOver ? ' is-over' : ''}`}
                {...(selecting ? {} : hold.bind(t.id))}>
                {selecting && (
                  <input type="checkbox" className="pi-check" checked={sel.has(t.id)} aria-label={`Select ${t.title}`} onChange={() => toggle(t.id)} />
                )}
                <button type="button" className="pi-name" onClick={() => (selecting ? toggle(t.id) : onOpen(t))}>
                  <span className="pi-title">{t.title || 'Untitled task'}</span>
                  {meta && <span className="pi-meta">{meta}</span>}
                </button>
                {!selecting && (
                  <>
                    <button type="button" className="btn pi-plan" onClick={() => setPlanning([t])}>Plan for…</button>
                    <MoreMenu label={`More for ${t.title}`} items={[
                      { label: 'Open', onSelect: () => onOpen(t) },
                      { label: 'Plan for…', onSelect: () => setPlanning([t]) },
                      { label: 'Copy to…', onSelect: () => setCopying({ kind: 'task', task: t }) },
                      sorting && { label: 'Move up', disabled: index <= 0, onSelect: () => step(t, -1) },
                      sorting && { label: 'Move down', disabled: index >= tasks.length - 1, onSelect: () => step(t, 1) },
                      { label: 'Delete', danger: true, onSelect: () => void remove([t]) },
                    ]}>Or hold it and drop it on a day{sorting ? ' or another place in the list' : ''}; hold it still and let go to select.</MoreMenu>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {selecting && <TaskSelectBar sel={sel} shown={shown} profileId={profileId} inbox />}

      {planning && (
        <DayPickSheet title={planning.length === 1 ? `Plan “${planning[0].title}” for…` : `Plan ${planning.length} tasks for…`}
          onPick={(d) => { const list = planning; setPlanning(null); void planFor(list, d) }} onClose={() => setPlanning(null)} />
      )}
      {copying && <CopySheet what={copying} onClose={() => setCopying(null)} />}
    </div>
  )
}
