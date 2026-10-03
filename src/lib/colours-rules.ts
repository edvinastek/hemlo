import type { ColourSettings } from './settings.ts'

/** Module colours, as rules with no database and no React, so every choice
 *  can be checked in plain Node (src/test/colours.check.mjs).
 *
 *  A colour marks which part of life a task belongs to, so a day can be read
 *  at a glance. It is never the only signal: tabs, legends and the row's own
 *  meta line always carry the name as well. */

export interface Swatch { hex: string; name: string }

/** The picker's swatches, in hue order. One set for both themes: every one
 *  sits in the narrow middle band of lightness that keeps a 6 px marker at
 *  3:1 or more against both the light page (#f8f4ed) and the dark one
 *  (#15141b), so a colour chosen in one theme never vanishes in the other.
 *  The check computes the ratios; the figures are in the check's output. */
export const SWATCHES: Swatch[] = [
  { hex: '#c43f3e', name: 'Brick' },
  { hex: '#b84379', name: 'Rose' },
  { hex: '#92508c', name: 'Plum' },
  { hex: '#a262b6', name: 'Violet' },
  { hex: '#6a59bc', name: 'Indigo' },
  { hex: '#4777d2', name: 'Blue' },
  { hex: '#6d7198', name: 'Slate' },
  { hex: '#0a7ca6', name: 'Steel' },
  { hex: '#14938d', name: 'Teal' },
  { hex: '#1e8347', name: 'Green' },
  { hex: '#5d9850', name: 'Leaf' },
  { hex: '#7a8a12', name: 'Olive' },
  { hex: '#a4861e', name: 'Ochre' },
  { hex: '#ce710c', name: 'Orange' },
  { hex: '#9b5e30', name: 'Brown' },
  { hex: '#78716a', name: 'Stone' },
]

/** Each built-in module's own colour, and the two parts of planning that are
 *  not modules but still colour a day: work hours and the evening. Chosen so
 *  modules that often share a day (work and learning, training and
 *  nutrition, habits and supplements) sit far apart in hue. */
export const DEFAULT_COLOURS: Record<string, string> = {
  training: '#c43f3e',
  health: '#b84379',
  evening: '#92508c',
  supplements: '#a262b6',
  sleep: '#6a59bc',
  learning: '#4777d2',
  agenda: '#6d7198',
  work: '#0a7ca6',
  shopping: '#14938d',
  habits: '#1e8347',
  finance: '#7a8a12',
  projects: '#a4861e',
  nutrition: '#ce710c',
  household: '#9b5e30',
  stats: '#5d9850',
  custom: '#78716a',
}

/** Short names for tabs, legends and settings rows. The registry's names are
 *  written for the Modules list ("Learning and reading") and are too long for
 *  a tab on a phone. */
export const SHORT_NAMES: Record<string, string> = {
  nutrition: 'Nutrition',
  shopping: 'Shopping',
  training: 'Training',
  habits: 'Habits',
  supplements: 'Supplements',
  health: 'Health',
  learning: 'Learning',
  agenda: 'Agenda',
  sleep: 'Sleep',
  projects: 'Projects',
  finance: 'Finance',
  household: 'Household',
  stats: 'Stats',
  custom: 'Custom',
  work: 'Work',
  evening: 'Evening',
}

/** The task sheet's sections, mapped to the module they belong with. A task
 *  written by hand has a section but rarely a module_key, and without this
 *  most of a day would have no colour at all. */
export const CATEGORY_MODULE: Record<string, string> = {
  Work: 'work',
  Meal: 'nutrition',
  Training: 'training',
  Learning: 'learning',
  Home: 'household',
  Body: 'health',
  Night: 'evening',
}

const HEX = /^#[0-9a-f]{6}$/i

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v)
}

/** The module a task belongs to: its module_key, else its section, else none.
 *  Work and commute series carry the Work section (work-rules.ts), so they
 *  come out as 'work' here without looking at the series. */
export function taskModule(task: { module_key?: string | null; category?: string | null }): string | null {
  if (task.module_key && /^[a-z0-9_]{1,40}$/.test(task.module_key)) return task.module_key
  if (task.category && CATEGORY_MODULE[task.category]) return CATEGORY_MODULE[task.category]
  return null
}

/** A stable place in the swatches for a key, so a built module keeps the same
 *  colour on every device without anyone choosing one. FNV-1a: short, and a
 *  one-letter difference in the key lands somewhere else entirely. */
export function hashColour(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return SWATCHES[h % SWATCHES.length].hex
}

/** Colours for the modules the person built, each as a definition carrying
 *  its colour, ready to pass to colourFor. A module whose definition names a
 *  colour keeps it. The rest start at their hashed place in the swatches and
 *  step past any colour already in use (the modules that are on, the ones a
 *  task's section maps to, colours the person chose, and built modules handed one before
 *  them, in key order), so a new module never looks like one already on the
 *  page. Only when every swatch is taken do two share. The same modules and
 *  settings give the same colours on every device. */
