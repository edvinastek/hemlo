// Module definitions: what is read from storage is checked and cleaned, a
// person's changes to a built-in module survive a round trip through the
// stored overlay, a record's day is worked out from its fields, and the rule
// that puts dated records on the day as tasks makes the same decision every time.
import {
  LIMITS, BUILT_KEY, fieldProblem, cleanField, cleanFields, readBuiltDefinition, definitionFor, definitionProblem,
  glyphProblem, cleanKeywords, newModuleKey, fieldNameFrom, readOverlay, applyOverlay, overlayFrom,
  recordDate, cleanValues, computeFormulas, taskPlan, taskChange, builtRuleCatalogue, ruleOn,
  moduleKeywords, suggestModules, moduleSuggestions, mainField, RULE_DAY_TASK, RULE_REMIND,
  boardField, gridFields, chartFields, viewProblem, viewDefaults,
  BUILTIN_RULES, ruleSupport, ruleSwitchable, isBuiltinRuleOn,
  addEntity, removeEntity, linkProblem, entityTabs, linkTargets,
} from '../modules/def-rules.ts'
import { MODULES } from '../modules/registry.ts'
import { PRESETS, combinePresets } from '../modules/presets.ts'
import { coerce, spanMinutes, checklistCount, hasOptions, NUMERIC_TYPES } from '../modules/def-rules.ts'
import { repeatPlan, sameRepeat, REPEAT_KEY } from '../modules/repeat-rules.ts'
import { designFile, designFileName, readDesignFile } from '../modules/design-file-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const base = (key) => MODULES.find((m) => m.key === key)
const clone = (v) => JSON.parse(JSON.stringify(v))

// ---------- validators -------------------------------------------------------
const num = { name: 'amount', label: 'Amount', type: 'number' }
is('a plain field is fine', fieldProblem(num, [num], 0), null)
is('a field needs a label', fieldProblem({ ...num, label: ' ' }, [], 0), 'Give the field a name.')
is('labels stop at 60', fieldProblem({ ...num, label: 'x'.repeat(61) }, [], 0), 'Keep the name under 60 characters.')
is('names are lower-case words', fieldProblem({ ...num, name: 'Amount' }, [], 0), 'That field has an unusable internal name.')
is('names start with a letter', fieldProblem({ ...num, name: '1a' }, [], 0) !== null, true)
is('two fields cannot share a name', fieldProblem(num, [num, { ...num }], 1), 'Two fields cannot share a name.')
is('unknown types are refused', fieldProblem({ ...num, type: 'script' }, [], 0), 'Pick a kind of field.')
is('a choice needs options', fieldProblem({ name: 's', label: 'S', type: 'select', options: [] }, [], 0), 'A choice field needs at least one option.')
is('at most 50 options', fieldProblem({ name: 's', label: 'S', type: 'select', options: Array.from({ length: 51 }, (_, i) => `o${i}`) }, [], 0), 'At most 50 options.')
is('a lookup names what it picks from', fieldProblem({ name: 'l', label: 'L', type: 'lookup', lookup: 'user' }, [], 0), 'Pick what the field links to.')
is('a formula may use the fields before it', fieldProblem({ name: 't', label: 'T', type: 'formula', formula: 'amount * 2' }, [num], 1), null)
is('a formula may not name a missing field', fieldProblem({ name: 't', label: 'T', type: 'formula', formula: 'amont * 2' }, [num], 1), 'There is no field called "amont".')
is('a formula may not name itself', fieldProblem({ name: 't', label: 'T', type: 'formula', formula: 't + 1' }, [num], 1), 'There is no field called "t".')
is('no JavaScript in a formula', fieldProblem({ name: 't', label: 'T', type: 'formula', formula: 'window.alert(1)' }, [num], 1) !== null, true)
is('only numbers are added up', fieldProblem({ name: 'n', label: 'N', type: 'text', stats: 'sum' }, [], 0), 'Only numbers can be added up or averaged.')
is('any field can be counted', fieldProblem({ name: 'n', label: 'N', type: 'text', stats: 'count' }, [], 0), null)

is('cleanField drops unknown properties', cleanField({ name: 'a', label: 'A', type: 'text', onclick: 'x', __proto__: { evil: 1 } }), { name: 'a', label: 'A', type: 'text' })
is('cleanField refuses a bad name', cleanField({ name: 'A-b', label: 'A', type: 'text' }), null)
is('cleanField refuses an unknown type', cleanField({ name: 'a', label: 'A', type: 'html' }), null)
is('cleanField clips the label', cleanField({ name: 'a', label: 'y'.repeat(80), type: 'text' }).label.length, 60)
is('cleanField keeps 50 options at most, no repeats', cleanField({ name: 's', label: 'S', type: 'select', options: ['a', 'a', ...Array.from({ length: 60 }, (_, i) => `o${i}`)] }).options.length, 50)
is('a required field is never hidden', cleanField({ name: 'a', label: 'A', type: 'text', required: true, hidden: true }).hidden, undefined)
is('at most 40 fields', cleanFields(Array.from({ length: 45 }, (_, i) => ({ name: `f${i}`, label: `F${i}`, type: 'text' }))).length, 40)
is('a formula naming a dropped field is dropped too', cleanFields([
  { name: 'a', label: 'A', type: 'nope' }, { name: 'b', label: 'B', type: 'formula', formula: 'a + 1' },
]).length, 0)

