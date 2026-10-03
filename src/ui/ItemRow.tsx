import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { DayItem } from '../lib/day-items-rules'
import { checklistProgress, hasNote, parseNote, type Span } from '../lib/notes'
import { pendingAfterDone, removeMarkers } from '../lib/after-done-rules'
import { TaskControls, TickButton } from './TaskRow'
import './colours.css'
import './itemrow.css'

/** One quick action in an open row (and, the same, in its ⋮ menu). */
export interface RowAction {
  label: string
  run: () => void
  danger?: boolean
}

interface Props {
  item: DayItem
  /** The module's colour (colours on), or a followed calendar's colour. */
  colour: string | null
  /** The module's name, so the colour is never the only thing that says it. */
  moduleName: string | null
  /** Its ⋮ button (from the list). */
  more: ReactNode
  expanded: boolean
  /** A tap on the name: open it (or, when open in place, close it). */
  onTitle: () => void
  /** The tick: a task, a habit, a chore, a supplement slot, a planned payment. */
  onTick: () => void
  onPush: (minutes: number) => void
  /** A count habit's new amount. */
  onAmount: (amount: number | null) => void
  /** A checklist line ticked in the note: the line (task) or the index
   *  among the checklist items (habit). */
  onCheck: (at: number) => void
  /** One supplement of a slot ticked. */
  onPart: (id: string) => void
  /** The quick actions of an open row. */
  actions: RowAction[]
  /** Name of the template a ticked task will ask for, for the plain words. */
  afterDoneName?: string | null
}

/** A row on the day's rail, for anything the day holds: a task, a habit, a
 *  chore, a supplement slot, an event or a record. Collapsed it reads like
 *  the planner always did: time in the margin, a dot on the rail, the name,
 *  a line under it, and its controls on the right. Open in place (the long
 *  hold, TOD-10) it shows its note with a checklist to tick (TOD-12), its
 *  facts and its quick actions; its header stays in sight while the rest
 *  scrolls (TOD-11). */
export function ItemRow(p: Props) {
  const { item, colour, expanded } = p
  const task = item.task
  const done = item.done
  const skipped = task?.status === 'dropped'
  const slipped = !!task && (task.status === 'stuck' || task.needs_review) && !done && !skipped

  const meta = metaLine(p)
  const mark = noteMark(item)

  const cls = [
    'row', 'ir', `ir-${item.kind}`,
    done ? 'is-done' : '', skipped ? 'is-skipped' : '', slipped ? 'is-slipped' : '',
    colour ? 'has-mod' : '', expanded ? 'is-open' : '', item.readonly ? 'is-readonly' : '',
    item.state === 'overdue' ? 'is-waiting' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={cls} style={colour ? ({ '--row-mod': colour } as CSSProperties) : undefined}
      aria-label={expanded ? `${item.title}, open` : undefined}>
      <span className="row-time">{item.time ?? (item.allDay ? 'All day' : '')}</span>
      <span className="row-dot" aria-hidden="true" />

      <div className="ir-head">
        <div className="ir-main">
          <div className="row-name">
            <button type="button" onClick={p.onTitle} aria-expanded={expanded}
              title={expanded ? 'Close' : item.readonly ? 'Show' : 'Open'}>
              {item.title || 'Untitled'}
            </button>
            {!meta && mark}
          </div>
          {meta && <div className="row-meta">{meta}{mark}</div>}
          {slipped && <div className="row-note">pushed {task!.push_count}×, needs a new time</div>}
          {item.kind === 'chore' && typeof item.dueness === 'number' && !done && item.dueness > 0 && item.dueness < 1 && (
            <span className="ir-due" role="img" aria-label={`About ${Math.round(item.dueness * 100)}% of the way to due`}>
              <i style={{ width: `${Math.round(item.dueness * 100)}%` }} />
            </span>
          )}
        </div>
        <Controls {...p} />
      </div>

      {expanded && <Body {...p} />}
    </article>
  )
}

/** A note as it is read: no "after done" marker line, and a recipe link's
 *  code left out (its words stay). Lines keep their places, so a tick still
 *  finds its line. */
