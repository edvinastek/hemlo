/** Templates a person keeps: note templates (a note to start from) and task
 *  templates (a whole task to start from). Kept in profile.settings, so they
 *  follow the person to every device. Pure. */

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
  /** How it repeats, in the one repeat engine's shape (TSK-26), or none.
   *  The days are worked out again from the day the task is made for. */
  repeat?: { rule: string; rule_config: Record<string, unknown>; count: number | null } | null
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
      // Only a template that repeats carries the key.
      ...(readRepeat(r.repeat) ? { repeat: readRepeat(r.repeat) } : {}),
    })
    if (out.length >= MAX_TEMPLATES) break
  }
  return out
}

const REPEAT_KINDS = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates', 'times_per_week']

/** A task template's repeat: a known kind with a settings object, and a
 *  count of 1 to 999 or none. Anything else is no repeat. (The settings are
 *  cleaned again by the repeat engine when the task is made.) */
function readRepeat(v: unknown): TaskTemplate['repeat'] {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.rule !== 'string' || !REPEAT_KINDS.includes(r.rule)) return null
  const cfg = r.rule_config && typeof r.rule_config === 'object' && !Array.isArray(r.rule_config) ? (r.rule_config as Record<string, unknown>) : {}
  const n = Number(r.count)
  return { rule: r.rule, rule_config: cfg, count: r.count != null && Number.isInteger(n) && n >= 1 && n <= 999 ? n : null }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A template's text with its fill-ins filled for a task on a day:
 *  {date} → "2 October 2026", {weekday} → "Friday", {title} → the task's
 *  title, {time} → its time or nothing. Unknown braces stay as typed. */
export function fillTemplate(body: string, ctx: { day: string; title?: string; time?: string | null }): string {
  const [y, m, d] = ctx.day.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const values: Record<string, string> = {
    date: `${d} ${MONTHS[m - 1]} ${y}`,
    weekday: WEEKDAYS[wd],
    title: ctx.title ?? '',
    time: ctx.time ? ctx.time.slice(0, 5) : '',
  }
  return body.replace(/\{(date|weekday|title|time)\}/g, (_, k: string) => values[k])
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
