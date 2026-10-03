import type { NavSettings } from './settings'
import { modulesOn } from './module-view-rules.ts'

/** Which pages a profile has, in which order, and where the page bar puts
 *  them. Pure: no database, no React, so the rules can be checked on their own
 *  (src/test/pages.check.mjs). */

export interface PageInfo {
  /** 'today' | 'plan' | 'more' | 'food' | 'shop' | 'm:<module key>' */
  key: string
  label: string
  route: string
  /** One Unicode character drawn above the label. */
  glyph: string
  /** Today and Plan: bigger in the bar and in their own colour. */
  primary: boolean
  /** The module the page belongs to, or null for Today, Plan and More. */
  module: string | null
}

/** What the page list needs from a module_instance row. */
export interface InstanceLike { module_key: string; enabled: boolean; sort_order?: number | null }
/** What it needs from a module someone built (a `module` row). */
export interface BuiltLike { key: string; name: string; builtin?: boolean; deleted_at?: string | null; definition?: Record<string, unknown> | null }

/** Short names for the bar. The registry's names are written for the module
 *  list ("Health and body") and do not fit under a glyph on a 360 px phone. */
const BUILTIN: Record<string, { label: string; glyph: string }> = {
  training: { label: 'Training', glyph: '▲' },
  habits: { label: 'Habits', glyph: '✓' },
  supplements: { label: 'Supplements', glyph: '◇' },
  health: { label: 'Health', glyph: '♡' },
  learning: { label: 'Learning', glyph: '◧' },
  agenda: { label: 'Agenda', glyph: '▦' },
  sleep: { label: 'Sleep', glyph: '☾' },
  projects: { label: 'Projects', glyph: '▣' },
  finance: { label: 'Finance', glyph: '¤' },
  household: { label: 'Household', glyph: '⌂' },
  stats: { label: 'Stats', glyph: '◔' },
}

/** The app's own order for modules with a page of their own; a module
 *  someone built follows these. */
const MODULE_ORDER = Object.keys(BUILTIN)

/** Modules that never get a page: 'core' is the planner itself, and 'custom'
 *  is only the placeholder under which built modules used to be listed. */
const NO_PAGE = new Set(['core', 'custom', 'nutrition', 'shopping'])

export const TODAY: PageInfo = { key: 'today', label: 'Today', route: '/', glyph: '◉', primary: true, module: null }
export const PLAN: PageInfo = { key: 'plan', label: 'Plan', route: '/plan', glyph: '▤', primary: true, module: null }
export const MORE: PageInfo = { key: 'more', label: 'More', route: '/more', glyph: '⋯', primary: false, module: null }
export const FOOD: PageInfo = { key: 'food', label: 'Food', route: '/food', glyph: '◍', primary: false, module: 'nutrition' }
export const SHOP: PageInfo = { key: 'shop', label: 'Shop', route: '/shop', glyph: '⛬', primary: false, module: 'shopping' }

/** The pages that are always there, for the moment before modules have loaded. */
export const FIXED_PAGES: PageInfo[] = [TODAY, PLAN, MORE]

/** Pages that can never be hidden or moved away from their place. */
export const isFixed = (key: string) => key === 'today' || key === 'plan' || key === 'more'

const MODULE_KEY = /^[a-z0-9_]{1,40}$/

/** A built module's glyph: its own if it set one (one or two characters, so a
 *  whole word cannot land in the bar), else the first letter of its name. */
function builtGlyph(m: BuiltLike): string {
  const g = m.definition && typeof m.definition.glyph === 'string' ? m.definition.glyph.trim() : ''
  if (g && [...g].length <= 2) return g
  const first = [...m.name.trim()][0]
  return first ? first.toUpperCase() : '•'
}

/** Every page the profile has, in the app's default order: Today, Plan, Food,
 *  Shop, the built-in modules, the modules they built (by their place in the
 *  module list, then name), More. A module needs an enabled instance row to
 *  count: a profile that never had a row for it has never switched it on. */
