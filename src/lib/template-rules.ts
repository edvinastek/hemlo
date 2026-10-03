/** Templates a person keeps: note templates (a note to start from) and task
 *  templates (a whole task to start from). Kept in profile.settings, so they
 *  follow the person to every device. Pure. */
import { withAfterDone } from './after-done-rules.ts'

export interface NoteTemplate {
  id: string
  name: string
  /** The note text, with fill-ins such as {date} and {title}. */
  body: string
  /** Opened when a task using it is ticked done ("what do you remember?"). */
  after_done: boolean
}

export interface TaskTemplate {
  id: string
  name: string
  title: string
  minutes: number | null
  section: string | null
  locked: boolean
  /** The note to start with: a note template's id, or the text itself. */
  note_template_id: string | null
  note: string | null
}

export const MAX_TEMPLATES = 100
export const MAX_TEMPLATE_BODY = 4000
const ID = /^[a-z0-9_-]{1,40}$/i

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

/** The templates a person starts with. They are ordinary templates: edit or
 *  delete any of them, and once the list has been changed it is theirs. */
export const STARTER_NOTE_TEMPLATES: NoteTemplate[] = [
  { id: 'recipe', name: 'Recipe: ingredients and steps', after_done: false,
    body: '## Ingredients\n- [ ] \n\n## Steps\n1. ' },
  { id: 'meal-prep', name: 'Meal prep checklist', after_done: false,
    body: '## {weekday} meal prep\n- [ ] Plan the meals\n- [ ] Check the cupboard\n- [ ] Cook\n- [ ] Portion and label\n- [ ] Clean up' },
  { id: 'reading', name: 'Reading reflection', after_done: true,
    body: '## {title}, {date}\n### What I remember\n- \n### Questions\n- \n### A line worth keeping\n' },
  { id: 'study', name: 'Study session', after_done: true,
    body: '## Goal\n- \n## Done\n- \n## Next time\n- ' },
  { id: 'workout', name: 'Workout plan', after_done: false,
    body: '## Warm-up\n- [ ] \n## Main\n- [ ] \n## Cool-down\n- [ ] ' },
  { id: 'packing', name: 'Packing list', after_done: false,
    body: '## Packing\n- [ ] Phone and charger\n- [ ] Keys\n- [ ] Wallet\n- [ ] ' },
  { id: 'meeting', name: 'Meeting notes', after_done: false,
    body: '## {title}, {date}\n### Agenda\n- \n### Decided\n- \n### To do\n- [ ] ' },
  { id: 'weekly-review', name: 'Weekly review', after_done: true,
    body: '## Week of {date}\n### Went well\n- \n### Didn\'t\n- \n### Next week\n- [ ] ' },
  { id: 'cleaning', name: 'Cleaning checklist', after_done: false,
    body: '## Cleaning\n- [ ] Kitchen\n- [ ] Bathroom\n- [ ] Floors\n- [ ] Bins out' },
  { id: 'shopping-run', name: 'Shopping run', after_done: false,
    body: '## Shopping\n- [ ] Check the list\n- [ ] Bags\n- [ ] Put things away' },
]

/** Stored note templates, checked. A list never written yet gives the
 *  starter set; an empty list is a person's choice and stays empty. */
export function readNoteTemplates(v: unknown): NoteTemplate[] {
  if (!Array.isArray(v)) return STARTER_NOTE_TEMPLATES.map((t) => ({ ...t }))
  const seen = new Set<string>()
  const out: NoteTemplate[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null
    const name = str(r.name, 60)
    const body = typeof r.body === 'string' ? r.body.slice(0, MAX_TEMPLATE_BODY) : null
    if (!id || !name || body == null || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, body, after_done: r.after_done === true })
    if (out.length >= MAX_TEMPLATES) break
  }
  return out
}

export function readTaskTemplates(v: unknown): TaskTemplate[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: TaskTemplate[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null
    const name = str(r.name, 60)
    const title = str(r.title, 200)
    if (!id || !name || !title || seen.has(id)) continue
    seen.add(id)
    const m = Number(r.minutes)
    out.push({
      id, name, title,
      minutes: r.minutes != null && Number.isFinite(m) && m >= 0 && m <= 1440 ? Math.round(m) : null,
      section: str(r.section, 40),
      locked: r.locked === true,
      note_template_id: typeof r.note_template_id === 'string' && ID.test(r.note_template_id) ? r.note_template_id : null,
      note: typeof r.note === 'string' ? r.note.slice(0, MAX_TEMPLATE_BODY) : null,
    })
    if (out.length >= MAX_TEMPLATES) break
  }
  return out
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A template's text with its fill-ins filled for a task on a day:
 *  {date} → "2 October 2026", {weekday} → "Friday", {title} → the task's
 *  title, {time} → its time or nothing, {day count} → which day it is since
 *  `start` (the first day of a repeat or a challenge: "12"), or nothing
 *  when there is no start. Unknown braces stay as typed. */
export function fillTemplate(body: string, ctx: FillContext): string {
  const [y, m, d] = ctx.day.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const values: Record<string, string> = {
    date: `${d} ${MONTHS[m - 1]} ${y}`,
    weekday: WEEKDAYS[wd],
    title: ctx.title ?? '',
    time: ctx.time ? ctx.time.slice(0, 5) : '',
    'day count': dayCount(ctx.start, ctx.day),
  }
  return body.replace(FILL, (_, k: string) => values[fillName(k)])
}

export interface FillContext {
  /** The day the note is for, 'yyyy-MM-dd'. */
  day: string
  title?: string
  time?: string | null
  /** The first day, for {day count}. */
  start?: string | null
}

const FILL = /\{(date|weekday|title|time|day ?count)\}/gi
/** A fill-in's name however it was typed: "{DayCount}" is "day count". */
const fillName = (k: string) => k.toLowerCase().replace(/^day ?count$/, 'day count')

function dayCount(start: string | null | undefined, day: string): string {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || start > day) return ''
  const n = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86_400_000 }
  return String(Math.round(n(day) - n(start)) + 1)
}

