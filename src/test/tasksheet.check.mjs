// The task sheet's pure parts (task-sheet-rules.ts): Duplicate (TSK-24),
// Save as template and starting from one (TSK-26).
import { duplicateOf, templateOfTask, applyTaskTemplate, templateRepeat, withTaskTemplate } from '../lib/task-sheet-rules.ts'
import { readTaskTemplates } from '../lib/template-rules.ts'
import { withQuickAdd } from '../lib/task-sheet-rules.ts'
import { readQuickAdd } from '../lib/quick-add-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const task = {
  id: 't1', profile_id: 'p', title: 'Read', category: 'Learning', module_key: 'learning', horizon: 'day', goal_id: null,
  series_id: 's1', duration_min: 30, total_effort_min: null, daily_quota_min: null, fixed: true, locked: false,
  planned_date: '2026-10-05', planned_time: '07:30', start_date: null, due_date: null, sort_order: 3, status: 'done',
  push_count: 3, extension_count: 2, needs_review: true, source: 'module', source_ref: 'r1', notes: '- [x] ch 1',
  updated_at: 'old', completed_at: 'x', deleted_at: null,
}

const d = duplicateOf(task, 'new', 'now')
eq('a duplicate keeps what was set', [d.title, d.category, d.duration_min, d.planned_date, d.planned_time, d.fixed, d.notes],
  ['Read', 'Learning', 30, '2026-10-05', '07:30', true, '- [x] ch 1'])
eq('and starts fresh', [d.id, d.series_id, d.status, d.push_count, d.extension_count, d.needs_review, d.completed_at, d.source, d.source_ref],
  ['new', null, 'todo', 0, 0, false, null, 'manual', null])
eq('the original is untouched', [task.id, task.status], ['t1', 'done'])

const tpl = templateOfTask(task, '  Morning read ', { rule: 'weekly', rule_config: { weekdays: [5, 1] }, end_date: '2026-12-31', count: null }, ['morning-read'])
eq('a template keeps title, length, section, lock, note (ticks cleared), repeat', tpl,
  { id: 'morning-read-2', name: 'Morning read', title: 'Read', minutes: 30, section: 'Learning', locked: false,
    note_template_id: null, note: '- [ ] ch 1', repeat: { rule: 'weekly', rule_config: { weekdays: [1, 5] }, count: null } })
eq('no name takes the title', templateOfTask(task, ' ', null, []).name, 'Read')
eq('no repeat, no key', 'repeat' in templateOfTask(task, 'x', { rule: null, rule_config: {}, end_date: null }, []), false)
eq('it survives being stored', readTaskTemplates([tpl])[0].repeat, { rule: 'weekly', rule_config: { weekdays: [1, 5] }, count: null })
eq('a stored broken repeat is no repeat', 'repeat' in readTaskTemplates([{ ...tpl, repeat: { rule: 'fortnightly' } }])[0], false)
eq('its repeat for the control', templateRepeat(tpl), { rule: 'weekly', rule_config: { weekdays: [1, 5] }, end_date: null, count: null })
eq('a count is kept', templateRepeat({ ...tpl, repeat: { rule: 'daily', rule_config: {}, count: 10 } }).count, 10)

const blank = { ...task, title: '', category: null, duration_min: null, notes: null, locked: false, planned_date: '2026-10-09', planned_time: '18:00' }
const notes = [{ id: 'meeting', name: 'Meeting', after_done: false, body: '## {title}, {weekday}' }, { id: 'reading', name: 'Reflection', after_done: true, body: 'x' }]
eq('a new task from a template', (({ title, duration_min, category, notes: n }) => [title, duration_min, category, n])(applyTaskTemplate(blank, tpl, notes)),
  ['Read', 30, 'Learning', '- [ ] ch 1'])
eq('a note template is filled for the day', applyTaskTemplate(blank, { ...tpl, note: null, note_template_id: 'meeting' }, notes).notes, '## Read, Friday')
eq('after the own note', applyTaskTemplate(blank, { ...tpl, note_template_id: 'meeting' }, notes).notes, '- [ ] ch 1\n\n## Read, Friday')
eq('an ask-after-done note template leaves its marker', applyTaskTemplate(blank, { ...tpl, note: null, note_template_id: 'reading' }, notes).notes, '{after-done:reading}')
eq('beside the own note', applyTaskTemplate(blank, { ...tpl, note_template_id: 'reading' }, notes).notes, '- [ ] ch 1\n{after-done:reading}')
eq('a deleted note template leaves the own note', applyTaskTemplate(blank, { ...tpl, note_template_id: 'gone' }, notes).notes, '- [ ] ch 1')

// NOT-15: a task started from a note template is saved carrying it.
const filled = { ...task, notes: '## Read, Friday' }
eq('carries a note template instead of its text', (({ note_template_id, note }) => [note_template_id, note])(templateOfTask(filled, 'R', null, [], notes[0])), ['meeting', null])
const asked = { ...task, notes: '- [x] pages\n{after-done:reading}' }
eq('an after-done one keeps the own note, without the marker', (({ note_template_id, note }) => [note_template_id, note])(templateOfTask(asked, 'R', null, [], notes[1])),
  ['reading', '- [ ] pages'])
eq('and comes back the same', applyTaskTemplate(blank, templateOfTask(asked, 'R', null, [], notes[1]), notes).notes, '- [ ] pages\n{after-done:reading}')
eq('replace a template by id', withTaskTemplate([tpl], { ...tpl, title: 'New' }).map((t) => t.title), ['New'])

// ---------- v19 quick add in the sheet (TSK-07) ----------------------------------------
const form = { ...blank, title: 'Gym tomorrow 18:00-19:30 #Training', planned_date: '2026-10-05', planned_time: null, duration_min: null, category: null }
const qa = (t, more = {}) => readQuickAdd(t, { today: '2026-10-05', base: '2026-10-05', sections: ['Training'], ...more })
const read19 = withQuickAdd(form, qa(form.title))
eq('the form takes what the line says', [read19.title, read19.planned_date, read19.planned_time, read19.duration_min, read19.category],
  ['Gym', '2026-10-06', '18:00', 90, 'Training'])
const hand = withQuickAdd({ ...form, planned_time: '07:00', duration_min: 30 }, qa(form.title), ['time', 'length'])
eq('a field set by hand keeps the person’s value', [hand.planned_time, hand.duration_min, hand.planned_date], ['07:00', 30, '2026-10-06'])
eq('nothing read: the form as it is', withQuickAdd(form, null), form)
const swim = qa('Swim every tue')
eq('a repeat’s first day is the day', withQuickAdd(form, swim).planned_date, '2026-10-06')
eq('…unless the repeat was then chosen by hand', withQuickAdd(form, swim, ['repeat']).planned_date, '2026-10-05')

if (fail) { console.log(`\n${fail} task sheet check(s) failed`); process.exit(1) }
console.log('\nall task sheet checks passed')
