import type { EntityDef, FieldDef, FieldType, ModuleDef, RuleDef, ViewDef } from './types.ts'
import { checkFormula, evaluateFormula } from './formula.ts'
import { MODULES } from './registry.ts'

/** The rules every module definition obeys, whoever wrote it. Pure: no
 *  database and no React, so the checks run in Node.
 *
 *  Everything read from storage (a module someone built, the changes someone
 *  made to a built-in one) passes through here before any screen sees it.
 *  What does not fit is dropped rather than trusted: a definition is data,
 *  and the only thing in it that is ever run is the formula language. */

export const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'integer', 'boolean', 'date', 'time', 'datetime', 'select', 'lookup', 'formula', 'duration',
]
export type LookupKind = NonNullable<FieldDef['lookup']>
export const LOOKUPS: LookupKind[] = ['food', 'recipe', 'exercise', 'task', 'goal']
export const VIEW_TYPES: ViewDef['type'][] = ['list', 'table', 'calendar', 'board', 'grid', 'chart', 'form']
/** The view types the generic module page draws: all of them. */
export const PAGE_VIEW_TYPES: ViewDef['type'][] = ['list', 'table', 'calendar', 'board', 'grid', 'chart', 'form']
export type ChartPeriod = NonNullable<ViewDef['period']>
export const CHART_PERIODS: ChartPeriod[] = ['day', 'week', 'month']
export type ChartKind = NonNullable<ViewDef['chart']>
export const CHART_KINDS: ChartKind[] = ['bar', 'line']
/** A board card shows its name and at most this many other fields. */
export const BOARD_CARD_FIELDS = 2
export type StatsKind = NonNullable<FieldDef['stats']>
export const STATS: StatsKind[] = ['sum', 'average', 'count']

export const LIMITS = {
  fields: 40,
  options: 50,
  option: 60,
  label: 60,
  unit: 16,
  formula: 200,
  views: 12,
  viewName: 40,
  keywords: 20,
  keyword: 30,
  summary: 160,
  moduleName: 60,
  entities: 4,
  /** Bytes. The server allows 64 KB for a definition and 16 KB for a record;
   *  staying a little under leaves room for its own encoding. */
  definition: 60000,
  record: 15000,
  text: 2000,
}

export const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/
export const BUILT_KEY = /^u_[a-z0-9]{6,24}$/
const VIEW_KEY = /^[a-z0-9_]{1,40}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d/
const LOOKUP_ID = /^[A-Za-z0-9_-]{1,64}$/

export const NUMERIC_TYPES: FieldType[] = ['number', 'integer', 'duration', 'formula']
export const isNumeric = (f: Pick<FieldDef, 'type'>) => NUMERIC_TYPES.includes(f.type)
export const isDateLike = (f: Pick<FieldDef, 'type'>) => f.type === 'date' || f.type === 'datetime'

export const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v ?? null)).length

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/* ---------- names, glyphs, keywords -------------------------------------- */

/** A field name from its label: "Cost (EUR)" becomes cost_eur, unique in the list. */
export function fieldNameFrom(label: string, taken: string[]): string {
  let base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  if (!/^[a-z]/.test(base)) base = `f_${base}`.replace(/_+$/, '').slice(0, 36)
  if (!FIELD_NAME.test(base)) base = 'field'
  let name = base
  for (let i = 2; taken.includes(name); i++) name = `${base}_${i}`
  return name
}

/** One character (a letter, digit or symbol), never a picture. */
export function glyphProblem(glyph: string): string | null {
  if (!glyph) return null
  const chars = Array.from(glyph)
  if (chars.length !== 1) return 'Use a single character.'
  if (/\s/.test(glyph)) return 'Use a letter or a symbol.'
  if (/\p{Extended_Pictographic}/u.test(glyph)) return 'Use a letter or a symbol, not a picture.'
  return null
}

export function cleanGlyph(v: unknown): string | undefined {
  const g = typeof v === 'string' ? v.trim() : ''
  return g && !glyphProblem(g) ? g : undefined
}

/** "books, Reading list , reading" → ['books', 'reading list', 'reading'] */
export function cleanKeywords(v: unknown): string[] {
  const list = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : []
  const out: string[] = []
  for (const k of list) {
    if (typeof k !== 'string') continue
    const w = k.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, LIMITS.keyword)
    if (w && !out.includes(w)) out.push(w)
    if (out.length >= LIMITS.keywords) break
  }
  return out
}

/** A new built module's key: u_ and twelve random letters and digits. */
export function newModuleKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return `u_${Array.from(random(12), (b) => abc[b % abc.length]).join('')}`
}

/* ---------- fields -------------------------------------------------------- */

/** Names a formula at position `index` may use: every field before it, and
 *  every stored field after it. Formulas are worked out in order, so one may
 *  build on an earlier one but never on itself or a later one. */
export function formulaScope(fields: Pick<FieldDef, 'name' | 'type'>[], index: number): string[] {
  return fields.filter((f, i) => i !== index && (f.type !== 'formula' || i < index)).map((f) => f.name)
}

