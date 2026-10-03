/** Pure rules for the household's stock: reading an amount someone typed,
 *  showing one, the −/+ steps, and what a meal or a shopping trip does to the
 *  cupboard. No database and no React, so every rule is checked by hand in
 *  src/test/stock.check.mjs. Amounts are grams throughout; kilograms exist
 *  only at the edges, where a person types or reads them. */

import { rawGrams } from './calc.ts'
import { findUnit, nudgeCount, type FoodUnit } from './units-rules.ts'
import type { Food, RecipeLine } from './types'

export type Unit = 'g' | 'kg'

/** The database refuses more than this (stock_grams_check), so the app never
 *  offers it: a tonne of anything is a typo, not a cupboard. */
export const MAX_GRAMS = 1_000_000
/** Also the database's limit, so a long note is cut here rather than refused there. */
export const NOTE_MAX = 200

/** Stored to a tenth of a gram. Taking 33.3 g out and putting it back must
 *  land where it started, and floating-point sums would drift by a hair. */
export const tidy = (g: number) => Math.round(g * 10) / 10

const clamp = (g: number) => Math.min(MAX_GRAMS, Math.max(0, tidy(g)))

/** What a person typed, in grams, or null when it is not an amount. A comma
 *  is read as the decimal point, because on a Dutch or Lithuanian phone
 *  keyboard that is the key that is there. */
export function toGrams(text: string | number, unit: Unit): number | null {
  if (typeof text === 'string' && text.trim() === '') return null
  const raw = typeof text === 'number' ? text : Number(text.replace(/\s+/g, '').replace(',', '.'))
  if (!Number.isFinite(raw) || raw < 0) return null
  const g = unit === 'kg' ? raw * 1000 : raw
  if (g > MAX_GRAMS) return null
  return tidy(g)
}

/** The unit an amount reads best in: kilograms from one kilo up. */
export const unitFor = (g: number): Unit => (g >= 1000 ? 'kg' : 'g')

/** An amount as it goes back into a field to be edited: "1.25" with kg, "450" with g. */
export function inUnit(g: number, unit: Unit): string {
  const n = unit === 'kg' ? Math.round(g) / 1000 : Math.round(g)
  return String(Math.round(n * 1000) / 1000)
}

/** "450 g", "1.25 kg". Grams are whole; kilos keep what matters and drop trailing zeros. */
export function formatGrams(g: number): string {
  if (!Number.isFinite(g) || g <= 0) return '0 g'
  if (g < 1000) return `${Math.max(1, Math.round(g))} g`
  const kg = Math.round(g / 10) / 100
  return `${kg} kg`
}

/** The −/+ step for an amount of this size: a spice jar moves by 10 g, a bag
 *  of rice by 100 g, a sack of potatoes by 500 g. */
export function stepFor(g: number): number {
  if (g < 100) return 10
  if (g < 1000) return 50
  if (g < 5000) return 100
  return 500
}

/** One tap of − or +. The amount snaps to the step, so 437 g goes up to 450
 *  and down to 400 rather than to 487 and 387, and a few taps reach a round
 *  number. Down uses the step of the amount just below, so + then − returns
 *  where it started even across a boundary (950 → 1000 → 950). */
export function nudge(g: number, dir: 1 | -1): number {
  const s = stepFor(dir > 0 ? g : Math.max(0, g - 0.001))
  const next = dir > 0 ? Math.floor(g / s + 1e-9) * s + s : Math.ceil(g / s - 1e-9) * s - s
  return clamp(next)
}

/** One tap on a stock row: a whole one of its unit when it is kept in one
 *  the food has ("12 eggs" → 13), else a step in grams. `units` are the
 *  food's, null when the food is not on this device; then the unit cannot be
 *  weighed, so the tap moves grams and the unit is left for the food's owner. */
export function stockStep(g: number, unit: string | null | undefined, units: FoodUnit[] | null, dir: 1 | -1): number {
  const u = unit && units ? findUnit(units, unit) : undefined
  return u ? nudgeCount(g, u, dir) : nudge(g, dir)
}

/** Grams on hand after a change, never below nothing and never past the cap,
 *  and how much really moved: 200 g asked of a 50 g bag takes 50 g. */
export function applyDelta(have: number, delta: number): { next: number; moved: number } {
  const next = clamp(have + delta)
  return { next, moved: tidy(next - have) }
}

/** Whether eating something touches the stock: a recipe (a ready meal is
 *  a recipe of one line) or one food with an amount. A meal typed as plain
 *  numbers has no food and changes nothing. For meals and for food logged
 *  outside a meal alike. */