is('glyph: one letter', glyphProblem('R'), null)
is('glyph: a symbol', glyphProblem('§'), null)
is('glyph: two letters', glyphProblem('Rd'), 'Use a single character.')
is('glyph: not a picture', glyphProblem('\u{1F4DA}'), 'Use a letter or a symbol, not a picture.')
is('keywords: split, trimmed, lower case, no repeats', cleanKeywords(' Books, reading ,, books , Reading List'), ['books', 'reading', 'reading list'])
is('keywords: at most 20', cleanKeywords(Array.from({ length: 30 }, (_, i) => `k${i}`).join(',')).length, 20)
is('a new key has the server’s form', BUILT_KEY.test(newModuleKey()), true)
is('a new key is u_ and 12 characters', newModuleKey().length, 14)
is('field names come from labels', fieldNameFrom('Cost (EUR)', []), 'cost_eur')
is('and stay unique', fieldNameFrom('Cost', ['cost', 'cost_2']), 'cost_3')
is('a label with no letters still gives a name', /^[a-z]/.test(fieldNameFrom('2024', [])), true)

// ---------- a built module, read from storage --------------------------------
const hostile = readBuiltDefinition({
  key: 'u_abcdef123456', name: '<img src=x onerror=alert(1)>',
  definition: {
    summary: 's'.repeat(500), glyph: 'ab', keywords: 'Cars, APK',
    entities: [{ name: 'item', label: 'Job', table: 'profile', fields: [
      { name: 'job', label: 'Job', type: 'text', required: true },
      { name: 'cost', label: 'Cost', type: 'number', stats: 'sum' },
      { name: 'bad', label: 'Bad', type: 'eval' },
      { name: 'double', label: 'Double', type: 'formula', formula: 'cost * 2' },
    ]}],
    views: [
      { key: 'table', name: 'Table', type: 'table', entity: 'item', columns: ['job', 'bad', 'cost'] },
      { key: 'cal', name: 'Cal', type: 'calendar', entity: 'item', dateField: 'job' },
      { key: 'table', name: 'Twice', type: 'list', entity: 'item' },
    ],
    rules: [{ name: 'day_task', off: false }, { name: 'drop_database', off: false }],
  },
})
is('the name stays text, as typed', hostile.name, '<img src=x onerror=alert(1)>')
is('a built module never gets a table', hostile.entities[0].table, undefined)
is('unknown field types are left out', hostile.entities[0].fields.map((f) => f.name), ['job', 'cost', 'double'])
is('columns name only fields that are there', hostile.views[0].columns, ['job', 'cost'])
is('a calendar only goes by a date field', hostile.views[1].dateField, undefined)
is('view keys are unique', hostile.views.length, 2)
is('only the rules the app knows', hostile.rules.map((r) => r.name), [RULE_DAY_TASK, RULE_REMIND])
is('and the stored switch is kept', ruleOn(hostile, RULE_DAY_TASK), true)
is('the reminder stays off', ruleOn(hostile, RULE_REMIND), false)
is('the summary is clipped', hostile.summary.length, LIMITS.summary)
is('a two-letter glyph is dropped', hostile.glyph, undefined)
is('keywords are cleaned', hostile.keywords, ['cars', 'apk'])
is('definitionFor and back gives the same module', readBuiltDefinition({ key: hostile.key, name: hostile.name, definition: definitionFor(hostile) }), hostile)
is('a module with nothing in it gets no views', readBuiltDefinition({ key: 'u_empty0', name: 'E', definition: null }).views, [])
const huge = clone(hostile)
huge.entities[0].fields = Array.from({ length: 40 }, (_, i) => ({ name: `f${i}`, label: `F${i}`, type: 'select', options: Array.from({ length: 50 }, (_, j) => `${'o'.repeat(50)}${j}`) }))
is('a definition over the size limit is refused', definitionProblem(huge), 'This module has grown too large to keep. Remove some fields or options.')
for (const p of PRESETS) {
  const def = { key: 'u_preset00', name: p.name, summary: p.description, built: true, depth: 'light', keywords: p.keywords,
    entities: [{ name: 'item', label: p.item, fields: p.fields }], views: p.views.map((v) => ({ ...v, entity: 'item' })), rules: builtRuleCatalogue() }
  is(`preset ${p.key} is a valid module`, definitionProblem(def), null)
  is(`preset ${p.key} survives storage`, readBuiltDefinition({ key: def.key, name: def.name, definition: definitionFor(def) }).entities[0].fields, p.fields)
}