/** What is wrong with a field, in words for the person editing it. */
export function fieldProblem(f: FieldDef, others: FieldDef[], index = others.length): string | null {
  if (!f.label.trim()) return 'Give the field a name.'
  if (f.label.length > LIMITS.label) return `Keep the name under ${LIMITS.label} characters.`
  if (!FIELD_NAME.test(f.name)) return 'That field has an unusable internal name.'
  if (others.some((o, i) => i !== index && o.name === f.name)) return 'Two fields cannot share a name.'
  if (!FIELD_TYPES.includes(f.type)) return 'Pick a kind of field.'
  if (f.unit && f.unit.length > LIMITS.unit) return `Keep the unit under ${LIMITS.unit} characters.`
  if (f.type === 'select') {
    const opts = f.options ?? []
    if (opts.length === 0) return 'A choice field needs at least one option.'
    if (opts.length > LIMITS.options) return `At most ${LIMITS.options} options.`
    if (new Set(opts).size !== opts.length) return 'Two options are the same.'
    if (opts.some((o) => !o.trim() || o.length > LIMITS.option)) return `Options are 1 to ${LIMITS.option} characters.`
  }
  if (f.type === 'lookup' && !LOOKUPS.includes(f.lookup as LookupKind)) return 'Pick what the field links to.'
  if (f.type === 'formula') {
    const src = (f.formula ?? '').trim()
    if (!src) return 'Write the formula.'
    if (src.length > LIMITS.formula) return `Keep the formula under ${LIMITS.formula} characters.`
    const list = [...others]
    list.splice(index, index < others.length ? 1 : 0, f)
    return checkFormula(src, formulaScope(list, index))
  }
  if (f.stats && (!STATS.includes(f.stats) || (f.stats !== 'count' && !isNumeric(f)))) return 'Only numbers can be added up or averaged.'
  return null
}

/** A field as read from storage, with anything unknown or oversized left
 *  out; null when it cannot be used at all. `names` is every field name in
 *  its entity so far, for the formula check. */
export function cleanField(raw: unknown, before: FieldDef[] = []): FieldDef | null {
  if (!isObj(raw)) return null
  const name = str(raw.name, 40)
  const type = raw.type as FieldType
  if (!FIELD_NAME.test(name) || !FIELD_TYPES.includes(type)) return null
  if (before.some((f) => f.name === name)) return null
  const label = str(raw.label, LIMITS.label) || name
  const f: FieldDef = { name, label, type }
  if (type === 'formula') {
    const src = str(raw.formula, LIMITS.formula)
    if (!src) return null
    f.formula = src
  }
  if (type === 'lookup') {
    if (!LOOKUPS.includes(raw.lookup as LookupKind)) return null
    f.lookup = raw.lookup as LookupKind
  }
  if (type === 'select') {
    const opts = Array.isArray(raw.options) ? raw.options : []
    const clean: string[] = []
    for (const o of opts) {
      const s = str(o, LIMITS.option)
      if (s && !clean.includes(s)) clean.push(s)
      if (clean.length >= LIMITS.options) break
    }
    if (clean.length === 0) return null
    f.options = clean
  }
  if (raw.required === true && type !== 'formula') f.required = true
  const unit = str(raw.unit, LIMITS.unit)
  if (unit) f.unit = unit
  if (typeof raw.width === 'number' && raw.width >= 40 && raw.width <= 400) f.width = Math.round(raw.width)
  if (STATS.includes(raw.stats as StatsKind) && (raw.stats === 'count' || isNumeric(f))) f.stats = raw.stats as StatsKind
  if (raw.hidden === true && !f.required) f.hidden = true
  return f
}

/** Fields of one entity, in order, formulas checked against what comes before. */
export function cleanFields(raw: unknown): FieldDef[] {
  const out: FieldDef[] = []
  if (!Array.isArray(raw)) return out
  for (const r of raw) {
    if (out.length >= LIMITS.fields) break
    const f = cleanField(r, out)
    if (f) out.push(f)
  }
  // A formula may only name fields that survived.
  return out.filter((f, i) => f.type !== 'formula' || checkFormula(f.formula!, formulaScope(out, i)) === null)
}

/* ---------- views and rules ----------------------------------------------- */

export function cleanView(raw: unknown, entities: EntityDef[]): ViewDef | null {
  if (!isObj(raw) || entities.length === 0) return null
  const key = str(raw.key, 40)
  const type = raw.type as ViewDef['type']
  if (!VIEW_KEY.test(key) || !VIEW_TYPES.includes(type)) return null
  const entity = entities.find((e) => e.name === raw.entity) ?? entities[0]
  const names = entity.fields.map((f) => f.name)
  const v: ViewDef = { key, name: str(raw.name, LIMITS.viewName) || key, type, entity: entity.name }
  if (Array.isArray(raw.columns)) {
    const cols = [...new Set(raw.columns.filter((c): c is string => typeof c === 'string' && names.includes(c)))]
    if (cols.length) v.columns = cols
  }
  const df = entity.fields.find((f) => f.name === raw.dateField && isDateLike(f))
  if (df) v.dateField = df.name
  // Each kind keeps only the settings it uses, naming fields that fit.
  const named = (n: unknown, ok: (f: FieldDef) => boolean) => entity.fields.find((f) => f.name === n && ok(f))?.name
  if (type === 'board') {
    const g = named(raw.groupBy, (f) => f.type === 'select')
    if (g) v.groupBy = g
    if (v.columns) v.columns = v.columns.slice(0, BOARD_CARD_FIELDS)
  }
  if (type === 'grid') {
    const g = named(raw.groupBy, isGridRow)
    if (g) v.groupBy = g
    const m = named(raw.field, isGridMark)
    // An empty name is a choice: a tap just adds a record for the day.
    if (m || raw.field === '') v.field = m ?? ''
  }
  if (type === 'chart') {
    const m = named(raw.field, isNumeric)
    if (m) v.field = m
    if (CHART_PERIODS.includes(raw.period as ChartPeriod)) v.period = raw.period as ChartPeriod
    if (CHART_KINDS.includes(raw.chart as ChartKind)) v.chart = raw.chart as ChartKind
  }
  if (raw.hidden === true) v.hidden = true
  return v
}

