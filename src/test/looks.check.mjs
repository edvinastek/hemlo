// Checks the looks rules (LOOK-01 to LOOK-11): every built-in theme passes
// the contrast guard in light, dark and black without a single colour moved;
// the default looks exactly as before; any colour the person picks comes out
// readable and says so when it had to move; text sizes, modes and icons.
import {
  THEMES, ICONS, SEEDS, PAIRS, TEXT_SIZES, resolveTheme, checkTokens, guard, expand, ownBase, nudge, shadeFor, textZoom,
  cssVars, cssText, adjustedNote, iconShapes, iconFor, themeDef, OWN, SYSTEM, DEFAULT_THEME, DEFAULT_ICON, hsl,
  DENSITIES, densityValue, FONT_PAIRINGS, pairingsFor, pairingIn, layoutVars,
} from '../lib/theme-rules.ts'
import { SWATCHES, contrast, contrastNote, setPagePapers } from '../lib/colours-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const SHADES = ['light', 'dark', 'black']

// Eleven themes, the default first, each with a name and a line about it.
is('eleven themes', THEMES.length, 11)
is('the keys of the design page', THEMES.map((t) => t.key),
  ['notebook', 'ub', 'sage', 'harbour', 'plum', 'ochre', 'slate', 'rose', 'coffee', 'mono', 'contrast'])
is('notebook is the default', DEFAULT_THEME, 'notebook')
is('the UB theme is called only UB', themeDef('ub').name, 'UB')
is('every theme has a description', THEMES.every((t) => t.desc.length > 10), true)
is('an unknown key falls back to the default', resolveTheme('nope', 'light', null).key, 'notebook')

// LOOK-05: every pair in every shade of every theme passes as drawn.
for (const t of THEMES) {
  for (const sh of SHADES) {
    const r = resolveTheme(t.key, sh, null)
    const fails = checkTokens(r.tokens).filter((p) => !p.pass).map((p) => `${p.label} ${p.ratio}`)
    is(`${t.key} ${sh}: every pair passes`, fails, [])
    is(`${t.key} ${sh}: nothing had to be adjusted`, r.adjusted, [])
    const swatchMin = Math.min(...SWATCHES.map((s) => contrast(s.hex, r.tokens.paper)))
    // LOOK-06: module marks stay at 3:1 on every theme's page.
    is(`${t.key} ${sh}: every module swatch at 3:1 on the page (lowest ${swatchMin.toFixed(2)})`, swatchMin >= 3, true)
  }
}

// The default looks exactly as v15 did (the warning text is a shade deeper
// so it reads at 4.5:1).
const nb = resolveTheme('notebook', 'light', null).tokens
is('notebook light: the v15 page, ink, accent and tint',
  [nb.paper, nb.ink, nb.soft, nb.accent, nb.tint, nb.rule, nb.rail, nb.field, nb.fieldLine, nb.navInk, nb.navBg],
  ['#f8f4ed', '#201e1b', '#6c665b', '#b4442a', '#efe9dd', '#e4ddcd', '#cfc6b3', '#ece4d4', '#d9cfbb', '#8e3521', '#f0dfd3'])
is('notebook light: v15 heat steps', nb.heat, ['#ece5d7', '#e8cdbf', '#dba68f', '#c87356', '#b4442a'])
is('notebook light: warnings now at 4.5:1 or more', contrast(nb.warn, nb.paper) >= 4.5, true)
const nd = resolveTheme('notebook', 'dark', null).tokens
is('notebook dark: the v15 page, ink, accent and tint',
  [nd.paper, nd.ink, nd.soft, nd.accent, nd.tint, nd.warn, nd.done, nd.field, nd.fieldLine, nd.navInk, nd.navBg],
  ['#15141b', '#f0eae0', '#9b9489', '#d9674a', '#221f27', '#e0a049', '#7fb389', '#24222b', '#34313c', '#ec9479', '#33221f'])

// Black: pure black page, dark colours on it; UB keeps its purple surfaces.
const nbk = resolveTheme('notebook', 'black', null).tokens
is('black: the page is pure black', nbk.paper, '#000000')
is('black: the dark accent stays', nbk.accent, nd.accent)
const ubk = resolveTheme('ub', 'black', null).tokens
is('UB black keeps purple surfaces and rail', [ubk.tab, ubk.rail, ubk.tint], ['#1a0b1a', '#531552', '#1a0b1a'])
is('UB dark: signal orange accent', resolveTheme('ub', 'dark', null).tokens.accent, '#ffa500')
is('heat runs from the tint to the accent', [nbk.heat[0], nbk.heat[4]], [nbk.tint, nbk.accent])