/** The fill-ins a template can use, in plain words (NOT-17): what is typed,
 *  what the editor calls it, and an example of what it becomes. */
export const FILLS: { token: string; label: string; example: string }[] = [
  { token: '{date}', label: 'date', example: '2 October 2026' },
  { token: '{weekday}', label: 'weekday', example: 'Friday' },
  { token: '{time}', label: 'time', example: '18:30' },
  { token: '{title}', label: 'title', example: 'the task’s title' },
  { token: '{day count}', label: 'day count', example: 'day 12 of a repeat' },
]

/** A template's text cut into plain text and fill-ins, so the editor can
 *  draw each fill-in as a labelled chip instead of a code in braces. */
export function templateParts(body: string): ({ text: string } | { fill: string })[] {
  const out: ({ text: string } | { fill: string })[] = []
  let at = 0
  for (const m of body.matchAll(FILL)) {
    if (m.index! > at) out.push({ text: body.slice(at, m.index) })
    out.push({ fill: fillName(m[1]) })
    at = m.index! + m[0].length
  }
  if (at < body.length) out.push({ text: body.slice(at) })
  return out
}

/** One line about what a template holds, for the list: its headings, or
 *  its first words. */
export function templateSummary(body: string): string {
  const heads = body.split('\n').map((l) => /^#{1,6}\s+(.+)$/.exec(l)?.[1]?.trim()).filter((h): h is string => !!h)
  const plain = (s: string) => templateParts(s).map((p) => ('fill' in p ? p.fill : p.text)).join('')
  if (heads.length) return heads.map(plain).join(' · ').slice(0, 120)
  return plain(body.replace(/^[ \t]*[-*+] (\[[ xX]\] )?/gm, '').replace(/\s+/g, ' ').trim()).slice(0, 120)
}

/** Puts a template into a note (NOT-13): filled, after what is already
 *  there, with a blank line between. A template meant for after the task
 *  (NOT-14) and `asPrompt` adds the "ask after done" marker instead, so it
 *  opens when the task is ticked. */
export function applyNoteTemplate(note: string | null | undefined, t: NoteTemplate, ctx: FillContext, asPrompt = false): string {
  if (asPrompt && t.after_done) return withAfterDone(note, t.id)
  const add = fillTemplate(t.body, ctx)
  const was = (note ?? '').replace(/\s+$/, '')
  return was ? `${was}\n\n${add}` : add
}

/* ---------- keeping the list (NOT-11) --------------------------------------- */

/** A new template at the end of the list; its id is made from its name. */
export function addTemplate(list: NoteTemplate[], name: string, body: string, after_done = false): { list: NoteTemplate[]; id: string } | null {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean || list.length >= MAX_TEMPLATES) return null
  const id = templateId(clean, list.map((t) => t.id))
  return { list: [...list, { id, name: clean, body: body.slice(0, MAX_TEMPLATE_BODY), after_done }], id }
}

/** One template changed; the name may not become empty. */
export function updateTemplate(list: NoteTemplate[], id: string, patch: Partial<Omit<NoteTemplate, 'id'>>): NoteTemplate[] {
  return list.map((t) => {
    if (t.id !== id) return t
    const name = patch.name !== undefined ? patch.name.replace(/\s+/g, ' ').trim().slice(0, 60) || t.name : t.name
    return { ...t, ...patch, name, body: (patch.body ?? t.body).slice(0, MAX_TEMPLATE_BODY) }
  })
}

/** Moves a template one place up or down. */
export function moveTemplate(list: NoteTemplate[], id: string, dir: -1 | 1): NoteTemplate[] {
  const i = list.findIndex((t) => t.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Takes a template out, saying where it was so Undo can put it back. */
export function removeTemplate(list: NoteTemplate[], id: string): { list: NoteTemplate[]; removed: NoteTemplate | null; index: number } {
  const index = list.findIndex((t) => t.id === id)
  if (index < 0) return { list, removed: null, index: -1 }
  return { list: list.filter((t) => t.id !== id), removed: list[index], index }
}

/** Puts a removed template back where it was (Undo). */
export function restoreTemplate(list: NoteTemplate[], t: NoteTemplate, index: number): NoteTemplate[] {
  if (list.some((x) => x.id === t.id)) return list
  const out = [...list]
  out.splice(Math.max(0, Math.min(index, out.length)), 0, t)
  return out
}

/** A note's checklist with every tick cleared, for "same notes, ticks
 *  cleared" when copying. */
export function clearTicks(note: string): string {
  return note.replace(/^(\s*[-*+]\s+)\[[xX]\]/gm, '$1[ ]')
}

/** A fresh template id from a name, unique among the ones given. */
export function templateId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'template'
  let id = base
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`
  return id
}