// ---------- changes to a built-in module --------------------------------------
const sleep = base('sleep')
const edited = clone(sleep)
edited.name = 'Nights'
edited.glyph = 'N'
edited.entities[0].fields[4].label = 'How well'
edited.entities[0].fields[1].hidden = true
edited.entities[0].fields.reverse()
edited.views[1].hidden = true
edited.views.reverse()
edited.views.find((v) => v.key === 'log').columns = ['log_date', 'quality']
const o = overlayFrom(sleep, edited)
is('an overlay carries only the changes', Object.keys(o).sort(), ['glyph', 'hidden', 'labels', 'name', 'order', 'views'])
is('and survives being stored', applyOverlay(sleep, readOverlay(JSON.parse(JSON.stringify(o)), sleep)), edited)
is('no changes, no overlay', overlayFrom(sleep, clone(sleep)), {})
is('an empty overlay is the module itself', applyOverlay(sleep, readOverlay({}, sleep)).entities, sleep.entities)
is('fields cannot be added to a table of its own', readOverlay({ extra: { sleep_log: [{ name: 'dream', label: 'Dream', type: 'text' }] } }, sleep).extra, undefined)
is('a required field cannot be hidden', readOverlay({ hidden: ['sleep_log.log_date', 'sleep_log.quality'] }, sleep).hidden, ['sleep_log.quality'])
is('labels only for fields that exist', readOverlay({ labels: { 'sleep_log.nope': 'x', 'sleep_log.quality': 'Q' } }, sleep).labels, { 'sleep_log.quality': 'Q' })
is('a view order cannot invent views', readOverlay({ views: { order: ['month', 'ghost'] } }, sleep).views, { order: ['month'] })
is('not every view can be hidden', readOverlay({ views: { hidden: ['log', 'month'] } }, sleep).views, undefined)
is('garbage is ignored', readOverlay('drop table', sleep), {})

const finance = base('finance')
const f2 = clone(finance)
f2.entities[0].fields.push({ name: 'vat', label: 'VAT', type: 'formula', formula: 'amount * 0.21', stats: 'sum' })
f2.entities[0].fields.push({ name: 'paid', label: 'Paid', type: 'boolean' })
f2.views.push({ key: 'cards', name: 'Cards', type: 'list', entity: 'entry' })
f2.entities[0].fields[2].stats = undefined
delete f2.entities[0].fields[2].stats
const o2 = overlayFrom(finance, f2)
is('record-backed modules take extra fields', o2.extra.entry.map((f) => f.name), ['vat', 'paid'])
is('and extra views', o2.views.extra.map((v) => v.key), ['cards'])
is('a Stats flag can be taken off a built-in field', o2.stats['entry.amount'], 'none')
is('extra fields and views survive being stored', applyOverlay(finance, readOverlay(JSON.parse(JSON.stringify(o2)), finance)), f2)
is('an extra formula naming a missing field is dropped', readOverlay({ extra: { entry: [{ name: 'x', label: 'X', type: 'formula', formula: 'nope * 2' }] } }, finance).extra, undefined)

// ---------- records -----------------------------------------------------------
const fields = [
  { name: 'item', label: 'What', type: 'text', required: true },
  { name: 'spent_on', label: 'Day', type: 'date' },
  { name: 'at', label: 'At', type: 'datetime' },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'qty', label: 'Qty', type: 'integer' },
  { name: 'kind', label: 'Kind', type: 'select', options: ['food', 'home'] },
  { name: 'paid', label: 'Paid', type: 'boolean' },
  { name: 'total', label: 'Total', type: 'formula', formula: 'amount * qty' },
]
is('the day comes from the first date field', recordDate(fields, { spent_on: '2026-09-27', at: '2026-10-01T10:00' }), '2026-09-27')
is('a date-time counts as its day', recordDate(fields.slice(2), { at: '2026-10-01T10:00' }), '2026-10-01')
is('no date, no day', recordDate(fields, { item: 'x' }), null)
is('a malformed date is no day', recordDate(fields, { spent_on: 'yesterday' }), null)
let r = cleanValues(fields, { item: ' Bread ', spent_on: '2026-09-27', amount: '2,50', qty: '2.6', kind: 'food', paid: true, total: 999 })
is('values are kept as their fields say', r.data, { item: ' Bread ', spent_on: '2026-09-27', at: null, amount: 2.5, qty: 3, kind: 'food', paid: true })
is('with no errors', r.errors, {})
is('calculated values are never stored', 'total' in r.data, false)
r = cleanValues(fields, { amount: 'lots', kind: 'cars' })
is('a required field must be there, and numbers be numbers', Object.keys(r.errors).sort(), ['amount', 'item', 'kind'])
is('an edit checks only what it changes', cleanValues(fields, { amount: '4' }, true), { data: { amount: 4 }, errors: {} })
is('a record over 16 KB is refused', !!cleanValues([{ name: 'n', label: 'N', type: 'text' }, ...Array.from({ length: 10 }, (_, i) => ({ name: `t${i}`, label: 'T', type: 'text' }))],
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`t${i}`, 'x'.repeat(2000)]))).errors._, true)
is('formulas are worked out on display', computeFormulas(fields, { amount: 2.5, qty: 3 }), { total: 7.5 })
is('a formula with an input missing shows nothing', computeFormulas(fields, { amount: 2.5 }), { total: null })
is('a formula can build on an earlier one', computeFormulas([
  { name: 'a', label: 'A', type: 'number' }, { name: 'b', label: 'B', type: 'formula', formula: 'a * 2' }, { name: 'c', label: 'C', type: 'formula', formula: 'b + 1' },
], { a: 2 }), { b: 4, c: 5 })
is('sleep hours across midnight', computeFormulas(sleep.entities[0].fields, { went_to_bed: '23:15', woke_at: '07:00' }), { hours: 7.75 })
is('the main field is the first text field showing', mainField([{ name: 'd', label: 'D', type: 'date' }, { name: 'n', label: 'N', type: 'text', hidden: true }, { name: 'm', label: 'M', type: 'text' }]).name, 'm')

