/** Recipe and food books, and what can be done with several rows at once,
 *  as rules with no database and no React, so every one is checked in plain
 *  Node (src/test/books.check.mjs).
 *
 *  A book is a named list of recipes or of foods ("Quick lunches", "Snacks").
 *  It only points at rows: deleting a book never deletes a recipe or a food,
 *  and a row that has since gone is simply skipped, then dropped from the
 *  book the next time the books are saved. */

import { SWATCHES } from './colours-rules.ts'
import { rawGrams } from './calc.ts'
import type { Food, Recipe, RecipeLine } from './types'

export type BookKind = 'recipe' | 'food'

export interface Book {
  id: string
  name: string
  kind: BookKind
  /** Ids of the recipes or foods in it, in the order they were added. */
  items: string[]
  /** One of the picker's swatches; none means the plain chip. */
  colour?: string
}

export const MAX_BOOKS = 50
export const MAX_ITEMS = 500
export const MAX_NAME = 60

const ID = /^[A-Za-z0-9_-]{1,64}$/
const SWATCH_HEXES = new Set(SWATCHES.map((s) => s.hex))

/** A name as it is kept: spaces tidied, at most 60 characters. */
export function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim() : ''
}

/** A colour is kept only if it is one of the swatches, lower-cased. */
export function cleanColour(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const hex = v.toLowerCase()
  return SWATCH_HEXES.has(hex) ? hex : undefined
}

/** Books as stored, checked strictly: anything that is not a whole, sane
 *  book is left out, repeated ids are dropped, and there are never more
 *  than 50 books or 500 rows in one. What another device or an old version
 *  wrote can never break the page. */
export function readBooks(v: unknown): Book[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: Book[] = []
  for (const raw of v) {
    if (out.length >= MAX_BOOKS) break
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    const id = typeof b.id === 'string' && ID.test(b.id) ? b.id : null
    const name = cleanName(b.name)
    const kind = b.kind === 'recipe' || b.kind === 'food' ? b.kind : null
    if (!id || !name || !kind || seen.has(id)) continue
    seen.add(id)
    const items = Array.isArray(b.items)
      ? [...new Set(b.items.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, MAX_ITEMS)
      : []
    const colour = cleanColour(b.colour)
    out.push(colour ? { id, name, kind, items, colour } : { id, name, kind, items })
  }
  return out
}

/** The books for one tab, in the order they were made. */
export function booksOf(books: Book[], kind: BookKind): Book[] {
  return books.filter((b) => b.kind === kind)
}

/** The rows a book holds, in the table's own order. No book means all rows.
 *  Ids whose row has gone are ignored. */
export function inBook<T extends { id: string }>(rows: T[], book: Book | null | undefined): T[] {
  if (!book) return rows
  const ids = new Set(book.items)
  return rows.filter((r) => ids.has(r.id))
}

/** How many rows a book holds that still exist. */
export function liveCount(book: Book, ids: Set<string>): number {
  return book.items.reduce((n, id) => n + (ids.has(id) ? 1 : 0), 0)
}

/** Books with the rows that no longer exist taken out. `live` gives the ids
 *  that still exist, per kind. A kind with no ids at all is left alone: on a
 *  new phone the catalogue may simply not have arrived yet, and a book
 *  emptied then could not be filled again. */
export function pruneBooks(books: Book[], live: Record<BookKind, Set<string>>): Book[] {
  return books.map((b) => {
    const ids = live[b.kind]
    if (!ids || ids.size === 0) return b
    const items = b.items.filter((id) => ids.has(id))
    return items.length === b.items.length ? b : { ...b, items }
  })
}

export type BookResult = { books: Book[]; error?: undefined } | { books?: undefined; error: string }

/** A new, empty book. `id` comes from the caller (a random one in the app). */
export function addBook(books: Book[], id: string, name: string, kind: BookKind, colour?: string): BookResult {
  const clean = cleanName(name)
  if (!clean) return { error: 'Give the book a name.' }
  if (books.length >= MAX_BOOKS) return { error: `There can be at most ${MAX_BOOKS} books.` }
  if (!ID.test(id) || books.some((b) => b.id === id)) return { error: 'That book could not be made.' }
  const c = cleanColour(colour)
  const book: Book = c ? { id, name: clean, kind, items: [], colour: c } : { id, name: clean, kind, items: [] }
  return { books: [...books, book] }
}

export function renameBook(books: Book[], id: string, name: string): BookResult {
  const clean = cleanName(name)
  if (!clean) return { error: 'Give the book a name.' }
  return { books: books.map((b) => (b.id === id ? { ...b, name: clean } : b)) }
}

/** A swatch colour, or none to go back to the plain chip. */
export function recolourBook(books: Book[], id: string, colour: string | null): Book[] {
  const c = cleanColour(colour)
  return books.map((b) => {
    if (b.id !== id) return b
    const { colour: _old, ...rest } = b
    return c ? { ...rest, colour: c } : rest
  })
}

/** Only the book goes; its recipes or foods stay where they are. */
export function deleteBook(books: Book[], id: string): Book[] {
  return books.filter((b) => b.id !== id)
}

/** Rows put in a book, after the ones already there. Rows it already holds
 *  are not added twice; past 500, the rest do not fit and are counted. */
export function addToBook(books: Book[], id: string, ids: string[]): { books: Book[]; added: number; already: number; full: number } {
  let added = 0, already = 0, full = 0
  const next = books.map((b) => {
    if (b.id !== id) return b
    const items = [...b.items]
    const have = new Set(items)
    for (const x of ids) {
      if (!ID.test(x)) continue
      if (have.has(x)) { already++; continue }
      if (items.length >= MAX_ITEMS) { full++; continue }
      items.push(x)
      have.add(x)
      added++
    }
    return { ...b, items }
  })
  return { books: next, added, already, full }
}

export function removeFromBook(books: Book[], id: string, ids: string[]): { books: Book[]; removed: number } {
  const drop = new Set(ids)
  let removed = 0
  const next = books.map((b) => {
    if (b.id !== id) return b
    const items = b.items.filter((x) => !drop.has(x))
    removed = b.items.length - items.length
    return { ...b, items }
  })
  return { books: next, removed }
}

/* ---------- several rows at once ------------------------------------------- */

/** Which of the chosen rows this person may delete (their own) and which are
 *  shared catalogue rows, read-only to everyone. */
export function splitOwned<T extends { owner_id: string | null }>(rows: T[], userId: string | null): { mine: T[]; shared: T[] } {
  const mine: T[] = []
  const shared: T[] = []
  for (const r of rows) (userId && r.owner_id === userId ? mine : shared).push(r)
  return { mine, shared }
}

/** "3 shared catalogue items can't be deleted", or nothing when there are none. */
export function sharedNote(count: number): string {
  if (count <= 0) return ''
  return `${count} shared catalogue ${count === 1 ? "item can't" : "items can't"} be deleted`
}

/** "1 recipe", "3 foods". */
export function countOf(n: number, kind: BookKind): string {
  return `${n} ${kind === 'recipe' ? (n === 1 ? 'recipe' : 'recipes') : (n === 1 ? 'food' : 'foods')}`
}

/** One ingredient on a combined list. `amount` is null for a line with no
 *  weight ("Salt, to taste"). */
export interface Ingredient {
  key: string
  name: string
  amount: number | null
  unit: string
}

/** A recipe's cooking note is left off the name when the amount is the raw
 *  weight: "Brown rice (cooked)" becomes "Brown rice". */
function uncooked(raw: string): string {
  const name = raw.replace(/\s*\((cooked|steamed|grilled|baked|boiled|roasted|drained|grilled or baked)[^)]*\)/i, '').trim()
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : raw
}

