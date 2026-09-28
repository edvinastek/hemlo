// Module definitions: what is read from storage is checked and cleaned, a
// person's changes to a built-in module survive a round trip through the
// stored overlay, a record's day is worked out from its fields, and the rule
// that puts dated records on the day as tasks makes the same decision every time.
import {
  LIMITS, BUILT_KEY, fieldProblem, cleanField, cleanFields, readBuiltDefinition, definitionFor, definitionProblem,
  glyphProblem, cleanKeywords, newModuleKey, fieldNameFrom, readOverlay, applyOverlay, overlayFrom,
  recordDate, cleanValues, computeFormulas, taskPlan, taskChange, builtRuleCatalogue, ruleOn,
  moduleKeywords, suggestModules, mainField, RULE_DAY_TASK, RULE_REMIND,
  boardField, gridFields, chartFields, viewProblem, viewDefaults,
  BUILTIN_RULES, ruleSupport, ruleSwitchable, isBuiltinRuleOn,
} from '../modules/def-rules.ts'
import { MODULES } from '../modules/registry.ts'
import { PRESETS } from '../modules/presets.ts'

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
  ['habits.daily', 'health.retarget', 'nutrition.meal_tasks', 'nutrition.size_main'])
is('the trip from the plan is always on', ruleSupport('shopping', 'from_plan'), 'always')
is('a built module’s rules all have switches', [ruleSwitchable('u_abcdef123456', RULE_DAY_TASK), ruleSwitchable('u_abcdef123456', RULE_REMIND)], [true, true])
is('a rule is on with no changes', isBuiltinRuleOn('nutrition', 'meal_tasks', undefined), true)
is('switched off in the overlay, it is off', isBuiltinRuleOn('nutrition', 'meal_tasks', { rulesOff: ['meal_tasks'] }), false)
is('the other rule of the module stays on', isBuiltinRuleOn('nutrition', 'size_main', { rulesOff: ['meal_tasks'] }), true)
is('garbage in the overlay leaves it on', isBuiltinRuleOn('habits', 'daily', 'drop table'), true)
is('an unknown rule is never on', isBuiltinRuleOn('habits', 'nope', {}), false)
is('an unknown module is never on', isBuiltinRuleOn('nope', 'daily', {}), false)
is('a rule the app does not act on cannot be stored off', readOverlay({ rulesOff: ['bedtime'] }, sleep).rulesOff, undefined)
is('and reads as on', isBuiltinRuleOn('sleep', 'bedtime', { rulesOff: ['bedtime'] }), true)
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

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