// Modes (LOOK-03): system follows the phone, never picks black.
is('system, phone light', shadeFor('system', false), 'light')
is('system, phone dark', shadeFor('system', true), 'dark')
is('light stays light on a dark phone', shadeFor('light', true), 'light')
is('dark stays dark on a light phone', shadeFor('dark', false), 'dark')
is('black is black', shadeFor('black', false), 'black')

// Own colour (LOOK-04): any colour comes out readable; a colour that already
// reads well is used as it is; one that does not is moved and reported.
const deep = resolveTheme(OWN, 'light', '#1e5a8c')
is('a deep blue is used as chosen on the light page', [deep.tokens.accent, deep.adjusted], ['#1e5a8c', []])
const deepDark = resolveTheme(OWN, 'dark', '#1e5a8c')
is('the same blue is lightened on the dark page', deepDark.adjusted.includes('accent'), true)
is('…and then reads at 4.5:1', contrast(deepDark.tokens.accent, deepDark.tokens.paper) >= 4.5, true)
is('…keeping its hue', Math.abs(hueOf(deepDark.tokens.accent) - hueOf('#1e5a8c')) < 6, true)
const yellow = resolveTheme(OWN, 'light', '#ffe000')
is('a bright yellow is darkened on the light page', yellow.adjusted, ['accent'])
is('the note says so', adjustedNote(yellow.adjusted, 'light'), 'Adjusted for readability: the accent is a little darker than chosen.')
is('nothing moved, no note', adjustedNote([], 'dark'), null)
is('several moved', adjustedNote(['accent', 'soft'], 'dark'), 'Adjusted for readability: the accent and labels are a little lighter than chosen.')
is('own colour is named', resolveTheme(OWN, 'dark', '#4777d2').name, 'Your colour')
is('own colour without a colour falls back to the default', resolveTheme(OWN, 'light', null).key, 'notebook')
is('phone colours (LOOK-02) are built the same way', resolveTheme(SYSTEM, 'light', null, '#6750a4').name, 'Phone colours')
is('phone colours without the phone fall back to the default', resolveTheme(SYSTEM, 'dark', null).key, 'notebook')

// Thirty-six hues at three strengths and two greys, in every shade: all pass.
let seeds = 0, failing = []
for (let h = 0; h < 360; h += 10) {
  for (const [s, l] of [[90, 50], [60, 30], [40, 75]]) {
    for (const sh of SHADES) {
      seeds++
      const r = resolveTheme(OWN, sh, hsl(h, s, l))
      if (checkTokens(r.tokens).some((p) => !p.pass)) failing.push(`${h}/${s}/${l} ${sh}`)
    }
  }
}
for (const g of ['#000000', '#ffffff', '#808080', ...SEEDS.map((x) => x.hex)]) {
  for (const sh of SHADES) {
    seeds++
    if (checkTokens(resolveTheme(OWN, sh, g).tokens).some((p) => !p.pass)) failing.push(`${g} ${sh}`)
  }
}
is(`${seeds} own colours in every shade: every pair passes`, failing, [])
is('own colour surfaces carry its hue', Math.abs(hueOf(ownBase('#1e8347', 'light').paper) - hueOf('#1e8347')) < 8, true)

// The guard itself: never moves the page, moves only what fails.
const bad = { ...expand(themeDef('notebook').light, 'light', themeDef('notebook').keep.light), soft: '#b0a898' }
const g = guard(bad)
is('a failing label colour is moved', g.adjusted, ['soft'])
is('…until it passes on the page and on tints', [contrast(g.tokens.soft, g.tokens.paper) >= 4.5, contrast(g.tokens.soft, g.tokens.tint) >= 4.5], [true, true])
is('…and the page is left alone', g.tokens.paper, bad.paper)
is('nudge leaves a passing colour unchanged', nudge('#201e1b', ['#f8f4ed'], 4.5), '#201e1b')
is('nudge on a dark page goes lighter', contrast(nudge('#333333', ['#000000'], 4.5), '#000000') >= 4.5, true)
is('every pair is labelled in words', PAIRS.every((p) => /^[A-Z][a-z ]+$/.test(p.label)), true)