/** One recipe's lines as ingredients for one whole batch (a portion's grams
 *  times the portions a batch makes). Weights are raw, as a shop sells them,
 *  when the food says how much it grows in cooking; a cooked weight that
 *  cannot be turned back says so in its unit. The name is what the recipe
 *  calls it ("Peanut butter"), else the food's own name. */
export function recipeIngredients(recipe: Pick<Recipe, 'id' | 'portions_per_batch'>, lines: RecipeLine[], foods: Map<string, Food>): Ingredient[] {
  const batch = Number(recipe.portions_per_batch) > 0 ? Number(recipe.portions_per_batch) : 1
  return lines
    .filter((l) => l.recipe_id === recipe.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l): Ingredient | null => {
      const food = l.food_id ? foods.get(l.food_id) : undefined
      const said = (l.raw_text ?? '').trim()
      const cooked = l.state === 'cooked'
      const toRaw = cooked && !!food && (food.cook_yield ?? 0) > 0
      const name = said ? (toRaw ? uncooked(said) : said) : food?.name ?? ''
      if (!name) return null
      const grams = l.grams_per_portion == null ? null : rawGrams(l, food) * batch
      const unit = cooked && !toRaw ? 'g cooked' : 'g'
      const key = l.food_id ? `food:${l.food_id}` : `text:${name.toLowerCase()}`
      return { key, name, amount: grams, unit }
    })
    .filter((x): x is Ingredient => x !== null)
}

/** Ingredients from several recipes as one list: the same food in the same
 *  unit is added up, and each keeps the place and the name it had where it
 *  first appeared. */
export function combineIngredients(lists: Ingredient[][]): Ingredient[] {
  const out: Ingredient[] = []
  const at = new Map<string, number>()
  for (const list of lists) {
    for (const item of list) {
      const k = `${item.key}|${item.unit}`
      const i = at.get(k)
      if (i === undefined) {
        at.set(k, out.length)
        out.push({ ...item })
      } else if (item.amount !== null) {
        out[i] = { ...out[i], amount: (out[i].amount ?? 0) + item.amount }
      }
    }
  }
  return out
}

/** An amount rounded the way a person would write it: a tenth under 10
 *  (7.5 g of salt), whole numbers up to 1000, the nearest 10 above. */
export function roundAmount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n < 10) return Math.round(n * 10) / 10
  if (n < 1000) return Math.round(n)
  return Math.round(n / 10) * 10
}

/** The list as plain text, one ingredient a line: "Oats — 240 g". */
export function ingredientText(items: Ingredient[]): string {
  return items
    .map((i) => (i.amount === null || roundAmount(i.amount) === 0 ? i.name : `${i.name} — ${roundAmount(i.amount)} ${i.unit}`))
    .join('\n')
}

/** Names, one a line, as they are shown. */
export function namesText(rows: { name: string }[]): string {
  return rows.map((r) => r.name.trim()).filter(Boolean).join('\n')
}

/** Rows in the order the table shows them, cut to the ones chosen. */
export function chosen<T extends { id: string }>(rows: T[], ids: Set<string>): T[] {
  return rows.filter((r) => ids.has(r.id))
}

/** "Select all shown" ticks every row on screen; when they are all ticked
 *  already, it clears them instead. Rows ticked elsewhere are kept. */
export function toggleAll(selected: Set<string>, shown: { id: string }[]): Set<string> {
  const all = shown.length > 0 && shown.every((r) => selected.has(r.id))
  const next = new Set(selected)
  for (const r of shown) (all ? next.delete(r.id) : next.add(r.id))
  return next
}
