// Checks the recipe sharing rules: how a recipe's status reads, what saving
// does to who can see it, which recipes a device keeps, the reviewer's note,
// and the recipe editor's form.
import {
  readSharing, choiceOf, statusOf, nextSharing, sharingEffect, personalFoods, keepInCatalogue, staleForeign,
  cleanNote, authorLabel, withoutReview, readRecipe, recipeChanges, macroLine, NOTE_MAX, CHOICES,
} from '../lib/sharing-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const ME = 'me', THEM = 'them'

// Reading a row, old ones included.
is('an own recipe from before sharing is private', readSharing({ owner_id: ME }), 'private')
is('a catalogue recipe from before sharing is public', readSharing({ owner_id: null }), 'public')
is('a stored value is taken as it is', readSharing({ owner_id: ME, sharing: 'proposed' }), 'proposed')
is('nonsense reads as the default', readSharing({ owner_id: ME, sharing: 'everyone' }), 'private')

// The choice in the editor.
is('two choices, Only me first', CHOICES.map((c) => c.label), ['Only me', 'Propose to everyone'])
is('private reads as Only me', choiceOf('private'), 'private')
is('not accepted reads as Only me', choiceOf('rejected'), 'private')
is('waiting reads as Propose', choiceOf('proposed'), 'propose')
is('approved reads as Propose', choiceOf('public'), 'propose')

// Status chips.
is('Private', statusOf({ owner_id: ME }).label, 'Private')
is('Waiting for review', statusOf({ owner_id: ME, sharing: 'proposed' }).label, 'Waiting for review')
is('Shared with everyone', statusOf({ owner_id: ME, sharing: 'public' }).label, 'Shared with everyone')
is('Not accepted, with the note', statusOf({ owner_id: ME, sharing: 'rejected', review_note: '  Too vague  ' }),
  { label: 'Not accepted', tone: 'warn', note: 'Too vague' })
is('a note is only shown when not accepted', statusOf({ owner_id: ME, sharing: 'public', review_note: 'Nice' }).note, null)
is('not accepted without a note', statusOf({ owner_id: ME, sharing: 'rejected', review_note: null }).note, null)

// What saving does.
is('a new recipe, Only me', nextSharing('private', 'private', true), 'private')
is('a new recipe, proposed', nextSharing('private', 'propose', true), 'proposed')
is('proposing a private one', nextSharing('private', 'propose', false), 'proposed')
is('proposing again after a no', nextSharing('rejected', 'propose', false), 'proposed')
is('a no stays a no when only edited', nextSharing('rejected', 'private', true), 'rejected')
is('withdrawing from review', nextSharing('proposed', 'private', false), 'private')
is('taking an approved one back', nextSharing('public', 'private', false), 'private')
is('an approved one, untouched, stays shared', nextSharing('public', 'propose', false), 'public')
is('an approved one, changed, goes back for review', nextSharing('public', 'propose', true), 'proposed')
is('a waiting one, changed, keeps waiting', nextSharing('proposed', 'propose', true), 'proposed')
is('the owner can never reach public or rejected by choosing',
  ['private', 'proposed', 'public', 'rejected'].flatMap((s) => ['private', 'propose'].map((c) => nextSharing(s, c, true)))
    .every((s) => s === 'private' || s === 'proposed' || s === 'rejected'), true)

is('saying so: sent for review', sharingEffect('private', 'proposed', false), 'Saving sends it for review. No one else sees it until it is approved.')
is('saying so: an approved one changed', sharingEffect('public', 'proposed', false)?.startsWith('Saving changes an approved recipe'), true)
is('saying so: taken back', sharingEffect('public', 'private', false), 'Saving takes it back: others no longer see it.')
is('saying so: withdrawn', sharingEffect('proposed', 'private', false), 'Saving withdraws it from review.')
is('nothing to say when nothing changes', sharingEffect('private', 'private', false), null)
is('nothing to say for a new private one', sharingEffect('private', 'private', true), null)

// Foods only the author can see.
const foods = new Map([
  ['rice', { name: 'Rice', owner_id: null }],
  ['oats', { name: 'My oats', owner_id: ME }],
])
is('shared foods only: nothing to swap', personalFoods([{ food_id: 'rice' }, { food_id: null }], foods), [])
is('an own food is named, once', personalFoods([{ food_id: 'oats' }, { food_id: 'rice' }, { food_id: 'oats' }], foods), ['My oats'])
is('an unknown food is not guessed at', personalFoods([{ food_id: 'gone' }], foods), [])