export function availablePages(instances: InstanceLike[], built: BuiltLike[]): PageInfo[] {
  // The one "is it on" rule (module-view-rules.ts), so the bar, Today, the
  // hub and every list agree on which modules exist.
  const isOn = modulesOn(instances, built)
  const on = new Map<string, InstanceLike>()
  for (const i of instances) if (isOn.has(i.module_key)) on.set(i.module_key, i)
  const out: PageInfo[] = [TODAY, PLAN]
  if (on.has('nutrition')) out.push(FOOD)
  if (on.has('shopping')) out.push(SHOP)
  for (const key of MODULE_ORDER) {
    if (on.has(key)) out.push({ key: `m:${key}`, label: BUILTIN[key].label, route: `/m/${key}`, glyph: BUILTIN[key].glyph, primary: false, module: key })
  }
  const mine = built
    .filter((m) => !m.builtin && !m.deleted_at && on.has(m.key) && MODULE_KEY.test(m.key)
      && !NO_PAGE.has(m.key) && !(m.key in BUILTIN))
    .sort((a, b) => ((on.get(a.key)!.sort_order ?? 0) - (on.get(b.key)!.sort_order ?? 0)) || a.name.localeCompare(b.name))
  for (const m of mine) {
    out.push({ key: `m:${m.key}`, label: m.name.trim() || 'Module', route: `/m/${m.key}`, glyph: builtGlyph(m), primary: false, module: m.key })
  }
  out.push(MORE)
  return out
}

/** The pages in the person's order. Keys they listed come first, in their
 *  order; the rest follow in the default order. Whatever the list says, Today
 *  and Plan lead and More closes it: the two primary pages are where every
 *  swipe starts, and More is the way to every setting. */
export function orderPages(pages: PageInfo[], order: string[]): PageInfo[] {
  const rank = new Map(order.map((k, i) => [k, i]))
  const defaultRank = new Map(pages.map((p, i) => [p.key, i]))
  const sorted = [...pages].sort((a, b) => {
    const ra = rank.get(a.key); const rb = rank.get(b.key)
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return defaultRank.get(a.key)! - defaultRank.get(b.key)!
  })
  const primary = sorted.filter((p) => p.primary)
  const middle = sorted.filter((p) => !p.primary && p.key !== 'more')
  const more = sorted.filter((p) => p.key === 'more')
  return [...primary, ...middle, ...more]
}

export interface PageList {
  /** Every page, in order, hidden ones included (for the settings list). */
  all: PageInfo[]
  /** The pages on the bar, in order; swiping walks this list. */
  bar: PageInfo[]
}

export function pageList(instances: InstanceLike[], built: BuiltLike[], nav: Pick<NavSettings, 'order' | 'hidden'>): PageList {
  const all = orderPages(availablePages(instances, built), nav.order)
  const hidden = new Set(nav.hidden.filter((k) => !isFixed(k)))
  return { all, bar: all.filter((p) => !hidden.has(p.key)) }
}

/** The page key a path belongs to, or null for a path that is no page. */
export function pageForPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'today'
  const fixed: Record<string, string> = { '/plan': 'plan', '/food': 'food', '/shop': 'shop', '/more': 'more' }
  if (fixed[path]) return fixed[path]
  const m = /^\/m\/([^/]+)$/.exec(path)
  if (m) {
    const key = decodeURIComponent(m[1])
    return MODULE_KEY.test(key) ? `m:${key}` : null
  }
  return null
}

/** Whether a page may open. A page kept off the bar still opens (its module
 *  is on, it is only not on the bar); a page whose module is off, or one that
 *  never existed, sends the person to Today instead. */
export function pageAllowed(key: string | null, all: PageInfo[]): boolean {
  return key != null && all.some((p) => p.key === key)
}

/** The page a swipe lands on: the next (+1) or previous (-1) one on the bar.
 *  No wrapping: swiping past More does nothing, which reads as the end of the
 *  line rather than a jump back to Today. A page that is not on the bar (a
 *  hidden one, opened from settings) steps from its place in the full list. */
