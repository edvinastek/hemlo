/** Who can see a recipe, as rules with no database or screen in them, so they
 *  can be checked on their own (src/test/sharing.check.mjs).
 *
 *  A recipe is private (only its owner sees it), proposed (waiting for the
 *  app's owner to look at it), public (approved: everyone signed in sees it)
 *  or rejected (looked at and not accepted; only its owner sees it, with the
 *  reviewer's note). The database enforces all of this (migration 019); the
 *  app follows the same rules so the screen is right before the server
 *  answers. */

import { findUnit, gramsOf, readQty, type FoodUnit } from './units-rules.ts'

export type Sharing ='private' | 'proposed' | 'public' | 'rejected'
/** What the person picks in the editor. */
export type Choice = 'private' | 'propose'

export const NOTE_MAX = 280

/** The shape these rules need; any recipe row fits it. Rows from before the
 *  sharing columns existed have none of them. */
export interface SharingRow {
  owner_id: string | null
  sharing?: Sharing | null
  review_note?: string | null
  deleted_at?: string | null
}

/** A row without the column is read as the database fills it in: the shared
 *  catalogue is public, anyone's own recipe private. */
export function readSharing(r: SharingRow): Sharing {
  const s = r.sharing
  if (s === 'private' || s === 'proposed' || s === 'public' || s === 'rejected') return s
  return r.owner_id ? 'private' : 'public'
}

export const CHOICES: { value: Choice; label: string; hint: string }[] = [
  { value: 'private', label: 'Only me', hint: 'No one else sees it.' },
  { value: 'propose', label: 'Propose to everyone',
    hint: 'The app’s owner looks at it first. Once approved, everyone using GetIt can find it. Your name is not shown with it.' },
]

/** The editor's choice for a recipe as it stands. Rejected reads as "Only
 *  me": it is private until proposed again. */
export function choiceOf(s: Sharing): Choice {
  return s === 'proposed' || s === 'public' ? 'propose' : 'private'
}

export interface Status {
  label: string
  /** For the chip's colour: waiting, done (shared) or warn (not accepted). */
  tone: 'plain' | 'waiting' | 'done' | 'warn'
  /** The reviewer's note, only on a recipe that was not accepted. */
  note: string | null
}

const LABELS: Record<Sharing, { label: string; tone: Status['tone'] }> = {
  private: { label: 'Private', tone: 'plain' },
  proposed: { label: 'Waiting for review', tone: 'waiting' },
  public: { label: 'Shared with everyone', tone: 'done' },
  rejected: { label: 'Not accepted', tone: 'warn' },
}

export function statusOf(r: SharingRow): Status {
  const s = readSharing(r)
  const note = s === 'rejected' ? cleanNote(r.review_note ?? '') : null
  return { ...LABELS[s], note }
}

/** What saving does to sharing. A changed choice is what the person asked
 *  for; an unchanged one keeps the recipe where it is, except that a change
 *  to an approved recipe sends it back for review, as the database does. */
export function nextSharing(current: Sharing, choice: Choice, contentChanged: boolean): Sharing {
  if (choice !== choiceOf(current)) return choice === 'propose' ? 'proposed' : 'private'
  if (current === 'public' && contentChanged) return 'proposed'
  return current
}

/** One line under the choice, saying what saving will do, or null when
 *  nothing about sharing changes. */
export function sharingEffect(current: Sharing, next: Sharing, isNew: boolean): string | null {
  if (next === current && !isNew) return null
  if (next === 'proposed') {
    return current === 'public'
      ? 'Saving changes an approved recipe, so it goes back for review and is hidden from others until approved again.'
      : 'Saving sends it for review. No one else sees it until it is approved.'
  }
  if (next === 'private' && (current === 'public' || current === 'proposed')) {
    return current === 'public'
      ? 'Saving takes it back: others no longer see it.'
      : 'Saving withdraws it from review.'
  }
  return null
}

/** A shared recipe uses foods from the shared list only: other people cannot
 *  see a food someone added for themselves. Names of the lines' foods that
 *  are someone's own, so the editor can say which to swap. */
export function personalFoods(
  lines: { food_id: string | null }[],
  foods: Map<string, { name: string; owner_id: string | null }>,
): string[] {
  const names: string[] = []
  for (const l of lines) {
    const f = l.food_id ? foods.get(l.food_id) : undefined
    if (f?.owner_id && !names.includes(f.name)) names.push(f.name)
  }
  return names
}