export function assignBuiltColours(
  builtKeys: string[],
  definitions: Map<string, unknown> | Record<string, unknown>,
  enabled: string[],
  colours: ColourSettings,
): Map<string, { colour: string }> {
  const def = (k: string) => (definitions instanceof Map ? definitions.get(k) : definitions[k])
  const taken = new Set<string>()
  const builtSet = new Set(builtKeys)
  // Modules a section maps to can colour a day even when switched off (a
  // task in the Home section), so their colours count as taken too.
  for (const k of [...enabled, ...Object.values(CATEGORY_MODULE)]) {
    if (builtSet.has(k)) continue
    taken.add(colourFor(k, colours))
  }
  for (const hex of Object.values(colours.modules)) if (isHex(hex)) taken.add(hex.toLowerCase())
  for (const k of builtKeys) {
    const own = colours.modules[k] ?? definitionColour(def(k))
    if (own) taken.add(own.toLowerCase())
  }

  const out = new Map<string, { colour: string }>()
  for (const k of [...builtKeys].sort()) {
    const own = definitionColour(def(k))
    if (own) { out.set(k, { colour: own }); continue }
    const start = SWATCHES.findIndex((s) => s.hex === hashColour(k))
    let pick = SWATCHES[start].hex
    for (let i = 0; i < SWATCHES.length; i++) {
      const hex = SWATCHES[(start + i) % SWATCHES.length].hex
      if (!taken.has(hex)) { pick = hex; break }
    }
    taken.add(pick)
    out.set(k, { colour: pick })
  }
  return out
}

/** What a built module's definition says about its colour, if anything. */
export function definitionColour(definition: unknown): string | null {
  const c = (definition as { colour?: unknown; color?: unknown } | null | undefined)
  const v = c?.colour ?? c?.color
  return isHex(v) ? v.toLowerCase() : null
}

/** The colour for a module: the person's choice, else the module's own
 *  default, else what a built module's definition says, else a stable pick
 *  from the swatches. Always a colour; whether to show it is settings.on. */
export function colourFor(
  moduleKey: string,
  settings: { colours: ColourSettings } | ColourSettings,
  built?: Map<string, unknown> | Record<string, unknown>,
): string {
  const colours = 'colours' in settings ? settings.colours : settings
  const chosen = colours.modules[moduleKey]
  if (isHex(chosen)) return chosen.toLowerCase()
  if (DEFAULT_COLOURS[moduleKey]) return DEFAULT_COLOURS[moduleKey]
  const def = built instanceof Map ? built.get(moduleKey) : built?.[moduleKey]
  return definitionColour(def) ?? hashColour(moduleKey)
}

/** The marker a task gets, or null when colours are off or the task belongs
 *  to no module. */
export function taskColour(
  task: { module_key?: string | null; category?: string | null },
  settings: { colours: ColourSettings },
  built?: Map<string, unknown> | Record<string, unknown>,
): string | null {
  if (!settings.colours.on) return null
  const key = taskModule(task)
  return key ? colourFor(key, settings, built) : null
}

/** A name for a module key: the short built-in name, else the built module's
 *  own name. A built module that is gone (deleted, or not synced yet) reads
 *  "Your module": its internal key (u_…) means nothing to a person. */
export function moduleLabel(key: string, names?: Map<string, string> | Record<string, string>): string {
  if (SHORT_NAMES[key]) return SHORT_NAMES[key]
  const n = names instanceof Map ? names.get(key) : names?.[key]
  if (n && n.trim()) return n.trim()
  return key.startsWith('u_') ? 'Your module' : key
}

/** A colour setting with one module changed, or with it reset to its default
 *  (hex null). The whole map is returned because mergeSettings replaces the
 *  map as one value. */
export function withColour(colours: ColourSettings, key: string, hex: string | null): ColourSettings {
  const modules = { ...colours.modules }
  if (hex && isHex(hex)) modules[key] = hex.toLowerCase()
  else delete modules[key]
  return { ...colours, modules }
}

/** '#abc', 'abc', ' #AABBCC ' and so on, as typed, to '#aabbcc' or null. */
export function parseHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s.split('').map((c) => c + c).join('')}`
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`
  return null
}

/* ---------- contrast ------------------------------------------------------ */

/** The two page colours a marker sits on (--e-paper, light and dark) in
 *  the default theme. */
export const PAPER = { light: '#f8f4ed', dark: '#15141b' } as const

/** The pages of the theme the person chose (LOOK-06): set by looks.ts when
 *  the theme is applied, so a colour's note speaks of the pages they see. */
const pages: { light: string; dark: string } = { ...PAPER }
export function setPagePapers(light: string, dark: string) {
  pages.light = light
  pages.dark = dark
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** For a colour typed by hand: which page it will be hard to see on, if
 *  either. 3:1 is the floor for a small non-text mark. */
export function contrastNote(hex: string): string | null {
  const light = contrast(hex, pages.light) < 3
  const dark = contrast(hex, pages.dark) < 3
  if (light && dark) return 'Hard to see on both the light and the dark page.'
  if (light) return 'Hard to see on the light page.'
  if (dark) return 'Hard to see on the dark page.'
  return null
}

/** The modules present on a day, most tasks first, then by name; for the
 *  month cell's dots and the year square's title. */
export function modulesByWeight(keys: (string | null)[]): string[] {
  const count = new Map<string, number>()
  for (const k of keys) if (k) count.set(k, (count.get(k) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}
