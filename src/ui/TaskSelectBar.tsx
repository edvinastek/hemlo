import { useState } from 'react'
import { duplicateTasks } from '../lib/copy'
import { dayLabel } from '../lib/copy-rules'
import { deleteTasks, moveWithUndo, repeatMany } from '../lib/series'
import { TASK_RULE_KINDS } from '../lib/series-rules'
import { describeSchedule } from '../lib/schedule-rules'
import { repeatManyWords } from '../lib/selection-rules'
import { TASK_FIELDS } from '../lib/transfer-rules'
import type { Task } from '../lib/types'
import { CopySheet } from './CopySheet'
import { DayPickSheet } from './DayPickSheet'
import { useExport } from './ExportLink'
import { NO_REPEAT, RepeatPicker, type RepeatValue } from './RepeatPicker'
import { SelectAction, SelectBar, SelectDelete } from './SelectBar'
import { offerUndo } from './Undo'
import { useBackClose } from './useBackClose'
import { useDayRange } from './useDayRange'
import type { Selection } from './useSelection'

type Sheet = 'copy' | 'move' | 'repeat' | null

/** The select bar for tasks (GEN-53), the same wherever tasks are listed:
 *  Plan's week, Plan's day and Today (the rail), and the Inbox. Copy to
 *  day…, Move to day… (in the Inbox: Plan for…), Send to Inbox, Duplicate,
 *  Change repeat…, Export… and Delete, last. Each opens at most one sheet,
 *  never one on another (CALM-10); every move, copy, duplicate and delete
 *  can be undone. */
export function TaskSelectBar({ sel, shown, profileId, inbox = false }: {
  sel: Selection<Task>
  /** The tasks on screen now, for "Select all shown". */
  shown: Task[]
  profileId: string
  /** In the Inbox: "Plan for…" instead of Move, and no "Send to Inbox". */
  inbox?: boolean
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const picked = sel.picked
  const n = picked.length
  const exp = useExport(n ? { rows: picked as unknown as Record<string, unknown>[], fields: TASK_FIELDS, label: n === 1 ? picked[0].title || 'Task' : `${n} tasks` } : null)
  const one = n === 1 ? `“${picked[0].title || 'task'}”` : `${n} tasks`

  async function moveTo(day: string | null) {
    const list = picked
    const undo = await moveWithUndo(list.map((task) => ({ task, to: day })))
    const words = day ? `planned for ${dayLabel(day)}` : 'sent to the Inbox'
    offerUndo(list.length === 1 ? `“${list[0].title}” ${words}` : `${list.length} tasks ${words}`, undo)
    sel.clear()
  }

  return (
    <>
      <SelectBar {...sel.bar(shown, 'tasks')}>
        <SelectAction count={n} onClick={() => setSheet('copy')}>Copy to day…</SelectAction>
        <SelectAction count={n} onClick={() => setSheet('move')}>{inbox ? 'Plan for…' : 'Move to day…'}</SelectAction>
        {!inbox && <SelectAction count={n} onClick={() => void moveTo(null)}>Send to Inbox</SelectAction>}
        <SelectAction count={n} onClick={() => void duplicateTasks(profileId, picked).then((r) => { offerUndo(r.summary, r.undo); sel.say(r.summary) })}>
          Duplicate
        </SelectAction>
        <SelectAction count={n} onClick={() => setSheet('repeat')}>Change repeat…</SelectAction>
        <SelectAction count={n} onClick={() => exp.item?.onSelect()}>Export…</SelectAction>
        <SelectDelete count={n} onDelete={() => {
          const list = picked
          void deleteTasks(list).then((undo) => { offerUndo(list.length === 1 ? 'Task deleted' : `${list.length} tasks deleted`, undo); sel.clear() })
        }} />
      </SelectBar>

      {sheet === 'copy' && <CopySheet what={{ kind: 'tasks', tasks: picked }} onClose={() => setSheet(null)} onDone={() => sel.clear()} />}
      {sheet === 'move' && (
        <DayPickSheet title={inbox ? `Plan ${one} for…` : `Move ${one} to…`} inbox={!inbox}
          current={picked.length === 1 ? picked[0].planned_date : undefined}
          onPick={(d) => { setSheet(null); void moveTo(d) }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'repeat' && (
        <RepeatManySheet tasks={picked} onClose={() => setSheet(null)}
          onDone={(words) => { setSheet(null); sel.say(words) }} />
      )}
      {exp.sheet}
    </>
  )
}

/** "Change repeat" for the tasks picked: the one repeat control, then
 *  Apply. The control opens on the first task's day. */
function RepeatManySheet({ tasks, onClose, onDone }: { tasks: Task[]; onClose: () => void; onDone: (words: string) => void }) {
  useBackClose(onClose)
  const { today } = useDayRange()
  const [value, setValue] = useState<RepeatValue>(NO_REPEAT)
  const [busy, setBusy] = useState(false)
  const start = tasks.find((t) => t.planned_date)?.planned_date ?? today
  const inSeries = tasks.some((t) => !!t.series_id)
  const title = tasks.length === 1 ? `Repeat “${tasks[0].title || 'task'}”` : `Repeat ${tasks.length} tasks`
  const rule = value.rule ? describeSchedule({ rule: value.rule, rule_config: value.rule_config, start_date: start, end_date: value.end_date, occurrence_count: value.count ?? null }) : null
  const empty = value.rule === 'dates' && (value.rule_config.dates ?? []).length === 0
  const nothing = !value.rule && !inSeries

  async function apply() {
    if (busy || empty || nothing) return
    setBusy(true)
    try {
      const r = await repeatMany(tasks, value)
      onDone(repeatManyWords(r, rule))
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <RepeatPicker value={value} onChange={setValue} start={start} today={today} kinds={TASK_RULE_KINDS} allowCount loose
          noneLabel={inSeries ? 'Stop repeating' : 'Does not repeat'} />
        {inSeries && value.rule && <p className="row-meta">A task already repeating changes its whole series from today.</p>}
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary grow" disabled={busy || empty || nothing} onClick={() => void apply()}>
            {!value.rule && inSeries ? 'Stop repeating' : 'Apply'}
          </button>
        </div>
      </div>
    </>
  )
}