/** Whether a recipe belongs in this device's copy of the catalogue: the
 *  shared list, approved recipes and the person's own. A reviewer can read
 *  proposals from the server too, but those stay in the review queue and are
 *  never mixed into their recipes. */
export function keepInCatalogue(r: SharingRow, userId: string | null): boolean {
  if (!r.owner_id) return true
  if (userId && r.owner_id === userId) return true
  return readSharing(r) === 'public' && !r.deleted_at
}

/** Someone else's recipes this device holds that the server no longer
 *  shows: withdrawn, changed and waiting again, or not accepted. Only rows
 *  owned by someone else are ever dropped this way; the person's own and the
 *  shared list are never touched. */
export function staleForeign(local: ({ id: string } & SharingRow)[], kept: Set<string>, userId: string | null): string[] {
  if (!userId) return []
  return local.filter((r) => r.owner_id && r.owner_id !== userId && !kept.has(r.id)).map((r) => r.id)
}

/** A reviewer's note as it is saved: trimmed, at most 280 characters, and
 *  nothing when empty. */
export function cleanNote(text: string): string | null {
  const t = text.trim().slice(0, NOTE_MAX).trim()
  return t ? t : null
}

/** How the review queue names an author: their name as they set it, never
 *  an email address. */
export function authorLabel(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  return n && !n.includes('@') ? n : 'Someone'
}

/** Columns only the server writes. Left out of anything the app sends (a
 *  backup read back in, say), so a recipe keeps its place in review. */
export const SERVER_ONLY = ['sharing', 'proposed_at', 'reviewed_at', 'review_note'] as const

export function withoutReview<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row }
  for (const k of SERVER_ONLY) delete copy[k]
  return copy
}

// The recipe editor -----------------------------------------------------------

export interface LineDraft {
  /** Set for a line that is already saved. */
  id: string | null
  food_id: string | null
  /** The amount as typed, in the unit chosen: grams unless `unit` is set. */
  grams: string
  /** One of the food's units ("egg") the amount is typed in; none for grams. */
  unit?: string | null
  /** The line as saved in a unit. Typed the same again, it keeps its saved
   *  grams, even if the unit's weight has been changed since. */
  saved?: { unit: string; qty: number; grams: number } | null
}

export interface RecipeDraft {
  name: string
  role: string
  portions: string
  minutes: string
  steps: string
  lines: LineDraft[]
}

export interface RecipeValues {
  name: string
  role: string | null
  portions_per_batch: number
  cook_minutes: number | null
  steps: string | null
  /** unit and unit_qty only on a line typed in a unit. */
  lines: { id: string | null; food_id: string; grams_per_portion: number; unit?: string; unit_qty?: number }[]
}

const num = (s: string) => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** The grams one line comes to, or why it cannot be read. A line in a unit
 *  is how many × what one weighs, worked out now and saved with the line; a
 *  unit the food no longer has is read at the weight it was saved with. */
export function lineGrams(l: LineDraft, units: FoodUnit[]): { grams: number; unit?: string; unit_qty?: number } | { error: string } {
  if (!l.unit) {
    const g = num(l.grams)
    if (g === null || Number.isNaN(g) || g <= 0 || g > 10000) return { error: 'Each ingredient needs its grams per portion.' }
    return { grams: Math.round(g * 100) / 100 }
  }
  const qty = readQty(l.grams)
  const kept = l.saved && l.saved.unit.toLowerCase() === l.unit.toLowerCase() && l.saved.qty > 0
    ? { name: l.saved.unit, g: l.saved.grams / l.saved.qty } : null
  const unit = findUnit(units, l.unit) ?? kept
  if (!unit) return { error: `Choose grams or one of the food's units, not ${l.unit}.` }
  if (qty === null || qty <= 0) return { error: 'Each ingredient needs its amount per portion.' }
  // Typed as saved: the saved grams stand, whatever the unit weighs now.
  const grams = l.saved && kept && qty === l.saved.qty ? l.saved.grams : gramsOf(qty, unit)
  if (grams <= 0 || grams > 10000) return { error: 'One portion holds at most 10 kg of an ingredient.' }
  return { grams: Math.round(grams * 100) / 100, unit: unit.name, unit_qty: qty }
}

