import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { applyTool, continueList, type Edit, type Tool } from '../lib/notes'
import './notes.css'

const TOOLS: { tool: Tool; glyph: string; name: string }[] = [
  { tool: 'check', glyph: '☐', name: 'Checklist item' },
  { tool: 'bullet', glyph: '•', name: 'Bullet' },
  { tool: 'bold', glyph: 'B', name: 'Bold' },
  { tool: 'heading', glyph: 'H', name: 'Heading' },
]

/** A note's text box with a row of small formatting buttons above it. The
 *  buttons write the same plain Markdown a person could type, so the note
 *  stays readable wherever it ends up. `aside` sits at the right end of the
 *  button row (the task sheet puts "Open as page" there). */
export function NoteEditor({ value, onChange, label = 'Note', aside, className, autoFocus }: {
  value: string
  onChange: (text: string) => void
  label?: string
  aside?: ReactNode
  className?: string
  autoFocus?: boolean
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  // Where the cursor goes once the new text is on screen. Setting it before
  // React has written the text would put it in the old text.
  const caret = useRef<[number, number] | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    const at = caret.current
    if (!el || !at) return
    caret.current = null
    el.focus()
    el.setSelectionRange(at[0], at[1])
  })

  function commit(e: Edit) {
    caret.current = [e.start, e.end]
    onChange(e.text)
  }

  function use(tool: Tool) {
    const el = box.current
    if (!el) return
    commit(applyTool(el.value, el.selectionStart, el.selectionEnd, tool))
  }

  // A new line typed at the end of a list item starts the next item. This
  // looks at the change rather than at the Enter key, because a phone's
  // keyboard often sends Enter as part of a word it is still composing.
  function typed(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target
    const next = el.value
    const at = el.selectionStart
    if (el.selectionEnd === at && next.length === value.length + 1 && next[at - 1] === '\n'
      && next.slice(0, at - 1) + next.slice(at) === value) {
      const list = continueList(value, at - 1, at - 1)
      if (list) return commit(list)
    }
    onChange(next)
  }

  return (
    <div className={`ne${className ? ` ${className}` : ''}`}>
      <div className="ne-head">
        <span className="ne-label">{label}</span>
        <div className="ne-tools" role="toolbar" aria-label="Formatting">
          {TOOLS.map((t) => (
            // Pressing a button would otherwise take the focus, and on a phone
            // the keyboard with it, from the text being formatted.
            <button key={t.tool} type="button" className={`ne-tool ne-${t.tool}`} aria-label={t.name} title={t.name}
              onMouseDown={(e) => e.preventDefault()} onClick={() => use(t.tool)}>{t.glyph}</button>
          ))}
        </div>
        {aside}
      </div>
      <textarea ref={box} aria-label={label} value={value} onChange={typed} autoFocus={autoFocus} />
    </div>
  )
}