// ---------- rule: dated records become tasks ----------------------------------
const def = { name: 'Expenses', rules: builtRuleCatalogue() }
const on = (d, ...names) => ({ ...d, rules: d.rules.map((x) => (names.includes(x.name) ? { ...x, off: false } : x)) })
const rec = { data: { item: 'Rent', spent_on: '2026-10-01' }, record_date: '2026-10-01', deleted_at: null }
is('rule off: no task', taskPlan(def, fields, rec), null)
is('rule on: a task on the record’s day, named by it, no time', taskPlan(on(def, RULE_DAY_TASK), fields, rec),
  { title: 'Rent', planned_date: '2026-10-01', planned_time: null })
is('no date: no task', taskPlan(on(def, RULE_DAY_TASK), fields, { ...rec, record_date: null }), null)
is('a deleted record: no task', taskPlan(on(def, RULE_DAY_TASK), fields, { ...rec, deleted_at: '2026-10-02T00:00:00Z' }), null)
is('no name: the module’s name', taskPlan(on(def, RULE_DAY_TASK), fields, { ...rec, data: { spent_on: '2026-10-01' } }).title, 'Expenses')
is('remind: the record’s own time', taskPlan(on(def, RULE_DAY_TASK, RULE_REMIND), fields, { ...rec, data: { ...rec.data, at: '2026-10-01T18:30' } }).planned_time, '18:30')
is('remind: a time field', taskPlan(on(def, RULE_DAY_TASK, RULE_REMIND), [...fields, { name: 't', label: 'T', type: 'time' }], { ...rec, data: { ...rec.data, t: '07:45' } }).planned_time, '07:45')
is('remind: the rule’s time otherwise', taskPlan(on(def, RULE_DAY_TASK, RULE_REMIND), fields, rec).planned_time, '09:00')
const plan = taskPlan(on(def, RULE_DAY_TASK), fields, rec)
const task = { title: 'Rent', planned_date: '2026-10-01', planned_time: null, deleted_at: null }
is('no task yet: make one', taskChange(plan, null), 'create')
is('the same task: nothing to do (running twice changes nothing)', taskChange(plan, task), 'none')
is('a time stored with seconds is the same time', taskChange({ ...plan, planned_time: '09:00' }, { ...task, planned_time: '09:00:00' }), 'none')
is('the record moved: move the task', taskChange({ ...plan, planned_date: '2026-10-02' }, task), 'update')
is('renamed: rename the task', taskChange({ ...plan, title: 'Rent, October' }, task), 'update')
is('no plan any more: remove the task', taskChange(null, task), 'delete')
is('no plan and the task already gone: nothing', taskChange(null, { ...task, deleted_at: 'x' }), 'none')
is('a removed task comes back when the rule wants it', taskChange(plan, { ...task, deleted_at: 'x' }), 'update')

// ---------- board, grid and chart views -----------------------------------------
const item = { name: 'item', label: 'Item', fields: [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'day', label: 'Day', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', options: ['to do', 'doing', 'done'] },
  { name: 'kind', label: 'Kind', type: 'select', options: ['a', 'b'] },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'done', label: 'Done', type: 'boolean' },
  { name: 'double', label: 'Double', type: 'formula', formula: 'amount * 2' },
]}
const bare = { name: 'item', label: 'Item', fields: [{ name: 'name', label: 'Name', type: 'text' }] }
const view = (type, extra = {}) => ({ key: type, name: type, type, entity: 'item', ...extra })
is('a board goes by the first choice field', boardField(item, view('board')).name, 'status')
is('or the one it names', boardField(item, view('board', { groupBy: 'kind' })).name, 'kind')
is('a board without a choice field cannot draw', viewProblem(view('board'), bare), 'A board needs a choice field; its options are the columns.')
is('a grid ticks the first yes/no field, rows by name', Object.values(gridFields(item, view('grid'))).map((f) => f?.name), ['name', 'day', 'done'])
is('a grid can count a number instead', gridFields(item, view('grid', { field: 'amount' })).mark.name, 'amount')
is('a grid can tick nothing (a tap adds a record)', gridFields(item, view('grid', { field: '' })).mark, undefined)
is('a grid needs a date', viewProblem(view('grid'), bare), 'A grid needs a date field: its columns are days.')
is('a chart draws the first number', chartFields(item, view('chart')).value.name, 'amount')
is('a chart can draw a calculated field', chartFields(item, view('chart', { field: 'double' })).value.name, 'double')
is('a chart does not draw text', chartFields(item, view('chart', { field: 'name' })).value.name, 'amount')
is('a chart needs a number', viewProblem(view('chart'), { ...bare, fields: [...bare.fields, { name: 'd', label: 'D', type: 'date' }] }), 'A chart needs a number field to draw.')
is('lists and tables always draw', [view('list'), view('table'), view('form')].map((v) => viewProblem(v, bare)), [null, null, null])
is('defaults fill a new chart in', viewDefaults(view('chart'), item), { key: 'chart', name: 'chart', type: 'chart', entity: 'item', dateField: 'day', field: 'amount', period: 'week', chart: 'bar' })
is('defaults fill a new board in', viewDefaults(view('board'), item).groupBy, 'status')
is('defaults keep what is set', viewDefaults(view('grid', { field: '' }), item).field, '')
const withViews = (views) => readBuiltDefinition({ key: 'u_views0', name: 'V', definition: { entities: [item], views } }).views
is('stored settings are kept when they fit', withViews([view('board', { groupBy: 'kind', columns: ['amount', 'day', 'done'] }), view('chart', { field: 'double', period: 'month', chart: 'line' })]),
  [{ key: 'board', name: 'board', type: 'board', entity: 'item', columns: ['amount', 'day'], groupBy: 'kind' },
    { key: 'chart', name: 'chart', type: 'chart', entity: 'item', field: 'double', period: 'month', chart: 'line' }])