/* ---------- what board, grid and chart views go by ------------------------ */

/** A field that can name a grid's rows: text, a choice or a link. */
export const isGridRow = (f: Pick<FieldDef, 'type'>) => f.type === 'text' || f.type === 'select' || f.type === 'lookup'
/** A field a tap on a grid cell can tick: yes/no, or a number to count up. */
export const isGridMark = (f: Pick<FieldDef, 'type'>) =>
  f.type === 'boolean' || f.type === 'number' || f.type === 'integer' || f.type === 'duration'

const shownFirst = (fields: FieldDef[], ok: (f: FieldDef) => boolean) =>
  fields.find((f) => ok(f) && !f.hidden) ?? fields.find(ok)

/** The date field a view goes by: the one it names, else the first. */
export function viewDateField(entity: EntityDef, view: Pick<ViewDef, 'dateField'>): FieldDef | undefined {
  return entity.fields.find((f) => f.name === view.dateField && isDateLike(f)) ?? shownFirst(entity.fields, isDateLike)
}

/** Board: the choice field whose options are the columns. */
export function boardField(entity: EntityDef, view: Pick<ViewDef, 'groupBy'>): FieldDef | undefined {
  return entity.fields.find((f) => f.name === view.groupBy && f.type === 'select') ?? shownFirst(entity.fields, (f) => f.type === 'select')
}

/** Grid: what names the rows, which day a record is on, and what a tap
 *  ticks. With `field` absent the first yes/no (else number) field is
 *  used; with it empty, nothing is ticked and a tap just adds a record for
 *  the day. */
export function gridFields(entity: EntityDef, view: Pick<ViewDef, 'groupBy' | 'dateField' | 'field'>):
  { row?: FieldDef; date?: FieldDef; mark?: FieldDef } {
  const main = mainField(entity.fields)
  const row = entity.fields.find((f) => f.name === view.groupBy && isGridRow(f))
    ?? (main && isGridRow(main) ? main : shownFirst(entity.fields, isGridRow))
  const mark = view.field === undefined
    ? shownFirst(entity.fields, (f) => f.type === 'boolean') ?? shownFirst(entity.fields, isGridMark)
    : entity.fields.find((f) => f.name === view.field && isGridMark(f))
  return { row, date: viewDateField(entity, view), mark }
}

/** Chart: the number drawn and the day it belongs to. */
export function chartFields(entity: EntityDef, view: Pick<ViewDef, 'field' | 'dateField'>): { value?: FieldDef; date?: FieldDef } {
  const value = entity.fields.find((f) => f.name === view.field && isNumeric(f)) ?? shownFirst(entity.fields, isNumeric)
  return { value, date: viewDateField(entity, view) }
}

/** What stops a board, grid or chart from being drawn, in words; null when
 *  nothing does. Other kinds always draw. */
export function viewProblem(view: ViewDef, entity: EntityDef): string | null {
  if (view.type === 'board' && !boardField(entity, view)) return 'A board needs a choice field; its options are the columns.'
  if (view.type === 'grid') {
    const g = gridFields(entity, view)
    if (!g.date) return 'A grid needs a date field: its columns are days.'
    if (!g.row) return 'A grid needs a text or choice field to name its rows.'
  }
  if (view.type === 'chart') {
    const c = chartFields(entity, view)
    if (!c.value) return 'A chart needs a number field to draw.'
    if (!c.date) return 'A chart needs a date field to draw it over time.'
  }
  return null
}

/** A new view with its settings filled in from the fields there are, so it
 *  draws something straight away. What is already set is kept. */
export function viewDefaults(view: ViewDef, entity: EntityDef): ViewDef {
  const v: ViewDef = { ...view }
  const date = viewDateField(entity, v)
  if ((v.type === 'calendar' || v.type === 'grid' || v.type === 'chart') && !v.dateField && date) v.dateField = date.name
  if (v.type === 'board' && !v.groupBy) { const g = boardField(entity, v); if (g) v.groupBy = g.name }
  if (v.type === 'grid') {
    const g = gridFields(entity, v)
    if (!v.groupBy && g.row) v.groupBy = g.row.name
    if (v.field === undefined && g.mark) v.field = g.mark.name
  }
  if (v.type === 'chart') {
    const c = chartFields(entity, v)
    if (!v.field && c.value) v.field = c.value.name
    if (!v.period) v.period = 'week'
    if (!v.chart) v.chart = 'bar'
  }
  return v
}

export function cleanViews(raw: unknown, entities: EntityDef[]): ViewDef[] {
  const out: ViewDef[] = []
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const v = cleanView(r, entities)
      if (v && !out.some((o) => o.key === v.key)) out.push(v)
      if (out.length >= LIMITS.views) break
    }
  }
  return out
}

export const RULE_DAY_TASK = 'day_task'
export const RULE_REMIND = 'remind'
export const DEFAULT_REMIND_TIME = '09:00'

/** The rules a built module can switch on. Both start off. */
export function builtRuleCatalogue(): RuleDef[] {
  return [
    { name: RULE_DAY_TASK, sentence: 'Put records with a date on the day as a task.', when: 'record.saved', then: 'task.upsert', off: true },
    { name: RULE_REMIND, sentence: 'Remind me at the record’s time, or at a set time when it has none.', when: 'task.planned', then: 'task.set_time', off: true, time: DEFAULT_REMIND_TIME },
  ]
}

/** A built module's rules: the catalogue, with what was stored switched on
 *  or off and its time kept. Anything else stored under rules is ignored. */