export function takesStock(row: { recipe_id?: string | null; food_id?: string | null; grams?: number | string | null }): boolean {
  return !!row.recipe_id || (!!row.food_id && Number(row.grams) > 0)
}

/** What one planned meal uses, per food, in raw grams: the weight that was
 *  bought, which is the weight stock is kept in. Lines without a food (a
 *  pinch of salt typed as text) use nothing. */
export function mealNeeds(
  lines: RecipeLine[],
  foods: Map<string, Food>,
  portions: number,
): Map<string, number> {
  const needs = new Map<string, number>()
  const k = Number.isFinite(portions) && portions > 0 ? portions : 1
  for (const line of lines) {
    if (!line.food_id) continue
    const g = rawGrams(line, foods.get(line.food_id)) * k
    if (g > 0) needs.set(line.food_id, (needs.get(line.food_id) ?? 0) + g)
  }
  for (const [id, g] of needs) needs.set(id, tidy(g))
  return needs
}

/** Taking a meal's ingredients out of stock. Only foods that are in stock are
 *  touched; eating rice you never recorded does not create a row of "0 g
 *  rice". Returns the new amounts and what was really taken, which is what
 *  goes back if the meal is unticked. */
export function takeOut(
  needs: Map<string, number>,
  have: Map<string, number>,
): { next: Map<string, number>; taken: Record<string, number> } {
  const next = new Map<string, number>()
  const taken: Record<string, number> = {}
  for (const [id, g] of needs) {
    const on = have.get(id)
    if (on === undefined || on <= 0) continue
    const { next: left, moved } = applyDelta(on, -g)
    next.set(id, left)
    if (moved < 0) taken[id] = -moved
  }
  return { next, taken }
}

/** Putting back what a meal took. Again only foods with a row: a food removed
 *  from stock since is not brought back by unticking a meal. */
export function putBack(
  taken: Record<string, number>,
  have: Map<string, number>,
): Map<string, number> {
  const next = new Map<string, number>()
  for (const [id, g] of Object.entries(taken)) {
    const on = have.get(id)
    if (on === undefined || !(g > 0)) continue
    next.set(id, applyDelta(on, g).next)
  }
  return next
}

/** What a ticked trip line put in the basket: whole packs where the pack
 *  size is known (a 500 g bag is 500 g in the cupboard, however little the
 *  plan needed), else what the list said to buy. */
export function boughtGrams(line: {
  needed_g: number; from_stock_g: number; pack_size_g: number | null; packs: number | null
}): number {
  if (line.pack_size_g && line.pack_size_g > 0 && line.packs && line.packs > 0) return tidy(line.packs * line.pack_size_g)
  return tidy(Math.max(0, line.needed_g - line.from_stock_g))
}

export interface StockView {
  id: string
  food_id: string
  name: string
  section: string
  grams: number
  note: string | null
}

/** In the order of a walk round the shop: by aisle, then by name. Anything
 *  without an aisle goes last, under Other. */
export function sortStock<T extends Pick<StockView, 'section' | 'name'>>(rows: T[]): T[] {
  const rank = (s: string) => (s === 'Other' ? 1 : 0)
  return [...rows].sort((a, b) =>
    rank(a.section) - rank(b.section)
    || a.section.localeCompare(b.section)
    || a.name.localeCompare(b.name))
}