is('and dropped when they do not', withViews([view('board', { groupBy: 'amount' }), view('chart', { field: 'name', period: 'year', chart: 'pie' }), view('grid', { groupBy: 'done', field: 'name' })]),
  [view('board'), view('chart'), view('grid')])
is('settings of one kind do not stick to another', withViews([view('list', { groupBy: 'status', field: 'amount', period: 'day' })]), [view('list')])
is('a grid keeps "a tap adds a record"', withViews([view('grid', { field: '' })])[0].field, '')
const viewDef = (views) => ({ key: 'u_views0', name: 'V', summary: '', built: true, depth: 'light', entities: [bare], views, rules: builtRuleCatalogue() })
is('a board that cannot draw stops a save', definitionProblem(viewDef([view('list'), view('board')])), 'board: A board needs a choice field; its options are the columns.')
is('unless it is switched off', definitionProblem(viewDef([view('list'), view('board', { hidden: true })])), null)
is('the app’s own views of a built-in module are not held to it', definitionProblem(clone(base('habits'))), null)
const fin = clone(base('finance'))
fin.views.push({ key: 'spend', name: 'Spend', type: 'chart', entity: 'entry', field: 'amount', period: 'month' })
is('a chart added to a built-in module survives its overlay', applyOverlay(finance, readOverlay(JSON.parse(JSON.stringify(overlayFrom(finance, fin))), finance)).views.at(-1),
  { key: 'spend', name: 'Spend', type: 'chart', entity: 'entry', field: 'amount', period: 'month' })

// ---------- built-in rules: which are acted on, and the switch ------------------
const allRules = MODULES.flatMap((m) => m.rules.map((r) => `${m.key}.${r.name}`))
is('every registry rule says what the app does with it', allRules.filter((k) => !BUILTIN_RULES[k]), [])
is('and nothing is listed that is not in the registry', Object.keys(BUILTIN_RULES).filter((k) => !allRules.includes(k)), [])
is('the rules acted on have switches', allRules.filter((k) => ruleSwitchable(...k.split('.'))).sort(),
  ['agenda.no_overlap', 'health.retarget', 'learning.study_task', 'nutrition.meal_tasks', 'nutrition.size_main', 'projects.to_goal',
    'sleep.bedtime', 'training.session_task'])
// HAB-23: where habits show is now the module's Show on switches, not this rule.
is('the daily habit rule is always on, even if once stored off', isBuiltinRuleOn('habits', 'daily', { rulesOff: ['daily'] }), true)
is('the trip from the plan is always on', ruleSupport('shopping', 'from_plan'), 'always')
is('a built module’s rules all have switches', [ruleSwitchable('u_abcdef123456', RULE_DAY_TASK), ruleSwitchable('u_abcdef123456', RULE_REMIND)], [true, true])
is('a rule is on with no changes', isBuiltinRuleOn('nutrition', 'meal_tasks', undefined), true)
is('switched off in the overlay, it is off', isBuiltinRuleOn('nutrition', 'meal_tasks', { rulesOff: ['meal_tasks'] }), false)
is('the other rule of the module stays on', isBuiltinRuleOn('nutrition', 'size_main', { rulesOff: ['meal_tasks'] }), true)
is('garbage in the overlay leaves it on', isBuiltinRuleOn('habits', 'daily', 'drop table'), true)
is('an unknown rule is never on', isBuiltinRuleOn('habits', 'nope', {}), false)
is('an unknown module is never on', isBuiltinRuleOn('nope', 'daily', {}), false)
is('a rule the app does not act on cannot be stored off', readOverlay({ rulesOff: ['trip_days'] }, base('shopping')).rulesOff, undefined)
is('and reads as on', isBuiltinRuleOn('shopping', 'trip_days', { rulesOff: ['trip_days'] }), true)
// v19 (AGN-07): the busy all-day warning is carried out, so it has a switch.
is('the busy all-day warning can be switched off', isBuiltinRuleOn('agenda', 'no_overlap', { rulesOff: ['no_overlap'] }), false)
is('the bedtime block can be switched off (v16)', isBuiltinRuleOn('sleep', 'bedtime', { rulesOff: ['bedtime'] }), false)
const nut = clone(base('nutrition'))
nut.rules.find((r) => r.name === 'meal_tasks').off = true
nut.rules.find((r) => r.name === 'skipped_meal').off = true
const nutO = overlayFrom(base('nutrition'), nut)
is('the editor’s switch is saved for a rule with one', nutO.rulesOff, ['meal_tasks'])
is('and read back off', isBuiltinRuleOn('nutrition', 'meal_tasks', JSON.parse(JSON.stringify(nutO))), false)
is('switched back on, the overlay is empty', overlayFrom(base('nutrition'), clone(base('nutrition'))), {})