export function cleanBuiltRules(raw: unknown): RuleDef[] {
  const stored = Array.isArray(raw) ? raw.filter(isObj) : []
  return builtRuleCatalogue().map((r) => {
    const s = stored.find((x) => x.name === r.name)
    if (!s) return r
    const out: RuleDef = { ...r, off: s.off !== false }
    if (r.time !== undefined) out.time = typeof s.time === 'string' && TIME.test(s.time) ? s.time : r.time
    return out
  })
}

export const ruleOn = (def: Pick<ModuleDef, 'rules'>, name: string) =>
  def.rules.some((r) => r.name === name && !r.off)

/* ---------- the rules of built-in modules --------------------------------- */

/** What the app does with a rule of a built-in module:
 *  - switch: it acts on it, so switching it off stops it;
 *  - always: it is what the module is, so it has no switch (switch the
 *    module off instead);
 *  - later: nothing in the app acts on it yet, so a switch would do nothing
 *    and none is shown. */
export type RuleSupport = 'switch' | 'always' | 'later'

/** Every rule in the registry, by "module.rule", with a line for the editor
 *  on what switching it off does, or why there is no switch. A rule added to
 *  the registry without a line here counts as "later", and
 *  moduledefs.check.mjs fails until it has one. */
export const BUILTIN_RULES: Record<string, { support: RuleSupport; note: string }> = {
  'nutrition.meal_tasks': { support: 'switch', note: 'Off: planned meals stay on Food and the shopping list, but from today on they are not put on Today as tasks.' },
  'nutrition.skipped_meal': { support: 'later', note: 'Not acted on yet: a meal cannot be marked skipped in the app.' },
  'nutrition.size_main': { support: 'switch', note: 'Off: Food no longer offers to size the main meal to the day’s target.' },
  'shopping.from_plan': { support: 'always', note: 'This is how the trip is made, so it stays on. Switch Shopping off in More to stop it.' },
  'shopping.trip_days': { support: 'later', note: 'Not acted on yet: shopping days are not put on the planner.' },
  'training.session_task': { support: 'later', note: 'Not acted on yet: sessions are logged, not planned ahead.' },
  'habits.daily': { support: 'always', note: 'Where habits show is now set by the module’s Show on Today, Show on Plan and Show on the widget switches.' },
  'supplements.slot_task': { support: 'later', note: 'Not acted on yet: supplements are ticked on Today, not made into tasks.' },
  'health.retarget': { support: 'switch', note: 'Off: a weigh-in is saved and the calorie and protein targets are left as they are.' },
  'learning.soft': { support: 'later', note: 'Not acted on yet: the planner does not move tasks by itself.' },
  'agenda.no_overlap': { support: 'later', note: 'Not acted on yet: the planner does not place tasks by itself.' },
  'sleep.bedtime': { support: 'later', note: 'Not acted on yet: the planner does not place tasks by itself.' },
  'projects.to_goal': { support: 'later', note: 'Not acted on yet: goals have no page of their own to show on.' },
  'household.shared': { support: 'later', note: 'Not acted on yet: records are kept per person.' },
}

export function ruleSupport(moduleKey: string, ruleName: string): RuleSupport {
  // A built module's rules (a task per dated record, reminders) are all acted on.
  if (BUILT_KEY.test(moduleKey)) return 'switch'
  return BUILTIN_RULES[`${moduleKey}.${ruleName}`]?.support ?? 'later'
}

export const ruleSwitchable = (moduleKey: string, ruleName: string) => ruleSupport(moduleKey, ruleName) === 'switch'

/** Whether a built-in module's rule is on for a profile, from the changes
 *  kept in its settings (module_instance.settings.overlay). A rule the app
 *  does not act on reads as the registry has it. */
export function isBuiltinRuleOn(moduleKey: string, ruleName: string, overlay: unknown): boolean {
  const base = MODULES.find((m) => m.key === moduleKey)
  const rule = base?.rules.find((r) => r.name === ruleName)
  if (!base || !rule || rule.off) return false
  if (!ruleSwitchable(moduleKey, ruleName)) return true
  return !(readOverlay(overlay, base).rulesOff ?? []).includes(ruleName)
}

/* ---------- a module someone built --------------------------------------- */

export interface StoredModule { key: string; name: string; definition: unknown }

/** A built module's definition as the app uses it, from its stored row. */
export function readBuiltDefinition(row: StoredModule): ModuleDef {
  const d = isObj(row.definition) ? row.definition : {}
  const entities: EntityDef[] = []
  if (Array.isArray(d.entities)) {
    for (const e of d.entities) {
      if (!isObj(e) || entities.length >= LIMITS.entities) continue
      const name = str(e.name, 40)
      if (!FIELD_NAME.test(name) || entities.some((x) => x.name === name)) continue
      // No table: a built module's records always live in module_record.
      entities.push({ name, label: str(e.label, LIMITS.label) || name, fields: cleanFields(e.fields) })
    }
  }
  let views = cleanViews(d.views, entities)
  if (views.length === 0 && entities.length) views = [{ key: 'list', name: 'List', type: 'list', entity: entities[0].name }]
  const def: ModuleDef = {
    key: row.key,
    name: str(row.name, LIMITS.moduleName) || str(d.name, LIMITS.moduleName) || 'My module',
    summary: str(d.summary, LIMITS.summary),
    entities,
    views,
    rules: cleanBuiltRules(d.rules),
    depth: 'light',
    built: true,
    keywords: cleanKeywords(d.keywords),
  }
  const glyph = cleanGlyph(d.glyph)
  if (glyph) def.glyph = glyph
  return def
}

