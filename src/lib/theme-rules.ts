/** Looks: the themes ("colour flows"), the modes, the person's own colour,
 *  text sizes and app icons (LOOK-01 to LOOK-12). Pure: colours in, colours
 *  out, no DOM and no Capacitor, so every rule is checked in plain Node
 *  (src/test/looks.check.mjs).
 *
 *  A theme is a handful of colours for the light page and the dark page; the
 *  rest (the black page, tints, the heat scale, fields) is worked out from
 *  them the same way for every theme, so all themes behave alike. The design
 *  page "Visuma — Looks" is the source of the eleven built-in themes.
 *
 *  Every theme passes the contrast guard (LOOK-05): text at least 4.5:1 on the
 *  page, on tinted chips and in fields; chart strokes and marks at least 3:1.
 *  Dividers and the margin rail are decoration and are not held to it; no
 *  meaning rests on them. A colour the person brings that fails is adjusted
 *  and they are told "Adjusted for readability". */

import { contrast } from './colours-rules.ts'

export type ThemeMode = 'system' | 'light' | 'dark' | 'black'
/** The mode actually drawn, once "system" is resolved. */
export type Shade = 'light' | 'dark' | 'black'

/** The colours a theme is made from, for one shade. */
export interface ThemeBase {
  paper: string
  /** Tabs, chips and the quiet fill behind tinted rows. */
  tab: string
  /** Dividers (decoration). */
  rule: string
  /** The margin rail (decoration). */
  rail: string
  ink: string
  /** Labels and secondary text. */
  soft: string
  /** The now-dot, buttons, links, selected things. */
  accent: string
  warn: string
  done: string
  /** Goal lines in charts. */
  goal: string
}

/** Everything the app's stylesheet reads, for one shade. */
export interface ThemeTokens extends ThemeBase {
  tint: string
  /** Five steps from empty to full, for Plan's heat colours. */
  heat: [string, string, string, string, string]
  field: string
  fieldLine: string
  /** The page bar's main items: their text and the pill behind them. */
  navInk: string
  navBg: string
  scrim: string
}

interface ThemeDef {
  key: string
  name: string
  desc: string
  light: ThemeBase
  dark: ThemeBase
  /** Colours kept exactly as they were before themes existed, so the
   *  default look does not shift for anyone. */
  keep?: { light?: Partial<ThemeTokens>; dark?: Partial<ThemeTokens> }
  /** Font pairings besides the default serif-and-sans the theme offers (LOOK-12). */
  fonts?: FontPairing[]
  /** Surfaces for the black page, when the theme has its own (UB keeps purple). */
  black?: Partial<ThemeBase> & { tint?: string }
}

/* ---------- colour arithmetic --------------------------------------------- */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}
export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0')).join('')
}
/** Hue 0–360, saturation and lightness 0–100. */
export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [h, s * 100, l * 100]
}
export function hsl(h: number, s: number, l: number): string {
  const S = clamp01(s / 100), L = clamp01(l / 100)
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex([f(0), f(8), f(4)])
}
/** A colour t of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b)
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t) as [number, number, number])
}
const isDarkColour = (hex: string) => rgbToHsl(hexToRgb(hex))[2] < 50

/** The colour moved in lightness, one step at a time, until it reaches the
 *  ratio against every background given: darker on a light page, lighter on
 *  a dark one. Hue and saturation stay, so it is still recognisably the same
 *  colour. Gives the colour back unchanged when it already passes. */
export function nudge(hex: string, backgrounds: string[], target: number): string {
  const passes = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= target)
  if (passes(hex)) return hex
  const lighter = isDarkColour(backgrounds[0])
  const [h, s, l0] = rgbToHsl(hexToRgb(hex))
  for (let step = 1; step <= 100; step++) {
    const c = hsl(h, s, l0 + (lighter ? step : -step))
    if (passes(c)) return c
  }
  return lighter ? '#ffffff' : '#000000'
}

/* ---------- the built-in themes ------------------------------------------- */

