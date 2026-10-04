// Checks module colours: the palette is readable on both pages, every
// built-in module has its own colour, and the right colour reaches a task.
import {
  SWATCHES, DEFAULT_COLOURS, SHORT_NAMES, PAPER, colourFor, taskModule, taskColour, hashColour, moduleLabel,
  withColour, parseHex, contrast, contrastNote, definitionColour, modulesByWeight, assignBuiltColours, swatchesFor,
} from '../lib/colours-rules.ts'
import { MODULES } from '../modules/registry.ts'
import { resolveTheme, THEMES } from '../lib/theme-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Contrast: a 6 px marker needs 3:1 against the page, in both themes.
console.log('\nswatch     light   dark')
for (const s of SWATCHES) {
  const l = contrast(s.hex, PAPER.light)
  const d = contrast(s.hex, PAPER.dark)
  console.log(`${s.hex}  ${l.toFixed(2)}:1  ${d.toFixed(2)}:1  ${s.name}`)
  if (l < 3 || d < 3) { fail++; console.log(`FAIL  ${s.name} is under 3:1`) }
}
console.log('')
is('every swatch clears 3:1 on both pages', SWATCHES.every((s) => contrast(s.hex, PAPER.light) >= 3 && contrast(s.hex, PAPER.dark) >= 3), true)
is('12 to 16 swatches', SWATCHES.length >= 12 && SWATCHES.length <= 16, true)
is('no swatch twice', new Set(SWATCHES.map((s) => s.hex)).size, SWATCHES.length)
is('every swatch is lower-case #rrggbb', SWATCHES.every((s) => /^#[0-9a-f]{6}$/.test(s.hex)), true)

// Defaults.
const builtins = MODULES.map((m) => m.key)
is('every built-in module has a default', builtins.filter((k) => !DEFAULT_COLOURS[k]), [])
is('and a short name', builtins.filter((k) => !SHORT_NAMES[k]), [])
is('Stats has its own colour and name', [DEFAULT_COLOURS.stats, SHORT_NAMES.stats], ['#5d9850', 'Stats'])
is('work and evening have colours too', [!!DEFAULT_COLOURS.work, !!DEFAULT_COLOURS.evening], [true, true])
is('every default is one of the swatches', Object.values(DEFAULT_COLOURS).every((h) => SWATCHES.some((s) => s.hex === h)), true)
is('no two defaults share a colour', new Set(Object.values(DEFAULT_COLOURS)).size, Object.keys(DEFAULT_COLOURS).length)

// Which module a task belongs to.
is('its module key first', taskModule({ module_key: 'u_abc123', category: 'Work' }), 'u_abc123')
is('then its section', [taskModule({ category: 'Work' }), taskModule({ category: 'Meal' }), taskModule({ category: 'Training' }),
  taskModule({ category: 'Learning' }), taskModule({ category: 'Night' }), taskModule({ category: 'Home' }), taskModule({ category: 'Body' })],
['work', 'nutrition', 'training', 'learning', 'evening', 'household', 'health'])
is('an unknown section is no module', taskModule({ category: 'Errands' }), null)
is('nothing is no module', taskModule({}), null)
is('a malformed key is ignored', taskModule({ module_key: 'Bad Key', category: 'Work' }), 'work')

// The colour for a module.
const on = { colours: { on: true, modules: {} } }
const mine = { colours: { on: true, modules: { work: '#123456' } } }
is('the default when nothing is chosen', colourFor('work', on), DEFAULT_COLOURS.work)
is('the person’s choice wins', colourFor('work', mine), '#123456')
is('the colour settings alone work too', colourFor('work', mine.colours), '#123456')
is('a built module’s own colour', colourFor('u_abc123', on, { u_abc123: { colour: '#AA3300' } }), '#aa3300')
is('its definition may say color', definitionColour({ color: '#00aa33' }), '#00aa33')
is('a bad definition colour is ignored', definitionColour({ colour: 'red' }), null)
is('else a stable pick from the swatches', colourFor('u_abc123', on), hashColour('u_abc123'))
is('the same on every call', hashColour('u_plants1'), hashColour('u_plants1'))
is('the pick is a swatch', SWATCHES.some((s) => s.hex === hashColour('u_zz9')), true)
const spread = new Set(['u_a1b2c3', 'u_d4e5f6', 'u_g7h8i9', 'u_j0k1l2', 'u_m3n4o5', 'u_p6q7r8'].map(hashColour))
is('different keys spread over the swatches', spread.size >= 4, true)
is('a map of definitions works as well', colourFor('u_x', on, new Map([['u_x', { colour: '#010203' }]])), '#010203')

// Built modules steer clear of colours already on the page.
const plain = { on: true, modules: {} }
const onNow = ['habits', 'training', 'learning']
const inUse = new Set([...onNow, 'work', 'evening'].map((k) => DEFAULT_COLOURS[k]))
const given = assignBuiltColours(['u_plants1', 'u_books22', 'u_bikes33'], {}, onNow, plain)
is('each built module gets a colour not used by what is on', [...given.values()].every((v) => !inUse.has(v.colour)), true)
is('and not each other’s', new Set([...given.values()].map((v) => v.colour)).size, 3)
is('the same answer every time', JSON.stringify([...assignBuiltColours(['u_plants1', 'u_books22', 'u_bikes33'], {}, onNow, plain)]), JSON.stringify([...given]))
is('a colour in the definition is kept', assignBuiltColours(['u_x'], { u_x: { colour: '#0a7ca6' } }, onNow, plain).get('u_x'), { colour: '#0a7ca6' })
const chosen = { on: true, modules: { habits: hashColour('u_plants1') } }
is('a colour the person chose for another module is avoided', assignBuiltColours(['u_plants1'], {}, [], chosen).get('u_plants1').colour !== hashColour('u_plants1'), true)
const everything = SWATCHES.map((_, i) => `k${i}`)
is('with every swatch taken, still a swatch', SWATCHES.some((s) => s.hex === assignBuiltColours(['u_last'], {}, [], { on: true, modules: Object.fromEntries(everything.map((k, i) => [k, SWATCHES[i].hex])) }).get('u_last').colour), true)
is('colourFor takes the assignment', colourFor('u_plants1', on, given), given.get('u_plants1').colour)

// A task's marker.
is('off: no marker', taskColour({ category: 'Work' }, { colours: { on: false, modules: {} } }), null)
is('on: the module’s colour', taskColour({ category: 'Work' }, on), DEFAULT_COLOURS.work)
is('on, no module: no marker', taskColour({ category: null }, on), null)

// Names.
is('short built-in names', [moduleLabel('learning'), moduleLabel('health'), moduleLabel('evening')], ['Learning', 'Health', 'Evening'])
is('a built module’s own name', moduleLabel('u_abc', { u_abc: ' Plants ' }), 'Plants')
is('a built module with no name known reads as "Your module", never its key', moduleLabel('u_abc'), 'Your module')

// Changing a colour.
const c1 = withColour({ on: true, modules: { work: '#111111' } }, 'habits', '#ABCDEF')
is('setting one keeps the others', c1, { on: true, modules: { work: '#111111', habits: '#abcdef' } })
is('reset removes it', withColour(c1, 'work', null), { on: true, modules: { habits: '#abcdef' } })
is('a bad value resets rather than storing junk', withColour(c1, 'work', 'nope').modules.work, undefined)
is('hex as typed', [parseHex('#3F6B4A'), parseHex('3f6b4a'), parseHex(' #abc '), parseHex('#12345'), parseHex('green')],
  ['#3f6b4a', '#3f6b4a', '#aabbcc', null, null])

// A colour typed by hand is checked for both pages.
is('pale yellow is hard to see on the light page', contrastNote('#f5e663'), 'Hard to see on the light page.')
is('navy is hard to see on the dark page', contrastNote('#1a1f4a'), 'Hard to see on the dark page.')
is('a swatch is fine', contrastNote(SWATCHES[0].hex), null)
// LOOK-06: checked against the chosen theme's own pages, not the default ones.
const papers = (key, dark = 'dark') => ({ light: resolveTheme(key, 'light', null).tokens.paper, dark: resolveTheme(key, dark, null).tokens.paper })
is('a colour is judged on the pages given', contrastNote('#3a3a6a', { light: '#f8f4ed', dark: '#000000' }), 'Hard to see on the dark page.')
is('every built-in theme gives both pages', THEMES.every((t) => /^#[0-9a-f]{6}$/i.test(papers(t.key).light) && /^#[0-9a-f]{6}$/i.test(papers(t.key).dark)), true)
const black = swatchesFor(papers(THEMES[0].key, 'black'))
is('the picker marks each swatch by the chosen theme (a note or none)', black.length === SWATCHES.length && black.every((x) => x.note === null || /^Hard to see/.test(x.note)), true)
const tinted = swatchesFor({ light: '#c43f3e', dark: '#15141b' })
is('on a page of its own colour, that swatch is marked', tinted.find((x) => x.hex === '#c43f3e').note, 'Hard to see on the light page.')
is('on the default pages no swatch is marked', swatchesFor({ light: '#f8f4ed', dark: '#15141b' }).every((x) => x.note === null), true)

// The month cell's order.
is('most items first, then by name', modulesByWeight(['work', 'habits', null, 'work', 'evening', 'habits', 'work']), ['work', 'habits', 'evening'])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
