import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  checklistProgress, hasNote, indentItem, itemSpan, linkOnLine, markerOnLine, moveItem, moveItemTo, orderItems, parseNote,
  toEditable, toggleCheck, type Item, type Span,
} from '../lib/notes'
import { NoteEditor, RecipeLinks } from './NoteEditor'
import { ExportLink } from './ExportLink'
import { noteText } from '../lib/transfer-rules'
import { removeMarkers } from '../lib/after-done-rules'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import { ensureInstance } from '../modules/defs'
import type { FillContext } from '../lib/template-rules'
import { offerUndo } from './Undo'
import { Tip } from './Tip'
import './notes.css'

function Words({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <Fragment key={i}>{s.text}</Fragment>))}</>
}

/** Whether ticked checklist items are drawn at the bottom (NOT-04). A
 *  person's choice, kept with the core module's settings so it follows
 *  them to every device. */
export function useTickedLast(): [boolean, (on: boolean) => void] {
  const profileId = useApp((s) => s.profile?.id)
  const on = useLiveQuery(async () => {
    if (!profileId) return false
    const inst = await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'core').first()
    return inst?.settings?.note_ticked_last === true
  }, [profileId], false)
  async function set(next: boolean) {
    if (!profileId) return
    const inst = await ensureInstance(profileId, 'core', true)
    const current = (await db.module_instance.get(inst.id)) ?? inst
    await edit('module_instance', current, { settings: { ...(current.settings ?? {}), note_ticked_last: next } })
  }
  return [on, (next) => void set(next)]
}

/** A task's note on a page of its own, for the tasks that need preparing or
 *  explaining. It shows the note drawn (headings, bullets, bold, a checklist
 *  to tick) and can switch back to the text to edit it. Checklist items can
 *  be moved by dragging their handle, or with each item's ⋮ menu (up, down,
 *  in, out), and ticked items can be drawn last.
 *
 *  `onKeep` is called with the note whenever something here should last: a
 *  tick or a move at once, typing when the person stops editing or goes
 *  back. The task sheet decides what keeping means (saved now for a task
 *  that exists, held in the form for one not saved yet). */
