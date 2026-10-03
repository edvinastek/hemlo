// Checks note templates (NOT-10 to NOT-17) and recipes in notes (NOT-20 to
// NOT-23): fill-ins, the plain-word chips, putting a template in a note or
// asking for it after the task, keeping the list, a recipe's block found
// again, "Update from recipe" only when the recipe changed (ticks kept), and
// several recipes' ingredients added up. 2026-10-02 is a Friday.
import {
  fillTemplate, FILLS, templateParts, templateSummary, applyNoteTemplate, addTemplate, updateTemplate, moveTemplate,
  removeTemplate, restoreTemplate, STARTER_NOTE_TEMPLATES, readNoteTemplates,
} from '../lib/template-rules.ts'
import { recipeToNote, recipeLink, recipeLinks, figuresLine, recipeBlocks, blockChanged, replaceBlock, combinedIngredients } from '../lib/recipe-note-rules.ts'
import { pendingAfterDone } from '../lib/after-done-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// ---------- fill-ins (NOT-10) ----------------------------------------------------
const ctx = { day: '2026-10-02', title: 'Read', time: '18:30:00', start: '2026-09-21' }
is('every fill-in', fillTemplate('{weekday} {date} {time} {title}, day {day count}', ctx), 'Friday 2 October 2026 18:30 Read, day 12')
is('day count without a start is left empty', fillTemplate('day {day count}', { day: '2026-10-02' }), 'day ')
is('day count written without the space, any case', fillTemplate('{DayCount}', ctx), '12')
is('a start after the day gives nothing', fillTemplate('{day count}', { day: '2026-10-02', start: '2026-10-05' }), '')
is('unknown braces stay', fillTemplate('{mood}', ctx), '{mood}')
is('the fill-ins have plain names', FILLS.map((f) => f.label), ['date', 'weekday', 'time', 'title', 'day count'])

// ---------- chips (NOT-17) ---------------------------------------------------------
is('text and fill-ins apart', templateParts('## {title}, {date}\n- '), [{ text: '## ' }, { fill: 'title' }, { text: ', ' }, { fill: 'date' }, { text: '\n- ' }])
is('summary from headings, fill-ins in words', templateSummary(STARTER_NOTE_TEMPLATES.find((t) => t.id === 'reading').body), 'title, date · What I remember · Questions · A line worth keeping')
is('summary from words when there are no headings', templateSummary('- [ ] Bags\n- [ ] Keys'), 'Bags Keys')

// ---------- using a template (NOT-13, NOT-14) -----------------------------------------
const reading = STARTER_NOTE_TEMPLATES.find((t) => t.id === 'reading')
const packing = STARTER_NOTE_TEMPLATES.find((t) => t.id === 'packing')
is('put in after what is there', applyNoteTemplate('Chapter 3\n', packing, ctx), 'Chapter 3\n\n' + packing.body)
is('into an empty note', applyNoteTemplate(null, packing, ctx), packing.body)
is('an after-done template asks later instead', pendingAfterDone(applyNoteTemplate('Chapter 3', reading, ctx, true)), 'reading')
is('…but can be put in now', applyNoteTemplate('', reading, ctx).startsWith('## Read, 2 October 2026'), true)
is('a plain template ignores "ask later"', applyNoteTemplate('', packing, ctx, true), packing.body)

// ---------- keeping the list (NOT-11, NOT-12) ---------------------------------------
const list = readNoteTemplates(undefined)
is('ten starter templates', list.length, 10)
const added = addTemplate(list, ' Weekly   review ', 'x')
is('a new template gets an id that is free', added.id, 'weekly-review-2')
is('…and its tidied name', added.list.at(-1).name, 'Weekly review')
is('no name, no template', addTemplate(list, '  ', 'x'), null)
is('rename keeps a name', updateTemplate(list, 'packing', { name: '  ' }).find((t) => t.id === 'packing').name, 'Packing list')
is('edit the body and the after-done switch', updateTemplate(list, 'packing', { body: 'new', after_done: true }).find((t) => t.id === 'packing'),
  { id: 'packing', name: 'Packing list', after_done: true, body: 'new' })