// What a device keeps.
is('the catalogue is kept', keepInCatalogue({ owner_id: null }, ME), true)
is('my own, whatever its state', ['private', 'proposed', 'rejected', 'public'].map((s) => keepInCatalogue({ owner_id: ME, sharing: s }, ME)),
  [true, true, true, true])
is('someone else’s approved recipe is kept', keepInCatalogue({ owner_id: THEM, sharing: 'public' }, ME), true)
is('a proposal a reviewer can read is not mixed in', keepInCatalogue({ owner_id: THEM, sharing: 'proposed' }, ME), false)
is('nor someone else’s private or declined one', [keepInCatalogue({ owner_id: THEM, sharing: 'private' }, ME),
  keepInCatalogue({ owner_id: THEM, sharing: 'rejected' }, ME)], [false, false])
is('a deleted approved one is not kept', keepInCatalogue({ owner_id: THEM, sharing: 'public', deleted_at: '2026-01-01' }, ME), false)
is('someone else’s row from an old server (no column) is not kept', keepInCatalogue({ owner_id: THEM }, ME), false)

const local = [
  { id: 'cat', owner_id: null }, { id: 'mine', owner_id: ME }, { id: 'kept', owner_id: THEM, sharing: 'public' },
  { id: 'gone', owner_id: THEM, sharing: 'public' },
]
is('only someone else’s withdrawn recipe is dropped', staleForeign(local, new Set(['cat', 'kept']), ME), ['gone'])
is('nothing is dropped without knowing who is signed in', staleForeign(local, new Set(), null), [])

// The reviewer's note and the author's name.
is('a note is trimmed', cleanNote('  Needs grams  '), 'Needs grams')
is('an empty note is none', cleanNote('   '), null)
is(`a note stops at ${NOTE_MAX} characters`, cleanNote('x'.repeat(400))?.length, NOTE_MAX)
is('an author with a name', authorLabel(' Egle '), 'Egle')
is('an author without one', authorLabel(null), 'Someone')
is('an address is never shown', authorLabel('egle@example.com'), 'Someone')

// A backup read back in never carries a review.
is('review columns are left out', withoutReview({ id: 'r', name: 'Soup', sharing: 'public', proposed_at: 'x', reviewed_at: 'y', review_note: 'z' }),
  { id: 'r', name: 'Soup' })

// The editor's form.
const draft = (over = {}) => ({
  name: 'Chicken rice', role: 'dinner', portions: '4', minutes: '30', steps: '  Boil. ',
  lines: [{ id: null, food_id: 'rice', grams: '75' }, { id: null, food_id: 'chicken', grams: '150,5' }], ...over,
})
is('a whole recipe reads', readRecipe(draft()), { values: {
  name: 'Chicken rice', role: 'dinner', portions_per_batch: 4, cook_minutes: 30, steps: 'Boil.',
  lines: [{ id: null, food_id: 'rice', grams_per_portion: 75 }, { id: null, food_id: 'chicken', grams_per_portion: 150.5 }],
} })
is('a name is needed', readRecipe(draft({ name: '  ' })), { error: 'Give it a name.' })
is('an ingredient is needed', readRecipe(draft({ lines: [] })), { error: 'Add at least one ingredient.' })
is('each ingredient needs grams', readRecipe(draft({ lines: [{ id: null, food_id: 'rice', grams: '' }] })),
  { error: 'Each ingredient needs its grams per portion.' })
is('portions past the database’s limit', 'error' in readRecipe(draft({ portions: '1000' })), true)
is('empty portions are one', (readRecipe(draft({ portions: '' })).values ?? {}).portions_per_batch, 1)
is('no role and no minutes are fine', (({ role, cook_minutes }) => [role, cook_minutes])(readRecipe(draft({ role: '', minutes: '' })).values),
  [null, null])