// Module colour notes follow the chosen theme's pages.
setPagePapers('#f8f4ed', '#15141b')
is('a pale colour is hard to see on the light page', contrastNote('#f0e0a0'), 'Hard to see on the light page.')
setPagePapers('#f8f4ed', '#000000')
is('on a black page, a dark blue is hard to see', contrastNote('#1a2a6a'), 'Hard to see on the dark page.')
setPagePapers('#f8f4ed', '#15141b')

// CSS: every token the stylesheet reads is set.
const vars = cssVars(resolveTheme('sage', 'dark', null).tokens, 'dark')
is('the stylesheet tokens are all set', ['--e-paper', '--e-tab', '--e-rule', '--e-rail', '--e-ink', '--e-ink-soft', '--e-accent', '--e-tint',
  '--e-warn', '--e-done', '--e-goal', '--e-scrim', '--e-heat-0', '--e-heat-4', '--e-field', '--e-field-line',
  '--e-primary-nav', '--e-primary-nav-bg'].every((k) => typeof vars[k] === 'string' && vars[k].length > 3), true)
is('dark shades ask for dark form controls', vars['color-scheme'], 'dark')
is('one style attribute', cssText({ '--a': '#000', b: 'x' }), '--a:#000;b:x')

// Text size (LOOK-07): the choice on top of the phone's own font size.
is('four sizes', TEXT_SIZES.map((t) => t.label), ['Small', 'Default', 'Large', 'Larger'])
is('default on a default phone', textZoom('default', 1), 100)
is('larger', textZoom('larger', 1), 130)
is('the phone set to 1.15 and Large', textZoom('large', 1.15), 132)
is('small on a default phone', textZoom('small'), 90)
is('a nonsense phone scale is ignored', textZoom('default', NaN), 100)
is('never beyond what the layout holds', textZoom('larger', 2), 200)

// App icons (LOOK-10, LOOK-11): nine, Classic first and the default; every
// mark inside the adaptive icon's safe zone.
is('nine icons', ICONS.map((i) => i.key), ['classic', 'night', 'mono', 'brick', 'sage', 'harbour', 'ub', 'tick', 'week'])
is('classic is the default', [DEFAULT_ICON, iconFor('nope').key], ['classic', 'classic'])
is('classic keeps the v15 colours', [iconFor('classic').bg, iconFor('classic').dot], ['#f8f4ed', '#b4442a'])
for (const kind of ['rows', 'tick', 'week']) {
  const out = iconShapes(kind).filter((s) => {
    const pts = corners(s)
    return pts.some(([x, y]) => x < 21 - 0.01 || x > 87 + 0.01 || y < 21 - 0.01 || y > 87 + 0.01)
  })
  is(`${kind}: every mark inside the safe zone`, out.length, 0)
}

// Density (LOOK-08) and font pairing (LOOK-12).
is('density: Comfortable first, Compact', DENSITIES.map((d) => [d.key, d.value]), [['comfortable', 1], ['compact', 0.5]])
is('the default changes nothing on the root', layoutVars('comfortable', 'paired'), { '--density': '', '--font-serif': '' })
is('compact sets the one density number', layoutVars('compact', 'paired')['--density'], '0.5')
is('an unknown density is comfortable', densityValue('roomy'), 1)
is('pairings: serif and sans, all sans', FONT_PAIRINGS.map((p) => p.label), ['Serif and sans', 'All sans'])
is('Notebook keeps the serif: it offers no other pairing', pairingsFor('notebook'), ['paired'])
is('Slate, Mono, High contrast and Harbour offer all sans', ['slate', 'mono', 'contrast', 'harbour'].map((k) => pairingsFor(k).includes('sans')), [true, true, true, true])
is('your own colour and the phone\'s may be all sans', [pairingsFor(OWN), pairingsFor(SYSTEM)], [['paired', 'sans'], ['paired', 'sans']])
is('all sans chosen, then a theme without it: the serif comes back', [pairingIn('slate', 'sans'), pairingIn('notebook', 'sans')], ['sans', 'paired'])
is('all sans sets the serif variable to the sans the app already has', layoutVars('comfortable', 'sans')['--font-serif'], '"IBM Plex Sans", system-ui, sans-serif')

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)

function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return 0
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}
function corners(s) {
  const pts = [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.h], [s.x + s.w, s.y + s.h]]
  if (!s.rot) return pts
  const a = (s.rot * Math.PI) / 180
  return pts.map(([x, y]) => {
    const dx = x - s.ox, dy = y - s.oy
    return [s.ox + dx * Math.cos(a) - dy * Math.sin(a), s.oy + dx * Math.sin(a) + dy * Math.cos(a)]
  })
}