is('move up', moveTemplate(list, 'meal-prep', -1).slice(0, 2).map((t) => t.id), ['meal-prep', 'recipe'])
is('the first cannot go up', moveTemplate(list, 'recipe', -1), list)
const gone = removeTemplate(list, 'reading')
is('remove says where it was', [gone.index, gone.removed.id, gone.list.length], [2, 'reading', 9])
is('undo puts it back in its place', restoreTemplate(gone.list, gone.removed, gone.index).map((t) => t.id), list.map((t) => t.id))

// ---------- recipes in notes (NOT-20 to NOT-23) ---------------------------------------
const id = '0b6c2a0e-9d7e-4f7e-8a5c-1234567890ab'
const curry = { id, name: 'Chicken curry', portions_per_batch: 4, steps: 'Fry.\nSimmer.' }
const lines = [
  { name: 'Chicken', grams_per_portion: 150 },
  { name: 'Egg', grams_per_portion: 50, unit: 'egg', unit_qty: 1, units: [{ name: 'egg', g: 50 }] },
  { name: 'Salt', grams_per_portion: null, raw_text: 'Salt to taste' },
]
const fig = figuresLine({ kcal: 520.4, protein_g: 38.26, carbs_g: 45, fat_g: 4.44, fiber_g: null })
is('figures per portion, unknowns left out', fig, 'One portion: 520 kcal · protein 38 g · carbohydrate 45 g · fat 4.4 g')
is('no figures at all, no line', figuresLine({}), null)
const block = recipeToNote(curry, lines, { portions: 2, ingredients: true, steps: true, figures: fig })
is('the link line', recipeLink(curry, 2), `From recipe: Chicken curry · 2 portions {recipe:${id}}`)
const note = `Before\n\n${block}\n\n## After\nkeep`
const found = recipeBlocks(note)
is('the block is found again with its parts', found.map((b) => [b.id, b.portions, b.start, b.ingredients, b.steps, b.figures]), [[id, 2, 2, true, true, true]])
is('the block stops at the next heading', note.split('\n')[found[0].end], '## After')
is('unchanged recipe: nothing to update', blockChanged(note, found[0], block), false)
const ticked = note.replace('- [ ] Chicken', '- [x] Chicken')
is('ticks are not a change', blockChanged(ticked, recipeBlocks(ticked)[0], block), false)
const changed = recipeToNote({ ...curry, steps: 'Fry.\nSimmer.\nServe.' }, [...lines, { name: 'Peas', grams_per_portion: 80 }], { portions: 2, ingredients: true, steps: true, figures: fig })
is('a changed recipe offers an update', blockChanged(ticked, recipeBlocks(ticked)[0], changed), true)
const updated = replaceBlock(ticked, recipeBlocks(ticked)[0], changed)
is('the update keeps ticks on lines still there', updated.includes('- [x] Chicken, 300 g'), true)
is('…adds what is new', updated.includes('- [ ] Peas, 160 g'), true)
is('…and leaves the rest of the note alone', [updated.startsWith('Before\n\n## Chicken curry'), updated.endsWith('\n\n## After\nkeep')], [true, true])
is('a block without its heading is still found', recipeBlocks(`From recipe: X · 1 portion {recipe:${id}}\n- [ ] a`).map((b) => [b.start, b.end, b.ingredients]), [[0, 2, false]])
is('the old reader still reads links', recipeLinks(note), [{ name: 'Chicken curry', portions: 2, id }])
const all = combinedIngredients([
  { lines, portions: 2 },
  { lines: [{ name: 'chicken', grams_per_portion: 100 }, { name: 'Salt', grams_per_portion: null, raw_text: 'Salt to taste' }], portions: 3 },
])
is('several recipes added up by food and unit', all, '## All ingredients\n- [ ] Chicken, 600 g\n- [ ] Egg, 2 eggs (100 g)\n- [ ] Salt to taste')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