const shownNote = (note: string) => note
  .replace(/^\{after-done:[a-z0-9-]{1,64}\}$/gm, '')
  .replace(/ ?\{recipe:[0-9a-f-]{36}\}/g, '')

/** The small line under the name. */
function metaLine({ item, colour, moduleName }: Props): string {
  const t = item.task
  if (t) {
    return [
      t.status === 'dropped' ? 'Skipped' : null,
      t.duration_min ? `${t.duration_min} min` : null,
      t.category ?? (colour ? moduleName : null),
      !(t.status === 'stuck' || t.needs_review) && t.push_count > 0 ? `pushed ${t.push_count}×` : null,
    ].filter(Boolean).join(' · ')
  }
  // "All day" already stands in the margin.
  if (item.kind === 'event') return [item.minutes ? `${item.minutes} min` : null, (item.allDay ? item.meta.replace(/^All day( · )?/, '') : item.meta) || null].filter(Boolean).join(' · ')
  if (item.kind === 'record') return moduleName ?? ''
  return item.meta
}

/** A checklist's "2/5", or a mark that there is a note. */
function noteMark(item: DayItem): ReactNode {
  const note = item.note ? removeMarkers(item.note) : ''
  if (item.kind === 'habit') {
    const total = checklistProgress(note).total
    if (total === 0) return hasNote(note) ? <NoteMark /> : null
    const n = (item.checks ?? []).filter((i) => i < total).length
    return <Chip done={n} total={total} />
  }
  const list = checklistProgress(note)
  if (list.total > 0) return <Chip done={list.done} total={list.total} />
  return hasNote(note) ? <NoteMark /> : null
}

function Chip({ done, total }: { done: number; total: number }) {
  return (
    <span className={`row-chip${done === total ? ' is-complete' : ''}`}
      aria-label={`${done} of ${total} checklist items done`}>{done}/{total}</span>
  )
}

function NoteMark() {
  return (
    <span className="row-notemark" role="img" aria-label="Has a note">
      <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden="true">
        <path d="M1.5 0.5h5l2 2v8h-7z" stroke="currentColor" />
        <path d="M3 5h4M3 7.5h3" stroke="currentColor" />
      </svg>
    </span>
  )
}

/** The controls on the right, by kind. */
function Controls(p: Props) {
  const { item, more } = p
  if (item.task) return <TaskControls task={item.task} onPush={p.onPush} onTick={p.onTick} more={more} />
  if (item.kind === 'habit' && item.target && item.target > 0) {
    const n = item.amount ?? 0
    return (
      <div className="row-right">
        <div className="ir-count" role="group" aria-label={`${item.title}: ${n} of ${item.target}${item.unit ? ` ${item.unit}` : ''}`}>
          <button type="button" aria-label="One less" disabled={n <= 0} onClick={() => p.onAmount(Math.max(0, n - 1))}>−</button>
          <span className={item.done ? 'is-met' : ''}>{fmt(n)}/{fmt(item.target)}</span>
          <button type="button" aria-label="One more" onClick={() => p.onAmount(n + 1)}>+</button>
        </div>
        {more}
      </div>
    )
  }
  if (item.kind === 'habit' || item.kind === 'chore' || item.kind === 'supplements' || item.kind === 'payment') {
    const partly = item.kind === 'supplements' && !item.done && (item.parts ?? []).some((x) => x.done)
    return (
      <div className="row-right">
        <TickButton done={item.done} partly={partly} label={item.title} onTick={p.onTick} />
        {more}
      </div>
    )
  }
  return <div className="row-right">{more}</div>
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function Words({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <Fragment key={i}>{s.text}</Fragment>))}</>
}

/** The note, drawn, with its checklist to tick. For a habit the ticks are
 *  the day's (from its log, by item index); for a task they are in the note. */