// What saving changes.
const before = { name: 'Chicken rice', role: 'dinner', portions_per_batch: 4, cook_minutes: 30, steps: 'Boil.' }
const saved = [
  { id: 'l1', food_id: 'rice', grams_per_portion: 75, sort_order: 0 },
  { id: 'l2', food_id: 'chicken', grams_per_portion: 150, sort_order: 1 },
]
const values = (lines, over = {}) => ({ ...before, ...over, lines })
let c = recipeChanges(before, saved, values([{ id: 'l1', food_id: 'rice', grams_per_portion: 75 }, { id: 'l2', food_id: 'chicken', grams_per_portion: 150 }]))
is('nothing changed', [c.fields, c.upsert, c.removed, c.contentChanged], [{}, [], [], false])
c = recipeChanges(before, saved, values([{ id: 'l2', food_id: 'chicken', grams_per_portion: 150 }, { id: 'l1', food_id: 'rice', grams_per_portion: 75 }]))
is('a new order is saved but is not a change to the recipe', [c.upsert.map((l) => [l.id, l.sort_order]), c.contentChanged], [[['l2', 0], ['l1', 1]], false])
c = recipeChanges(before, saved, values([{ id: 'l1', food_id: 'rice', grams_per_portion: 90 }, { id: 'l2', food_id: 'chicken', grams_per_portion: 150 }]))
is('more rice is a change', [c.upsert.map((l) => l.id), c.contentChanged], [['l1'], true])
c = recipeChanges(before, saved, values([{ id: 'l1', food_id: 'rice', grams_per_portion: 75 }]))
is('a removed line is a change', [c.removed, c.contentChanged], [['l2'], true])
c = recipeChanges(before, saved, values([...saved.map(({ id, food_id, grams_per_portion }) => ({ id, food_id, grams_per_portion })),
  { id: null, food_id: 'peas', grams_per_portion: 40 }]))
is('an added line is a change', [c.upsert.map((l) => [l.food_id, l.sort_order]), c.contentChanged], [[['peas', 2]], true])
c = recipeChanges(before, saved, values(saved.map(({ id, food_id, grams_per_portion }) => ({ id, food_id, grams_per_portion })), { name: 'Chicken & rice' }))
is('a new name is a change', [c.fields, c.contentChanged], [{ name: 'Chicken & rice' }, true])
c = recipeChanges(null, [], values([{ id: null, food_id: 'rice', grams_per_portion: 75 }]))
is('a new recipe sends every field', Object.keys(c.fields), ['name', 'role', 'portions_per_batch', 'cook_minutes', 'steps'])

// Lines of every kind (REC-04): free text, raw or cooked, a note.
const rich = readRecipe(draft({ lines: [
  { id: null, food_id: 'rice', grams: '75', state: 'cooked', note: ' rinsed ', raw_text: 'Brown rice (cooked)' },
  { id: null, food_id: null, grams: '', raw_text: 'Salt to taste' },
  { id: null, food_id: null, grams: '', raw_text: '  ' },
] }))
is('a cooked line with a note and its own words', rich.values.lines[0], { id: null, food_id: 'rice', grams_per_portion: 75, raw_text: 'Brown rice (cooked)', state: 'cooked', note: 'rinsed' })
is('a free-text line without an amount', rich.values.lines[1], { id: null, food_id: null, grams_per_portion: null, raw_text: 'Salt to taste' })
is('an empty free-text line is dropped', rich.values.lines.length, 2)
is('free text alone is not an ingredient', readRecipe(draft({ lines: [{ id: null, food_id: null, grams: '', raw_text: 'Salt' }] })), { error: 'Add at least one ingredient.' })
is('a note past 200 characters is refused', 'error' in readRecipe(draft({ lines: [{ id: null, food_id: 'rice', grams: '75', note: 'x'.repeat(201) }] })), true)
c = recipeChanges(before, [{ ...saved[0], state: 'cooked', raw_text: 'Brown rice (cooked)' }], values([{ id: 'l1', food_id: 'rice', grams_per_portion: 75, state: 'cooked', raw_text: 'Brown rice (cooked)' }]))
is('a line read back as saved is no change (so an approved recipe stays approved)', c.contentChanged, false)
c = recipeChanges(before, [saved[0]], values([{ id: 'l1', food_id: 'rice', grams_per_portion: 75, state: 'cooked' }]))
is('marking a line cooked is a change', [c.upsert.map((l) => l.state), c.contentChanged], [['cooked'], true])

is('one portion in a line', macroLine({ kcal: 519.6, protein_g: 31.5, carbs_g: 60, fat_g: 12.2, fiber_g: 4.9 }),
  '520 kcal · 32 g protein · 60 g carbs · 12 g fat · 5 g fibre')

console.log(fail ? `\n${fail} failed` : '\nall sharing checks passed')
process.exit(fail ? 1 : 0)
