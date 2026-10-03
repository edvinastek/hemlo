import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useInRouterContext } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import {
  applyTool, continueList, fromEditable, indentSelection, toEditable, type Edit, type Hidden, type Tool,
} from '../lib/notes'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { addTemplate, applyNoteTemplate, FILLS, type FillContext, type NoteTemplate } from '../lib/template-rules'
import { blockChanged, recipeBlocks, replaceBlock, type RecipeBlock } from '../lib/recipe-note-rules'
import { figuresOf, loadRecipes, recipeBlockText } from '../lib/recipe-note'
import { foodRoute } from '../lib/hub-rules'
import { TemplatePicker } from './TemplatePicker'
import { RecipeInsert } from './RecipeInsert'
import { offerUndo } from './Undo'
import './notes.css'

const TOOLS: { tool: Tool; glyph: string; name: string }[] = [
  { tool: 'check', glyph: '☐', name: 'Checklist item' },
  { tool: 'bullet', glyph: '•', name: 'Bullet' },
  { tool: 'bold', glyph: 'B', name: 'Bold' },
  { tool: 'heading', glyph: 'H', name: 'Heading' },
]

type Panel = null | 'menu' | 'template' | 'recipe' | 'save' | { ask: NoteTemplate }

/** A note's text box with a row of small formatting buttons above it. The
 *  buttons write the same plain Markdown a person could type, so the note
 *  stays readable wherever it ends up. `aside` sits at the right end of the
 *  label row (the task sheet puts "Open as page" there).
 *
 *  The same editor serves tasks, habits, chores and module records (NOT-16).
 *  Its Insert menu puts in a note template (NOT-13) or a recipe (NOT-20),
 *  and keeps any note as a new template (NOT-11). Codes never show in the
 *  box (NOT-17): an "ask after done" marker is a sentence under it with a
 *  Remove button, and a recipe's link line shows without its code, with
 *  "Open recipe" and, when the recipe has changed, "Update from recipe".
 *
 *  - `context` fills a template's fill-ins (the day, the task's title, its
 *    time, the first day for {day count}); today when not given.
 *  - `afterDone` (tasks only) lets an "ask after done" template wait for the
 *    tick instead of going in at once.
 *  - `templateMode` edits a template's own text: fill-in buttons instead of
 *    the Insert menu, and nothing hidden.
 *  - `startLabel` shows a button of that name while the note is empty, to
 *    start it from a note template (a new task: NOT-13); `onTemplateUsed`
 *    hears which template went in, so a task template can carry it (NOT-15). */