// ---------- keywords ------------------------------------------------------------
is('built-in modules have keywords', moduleKeywords().every((m) => m.keywords.length > 0), true)
is('built modules are added', moduleKeywords([{ key: 'u_abcdef', name: 'Car', keywords: ['apk'] }]).at(-1), { key: 'u_abcdef', name: 'Car', keywords: ['apk'] })
is('typed words suggest modules', suggestModules('I go to the gym and read books', moduleKeywords([{ key: 'u_books1', name: 'Reading', keywords: ['books'] }])).sort(), ['learning', 'training', 'u_books1'])
is('whole words only', suggestModules('gymnastics'), [])
// MOD-07: setup offers built modules by the keywords typed for them, and not what is on already.
const words = moduleKeywords([{ key: 'u_car001', name: 'Car', keywords: ['car', 'apk', 'oil change'] }])
is('setup offers a built module by its own keywords', moduleSuggestions('student with a car', words, []).map((m) => m.key), ['u_car001'])
is('…a keyword of two words too', moduleSuggestions('the oil change is due', words, []).map((m) => m.name), ['Car'])
is('…and not what is on already', moduleSuggestions('gym and my car', words, ['training', 'u_car001']), [])

// ---------- field kinds of version 16 (MOD-11, MOD-12) ---------------------------
const tags = { name: 'tags', label: 'Tags', type: 'multi', options: ['red', 'green', 'blue'] }
is('tags: kept in the options’ order', coerce(tags, ['blue', 'red']), ['red', 'blue'])
is('tags: from a spreadsheet cell', coerce(tags, 'green; red'), ['red', 'green'])
is('tags: none is empty', coerce(tags, []), null)
is('tags: an unknown one is refused', coerce(tags, ['pink']), undefined)
is('tags need options, like a choice', fieldProblem({ ...tags, options: [] }, []), 'A choice field needs at least one option.')
is('tags keep their options when read back', cleanField(tags)?.options, ['red', 'green', 'blue'])
is('tags and choices have options', ['multi', 'select', 'text'].map(hasOptions), [true, true, false])
const stars = { name: 'r', label: 'Rating', type: 'rating' }
is('stars: 1 to 5', [coerce(stars, 3), coerce(stars, '5'), coerce(stars, 0), coerce(stars, 6), coerce(stars, 2.5)], [3, 5, undefined, undefined, undefined])
const pct = { name: 'p', label: 'Share', type: 'percent' }
is('percentage: 0 to 100, a % sign allowed', [coerce(pct, '42,5%'), coerce(pct, 101), coerce(pct, -1)], [42.5, undefined, undefined])
const money = { name: 'm', label: 'Cost', type: 'money', unit: '€' }
is('money: to the cent, a sign allowed', [coerce(money, '€ 12,345'), coerce(money, 3)], [12.35, 3])
is('stars, shares and money count as numbers', ['rating', 'percent', 'money'].every((t) => NUMERIC_TYPES.includes(t)), true)
const span = { name: 's', label: 'When', type: 'timespan' }
is('start and end: kept as HH:MM-HH:MM', [coerce(span, '09:00-10:30'), coerce(span, '09:00 – 10:30'), coerce(span, '9-10')], ['09:00-10:30', '09:00-10:30', undefined])
is('start and end: minutes, across midnight too', [spanMinutes('09:00-10:30'), spanMinutes('22:30-06:00'), spanMinutes('x')], [90, 450, null])
is('checklist: lines ticked of all', checklistCount('- [x] milk\n- [ ] eggs\nplain line\n* [X] bread'), { done: 2, total: 3 })
const link = { name: 'plant', label: 'Plant', type: 'lookup', lookup: 'record', module: 'u_plants01' }
is('a link to a built module’s records keeps the module', cleanField(link)?.module, 'u_plants01')
is('…and is dropped without one', cleanField({ ...link, module: 'habits' }), null)
is('…and says so when made', fieldProblem({ ...link, module: '' }, []), 'Pick the module whose records it links to.')
is('a note keeps up to 2000 characters', coerce({ name: 'n', label: 'Note', type: 'note' }, 'x'.repeat(2500)).length, 2000)

// ---------- presets combined (MOD-10) ----------------------------------------------
const both = combinePresets(['plants', 'expenses'])
is('combined: fields of both, in order', both.fields.map((f) => f.name).slice(0, 3), ['plant', 'action', 'next_due'])
is('combined: a field both have is kept once (Note)', both.fields.filter((f) => f.label === 'Note').length, 1)
is('combined: the record is named by the first', both.item, 'Care')
is('combined: views of both, no kind and name twice', both.views.map((v) => v.name), ['Plants', 'Month', 'Table', 'List'])
const clash = combinePresets(['car', 'expenses'])
is('combined: the same label and kind kept once, needed if either needs it', clash.fields.filter((f) => /^Day/.test(f.label)).map((f) => [f.label, !!f.required]), [['Day', true]])
const odd = combinePresets(['car', 'pets'])
is('combined: same name, another kind, kept apart under a new name', odd.fields.filter((f) => /^Cost/.test(f.label)).map((f) => [f.name, f.label, f.type]),
  [['cost', 'Cost', 'number'], ['cost_pet_care', 'Cost (pet care)', 'money']])