/** What is stored in module.definition for a built module. */
export function definitionFor(def: ModuleDef): Record<string, unknown> {
  return {
    name: def.name,
    summary: def.summary,
    glyph: def.glyph ?? null,
    keywords: def.keywords ?? [],
    entities: def.entities.map((e) => ({ name: e.name, label: e.label, fields: e.fields })),
    views: def.views,
    rules: def.rules.map((r) => ({ name: r.name, off: !!r.off, ...(r.time ? { time: r.time } : {}) })),
  }
}

/** Everything wrong with a definition before it is saved, first problem first. */
export function definitionProblem(def: ModuleDef): string | null {
  if (!def.name.trim()) return 'Give the module a name.'
  if (def.name.length > LIMITS.moduleName) return `Keep the name under ${LIMITS.moduleName} characters.`
  if (def.summary.length > LIMITS.summary) return `Keep the summary under ${LIMITS.summary} characters.`
  const g = glyphProblem(def.glyph ?? '')
  if (g) return g
  for (const e of def.entities) {
    if (e.fields.length > LIMITS.fields) return `At most ${LIMITS.fields} fields.`
    for (const [i, f] of e.fields.entries()) {
      const p = fieldProblem(f, e.fields, i)
      if (p) return `${f.label || 'A field'}: ${p}`
    }
    if (e.fields.length && e.fields.every((f) => f.hidden)) return 'Keep at least one field showing.'
  }
  if (def.views.length > LIMITS.views) return `At most ${LIMITS.views} views.`
  if (def.views.length && def.views.every((v) => v.hidden)) return 'Keep at least one view switched on.'
  // The app's own views of a built-in module are its business; the ones a
  // person added must be able to draw.
  const base = def.built ? undefined : MODULES.find((m) => m.key === def.key)
  for (const v of def.views) {
    if (v.hidden || base?.views.some((b) => b.key === v.key)) continue
    const e = def.entities.find((x) => x.name === v.entity)
    const p = e ? viewProblem(v, e) : null
    if (p) return `${v.name || 'A view'}: ${p}`
  }
  if (def.built && bytes(definitionFor(def)) > LIMITS.definition) return 'This module has grown too large to keep. Remove some fields or options.'
  return null
}

/* ---------- changes to a built-in module ---------------------------------- */

/** A person's changes to a built-in module, kept in module_instance.settings.
 *  Field keys are "entity.field". */
export interface Overlay {
  name?: string
  glyph?: string
  summary?: string
  keywords?: string[]
  labels?: Record<string, string>
  hidden?: string[]
  order?: Record<string, string[]>
  /** Fields added to an entity that keeps its records in module_record. */
  extra?: Record<string, FieldDef[]>
  stats?: Record<string, StatsKind | 'none'>
  views?: {
    order?: string[]
    hidden?: string[]
    names?: Record<string, string>
    columns?: Record<string, string[]>
    dateField?: Record<string, string>
    extra?: ViewDef[]
  }
  rulesOff?: string[]
}

export const OVERLAY_KEY = 'overlay'