function NoteView({ note, checks, onCheck, label }: {
  note: string; checks?: number[]; onCheck: (at: number) => void; label: string
}) {
  const blocks = parseNote(note)
  let index = -1
  return (
    <div className="ir-note">
      {blocks.map((b) => {
        if (b.kind === 'heading') return <p key={b.line} className={`ir-h ir-h${b.level}`}><Words spans={b.spans} /></p>
        if (b.kind === 'text') {
          return (
            <p key={b.lines[0].line} className="ir-p">
              {b.lines.map((l, i) => <Fragment key={l.line}>{i > 0 && <br />}<Words spans={l.spans} /></Fragment>)}
            </p>
          )
        }
        return (
          <ul key={b.items[0].line} className="ir-list" aria-label={`${label}: checklist`}>
            {b.items.map((it) => {
              if (it.kind !== 'check') {
                return (
                  <li key={it.line} className="ir-item" style={it.depth ? { marginLeft: it.depth * 20 } : undefined}>
                    <span className="ir-bullet" aria-hidden="true">•</span><span><Words spans={it.spans} /></span>
                  </li>
                )
              }
              index++
              const at = checks ? index : it.line
              const ticked = checks ? checks.includes(index) : it.done
              return (
                <li key={it.line} className={`ir-item${ticked ? ' is-done' : ''}`} style={it.depth ? { marginLeft: it.depth * 20 } : undefined}>
                  <label className="ir-check">
                    <input type="checkbox" checked={ticked} onChange={() => onCheck(at)} />
                    <span><Words spans={it.spans} /></span>
                  </label>
                </li>
              )
            })}
          </ul>
        )
      })}
    </div>
  )
}

/** What an open row shows under its header. */
function Body(p: Props) {
  const { item, actions } = p
  const t = item.task
  const note = item.note ? shownNote(item.note) : ''
  const waiting = t ? pendingAfterDone(t.notes) : null

  const facts = t
    ? [
      t.planned_time ? t.planned_time.slice(0, 5) : 'No time',
      t.duration_min ? `${t.duration_min} min` : null,
      t.category ?? 'No section',
      t.locked ? 'Locked' : null,
      t.series_id ? 'Repeats' : null,
    ]
    : item.kind === 'event'
      ? [item.allDay ? 'All day' : item.time, item.minutes ? `${item.minutes} min` : null, item.meta || null]
      : [item.time ?? (item.kind === 'record' ? null : 'Any time'), item.minutes ? `${item.minutes} min` : null, item.kind === 'record' ? null : item.meta || null]

  return (
    <div className="ir-body" data-no-hold data-no-swipe>
      <p className="ir-facts">{facts.filter(Boolean).join(' · ')}</p>

      {hasNote(note)
        ? <NoteView note={note} checks={item.kind === 'habit' ? item.checks ?? [] : undefined} onCheck={p.onCheck} label={item.title} />
        : (t || item.kind === 'habit' || item.kind === 'chore') && <p className="ir-empty">No note.</p>}
      {waiting && (
        <p className="ir-asks">When it is ticked, it asks for {p.afterDoneName ? `“${p.afterDoneName}”` : 'a note'}.</p>
      )}

      {item.kind === 'habit' && item.target && item.target > 0 && <AmountField item={item} onAmount={p.onAmount} />}

      {item.kind === 'supplements' && (
        <ul className="ir-list ir-parts" aria-label={`${item.title}: each one`}>
          {(item.parts ?? []).map((x) => (
            <li key={x.id} className={`ir-item${x.done ? ' is-done' : ''}`}>
              <label className="ir-check">
                <input type="checkbox" checked={x.done} onChange={() => p.onPart(x.id)} />
                <span>{x.name}{x.dose && <span className="ir-dose"> · {x.dose}</span>}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <div className="ir-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`btn ir-act${a.danger ? ' is-danger' : ''}`} onClick={a.run}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A count habit's amount, typed. Saved on Enter or when the field is left. */
function AmountField({ item, onAmount }: { item: DayItem; onAmount: (n: number | null) => void }) {
  const [text, setText] = useState(item.amount == null ? '' : String(item.amount))
  useEffect(() => { setText(item.amount == null ? '' : String(item.amount)) }, [item.amount])
  const keep = () => {
    const n = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if (n === null || (Number.isFinite(n) && n >= 0)) { if (n !== (item.amount ?? null)) onAmount(n) }
    else setText(item.amount == null ? '' : String(item.amount))
  }
  return (
    <label className="ir-amount">
      <span>Done so far{item.unit ? ` (${item.unit})` : ''}</span>
      <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={keep} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); keep() } }} />
      <span className="ir-of">of {fmt(item.target ?? 0)}</span>
    </label>
  )
}