export function NotesPage({ title, notes, onKeep, onClose, context, afterDone = true, emptyTitle = 'Untitled task' }: {
  title: string
  notes: string | null
  onKeep: (notes: string | null) => void
  onClose: () => void
  context?: Partial<FillContext>
  afterDone?: boolean
  emptyTitle?: string
}) {
  const [text, setText] = useState(notes ?? '')
  // An empty note has nothing to show, so it opens ready to write.
  const [editing, setEditing] = useState(!hasNote(removeMarkers(notes ?? '')))
  const kept = useRef(notes ?? '')
  const blocks = useMemo(() => parseNote(text), [text])
  const { done, total } = checklistProgress(text)
  const [tickedLast, setTickedLast] = useTickedLast()
  const [menu, setMenu] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number | null; after: boolean } | null>(null)
  const templates = readSettings(useApp((s) => s.profile)).note_templates

  function keep(next: string) {
    if (next === kept.current) return
    kept.current = next
    onKeep(next || null)
  }

  function change(next: string, undoLabel?: string) {
    const before = text
    setText(next)
    keep(next)
    if (undoLabel) offerUndo(undoLabel, () => { setText(before); keep(before) })
  }

  function tick(line: number) {
    change(toggleCheck(text, line))
  }

  function back() {
    if (editing) keep(text)
    onClose()
  }

  function toggleMode() {
    if (editing) keep(text)
    setEditing(!editing)
  }

  // Escape goes back, as it closes the other overlays.
  const backRef = useRef(back)
  backRef.current = back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') backRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function act(line: number, what: 'up' | 'down' | 'in' | 'out') {
    setMenu(null)
    const r = what === 'up' ? moveItem(text, line, -1) : what === 'down' ? moveItem(text, line, 1)
      : indentItem(text, line, what === 'in' ? 1 : -1)
    if (r) change(r.text, what === 'up' || what === 'down' ? 'Item moved' : what === 'in' ? 'Item indented' : 'Item outdented')
  }

  // Dragging an item by its handle: the item under the finger is found by
  // its data-line, and the drop goes above or below it by which half of it
  // the finger is on.
  function overAt(x: number, y: number): { over: number | null; after: boolean } {
    const el = document.elementFromPoint(x, y)?.closest('[data-line]') as HTMLElement | null
    if (!el) return { over: null, after: false }
    const r = el.getBoundingClientRect()
    return { over: Number(el.dataset.line), after: y > r.top + r.height / 2 }
  }
  function startDrag(e: React.PointerEvent, line: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setMenu(null)
    setDrag({ from: line, over: null, after: false })
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return
    setDrag({ ...drag, ...overAt(e.clientX, e.clientY) })
  }
  function endDrag() {
    if (!drag) return
    const { from, over, after } = drag
    setDrag(null)
    if (over == null || over === from) return
    let r: { text: string; line: number } | null
    if (!after) r = moveItemTo(text, from, over)
    else {
      const span = itemSpan(text, over)
      const next = span ? span[1] : null
      const nextIsItem = next != null && itemSpan(text, next) !== null
      r = nextIsItem ? moveItemTo(text, from, next) : moveItemTo(text, from, null, span ? span[1] - 1 : over)
    }
    if (r) change(r.text, 'Item moved')
  }

  const hasList = blocks.some((b) => b.kind === 'list')

  function itemRow(it: Item) {
    const dropping = drag && drag.over === it.line && drag.from !== it.line
    return (
      <li key={it.line} data-line={it.line}
        className={`np-item${it.done ? ' is-done' : ''}${drag?.from === it.line ? ' is-dragged' : ''}${dropping ? (drag!.after ? ' drop-after' : ' drop-before') : ''}`}
        style={it.depth ? { marginLeft: it.depth * 22 } : undefined}>
        {it.kind === 'check' ? (
          <label className="np-check">
            <input type="checkbox" checked={it.done} onChange={() => tick(it.line)} />
            <span className="np-words"><Words spans={it.spans} /></span>
          </label>
        ) : (
          <span className="np-check">
            <span className="np-bullet" aria-hidden="true">•</span>
            <span className="np-words"><Words spans={it.spans} /></span>
          </span>
        )}
        <button type="button" className="np-handle" aria-label="Drag to move" title="Drag to move"
          onPointerDown={(e) => startDrag(e, it.line)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>⠿</button>
        <button type="button" className="np-more" aria-label="More for this item" aria-expanded={menu === it.line}
          onClick={() => setMenu(menu === it.line ? null : it.line)}>⋮</button>
        {menu === it.line && (
          <div className="np-menu" role="menu">
            <button type="button" role="menuitem" disabled={!moveItem(text, it.line, -1)} onClick={() => act(it.line, 'up')}>Move up</button>
            <button type="button" role="menuitem" disabled={!moveItem(text, it.line, 1)} onClick={() => act(it.line, 'down')}>Move down</button>
            <button type="button" role="menuitem" disabled={!indentItem(text, it.line, 1)} onClick={() => act(it.line, 'in')}>Indent</button>
            <button type="button" role="menuitem" disabled={!indentItem(text, it.line, -1)} onClick={() => act(it.line, 'out')}>Outdent</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="np" role="dialog" aria-modal="true" aria-label={`Note: ${title || 'task'}`}>
      <div className="np-inner">
        <header className="np-head">
          <button type="button" className="np-back" onClick={back}>‹ Back</button>
          {total > 0 && <span className="np-progress">{done} of {total} done</span>}
          <button type="button" className="np-mode" onClick={toggleMode}>
            {editing ? 'View' : 'Edit'}
          </button>
        </header>
        <h1 className="np-title">{title.trim() || emptyTitle}</h1>

        {editing ? (
          <NoteEditor className="np-editor" value={text} onChange={setText} autoFocus={!hasNote(text)}
            context={{ title, ...context }} afterDone={afterDone} />
        ) : blocks.length === 0 ? (
          <p className="np-empty">Nothing written yet. Edit to add steps, a checklist or an explanation.</p>
        ) : (
          <div className="np-body">
            {/* The first checklist met: how ticking works (ONB-13), once. */}
            {total > 0 && <Tip id="first-checklist" />}
            {blocks.map((b) => {
              if (b.kind === 'heading') {
                const H = b.level === 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4'
                return <H key={b.line} className={`np-h np-h${b.level}`}><Words spans={b.spans} /></H>
              }
              if (b.kind === 'text') {
                // Code lines (a recipe's link, the after-done marker) are
                // drawn in words below, not as text.
                const lines = text.split('\n')
                const shown = b.lines.filter((l) => !linkOnLine(lines[l.line] ?? '') && !markerOnLine(lines[l.line] ?? ''))
                if (!shown.length) return null
                return (
                  <p key={b.lines[0].line} className="np-p">
                    {shown.map((l, i) => <Fragment key={l.line}>{i > 0 && <br />}<Words spans={l.spans} /></Fragment>)}
                  </p>
                )
              }
              return <ul key={b.items[0].line} className="np-list">{orderItems(b.items, tickedLast).map(itemRow)}</ul>
            })}
            {(() => {
              const id = text.split('\n').map(markerOnLine).find(Boolean)
              if (!id) return null
              const name = templates.find((t) => t.id === id)?.name ?? 'a note'
              return (
                <div className="ne-coded">
                  <span>Asks for <b>{name}</b> when the task is done</span>
                  <button type="button" className="ne-link" onClick={() => change(removeMarkers(text), 'No longer asks when done')}>Remove</button>
                </div>
              )
            })()}
            <RecipeLinks note={text} onChange={(n) => change(n)} />
            {hasList && (
              <div className="np-pref">
                <span>Ticked items go to the bottom</span>
                <button type="button" className="switch" role="switch" aria-checked={tickedLast} aria-label="Ticked items go to the bottom"
                  onClick={() => setTickedLast(!tickedLast)} />
              </div>
            )}
          </div>
        )}
        {hasNote(text) && <ExportLink source={{ text: noteText(title, null, toEditable(text).text), label: title.trim() || 'Note' }} />}
      </div>
    </div>
  )
}