/** An overlay as read from storage, checked against the module it changes. */
export function readOverlay(raw: unknown, base: ModuleDef): Overlay {
  if (!isObj(raw)) return {}
  const o: Overlay = {}
  const name = str(raw.name, LIMITS.moduleName)
  if (name) o.name = name
  const glyph = cleanGlyph(raw.glyph)
  if (glyph) o.glyph = glyph
  if (typeof raw.summary === 'string') o.summary = str(raw.summary, LIMITS.summary)
  if (raw.keywords !== undefined) o.keywords = cleanKeywords(raw.keywords)

  const baseKeys = new Set(base.entities.flatMap((e) => e.fields.map((f) => `${e.name}.${f.name}`)))
  const extra: Record<string, FieldDef[]> = {}
  if (isObj(raw.extra)) {
    for (const e of base.entities) {
      if (e.table || !Array.isArray(raw.extra[e.name])) continue
      const room = LIMITS.fields - e.fields.length
      const list: FieldDef[] = []
      for (const r of raw.extra[e.name] as unknown[]) {
        if (list.length >= room) break
        const f = cleanField(r, [...e.fields, ...list])
        if (f) list.push({ ...f, hidden: undefined, stats: undefined })
      }
      const all = [...e.fields, ...list]
      const ok = list.filter((f) => f.type !== 'formula' || checkFormula(f.formula!, formulaScope(all, all.indexOf(f))) === null)
      if (ok.length) extra[e.name] = ok.map(stripUndefined)
    }
  }
  if (Object.keys(extra).length) o.extra = extra
  const known = new Set([...baseKeys, ...Object.entries(extra).flatMap(([e, fs]) => fs.map((f) => `${e}.${f.name}`))])

  if (isObj(raw.labels)) {
    const labels: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw.labels)) {
      const l = str(v, LIMITS.label)
      if (baseKeys.has(k) && l) labels[k] = l
    }
    if (Object.keys(labels).length) o.labels = labels
  }
  if (Array.isArray(raw.hidden)) {
    const required = new Set(base.entities.flatMap((e) => e.fields.filter((f) => f.required).map((f) => `${e.name}.${f.name}`)))
    const hidden = [...new Set(raw.hidden.filter((k): k is string => typeof k === 'string' && known.has(k) && !required.has(k)))]
    if (hidden.length) o.hidden = hidden
  }
  if (isObj(raw.order)) {
    const order: Record<string, string[]> = {}
    for (const e of base.entities) {
      const list = raw.order[e.name]
      if (!Array.isArray(list)) continue
      const names = [...e.fields.map((f) => f.name), ...(extra[e.name] ?? []).map((f) => f.name)]
      const clean = [...new Set(list.filter((n): n is string => typeof n === 'string' && names.includes(n)))]
      if (clean.length) order[e.name] = clean
    }
    if (Object.keys(order).length) o.order = order
  }
  if (isObj(raw.stats)) {
    const stats: Record<string, StatsKind | 'none'> = {}
    for (const [k, v] of Object.entries(raw.stats)) {
      if (!known.has(k)) continue
      const [en, fn] = k.split('.')
      const f = [...(base.entities.find((e) => e.name === en)?.fields ?? []), ...(extra[en] ?? [])].find((x) => x.name === fn)
      if (!f) continue
      if (v === 'none' || (STATS.includes(v as StatsKind) && (v === 'count' || isNumeric(f)))) stats[k] = v as StatsKind | 'none'
    }
    if (Object.keys(stats).length) o.stats = stats
  }

  if (isObj(raw.views)) {
    const rv = raw.views
    const views: NonNullable<Overlay['views']> = {}
    const entities = applyFields(base, o)
    const extraViews = cleanViews(rv.extra, entities)
      .filter((v) => !base.views.some((b) => b.key === v.key) && PAGE_VIEW_TYPES.includes(v.type))
      .map((v) => { const { hidden: _h, ...rest } = v; return rest })
    if (extraViews.length) views.extra = extraViews.slice(0, LIMITS.views - base.views.length)
    const keys = [...base.views.map((v) => v.key), ...(views.extra ?? []).map((v) => v.key)]
    if (Array.isArray(rv.order)) {
      const order = [...new Set(rv.order.filter((k): k is string => typeof k === 'string' && keys.includes(k)))]
      if (order.length) views.order = order
    }
    if (Array.isArray(rv.hidden)) {
      const hidden = [...new Set(rv.hidden.filter((k): k is string => typeof k === 'string' && keys.includes(k)))]
      if (hidden.length && hidden.length < keys.length) views.hidden = hidden
    }
    if (isObj(rv.names)) {
      const names: Record<string, string> = {}
      for (const [k, v] of Object.entries(rv.names)) {
        const n = str(v, LIMITS.viewName)
        if (keys.includes(k) && n) names[k] = n
      }
      if (Object.keys(names).length) views.names = names
    }
    const viewEntity = (k: string) => {
      const v = [...base.views, ...(views.extra ?? [])].find((x) => x.key === k)
      return entities.find((e) => e.name === v?.entity)
    }
    if (isObj(rv.columns)) {
      const columns: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(rv.columns)) {
        const e = viewEntity(k)
        if (!e || !Array.isArray(v)) continue
        const cols = [...new Set(v.filter((c): c is string => typeof c === 'string' && e.fields.some((f) => f.name === c)))]
        if (cols.length) columns[k] = cols
      }
      if (Object.keys(columns).length) views.columns = columns
    }
    if (isObj(rv.dateField)) {
      const dateField: Record<string, string> = {}
      for (const [k, v] of Object.entries(rv.dateField)) {
        const e = viewEntity(k)
        if (e?.fields.some((f) => f.name === v && isDateLike(f))) dateField[k] = v as string
      }
      if (Object.keys(dateField).length) views.dateField = dateField
    }
    if (Object.keys(views).length) o.views = views
  }

  if (Array.isArray(raw.rulesOff)) {
    // Only rules the app acts on keep a switch; anything else stored is dropped.
    const off = [...new Set(raw.rulesOff.filter((n): n is string =>
      typeof n === 'string' && base.rules.some((r) => r.name === n) && ruleSwitchable(base.key, n)))]
    if (off.length) o.rulesOff = off
  }
  return o
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function applyFields(base: ModuleDef, o: Overlay): EntityDef[] {
  return base.entities.map((e) => {
    let fields = [...e.fields, ...(o.extra?.[e.name] ?? [])].map((f) => {
      const k = `${e.name}.${f.name}`
      const next: FieldDef = { ...f }
      if (o.labels?.[k]) next.label = o.labels[k]
      if (o.hidden?.includes(k)) next.hidden = true
      else delete next.hidden
      const s = o.stats?.[k]
      if (s === 'none') delete next.stats
      else if (s) next.stats = s
      return next
    })
    const order = o.order?.[e.name]
    if (order) {
      const rank = (n: string) => { const i = order.indexOf(n); return i === -1 ? order.length : i }
      fields = fields.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f.name) - rank(b.f.name) || a.i - b.i).map((x) => x.f)
    }
    return { ...e, fields }
  })
}

/** A built-in module with a person's changes laid over it. */
export function applyOverlay(base: ModuleDef, o: Overlay): ModuleDef {
  const entities = applyFields(base, o)
  let views: ViewDef[] = [...base.views, ...(o.views?.extra ?? [])].map((v) => {
    const next: ViewDef = { ...v }
    if (o.views?.names?.[v.key]) next.name = o.views.names[v.key]
    if (o.views?.columns?.[v.key]) next.columns = o.views.columns[v.key]
    if (o.views?.dateField?.[v.key]) next.dateField = o.views.dateField[v.key]
    if (o.views?.hidden?.includes(v.key)) next.hidden = true
    return next
  })
  const order = o.views?.order
  if (order) {
    const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? order.length : i }
    views = views.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v.key) - rank(b.v.key) || a.i - b.i).map((x) => x.v)
  }
  const def: ModuleDef = {
    ...base,
    name: o.name ?? base.name,
    summary: o.summary ?? base.summary,
    keywords: o.keywords ?? base.keywords ?? [],
    entities,
    views,
    rules: base.rules.map((r) => (o.rulesOff?.includes(r.name) ? { ...r, off: true } : { ...r })),
  }
  const glyph = o.glyph ?? base.glyph
  if (glyph) def.glyph = glyph
  return def
}