// From the design page; the light themes' warning colour is a shade deeper
// than drawn there so warning text reads at 4.5:1, not 4.3:1.
export const THEMES: ThemeDef[] = [
  {
    key: 'notebook', name: 'Notebook', desc: 'The default: cream paper, ink rows, brick-red now-dot.',
    light: { paper: '#f8f4ed', tab: '#eee7d9', rule: '#e4ddcd', rail: '#cfc6b3', ink: '#201e1b', soft: '#6c665b', accent: '#b4442a', warn: '#975809', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#15141b', tab: '#201e26', rule: '#2b2a2f', rail: '#3a3842', ink: '#f0eae0', soft: '#9b9489', accent: '#d9674a', warn: '#e0a049', done: '#7fb389', goal: '#8fb0aa' },
    keep: {
      light: { tint: '#efe9dd', heat: ['#ece5d7', '#e8cdbf', '#dba68f', '#c87356', '#b4442a'], field: '#ece4d4', fieldLine: '#d9cfbb', navInk: '#8e3521', navBg: '#f0dfd3' },
      dark: { tint: '#221f27', heat: ['#211f26', '#3a2a23', '#6a3a2a', '#9c4c33', '#d9674a'], field: '#24222b', fieldLine: '#34313c', navInk: '#ec9479', navBg: '#33221f' },
    },
  },
  {
    key: 'ub', name: 'UB', desc: 'Void black, deep purple rails and a signal-orange now-dot. Made for dark.',
    light: { paper: '#f6f2f5', tab: '#ebe0ea', rule: '#dfd1de', rail: '#b99bb8', ink: '#0b0b0b', soft: '#5e4f5d', accent: '#531552', warn: '#995100', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#0b0b0b', tab: '#211021', rule: '#2c1a2c', rail: '#531552', ink: '#f2ece6', soft: '#a89aa6', accent: '#ffa500', warn: '#ff7a6b', done: '#8fd19e', goal: '#c08fc0' },
    black: { tab: '#1a0b1a', rule: '#261426', rail: '#531552', tint: '#1a0b1a' },
  },
  {
    key: 'sage', name: 'Sage', desc: 'Soft green paper, calm and natural.',
    light: { paper: '#f3f5ef', tab: '#e5eadd', rule: '#dae1d0', rail: '#bccab0', ink: '#1c211b', soft: '#5d685a', accent: '#3b7350', warn: '#975809', done: '#2d6b8c', goal: '#6a5f87' },
    dark: { paper: '#111511', tab: '#1b211b', rule: '#273027', rail: '#3a463a', ink: '#e9efe4', soft: '#97a492', accent: '#82c194', warn: '#e0a049', done: '#80b6d4', goal: '#b0a6cf' },
  },
  {
    key: 'harbour', name: 'Harbour', desc: 'Cool blue-grey paper with a sea-blue accent.',
    fonts: ['sans'],
    light: { paper: '#f3f6f9', tab: '#e3eaf2', rule: '#d7dfe8', rail: '#b6c3d2', ink: '#17202b', soft: '#5a6777', accent: '#255d9c', warn: '#975809', done: '#3f6b4a', goal: '#6b5e86' },
    dark: { paper: '#0f141b', tab: '#18202a', rule: '#253040', rail: '#364457', ink: '#e6edf5', soft: '#92a1b3', accent: '#7aa9e2', warn: '#e0a049', done: '#7fb389', goal: '#b3a8d0' },
  },
  {
    key: 'plum', name: 'Plum', desc: 'Warm violet paper for a softer evening feel.',
    light: { paper: '#f7f3f6', tab: '#ece2ea', rule: '#e2d5df', rail: '#c9b5c4', ink: '#22191f', soft: '#6a5c66', accent: '#7b3a69', warn: '#925509', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#17121a', tab: '#221a25', rule: '#302533', rail: '#443646', ink: '#f1e8ef', soft: '#a3929f', accent: '#d590c3', warn: '#e0a049', done: '#7fb389', goal: '#8fb0aa' },
  },
  {
    key: 'ochre', name: 'Ochre', desc: 'Sunny paper with a mustard accent and brick warnings.',
    light: { paper: '#faf6ea', tab: '#f0e7d0', rule: '#e6dbbf', rail: '#cdbe96', ink: '#221e14', soft: '#6b624d', accent: '#835f00', warn: '#b04229', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#16140e', tab: '#211e15', rule: '#2f2b1f', rail: '#423c2b', ink: '#f1ead8', soft: '#a59c86', accent: '#e2b64c', warn: '#e8806a', done: '#7fb389', goal: '#8fb0aa' },
  },
  {
    key: 'slate', name: 'Slate', desc: 'Neutral grey paper with a teal accent; quiet and technical.',
    fonts: ['sans'],
    light: { paper: '#f4f5f6', tab: '#e6e8eb', rule: '#dbdee2', rail: '#bbc1c8', ink: '#1b1f24', soft: '#5d646e', accent: '#0d716e', warn: '#975809', done: '#4b6b2a', goal: '#6b5e86' },
    dark: { paper: '#111316', tab: '#1a1d21', rule: '#272b31', rail: '#3a4048', ink: '#e8ebee', soft: '#99a0a9', accent: '#5cc6c0', warn: '#e0a049', done: '#a9c97f', goal: '#b3a8d0' },
  },
  {
    key: 'rose', name: 'Rose', desc: 'Blush paper with a raspberry accent.',
    light: { paper: '#faf4f3', tab: '#f1e3e1', rule: '#e8d7d4', rail: '#d1b9b5', ink: '#241b1a', soft: '#6d5e5c', accent: '#a8345a', warn: '#975809', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#181213', tab: '#241b1c', rule: '#33272a', rail: '#47383b', ink: '#f3e9e8', soft: '#a8979a', accent: '#ee8ba8', warn: '#e0a049', done: '#7fb389', goal: '#8fb0aa' },
  },
  {
    key: 'coffee', name: 'Coffee', desc: 'Kraft-paper browns, like a leather notebook.',
    light: { paper: '#f6f1ea', tab: '#ebe1d4', rule: '#e0d4c4', rail: '#c7b7a1', ink: '#231c15', soft: '#6b5e50', accent: '#7a4824', warn: '#925509', done: '#3f6b4a', goal: '#5b6e6a' },
    dark: { paper: '#15110d', tab: '#201a15', rule: '#2e261f', rail: '#42372d', ink: '#f0e6da', soft: '#a69886', accent: '#d79e6d', warn: '#e0a049', done: '#7fb389', goal: '#8fb0aa' },
  },
  {
    key: 'mono', name: 'Mono', desc: 'Black on white, no colour except your module marks.',
    fonts: ['sans'],
    light: { paper: '#ffffff', tab: '#f0f0f0', rule: '#e3e3e3', rail: '#c4c4c4', ink: '#111111', soft: '#5a5a5a', accent: '#111111', warn: '#9e5c09', done: '#3f6b4a', goal: '#5a5a5a' },
    dark: { paper: '#0b0b0b', tab: '#181818', rule: '#262626', rail: '#3a3a3a', ink: '#f2f2f2', soft: '#a3a3a3', accent: '#f2f2f2', warn: '#e0a049', done: '#7fb389', goal: '#a3a3a3' },
  },
  {
    key: 'contrast', name: 'High contrast', desc: 'Strongest contrast for bright sun or low vision.',
    fonts: ['sans'],
    light: { paper: '#ffffff', tab: '#ededed', rule: '#8a8a8a', rail: '#6b6b6b', ink: '#000000', soft: '#2e2e2e', accent: '#a8201a', warn: '#8a4b00', done: '#1d5a2e', goal: '#2e4a45' },
    dark: { paper: '#000000', tab: '#161616', rule: '#8a8a8a', rail: '#9a9a9a', ink: '#ffffff', soft: '#dadada', accent: '#ff8f80', warn: '#ffc266', done: '#8fe0a3', goal: '#a8d8cf' },
  },
]

export const DEFAULT_THEME = 'notebook'
/** Built from the person's own colour (LOOK-04). */
export const OWN = 'custom'
/** Built from the phone's wallpaper colours (LOOK-02, Android 12+). */
export const SYSTEM = 'system'

export const themeDef = (key: string): ThemeDef => THEMES.find((t) => t.key === key) ?? THEMES[0]

/** Swatches offered for "Your colour"; any hex works too. */
export const SEEDS: { name: string; hex: string }[] = [
  { name: 'Brick', hex: '#b4442a' }, { name: 'Orange', hex: '#ce710c' }, { name: 'Ochre', hex: '#a4861e' },
  { name: 'Green', hex: '#1e8347' }, { name: 'Teal', hex: '#14938d' }, { name: 'Blue', hex: '#4777d2' },
  { name: 'Indigo', hex: '#6a59bc' }, { name: 'Violet', hex: '#a262b6' }, { name: 'Rose', hex: '#b84379' },
  { name: 'Stone', hex: '#78716a' },
]

/* ---------- modes ---------------------------------------------------------- */

/** What is drawn: the chosen mode, or the phone's when it is "system". Black
 *  is the dark mode on pure black, so "system" never chooses it. */
export function shadeFor(mode: ThemeMode, systemDark: boolean): Shade {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}
export const isDarkShade = (s: Shade) => s !== 'light'

/* ---------- from a few colours to every token ------------------------------ */

/** The black page: the dark colours on pure black, with near-black surfaces
 *  (or the theme's own, for UB's purple). */
function blackBase(def: Pick<ThemeDef, 'dark' | 'black'>): ThemeBase & { tint: string } {
  return {
    ...def.dark, paper: '#000000', tab: '#121212', rule: '#242424', rail: '#363636', tint: '#161616',
    ...(def.black ?? {}),
  }
}

/** Every token for one shade, worked out from the base colours. */
export function expand(base: ThemeBase & { tint?: string }, shade: Shade, keep: Partial<ThemeTokens> = {}): ThemeTokens {
  const tint = base.tint ?? base.tab
  const navBg = mix(base.paper, base.accent, shade === 'light' ? 0.12 : 0.16)
  const t: ThemeTokens = {
    ...base,
    tint,
    heat: [tint, mix(tint, base.accent, 0.25), mix(tint, base.accent, 0.5), mix(tint, base.accent, 0.75), base.accent],
    field: mix(base.tab, base.rail, 0.15),
    fieldLine: mix(base.tab, base.rail, 0.7),
    navInk: nudge(base.accent, [navBg], 4.5),
    navBg,
    scrim: shade === 'light' ? `rgba(${hexToRgb(base.ink).map((v) => Math.round(v * 255)).join(', ')}, 0.42)`
      : shade === 'dark' ? 'rgba(0, 0, 0, 0.58)' : 'rgba(0, 0, 0, 0.7)',
  }
  return { ...t, ...keep }
}

/* ---------- the contrast guard (LOOK-05) ----------------------------------- */

export const TEXT_RATIO = 4.5
export const MARK_RATIO = 3

export interface ContrastPair {
  /** What it is, in plain words: "Labels on tinted rows". */
  label: string
  fg: keyof ThemeTokens
  bg: keyof ThemeTokens
  min: number
}

/** Every pair the app draws that carries meaning. Text sits on the page, on
 *  tinted rows and chips, and in fields; the accent is also the colour of
 *  text on buttons (drawn in the page colour). */
export const PAIRS: ContrastPair[] = [
  { label: 'Text', fg: 'ink', bg: 'paper', min: TEXT_RATIO },
  { label: 'Text on tinted rows', fg: 'ink', bg: 'tint', min: TEXT_RATIO },
  { label: 'Text in fields', fg: 'ink', bg: 'field', min: TEXT_RATIO },
  { label: 'Labels', fg: 'soft', bg: 'paper', min: TEXT_RATIO },
  { label: 'Labels on tinted rows', fg: 'soft', bg: 'tint', min: TEXT_RATIO },
  { label: 'Accent text and buttons', fg: 'accent', bg: 'paper', min: TEXT_RATIO },
  { label: 'Accent on tinted rows', fg: 'accent', bg: 'tint', min: TEXT_RATIO },
  { label: 'Warnings', fg: 'warn', bg: 'paper', min: TEXT_RATIO },
  { label: 'Warnings on tinted rows', fg: 'warn', bg: 'tint', min: TEXT_RATIO },
  { label: 'Done', fg: 'done', bg: 'paper', min: TEXT_RATIO },
  { label: 'Page bar', fg: 'navInk', bg: 'navBg', min: TEXT_RATIO },
  { label: 'Goal lines', fg: 'goal', bg: 'paper', min: MARK_RATIO },
]

export interface PairResult { label: string; ratio: number; min: number; pass: boolean }

export function checkTokens(t: ThemeTokens): PairResult[] {
  return PAIRS.map((p) => {
    const ratio = contrast(String(t[p.fg]), String(t[p.bg]))
    return { label: p.label, ratio: Math.round(ratio * 100) / 100, min: p.min, pass: ratio >= p.min }
  })
}

/** The tokens with every failing colour moved until it passes, and which
 *  ones moved. The page colours never move; the colours drawn on them do. */
export function guard(t: ThemeTokens): { tokens: ThemeTokens; adjusted: (keyof ThemeTokens)[] } {
  const out: ThemeTokens = { ...t, heat: [...t.heat] as ThemeTokens['heat'] }
  const adjusted = new Set<keyof ThemeTokens>()
  // Each foreground against all of its backgrounds at once, so fixing one
  // pair cannot break another.
  const fgs = [...new Set(PAIRS.map((p) => p.fg))]
  for (const fg of fgs) {
    const pairs = PAIRS.filter((p) => p.fg === fg)
    const min = Math.max(...pairs.map((p) => p.min))
    const bgs = pairs.map((p) => String(out[p.bg]))
    const before = String(out[fg])
    const after = nudge(before, bgs, min)
    if (after !== before) {
      ;(out as unknown as Record<string, string>)[fg] = after
      adjusted.add(fg)
    }
  }
  if (adjusted.has('accent')) out.heat[4] = out.accent
  return { tokens: out, adjusted: [...adjusted] }
}

/* ---------- own colour (LOOK-04) and the phone's colours (LOOK-02) ------------ */

/** A whole theme from one colour: paper and surfaces faintly tinted with its
 *  hue, ink nearly black (or nearly white), and the colour itself as the
 *  accent wherever it reads well enough; where it does not, it is made
 *  darker (light page) or lighter (dark page) and that is reported. */
export function ownBase(seed: string, shade: Shade): ThemeBase & { tint?: string } {
  const [h] = rgbToHsl(hexToRgb(seed))
  if (shade === 'light') {
    return {
      paper: hsl(h, 30, 96.5), tab: hsl(h, 24, 90.5), rule: hsl(h, 20, 86), rail: hsl(h, 16, 74),
      ink: hsl(h, 18, 11), soft: hsl(h, 9, 36), accent: seed, warn: '#9c5b09', done: '#3f6b4a', goal: hsl((h + 180) % 360, 15, 40),
    }
  }
  const dark: ThemeBase = {
    paper: hsl(h, 18, 8), tab: hsl(h, 16, 12.5), rule: hsl(h, 14, 17), rail: hsl(h, 12, 25),
    ink: hsl(h, 22, 92), soft: hsl(h, 8, 64), accent: seed, warn: '#e0a049', done: '#7fb389', goal: hsl((h + 180) % 360, 20, 70),
  }
  if (shade === 'black') return { ...dark, paper: '#000000', tab: hsl(h, 10, 7), rule: hsl(h, 8, 14), rail: hsl(h, 8, 21), tint: hsl(h, 10, 8.5) }
  return dark
}

export interface ResolvedTheme {
  key: string
  name: string
  shade: Shade
  tokens: ThemeTokens
  /** Colours the guard had to move; shown as "Adjusted for readability". */
  adjusted: (keyof ThemeTokens)[]
}

/** The colours to draw for a theme key and shade. `seed` is the person's own
 *  colour, `system` the phone's accent (both only for their theme). An
 *  unknown key falls back to the default theme. */
export function resolveTheme(key: string, shade: Shade, seed: string | null, system: string | null = null): ResolvedTheme {
  if ((key === OWN && seed) || (key === SYSTEM && system)) {
    const colour = (key === OWN ? seed : system) as string
    const { tokens, adjusted } = guard(expand(ownBase(colour, shade), shade))
    // Only the colour they chose is theirs to be told about; the rest of
    // the theme is worked out here and quietly kept readable.
    return { key, name: key === OWN ? 'Your colour' : 'Phone colours', shade, tokens, adjusted: adjusted.filter((k) => k === 'accent') }
  }
  const def = themeDef(key)
  const base = shade === 'black' ? blackBase(def) : def[shade]
  const keep = shade === 'light' ? def.keep?.light : shade === 'dark' ? def.keep?.dark : undefined
  const { tokens, adjusted } = guard(expand(base, shade, keep))
  return { key: def.key, name: def.name, shade, tokens, adjusted }
}

/* ---------- to CSS ---------------------------------------------------------- */

/** The custom properties the stylesheet reads, set on the page's root. */
export function cssVars(t: ThemeTokens, shade: Shade): Record<string, string> {
  return {
    'color-scheme': shade === 'light' ? 'light' : 'dark',
    '--e-paper': t.paper, '--e-tab': t.tab, '--e-rule': t.rule, '--e-rail': t.rail,
    '--e-ink': t.ink, '--e-ink-soft': t.soft, '--e-accent': t.accent, '--e-tint': t.tint,
    '--e-warn': t.warn, '--e-done': t.done, '--e-goal': t.goal, '--e-scrim': t.scrim,
    '--e-heat-0': t.heat[0], '--e-heat-1': t.heat[1], '--e-heat-2': t.heat[2], '--e-heat-3': t.heat[3], '--e-heat-4': t.heat[4],
    '--e-field': t.field, '--e-field-line': t.fieldLine,
    '--e-primary-nav': t.navInk, '--e-primary-nav-bg': t.navBg,
  }
}

/** The same as one style attribute, for the pre-paint script in index.html. */
export const cssText = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')

/* ---------- words for the guard ------------------------------------------- */

const TOKEN_WORDS: Partial<Record<keyof ThemeTokens, string>> = {
  ink: 'text', soft: 'labels', accent: 'the accent', warn: 'warnings', done: 'done marks', goal: 'goal lines', navInk: 'the page bar',
}
/** "Adjusted for readability: the accent is a little darker." */
export function adjustedNote(adjusted: (keyof ThemeTokens)[], shade: Shade): string | null {
  const words = adjusted.map((k) => TOKEN_WORDS[k]).filter(Boolean) as string[]
  if (!words.length) return null
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  const way = shade === 'light' ? 'darker' : 'lighter'
  return `Adjusted for readability: ${list} ${words.length === 1 && !list.endsWith('s') ? 'is' : 'are'} a little ${way} than chosen.`
}

/* ---------- text size (LOOK-07) and density (LOOK-08) ----------------------- */

export type TextSize = 'small' | 'default' | 'large' | 'larger'
export const TEXT_SIZES: { key: TextSize; label: string; scale: number }[] = [
  { key: 'small', label: 'Small', scale: 0.9 },
  { key: 'default', label: 'Default', scale: 1 },
  { key: 'large', label: 'Large', scale: 1.15 },
  { key: 'larger', label: 'Larger', scale: 1.3 },
]
/** The text zoom in percent: the chosen size on top of the phone's own
 *  font size (fontScale 1 is the phone's default), kept within what the
 *  layout can hold. */
export function textZoom(size: TextSize, phoneScale = 1): number {
  const s = TEXT_SIZES.find((x) => x.key === size)?.scale ?? 1
  const phone = Number.isFinite(phoneScale) && phoneScale > 0 ? phoneScale : 1
  return Math.round(Math.max(80, Math.min(200, s * phone * 100)))
}

/** Rows Comfortable (the default) or Compact (LOOK-08): one number on the
 *  page's root, --density, that the rows take their padding and line height
 *  from (app.css); tap targets stay at least 44 px either way. */
export type Density = 'comfortable' | 'compact'
export const DENSITIES: { key: Density; label: string; value: number }[] = [
  { key: 'comfortable', label: 'Comfortable', value: 1 },
  { key: 'compact', label: 'Compact', value: 0.5 },
]
export const densityValue = (d: Density) => DENSITIES.find((x) => x.key === d)?.value ?? 1

/* ---------- font pairing (LOOK-12) --------------------------------------------- */

/** The serif for what the person wrote and the sans for the system's own
 *  words, in every theme by default. A theme may offer another pairing:
 *  "All sans", where the person's words are set in the sans too. Only the
 *  font variables change; no font is added. */
export type FontPairing = 'paired' | 'sans'
export const FONT_PAIRINGS: { key: FontPairing; label: string }[] = [
  { key: 'paired', label: 'Serif and sans' },
  { key: 'sans', label: 'All sans' },
]
const SANS_STACK = '"IBM Plex Sans", system-ui, sans-serif'

/** The pairings a theme offers: the default always, then its own. Your own
 *  colour and the phone's colours are yours to pair as you like. */
export function pairingsFor(themeKey: string): FontPairing[] {
  const own = themeKey === OWN || themeKey === SYSTEM ? (['sans'] as FontPairing[]) : themeDef(themeKey).fonts ?? []
  return ['paired', ...own.filter((p) => p !== 'paired')]
}

/** The pairing in use: the chosen one if the theme offers it, else the default. */
export const pairingIn = (themeKey: string, chosen: FontPairing): FontPairing => (pairingsFor(themeKey).includes(chosen) ? chosen : 'paired')

/** The root variables for density and fonts; empty values mean "as the
 *  style sheet has it" (the default), so nothing changes for anyone who
 *  never chose. */
export function layoutVars(density: Density, pairing: FontPairing): Record<string, string> {
  return {
    '--density': density === 'comfortable' ? '' : String(densityValue(density)),
    '--font-serif': pairing === 'sans' ? SANS_STACK : '',
  }
}

/* ---------- app icons (LOOK-10, LOOK-11) ------------------------------------ */

export interface AppIcon {
  key: string
  name: string
  kind: 'rows' | 'tick' | 'week'
  bg: string
  rail: string
  ink: string
  dot: string
}

/** The icons bundled in the Android app (android/…/res/drawable/ic_icon_*),
 *  drawn by scripts/make-assets.mjs from these same colours. Classic is the
 *  icon Visuma always had, and the default. */
export const ICONS: AppIcon[] = [
  { key: 'classic', name: 'Classic', kind: 'rows', bg: '#f8f4ed', rail: '#cfc6b3', ink: '#201e1b', dot: '#b4442a' },
  { key: 'night', name: 'Night', kind: 'rows', bg: '#15141b', rail: '#3a3842', ink: '#f0eae0', dot: '#d9674a' },
  { key: 'mono', name: 'Mono', kind: 'rows', bg: '#ffffff', rail: '#c4c4c4', ink: '#111111', dot: '#111111' },
  { key: 'brick', name: 'Brick', kind: 'rows', bg: '#b4442a', rail: '#d98b78', ink: '#f8f4ed', dot: '#201e1b' },
  { key: 'sage', name: 'Sage', kind: 'rows', bg: '#e5eadd', rail: '#bccab0', ink: '#1c211b', dot: '#3b7350' },
  { key: 'harbour', name: 'Harbour', kind: 'rows', bg: '#255d9c', rail: '#6f97c6', ink: '#f3f6f9', dot: '#e2b64c' },
  { key: 'ub', name: 'UB', kind: 'rows', bg: '#0b0b0b', rail: '#531552', ink: '#f2ece6', dot: '#ffa500' },
  { key: 'tick', name: 'Tick', kind: 'tick', bg: '#f8f4ed', rail: '#cfc6b3', ink: '#201e1b', dot: '#b4442a' },
  { key: 'week', name: 'Week', kind: 'week', bg: '#201e1b', rail: '#4a463f', ink: '#f0eae0', dot: '#d9674a' },
]
export const DEFAULT_ICON = 'classic'
export const iconFor = (key: string) => ICONS.find((i) => i.key === key) ?? ICONS[0]

export interface IconShape {
  /** On Android's 108-unit adaptive icon grid. */
  x: number; y: number; w: number; h: number
  colour: 'rail' | 'ink' | 'dot'
  /** Corner radius; a pill when it is half the short side. */
  r: number
  /** Turned about (ox, oy) by this many degrees. */
  rot?: number; ox?: number; oy?: number
}

/** The marks of an icon: the margin rule that is the day's time rail, the
 *  now-dot on it, the day's rows beside it. Everything that matters sits in
 *  the 66-unit safe zone (21 to 87), so any launcher mask keeps it. */
export function iconShapes(kind: AppIcon['kind']): IconShape[] {
  const pill = (x: number, y: number, w: number, h: number, colour: IconShape['colour'], extra: Partial<IconShape> = {}): IconShape =>
    ({ x, y, w, h, colour, r: Math.min(w, h) / 2, ...extra })
  if (kind === 'rows') {
    return [pill(32, 26, 4, 56, 'rail'), pill(45, 36, 36, 8, 'ink'), pill(45, 50, 26, 8, 'ink'), pill(45, 64, 36, 8, 'ink'), pill(26, 46, 16, 16, 'dot')]
  }
  if (kind === 'tick') {
    return [
      pill(32, 26, 4, 56, 'rail'), pill(26, 46, 16, 16, 'dot'),
      pill(46, 53, 17, 8, 'ink', { rot: 45, ox: 46, oy: 57 }),
      pill(55, 63, 34, 8, 'ink', { rot: -52, ox: 55, oy: 67 }),
    ]
  }
  const heights = [16, 24, 20, 34, 28, 14, 10]
  return [
    { x: 27, y: 79, w: 54, h: 3, colour: 'rail', r: 1.5 },
    ...heights.map((h, i): IconShape => ({ x: 28 + i * 7.6, y: 77 - h, w: 5, h, colour: i === 3 ? 'dot' : 'ink', r: 1.6 })),
  ]
}