/** The form read as a recipe, or the first thing wrong with it. The limits
 *  are the database's: portions up to 999, grams up to 10 kg a portion.
 *  `unitsOf` gives a food's units, for lines typed in one. */
export function readRecipe(d: RecipeDraft, unitsOf: (foodId: string) => FoodUnit[] = () => []): { values: RecipeValues } | { error: string } {
  const name = d.name.trim()
  if (!name) return { error: 'Give it a name.' }
  if (name.length > 120) return { error: 'A name is at most 120 characters.' }
  const portions = num(d.portions) ?? 1
  if (Number.isNaN(portions) || portions <= 0 || portions > 999) return { error: 'Portions: a number above 0, up to 999.' }
  const minutes = num(d.minutes)
  if (minutes !== null && (Number.isNaN(minutes) || minutes < 0 || minutes > 10000)) return { error: 'Minutes: a whole number, or leave it empty.' }
  const lines: RecipeValues['lines'] = []
  for (const l of d.lines) {
    if (!l.food_id) continue
    const read = lineGrams(l, unitsOf(l.food_id))
    if ('error' in read) return { error: read.error }
    lines.push(read.unit
      ? { id: l.id, food_id: l.food_id, grams_per_portion: read.grams, unit: read.unit, unit_qty: read.unit_qty }
      : { id: l.id, food_id: l.food_id, grams_per_portion: read.grams })
  }
  if (lines.length === 0) return { error: 'Add at least one ingredient.' }
  const steps = d.steps.trim()
  return {
    values: {
      name, role: d.role || null, portions_per_batch: Math.round(portions * 100) / 100,
      cook_minutes: minutes === null ? null : Math.round(minutes), steps: steps || null, lines,
    },
  }
}

/** What saving changes: the recipe's own fields that differ, the lines to add
 *  or update, and the saved lines that were removed. contentChanged is what
 *  decides whether an approved recipe goes back for review. */
export function recipeChanges(
  before: { name: string; role: string | null; portions_per_batch: number; cook_minutes: number | null; steps: string | null } | null,
  beforeLines: { id: string; food_id: string | null; grams_per_portion: number | null; sort_order: number; unit?: string | null; unit_qty?: number | string | null }[],
  after: RecipeValues,
) {
  const fields: Partial<Pick<RecipeValues, 'name' | 'role' | 'portions_per_batch' | 'cook_minutes' | 'steps'>> = {}
  const keys = ['name', 'role', 'portions_per_batch', 'cook_minutes', 'steps'] as const
  for (const k of keys) {
    if (!before || before[k] !== after[k]) (fields as Record<string, unknown>)[k] = after[k]
  }
  const byId = new Map(beforeLines.map((l) => [l.id, l]))
  const upsert: (RecipeValues['lines'][number] & { sort_order: number })[] = []
  let linesChanged = false
  after.lines.forEach((l, i) => {
    const old = l.id ? byId.get(l.id) : undefined
    if (!old) { upsert.push({ ...l, sort_order: i }); linesChanged = true; return }
    const oldQty = old.unit_qty === null || old.unit_qty === undefined ? null : Number(old.unit_qty)
    const same = old.food_id === l.food_id && Number(old.grams_per_portion) === l.grams_per_portion
      && (old.unit ?? null) === (l.unit ?? null) && oldQty === (l.unit_qty ?? null)
    if (!same) linesChanged = true
    if (!same || old.sort_order !== i) upsert.push({ ...l, sort_order: i })
  })
  const keptIds = new Set(after.lines.map((l) => l.id).filter(Boolean))
  const removed = beforeLines.filter((l) => !keptIds.has(l.id)).map((l) => l.id)
  if (removed.length) linesChanged = true
  return { fields, upsert, removed, contentChanged: Object.keys(fields).length > 0 || linesChanged }
}

/** One portion's figures in a line: "520 kcal · 32 g protein · 60 g carbs ·
 *  12 g fat · 5 g fibre". */
export function macroLine(m: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }): string {
  const g = (n: number) => `${Math.round(n)} g`
  return [`${Math.round(m.kcal)} kcal`, `${g(m.protein_g)} protein`, `${g(m.carbs_g)} carbs`, `${g(m.fat_g)} fat`, `${g(m.fiber_g)} fibre`].join(' · ')
}