/** The overlay that turns `base` into `edited`: what the editor saves for a
 *  built-in module. Only what the editor may change is carried. */
export function overlayFrom(base: ModuleDef, edited: ModuleDef): Overlay {
  const o: Overlay = {}
  if (edited.name !== base.name) o.name = edited.name
  if ((edited.glyph ?? '') !== (base.glyph ?? '') && edited.glyph) o.glyph = edited.glyph
  if (edited.summary !== base.summary) o.summary = edited.summary
  if (JSON.stringify(edited.keywords ?? []) !== JSON.stringify(base.keywords ?? [])) o.keywords = edited.keywords ?? []

  const labels: Record<string, string> = {}
  const hidden: string[] = []
  const order: Record<string, string[]> = {}
  const extra: Record<string, FieldDef[]> = {}
  const stats: Record<string, StatsKind | 'none'> = {}
  for (const e of base.entities) {
    const ed = edited.entities.find((x) => x.name === e.name)
    if (!ed) continue
    for (const f of ed.fields) {
      const k = `${e.name}.${f.name}`
      const b = e.fields.find((x) => x.name === f.name)
      if (b) {
        if (f.label !== b.label) labels[k] = f.label
      } else if (!e.table) {
        const { hidden: _h, stats: _s, ...rest } = f
        ;(extra[e.name] ??= []).push(rest)
      } else continue
      if (f.hidden) hidden.push(k)
      if ((f.stats ?? null) !== (b?.stats ?? null)) stats[k] = f.stats ?? 'none'
    }
    const natural = [...e.fields.map((f) => f.name), ...(extra[e.name] ?? []).map((f) => f.name)]
    const now = ed.fields.map((f) => f.name).filter((n) => natural.includes(n))
    if (JSON.stringify(now) !== JSON.stringify(natural)) order[e.name] = now
  }
  if (Object.keys(labels).length) o.labels = labels
  if (hidden.length) o.hidden = hidden
  if (Object.keys(order).length) o.order = order
  if (Object.keys(extra).length) o.extra = extra
  if (Object.keys(stats).length) o.stats = stats

  const views: NonNullable<Overlay['views']> = {}
  const extraViews = edited.views.filter((v) => !base.views.some((b) => b.key === v.key))
    .map((v) => { const { hidden: _h, ...rest } = v; return rest })
  if (extraViews.length) views.extra = extraViews
  const natural = [...base.views.map((v) => v.key), ...extraViews.map((v) => v.key)]
  const now = edited.views.map((v) => v.key).filter((k) => natural.includes(k))
  if (JSON.stringify(now) !== JSON.stringify(natural)) views.order = now
  const vh = edited.views.filter((v) => v.hidden).map((v) => v.key)
  if (vh.length) views.hidden = vh
  const names: Record<string, string> = {}
  const columns: Record<string, string[]> = {}
  const dateField: Record<string, string> = {}
  for (const v of edited.views) {
    const b = base.views.find((x) => x.key === v.key)
    if (!b) continue
    if (v.name !== b.name) names[v.key] = v.name
    if (v.columns && JSON.stringify(v.columns) !== JSON.stringify(b.columns ?? null)) columns[v.key] = v.columns
    if (v.dateField && v.dateField !== b.dateField) dateField[v.key] = v.dateField
  }
  if (Object.keys(names).length) views.names = names
  if (Object.keys(columns).length) views.columns = columns
  if (Object.keys(dateField).length) views.dateField = dateField
  if (Object.keys(views).length) o.views = views

  const off = edited.rules.filter((r) => r.off && ruleSwitchable(base.key, r.name) && base.rules.some((b) => b.name === r.name && !b.off))
    .map((r) => r.name)
  if (off.length) o.rulesOff = off
  return o
}

/* ---------- records ------------------------------------------------------- */

/** The field a record is known by: the first text field showing, else the first field. */
export function mainField(fields: FieldDef[]): FieldDef | undefined {
  return fields.find((f) => f.type === 'text' && !f.hidden) ?? fields.find((f) => f.type === 'text')
    ?? fields.find((f) => !f.hidden && f.type !== 'formula') ?? fields[0]
}

export function firstDateField(fields: FieldDef[]): FieldDef | undefined {
  return fields.find(isDateLike)
}

/** The day a record belongs to: the value of its first date or date-time
 *  field, as yyyy-MM-dd, so Today and Stats can find it. */
export function recordDate(fields: FieldDef[], data: Record<string, unknown>): string | null {
  const f = firstDateField(fields)
  const v = f ? data[f.name] : null
  if (typeof v !== 'string') return null
  const d = v.slice(0, 10)
  return DATE.test(d) ? d : null
}

export const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** One value, as the field's type keeps it; undefined when it will not do. */
export function coerce(f: FieldDef, v: unknown): unknown {
  if (isEmpty(v)) return null
  switch (f.type) {
    case 'text': return typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, LIMITS.text) : undefined
    case 'number': case 'duration': case 'integer': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').trim())
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) return undefined
      if (f.type === 'duration' && n < 0) return undefined
      return f.type === 'integer' ? Math.round(n) : n
    }
    case 'boolean': return v === true || v === 'true' || v === 1
    case 'date': return typeof v === 'string' && DATE.test(v.slice(0, 10)) && !Number.isNaN(Date.parse(v.slice(0, 10))) ? v.slice(0, 10) : undefined
    case 'time': {
      const t = typeof v === 'string' ? v.slice(0, 5) : ''
      return TIME.test(t) ? t : undefined
    }
    case 'datetime': return typeof v === 'string' && DATETIME.test(v) ? v.slice(0, 16) : undefined
    case 'select': return typeof v === 'string' && (f.options ?? []).includes(v) ? v : undefined
    case 'lookup': return typeof v === 'string' && LOOKUP_ID.test(v) ? v : undefined
    case 'formula': return undefined
  }
  return undefined
}