/** Every word typed must appear in the name, the aisle or the note. */
export function filterStock<T extends Pick<StockView, 'name' | 'section' | 'note'>>(rows: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return rows
  return rows.filter((r) => {
    const hay = `${r.name} ${r.section} ${r.note ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** A note as stored: trimmed, empty is none, cut to what the database takes. */
export function cleanNote(note: string | null | undefined): string | null {
  const t = (note ?? '').trim()
  return t ? t.slice(0, NOTE_MAX) : null
}

// ---- where it is kept, and until when (STK-03) -------------------------------------

/** The places offered first; the person can type their own ("Cellar"). */
export const DEFAULT_PLACES = ['Fridge', 'Freezer', 'Cupboard']
export const PLACE_MAX = 40

/** A place as stored: spaces tidied, a capital first, cut to fit; empty is none. */
export function cleanPlace(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim().slice(0, PLACE_MAX)
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null
}

/** The places to offer: the three usual ones, then any others already in
 *  use, A to Z, each once (case aside). */
export function placesFrom(used: (string | null | undefined)[]): string[] {
  const seen = new Set(DEFAULT_PLACES.map((p) => p.toLowerCase()))
  const own: string[] = []
  for (const u of used) {
    const p = cleanPlace(u)
    if (p && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); own.push(p) }
  }
  return [...DEFAULT_PLACES, ...own.sort((a, b) => a.localeCompare(b))]
}

const dayNum = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000)
/** Days from today to the date: 0 today, negative once it has passed. */
export const daysUntil = (date: string, today: string) => dayNum(date) - dayNum(today)

/** A best-before date in plain words: "use today", "2 days left",
 *  "until 14 Oct", "3 days past its date". */
export function dateText(date: string, today: string): string {
  const n = daysUntil(date, today)
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} past its date`
  if (n === 0) return 'use today'
  if (n === 1) return 'use by tomorrow'
  if (n <= 6) return `${n} days left`
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `until ${Number(date.slice(8, 10))} ${M[Number(date.slice(5, 7)) - 1]}`
}

/** "Use soon": what has a date within `days` days (or past it), soonest
 *  first. Items that are out are left out: there is nothing to use. */
export function expiringSoon<T extends { best_before?: string | null; grams: number; name: string }>(rows: T[], today: string, days = 3): T[] {
  return rows
    .filter((r) => r.best_before && r.grams > 0 && daysUntil(r.best_before, today) <= days)
    .sort((a, b) => a.best_before!.localeCompare(b.best_before!) || a.name.localeCompare(b.name))
}

/** A date someone typed the quick way, as Grocy allows: "1410" is 14 October
 *  (this year, or next if that has passed), "141026" or "14102026" a full
 *  date; a date already in 'yyyy-MM-dd' is kept. Null when it is not a day. */
export function readDate(text: string, today: string): string | null {
  const t = String(text ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return validDay(t)
  const digits = t.replace(/[\s./-]/g, '')
  if (!/^\d+$/.test(digits)) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  if (digits.length === 4) {
    const d = Number(digits.slice(0, 2))
    const m = Number(digits.slice(2, 4))
    let y = Number(today.slice(0, 4))
    let day = validDay(`${y}-${pad(m)}-${pad(d)}`)
    if (day && day < today) { y++; day = validDay(`${y}-${pad(m)}-${pad(d)}`) }
    return day
  }
  if (digits.length === 6) return validDay(`20${digits.slice(4, 6)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`)
  if (digits.length === 8) return validDay(`${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`)
  return null
}

function validDay(s: string): string | null {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100 ? s : null
}

// ---- the minimum kept (STK-04, SHOP-15) ---------------------------------------------

/** Is the cupboard below what the person wants kept of it? */
export const belowMin = (r: { grams: number; min_grams?: number | null }) =>
  !!r.min_grams && r.min_grams > 0 && r.grams < r.min_grams

/** A minimum as stored: grams above nothing and within the cap; empty or
 *  zero is no minimum. */
export function cleanMin(g: number | null | undefined): number | null {
  if (g === null || g === undefined || !Number.isFinite(g) || g <= 0) return null
  return Math.min(MAX_GRAMS, tidy(g))
}

/** Stock grouped for the list: by place ("Fridge", "Freezer", then the
 *  person's own, then "No place set") or by aisle. */
export function groupKey(r: { place?: string | null; section: string }, by: 'place' | 'aisle'): string {
  return by === 'place' ? (cleanPlace(r.place) ?? 'No place set') : r.section
}

/** The order of the groups: places in the offered order, "No place set"
 *  last; aisles as sortStock has them. */
export function sortByPlace<T extends { place?: string | null; section: string; name: string }>(rows: T[], places: string[]): T[] {
  const at = new Map(places.map((p, i) => [p.toLowerCase(), i]))
  const rank = (r: T) => {
    const p = cleanPlace(r.place)
    return p ? at.get(p.toLowerCase()) ?? places.length : places.length + 1
  }
  return [...rows].sort((a, b) => rank(a) - rank(b) || (cleanPlace(a.place) ?? '').localeCompare(cleanPlace(b.place) ?? '') || a.name.localeCompare(b.name))
}

// ---- cooking from what is here (STK-06) ---------------------------------------------

/** How much of a recipe the cupboard covers: the share of its foods (by
 *  weight needed for one batch) that are in stock in the amount needed.
 *  Lines with no food (salt typed as text) are not counted. */
export function stockCover(needs: Map<string, number>, have: Map<string, number>): { share: number; missing: string[] } {
  let total = 0
  let covered = 0
  const missing: string[] = []
  for (const [id, g] of needs) {
    if (!(g > 0)) continue
    total += g
    const on = have.get(id) ?? 0
    covered += Math.min(on, g)
    if (on < g) missing.push(id)
  }
  return { share: total > 0 ? Math.round((covered / total) * 100) / 100 : 0, missing }
}
