/** Pure rules for the household's stock: reading an amount someone typed,
 *  showing one, the −/+ steps, and what a meal or a shopping trip does to the
 *  cupboard. No database and no React, so every rule is checked by hand in
 *  src/test/stock.check.mjs. Amounts are grams throughout; kilograms exist
 *  only at the edges, where a person types or reads them. */

import { rawGrams } from './calc.ts'
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

/** Grams on hand after a change, never below nothing and never past the cap,
 *  and how much really moved: 200 g asked of a 50 g bag takes 50 g. */
export function applyDelta(have: number, delta: number): { next: number; moved: number } {
  const next = clamp(have + delta)
  return { next, moved: tidy(next - have) }
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