const WHAT: Partial<Record<FieldType, string>> = {
  number: 'a number', integer: 'a whole number', duration: 'minutes', date: 'a date', time: 'a time',
  datetime: 'a date and time', select: 'one of the options', lookup: 'something from the list', text: 'text',
}

/** Values checked against their fields. With `partial`, only the fields
 *  given are checked (an edit to one cell); otherwise every field is, and
 *  required ones must be there. Calculated fields are never kept. */
export function cleanValues(fields: FieldDef[], values: Record<string, unknown>, partial = false):
  { data: Record<string, unknown>; errors: Record<string, string> } {
  const data: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const f of fields) {
    if (f.type === 'formula') continue
    if (partial && !(f.name in values)) continue
    const v = coerce(f, values[f.name])
    if (v === undefined) { errors[f.name] = `${f.label} needs ${WHAT[f.type] ?? 'a value'}.`; continue }
    if (v === null && f.required) { errors[f.name] = `${f.label} is needed.`; continue }
    data[f.name] = v
  }
  if (bytes(data) > LIMITS.record) errors._ = 'This record is too long to keep. Shorten the longest text.'
  return { data, errors }
}

/** Calculated fields worked out in order, each able to use the ones before. */
export function computeFormulas(fields: FieldDef[], data: Record<string, unknown>): Record<string, number | null> {
  const scope: Record<string, unknown> = { ...data }
  const out: Record<string, number | null> = {}
  const names = new Set(fields.map((x) => x.name))
  for (const f of fields) {
    if (f.type !== 'formula' || !f.formula) continue
    // A sum over a value not filled in yet is not zero, it is not known yet.
    const used = [...f.formula.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b(?!\s*\()/g)].map((m) => m[0]).filter((n) => names.has(n))
    if (used.some((n) => isEmpty(scope[n]))) { out[f.name] = null; continue }
    const v = evaluateFormula(f.formula, scope)
    out[f.name] = v === null ? null : Math.round(v * 100) / 100
    scope[f.name] = out[f.name] ?? 0
  }
  return out
}

/* ---------- rule: a record with a date becomes a task ---------------------- */

export interface TaskPlan { title: string; planned_date: string; planned_time: string | null }

/** The task a record should have under the module's rules, or null for none. */
export function taskPlan(def: Pick<ModuleDef, 'name' | 'rules'>, fields: FieldDef[],
  rec: { data: Record<string, unknown>; record_date: string | null; deleted_at?: string | null }): TaskPlan | null {
  if (!ruleOn(def, RULE_DAY_TASK) || rec.deleted_at || !rec.record_date) return null
  const main = mainField(fields)
  const mv = main ? rec.data[main.name] : null
  const title = (typeof mv === 'string' && mv.trim() ? mv.trim() : def.name).slice(0, 200)
  let time: string | null = null
  if (ruleOn(def, RULE_REMIND)) {
    const dt = fields.find((f) => f.type === 'datetime' && typeof rec.data[f.name] === 'string')
    const own = dt ? String(rec.data[dt.name]).slice(11, 16) : null
    const tf = fields.find((f) => f.type === 'time' && typeof rec.data[f.name] === 'string' && TIME.test(String(rec.data[f.name])))
    const rule = def.rules.find((r) => r.name === RULE_REMIND)
    time = (own && TIME.test(own) ? own : null) ?? (tf ? String(rec.data[tf.name]) : null) ?? rule?.time ?? DEFAULT_REMIND_TIME
  }
  return { title, planned_date: rec.record_date, planned_time: time }
}

export type TaskChange = 'none' | 'create' | 'update' | 'delete'

/** What to do to the record's task, if it has one, to match the plan. A
 *  task removed earlier comes back when the plan wants one again. */
export function taskChange(plan: TaskPlan | null,
  task: { title: string; planned_date: string | null; planned_time: string | null; deleted_at: string | null } | null): TaskChange {
  if (!plan) return task && !task.deleted_at ? 'delete' : 'none'
  if (!task) return 'create'
  const same = !task.deleted_at && task.title === plan.title && task.planned_date === plan.planned_date
    && (task.planned_time?.slice(0, 5) ?? null) === plan.planned_time
  return same ? 'none' : 'update'
}

/* ---------- keywords, for the setup templates ----------------------------- */

export interface ModuleWords { key: string; name: string; keywords: string[] }

/** Every module's keywords: the built-in ones, then any built ones given. */
export function moduleKeywords(built: Pick<ModuleDef, 'key' | 'name' | 'keywords'>[] = []): ModuleWords[] {
  return [
    ...MODULES.filter((m) => m.key !== 'custom').map((m) => ({ key: m.key, name: m.name, keywords: m.keywords ?? [] })),
    ...built.map((m) => ({ key: m.key, name: m.name, keywords: m.keywords ?? [] })),
  ]
}

/** Modules whose keywords appear, as whole words, in what was typed. */
export function suggestModules(text: string, list: ModuleWords[] = moduleKeywords()): string[] {
  const norm = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `
  const t = norm(text)
  if (!t.trim()) return []
  return list.filter((m) => m.keywords.some((k) => { const w = norm(k).trim(); return w && t.includes(` ${w} `) })).map((m) => m.key)
}
