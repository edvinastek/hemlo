import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { checklistProgress, hasNote, parseNote, toggleCheck, type Span } from '../lib/notes'
import { NoteEditor } from './NoteEditor'
import './notes.css'

function Words({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <Fragment key={i}>{s.text}</Fragment>))}</>
}

/** A task's note on a page of its own, for the tasks that need preparing or
 *  explaining. It shows the note drawn (headings, bullets, bold, a checklist
 *  to tick) and can switch back to the text to edit it.
 *
 *  `onKeep` is called with the note whenever something here should last: a
 *  tick at once, typing when the person stops editing or goes back. The task
 *  sheet decides what keeping means (saved now for a task that exists, held
 *  in the form for one not saved yet). */
export function NotesPage({ title, notes, onKeep, onClose }: {
  title: string
  notes: string | null
  onKeep: (notes: string | null) => void
  onClose: () => void
}) {
  const [text, setText] = useState(notes ?? '')
  // An empty note has nothing to show, so it opens ready to write.
  const [editing, setEditing] = useState(!hasNote(notes))
  const kept = useRef(notes ?? '')
  const blocks = useMemo(() => parseNote(text), [text])
  const { done, total } = checklistProgress(text)

  function keep(next: string) {
    if (next === kept.current) return
    kept.current = next
    onKeep(next || null)
  }

  function tick(line: number) {
    const next = toggleCheck(text, line)
    setText(next)
    keep(next)
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
        <h1 className="np-title">{title.trim() || 'Untitled task'}</h1>

        {editing ? (
          <NoteEditor className="np-editor" value={text} onChange={setText} autoFocus={!hasNote(text)} />
        ) : blocks.length === 0 ? (
          <p className="np-empty">Nothing written yet. Edit to add steps, a checklist or an explanation.</p>
        ) : (
          <div className="np-body">
            {blocks.map((b) => {
              if (b.kind === 'heading') {
                const H = b.level === 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4'
                return <H key={b.line} className={`np-h np-h${b.level}`}><Words spans={b.spans} /></H>
              }
              if (b.kind === 'text') {
                return (
                  <p key={b.lines[0].line} className="np-p">
                    {b.lines.map((l, i) => <Fragment key={l.line}>{i > 0 && <br />}<Words spans={l.spans} /></Fragment>)}
                  </p>
                )
              }
              return (
                <ul key={b.items[0].line} className="np-list">
                  {b.items.map((it) => (
                    <li key={it.line} className={`np-item${it.done ? ' is-done' : ''}`}
                      style={it.depth ? { marginLeft: it.depth * 22 } : undefined}>
                      {it.kind === 'check' ? (
                        <label className="np-check">
                          <input type="checkbox" checked={it.done} onChange={() => tick(it.line)} />
                          <span className="np-words"><Words spans={it.spans} /></span>
                        </label>
                      ) : (
                        <>
                          <span className="np-bullet" aria-hidden="true">•</span>
                          <span className="np-words"><Words spans={it.spans} /></span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