const mood = combinePresets(['mood', 'gratitude'])
is('combined: same name and kind (Day) once', mood.fields.filter((f) => f.name === 'day').length, 1)
is('combined is a valid module', definitionProblem({ key: 'u_test01', name: 'Mix', summary: '', built: true, depth: 'light',
  entities: [{ name: 'item', label: both.item, fields: both.fields }], views: both.views.map((v) => ({ ...v, entity: 'item' })), rules: builtRuleCatalogue() }), null)
is('Blank alone means nothing else', combinePresets(['blank', 'car']).keys, ['car'])
is('nothing picked is Blank', combinePresets([]).keys, ['blank'])
is('a private preset stays private when combined', combinePresets(['cycle', 'mood']).show, { today: false, plan: false, widget: false, reminders: false })
const ten = ['water', 'medication', 'cycle', 'pets', 'fuel', 'language', 'running', 'gratitude', 'subscriptions', 'mood']
is('the ten presets of MOD-13 exist', ten.every((k) => PRESETS.some((p) => p.key === k)), true)
for (const k of ['reading', 'workout', 'expenses', 'plants', 'car', 'study']) {
  for (const j of ten) {
    const c = combinePresets([k, j])
    const p = definitionProblem({ key: 'u_test01', name: 'Mix', summary: '', built: true, depth: 'light',
      entities: [{ name: 'item', label: c.item, fields: c.fields }], views: c.views.map((v) => ({ ...v, entity: 'item' })), rules: builtRuleCatalogue() })
    if (p) is(`${k} + ${j} combine into a valid module`, p, null)
  }
}

// ---------- a record that repeats (MOD-14) ------------------------------------------
const plantDef = { name: 'Plants', rules: builtRuleCatalogue() }
const plantFields = PRESETS.find((p) => p.key === 'plants').fields
const rplan = repeatPlan(plantDef, plantFields, { plant: 'Fern', next_due: '2026-10-06' }, { rule: 'daily', rule_config: { n: 3 }, end_date: null }, '2026-10-03')
is('repeat: named by the record, from its first date, any time', [rplan.title, rplan.rule, rplan.rule_config.n, rplan.start_date, rplan.time], ['Fern', 'daily', 3, '2026-10-06', null])
is('repeat: no rule, no series', repeatPlan(plantDef, plantFields, {}, { rule: null }, '2026-10-03'), null)
is('repeat: "times a week" makes no days, so none', repeatPlan(plantDef, plantFields, {}, { rule: 'times_per_week', rule_config: { times: 3 } }, '2026-10-03'), null)
is('repeat: no date, from today; named by the module when unnamed', (({ title, start_date }) => [title, start_date])(repeatPlan(plantDef, plantFields, {}, { rule: 'weekly', rule_config: { weekdays: [1] } }, '2026-10-03')), ['Plants', '2026-10-03'])
const remindDef = { name: 'Plants', rules: builtRuleCatalogue().map((r) => ({ ...r, off: false, ...(r.time ? { time: '08:15' } : {}) })) }
is('repeat: the reminder rule’s time when the record has none', repeatPlan(remindDef, plantFields, { plant: 'Fern' }, { rule: 'daily' }, '2026-10-03').time, '08:15')
is('repeat: an end before the start is dropped', repeatPlan(plantDef, plantFields, { next_due: '2026-10-06' }, { rule: 'daily', end_date: '2026-10-01' }, '2026-10-03').end_date, null)
const series = { title: 'Fern', rule: 'daily', rule_config: { n: 3 }, start_date: '2026-10-06', end_date: null, time_of_day: null }
is('repeat: the same plan changes nothing', sameRepeat(series, rplan), true)
is('repeat: a new name is a new series', sameRepeat({ ...series, title: 'Palm' }, rplan), false)
is('repeat: kept under a name no field can have', /^[a-z]/.test(REPEAT_KEY), false)
is('repeat: its key is not kept as a value', 'x' in cleanValues(plantFields, { plant: 'x', [REPEAT_KEY]: 'abc' }).data, false)

// ---------- a design as a file (MOD-16) ----------------------------------------------
const designDef = readBuiltDefinition({ key: 'u_plants01', name: 'Plants', definition: {
  glyph: '✿', summary: 'Care', entities: [{ name: 'item', label: 'Care', fields: [...PRESETS.find((p) => p.key === 'plants').fields,
    { name: 'pot', label: 'Pot', type: 'lookup', lookup: 'record', module: 'u_pots0001' }] }],
  views: [{ key: 'list', name: 'Plants', type: 'list', entity: 'item' }], rules: [{ name: RULE_DAY_TASK, off: false }] } })