export function NoteEditor({
  value, onChange, label = 'Note', aside, className, autoFocus, context, afterDone = true, templateMode = false,
  startLabel, onTemplateUsed,
}: {
  value: string
  onChange: (text: string) => void
  label?: string
  aside?: ReactNode
  className?: string
  autoFocus?: boolean
  context?: Partial<FillContext>
  afterDone?: boolean
  templateMode?: boolean
  startLabel?: string
  onTemplateUsed?: (template: NoteTemplate, asPrompt: boolean) => void
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  // Where the cursor goes once the new text is on screen. Setting it before
  // React has written the text would put it in the old text.
  const caret = useRef<[number, number] | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [note, setNote] = useState<string | null>(null)
  const profile = useApp((s) => s.profile)
  const templates = useMemo(() => readSettings(profile).note_templates, [profile])

  const { text, hidden } = useMemo<{ text: string; hidden: Hidden }>(
    () => (templateMode ? { text: value, hidden: { afterDone: null, links: [] } } : toEditable(value)), [value, templateMode])

  useLayoutEffect(() => {
    const el = box.current
    const at = caret.current
    if (!el || !at) return
    caret.current = null
    el.focus()
    el.setSelectionRange(at[0], at[1])
  })

  const emit = (next: string, h: Hidden = hidden) => onChange(templateMode ? next : fromEditable(next, h))

  function commit(e: Edit) {
    caret.current = [e.start, e.end]
    emit(e.text)
  }

  function use(tool: Tool) {
    const el = box.current
    if (!el) return
    commit(applyTool(el.value, el.selectionStart, el.selectionEnd, tool))
  }

  function indent(dir: -1 | 1) {
    const el = box.current
    if (!el) return
    commit(indentSelection(el.value, el.selectionStart, el.selectionEnd, dir))
  }

  /** Puts text in at the cursor (a fill-in) or, with nothing focused, at the end. */
  function insertAtCursor(add: string) {
    const el = box.current
    const at = el && document.activeElement === el ? el.selectionStart : text.length
    const end = el && document.activeElement === el ? el.selectionEnd : text.length
    commit({ text: text.slice(0, at) + add + text.slice(end), start: at + add.length, end: at + add.length })
  }

  // A new line typed at the end of a list item starts the next item. This
  // looks at the change rather than at the Enter key, because a phone's
  // keyboard often sends Enter as part of a word it is still composing.
  function typed(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target
    const next = el.value
    const at = el.selectionStart
    if (el.selectionEnd === at && next.length === text.length + 1 && next[at - 1] === '\n'
      && next.slice(0, at - 1) + next.slice(at) === text) {
      const list = continueList(text, at - 1, at - 1)
      if (list) return commit(list)
    }
    emit(next)
  }

  const ctx: FillContext = { day: context?.day ?? format(new Date(), 'yyyy-MM-dd'), title: context?.title, time: context?.time, start: context?.start }

  function putTemplate(t: NoteTemplate, asPrompt: boolean) {
    const before = value
    const next = applyNoteTemplate(value, t, ctx, asPrompt)
    onChange(next)
    onTemplateUsed?.(t, asPrompt)
    setPanel(null)
    setNote(asPrompt ? `It will ask for ${t.name} when the task is ticked.` : null)
    offerUndo(asPrompt ? 'Template set to ask when done' : `${t.name} added`, () => onChange(before))
  }

  function pickTemplate(t: NoteTemplate) {
    if (t.after_done && afterDone && !templateMode) setPanel({ ask: t })
    else putTemplate(t, false)
  }

  function putRecipes(block: string) {
    const before = value
    const was = text.replace(/\s+$/, '')
    emit(was ? `${was}\n\n${block}` : block)
    setPanel(null)
    offerUndo('Recipe added to the note', () => onChange(before))
  }

  const askName = hidden.afterDone ? templates.find((t) => t.id === hidden.afterDone)?.name ?? 'a note' : null

  return (
    <div className={`ne${className ? ` ${className}` : ''}`}>
      <div className="ne-head">
        <span className="ne-label">{label}</span>
        {aside}
      </div>
      <div className="ne-tools" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          // Pressing a button would otherwise take the focus, and on a phone
          // the keyboard with it, from the text being formatted.
          <button key={t.tool} type="button" className={`ne-tool ne-${t.tool}`} aria-label={t.name} title={t.name}
            onMouseDown={(e) => e.preventDefault()} onClick={() => use(t.tool)}>{t.glyph}</button>
        ))}
        <button type="button" className="ne-tool" aria-label="Indent list item" title="Indent"
          onMouseDown={(e) => e.preventDefault()} onClick={() => indent(1)}>→</button>
        <button type="button" className="ne-tool" aria-label="Outdent list item" title="Outdent"
          onMouseDown={(e) => e.preventDefault()} onClick={() => indent(-1)}>←</button>
        {!templateMode && (
          <button type="button" className="ne-tool ne-insert" aria-expanded={panel === 'menu'} aria-haspopup="true"
            onClick={() => setPanel(panel === 'menu' ? null : 'menu')}>Insert</button>
        )}
      </div>

      {templateMode && (
        <div className="ne-fills" role="group" aria-label="Fill-ins">
          <span className="ne-fills-label">Fill in when used:</span>
          {FILLS.map((f) => (
            <button key={f.token} type="button" className="ne-pill" title={`Becomes ${f.example}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insertAtCursor(f.token)}>{f.label}</button>
          ))}
        </div>
      )}

      {startLabel && !templateMode && !panel && !value.trim() && (
        <button type="button" className="ne-pill ne-start" onClick={() => setPanel('template')}>{startLabel}</button>
      )}

      {panel === 'menu' && (
        <div className="ne-menu" role="menu" aria-label="Insert">
          <button type="button" role="menuitem" onClick={() => setPanel('template')}>A note template</button>
          <button type="button" role="menuitem" onClick={() => setPanel('recipe')}>A recipe</button>
          <button type="button" role="menuitem" disabled={!value.trim()} onClick={() => setPanel('save')}>Save this note as a template</button>
        </div>
      )}
      {panel === 'template' && <TemplatePicker onPick={pickTemplate} onClose={() => setPanel(null)}
        title={startLabel && !value.trim() ? startLabel : undefined} />}
      {panel && typeof panel === 'object' && 'ask' in panel && (
        <div className="tp" role="group" aria-label={`${panel.ask.name}: when`}>
          <p className="tp-title">{panel.ask.name} is meant for after the task.</p>
          <button type="button" className="tp-item" onClick={() => putTemplate(panel.ask, true)}>
            <span className="tp-name">Ask for it when the task is ticked</span>
            <span className="tp-sum">With Fill in, Later and Skip</span>
          </button>
          <button type="button" className="tp-item" onClick={() => putTemplate(panel.ask, false)}>
            <span className="tp-name">Put it in now</span>
          </button>
          <button type="button" className="tp-close" onClick={() => setPanel(null)}>Cancel</button>
        </div>
      )}
      {panel === 'recipe' && <RecipeInsert onInsert={putRecipes} onClose={() => setPanel(null)} />}
      {panel === 'save' && <SaveAsTemplate body={templateMode ? value : text} onDone={(msg) => { setPanel(null); setNote(msg) }} />}
      {note && <p className="ne-note" role="status">{note}</p>}

      <textarea ref={box} aria-label={label} value={text} onChange={typed} autoFocus={autoFocus} />

      {askName && (
        <div className="ne-coded">
          <span>Asks for <b>{askName}</b> when the task is done</span>
          <button type="button" className="ne-link" onClick={() => {
            const before = value
            emit(text, { ...hidden, afterDone: null })
            offerUndo('No longer asks when done', () => onChange(before))
          }}>Remove</button>
        </div>
      )}
      {!templateMode && hidden.links.length > 0 && <RecipeLinks note={value} onChange={onChange} />}
    </div>
  )
}

/** "Save as template" (NOT-11): a name, and the note becomes a template the
 *  person can use anywhere. Codes are not copied: a template starts clean. */
function SaveAsTemplate({ body, onDone }: { body: string; onDone: (msg: string | null) => void }) {
  const profile = useApp((s) => s.profile)
  const [name, setName] = useState('')
  const [after, setAfter] = useState(false)
  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (!profile) return
    const list = readSettings(profile).note_templates
    const made = addTemplate(list, name, body, after)
    if (!made) return
    await saveSettings(profile, { note_templates: made.list })
    onDone(`Saved as the template ${made.list.at(-1)!.name}.`)
  }
  return (
    <div className="tp" role="group" aria-label="Save as a template">
      <div className="tp-head">
        <span className="tp-title">Save this note as a template</span>
        <button type="button" className="tp-close" onClick={() => onDone(null)}>Cancel</button>
      </div>
      <input className="tp-search" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
        aria-label="Template name" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} />
      <button type="button" className="ne-pill" aria-pressed={after} onClick={() => setAfter(!after)}>Can ask when a task is done</button>
      <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void save()}>Save template</button>
    </div>
  )
}

/** The recipes linked from a note, in plain words, each with Open recipe,
 *  and Update from recipe when the recipe no longer matches (NOT-21,
 *  NOT-22). Nothing changes until the person asks. */
export function RecipeLinks({ note, onChange }: { note: string; onChange: (next: string) => void }) {
  const routed = useInRouterContext()
  const blocks = useMemo(() => recipeBlocks(note), [note])
  const ids = blocks.map((b) => b.id).join(',')
  const data = useLiveQuery(() => loadRecipes(ids ? ids.split(',') : []), [ids])
  if (!blocks.length) return null

  function fresh(b: RecipeBlock): string | null {
    const d = data?.get(b.id)
    if (!d) return null
    // Figures that cannot be worked out on this phone are not a change.
    if (b.figures && !figuresOf(d)) return null
    return recipeBlockText(d, { portions: b.portions, ingredients: b.ingredients, steps: b.steps, figures: b.figures })
  }

  return (
    <ul className="ne-links" aria-label="Recipes in this note">
      {blocks.map((b, i) => {
        const now = fresh(b)
        const changed = now != null && blockChanged(note, b, now)
        const gone = data && !data.has(b.id)
        return (
          <li key={`${b.id}-${i}`} className="ne-coded">
            <span>From <b>{b.name}</b> · {b.portions} {b.portions === 1 ? 'portion' : 'portions'}{gone ? ' · the recipe is no longer here' : ''}</span>
            {routed && !gone && <OpenRecipe id={b.id} />}
            {changed && (
              <button type="button" className="ne-link" onClick={() => {
                const before = note
                onChange(replaceBlock(note, b, now!))
                offerUndo('Updated from the recipe', () => onChange(before))
              }}>Update from recipe</button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function OpenRecipe({ id }: { id: string }) {
  const navigate = useNavigate()
  return <button type="button" className="ne-link" onClick={() => navigate(foodRoute('recipe', id))}>Open recipe</button>
}