export function neighbour(list: PageList, current: string | null, dir: 1 | -1): PageInfo | null {
  if (!current) return null
  const onBar = new Set(list.bar.map((p) => p.key))
  const i = list.all.findIndex((p) => p.key === current)
  if (i < 0) return null
  for (let j = i + dir; j >= 0 && j < list.all.length; j += dir) {
    if (onBar.has(list.all[j].key)) return list.all[j]
  }
  return null
}

/* ---------- layouts ---------------------------------------------------------- */

/** The row style: up to five pages share the row; with more, Today and Plan
 *  stay at the left, More at the right, and the rest scroll between them. */
export function rowLayout(bar: PageInfo[]): { fixedLeft: PageInfo[]; scroll: PageInfo[]; fixedRight: PageInfo[] } | null {
  if (bar.length <= 5) return null
  return {
    fixedLeft: bar.filter((p) => p.primary),
    scroll: bar.filter((p) => !p.primary && p.key !== 'more'),
    fixedRight: bar.filter((p) => p.key === 'more'),
  }
}

/** Two or three rows: Today and Plan are tall tiles at the left, spanning the
 *  rows; the rest fill a grid row by row. Fewer pages than rows use fewer
 *  rows, so one other page never sits alone in a three-row block. */
export function gridLayout(bar: PageInfo[], rows: 2 | 3): { primary: PageInfo[]; rest: PageInfo[]; rows: number; cols: number } {
  const primary = bar.filter((p) => p.primary)
  const rest = bar.filter((p) => !p.primary)
  const r = Math.max(1, Math.min(rows, rest.length))
  return { primary, rest, rows: r, cols: Math.max(1, Math.ceil(rest.length / r)) }
}

/** The drawer style: Today, Plan and the page open now (if it is another
 *  one) on the bar; everything else in the sheet behind the handle. */
export function drawerLayout(bar: PageInfo[], current: string | null): { onBar: PageInfo[]; inSheet: PageInfo[] } {
  const primary = bar.filter((p) => p.primary)
  const others = bar.filter((p) => !p.primary)
  const here = others.find((p) => p.key === current)
  return { onBar: here ? [...primary, here] : primary, inSheet: others }
}

/** The fan style: Today, Plan and More on the bar; the rest fan out above
 *  the centre button. */
export function fanLayout(bar: PageInfo[]): { left: PageInfo[]; right: PageInfo[]; fan: PageInfo[] } {
  return {
    left: bar.filter((p) => p.primary),
    right: bar.filter((p) => p.key === 'more'),
    fan: bar.filter((p) => !p.primary && p.key !== 'more'),
  }
}

/** How many fan items sit in each row, nearest the button first. The rows
 *  widen as they go up (2, 3, 4 … up to what fits across the screen), so the
 *  pages open out as a triangle from the button. Items are shared out in
 *  proportion to each row's room, the top rows taking any remainder. */
export function fanRows(n: number, perRowMax: number): number[] {
  if (n <= 0) return []
  const cap = (r: number) => Math.max(1, Math.min(r + 2, perRowMax))
  const caps: number[] = []
  let room = 0
  while (room < n) { caps.push(cap(caps.length)); room += caps[caps.length - 1] }
  const counts = caps.map((c) => Math.max(1, Math.floor((n * c) / room)))
  let left = n - counts.reduce((a, b) => a + b, 0)
  // Top rows first: the wide end of the triangle takes what is over.
  for (let r = counts.length - 1; left > 0; r = r === 0 ? counts.length - 1 : r - 1) {
    if (counts[r] < caps[r]) { counts[r]++; left-- }
  }
  // Too many (every row forced to at least one): take from the top rows.
  for (let r = counts.length - 1; left < 0; r = r === 0 ? counts.length - 1 : r - 1) {
    if (counts[r] > 1) { counts[r]--; left++ }
  }
  return counts
}