const file = designFile(designDef)
is('a design: fields, views and rules, no records', [file.format, file.name, Object.keys(file.definition).sort().join(',')], ['hemlo.module', 'Plants', 'entities,glyph,keywords,name,rules,summary,views'])
is('a link to another module’s records goes with the module’s name (v22)', file.definition.entities[0].fields.find((f) => f.lookup === 'record')?.module_name, null)
const back = readDesignFile(JSON.stringify(file))
is('read back, it is the same design (the link, with no such module here, as text)', back.ok && [back.def.name, back.def.glyph, back.def.entities[0].fields.length, ruleOn(back.def, RULE_DAY_TASK), back.def.entities[0].fields.find((f) => f.name === 'pot')?.type], ['Plants', '✿', 6, true, 'text'])
const oldDesign = readDesignFile(JSON.stringify({ ...file, format: 'getit.module' }))
is('a design saved when the app was GetIt still reads', oldDesign.ok && oldDesign.def.name, 'Plants')
is('not a design', readDesignFile('{"format":"other"}'), { ok: false, problem: 'That file is not a module design.' })
is('not even JSON', readDesignFile('hello').ok, false)
is('a newer one', readDesignFile(JSON.stringify({ ...file, version: 2 })).problem, 'That design comes from a newer Hemlo. Update the app, then import it again.')
is('a design with no fields', readDesignFile(JSON.stringify({ ...file, definition: { ...file.definition, entities: [] } })).ok, false)
is('a file name from the module’s name', designFileName('Plant care: indoor!'), 'plant-care-indoor.hemlo-module.json')

// Several kinds of record in one built module (MOD-15).
const car = {
  key: 'u_cars0001', name: 'Car', summary: '', built: true, depth: 'light', keywords: [], rules: [],
  entities: [{ name: 'item', label: 'Car', fields: [{ name: 'name', label: 'Name', type: 'text', required: true }] }],
  views: [{ key: 'list', name: 'List', type: 'list', entity: 'item' }],
}
const withTrip = addEntity(car, ' Trip ').def
is('a kind added: named from its label, a Name field and a list of its own',
  [withTrip.entities[1], withTrip.views[1]],
  [{ name: 'trip', label: 'Trip', fields: [{ name: 'name', label: 'Name', type: 'text', required: true }] }, { key: 'list_trip', name: 'Trip', type: 'list', entity: 'trip' }])
is('no name: refused', addEntity(car, '  '), { problem: 'Give the kind of record a name.' })
is('the same name twice: refused', addEntity(withTrip, 'trip'), { problem: 'There is a kind with that name already.' })
let four = withTrip
for (const l of ['Service', 'Fuel']) four = addEntity(four, l).def
is('four kinds at most', [four.entities.length, addEntity(four, 'Tyres')], [4, { problem: 'A module keeps at most 4 kinds of record.' }])
is('a module of four kinds is a good definition', definitionProblem(four), null)
const carLink = { name: 'car', label: 'Car', type: 'lookup', lookup: 'record', module: 'u_cars0001', entity: 'item' }
const linked = clone(four)
linked.entities[1].fields.push(carLink)
is('a trip links to its car', [definitionProblem(linked), linkProblem(linked)], [null, null])
const self = clone(four)
self.entities[0].fields.push({ ...carLink, label: 'Other car' })
is('a car cannot link to its own kind', linkProblem(self), 'Other car: a record cannot link to its own kind; pick another.')
const gone = clone(four)
gone.entities[1].fields.push({ ...carLink, entity: 'boat' })
is('nor to a kind that is gone', definitionProblem(gone), 'Car: the kind of record it links to is gone.')
is('a link with no kind means the first kind', linkProblem({ ...linked, entities: linked.entities.map((e, i) => (i === 1 ? { ...e, fields: e.fields.map((f) => ({ ...f, entity: undefined })) } : e)) }), null)
const stored = readBuiltDefinition({ key: 'u_cars0001', name: 'Car', definition: definitionFor(linked) })
is('kinds and the link survive storage', [stored.entities.map((e) => e.name), stored.entities[1].fields[1]], [['item', 'trip', 'service', 'fuel'], carLink])
is('a link kind that is not a name is dropped, the link kept', cleanField({ ...carLink, entity: 'Bad Name!' }), { name: 'car', label: 'Car', type: 'lookup', lookup: 'record', module: 'u_cars0001' })
const less = removeEntity(linked, 'item')
is('the first kind stays', less.entities.length, 4)
const noTrips = removeEntity(linked, 'trip')
is('a kind removed takes its views', [noTrips.entities.map((e) => e.name), noTrips.views.map((v) => v.key)], [['item', 'service', 'fuel'], ['list', 'list_service', 'list_fuel']])
const noCarLinks = removeEntity({ ...linked, entities: [...linked.entities.slice(0, 2), { ...linked.entities[2], fields: [...linked.entities[2].fields, { ...carLink, entity: 'trip', name: 'trip' }] }, linked.entities[3]] }, 'trip')
is('and the links to it from the other kinds', noCarLinks.entities.find((e) => e.name === 'service').fields.map((f) => f.name), ['name'])
is('one kind: no tab row', entityTabs(car), [])
is('several kinds: a tab each with its views', entityTabs(withTrip).map((t) => [t.entity, t.name, t.views.map((v) => v.key)]), [['item', 'Car', ['list']], ['trip', 'Trip', ['list_trip']]])
is('a kind with every view off gets a plain list', entityTabs({ ...withTrip, views: [withTrip.views[0], { ...withTrip.views[1], hidden: true }] })[1].views,
  [{ key: 'list:trip', name: 'Trip', type: 'list', entity: 'trip' }])
is('links can point at the other kinds first, then other modules',
  linkTargets(withTrip, 'trip', [{ key: 'u_plants01', name: 'Plants' }, { key: 'u_cars0001', name: 'Car' }]).map((t) => t.value),
  ['u_cars0001#item', 'u_plants01#'])

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
