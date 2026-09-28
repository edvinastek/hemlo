import { NUTRIENTS, type Nutrient, type ProfileSettings } from './settings.ts'
import { countFits, findUnit, formatCount, gramsLabel, type Amount, type FoodUnit } from './units-rules.ts'

/** Meals as plain numbers, and which numbers the food screens show. Pure: no
 *  database, no React, so every figure here is checked in quickfood.check.
 *
 *  A quick entry is "a sandwich, about 450 kcal": no recipe, no catalogue
 *  food, just what the person read off a packet or guessed. Only calories are
 *  required; any macro typed in is kept, any left empty stays unknown (null),
 *  never zero, so a missing fat figure is not read as a fat-free meal. */

export type MacroKey = Exclude<Nutrient, 'kcal'>
export const MACROS: MacroKey[] = ['protein_g', 'carbs_g', 'fat_g', 'fiber_g']

/** The ways a packet states its calories. "portion" is a size the person
 *  types in (a 30 g bar, a 250 ml glass counted as grams). */
export type Basis = 'total' | '100' | '50' | '30' | '25' | 'portion'
export const BASES: { value: Basis; label: string; grams: number | null }[] = [
  { value: 'total', label: 'Total eaten', grams: null },
  { value: '100', label: 'per 100 g', grams: 100 },
  { value: '50', label: 'per 50 g', grams: 50 },
  { value: '30', label: 'per 30 g', grams: 30 },
  { value: '25', label: 'per 25 g', grams: 25 },
  { value: 'portion', label: 'per portion of … g', grams: null },
]

/** What the form holds: text as typed, so "12,5" from a comma-decimal
 *  keyboard is read the same as "12.5". */
export interface QuickForm {
  label: string
  basis: Basis
  kcal: string
  /** The portion size, only for basis "portion". */
  portion_g: string
  /** How much was eaten, for every basis but "total". */
  grams: string
  protein_g: string
  carbs_g: string
  fat_g: string
  fiber_g: string
}

export const EMPTY_FORM: QuickForm = {
  label: '', basis: 'total', kcal: '', portion_g: '', grams: '',
  protein_g: '', carbs_g: '', fat_g: '', fiber_g: '',
}

/** What is stored on the slot and, once eaten, on the log: totals only.
 *  An entry worked out from a food typed in one of its units ("2 eggs")
 *  also keeps the unit and how many, beside the grams they came to. */
export interface QuickEntry {
  label: string | null
  kcal: number
  grams: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  unit?: string
  unit_qty?: number
}

/** A meal worked out from one food and how much of it: the food's figures
 *  per 100 g times the grams, stored as plain numbers like any quick entry.
 *  A macro the food does not list stays unknown. */
export function quickFromFood(
  food: { name: string } & Partial<Record<Nutrient, number | string | null>>,
  amount: Amount | null,
): { entry: QuickEntry } | { error: string } {
  const per = num(food.kcal as string | number | null)
  if (per == null) return { error: `${food.name} has no calories listed; type the numbers instead.` }
  if (!amount || amount.grams <= 0) return { error: 'Say how much was eaten.' }
  if (amount.grams > LIMITS.grams) return { error: `At most ${LIMITS.grams} g in one meal.` }
  const f = amount.grams / 100
  const kcal = Math.round(per * f)
  if (kcal > LIMITS.kcal) return { error: `That comes to ${kcal} kcal, more than one meal can hold.` }
  const macros = {} as Record<MacroKey, number | null>
  for (const k of MACROS) {
    const v = num(food[k] as string | number | null)
    macros[k] = v == null ? null : Math.min(LIMITS.macro, round1(v * f))
  }
  const entry: QuickEntry = {
    label: food.name.trim().replace(/\s+/g, ' ').slice(0, LIMITS.label) || null,
    kcal, grams: round1(amount.grams), ...macros,
  }
  if (amount.unit && amount.unit_qty != null) { entry.unit = amount.unit; entry.unit_qty = amount.unit_qty }
  return { entry }
}

/** The database refuses anything outside these (migration 015). */
export const LIMITS = { kcal: 20000, grams: 20000, macro: 2000, label: 120 } as const

/** A number as typed, or null when empty or not a number. */
export function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** The grams the stated figures refer to, or null for "total". */
export function basisGrams(form: Pick<QuickForm, 'basis' | 'portion_g'>): number | null {
  if (form.basis === 'total') return null
  if (form.basis === 'portion') return num(form.portion_g)
  return Number(form.basis)
}

/** The multiplier from the stated figures to what was eaten: 1 for a total,
 *  grams eaten over the basis otherwise. Null while the grams are missing. */
export function factor(form: Pick<QuickForm, 'basis' | 'portion_g' | 'grams'>): number | null {
  if (form.basis === 'total') return 1
  const per = basisGrams(form)
  const eaten = num(form.grams)
  if (per == null || per <= 0 || eaten == null || eaten < 0) return null
  return eaten / per
}

/** The form read into totals, or the one thing that stops it saving. */
export function readQuick(form: QuickForm): { entry: QuickEntry } | { error: string } {
  const kcal = num(form.kcal)
  if (kcal == null) return { error: 'Calories are needed.' }
  if (kcal < 0) return { error: 'Calories cannot be negative.' }
  if (form.basis === 'portion') {
    const p = num(form.portion_g)
    if (p == null || p <= 0) return { error: 'Say how many grams one portion is.' }
  }
  // With a total the grams are optional, kept only if given.
  const grams = num(form.grams)
  if (form.basis !== 'total' && (grams == null || grams <= 0)) return { error: 'Say how many grams were eaten.' }
  if (grams != null && (grams < 0 || grams > LIMITS.grams)) return { error: `Grams must be between 0 and ${LIMITS.grams}.` }
  const f = factor(form)!

  const total = Math.round(kcal * f)
  if (total > LIMITS.kcal) return { error: `That comes to ${total} kcal, more than one meal can hold.` }

  const macros = {} as Record<MacroKey, number | null>
  for (const k of MACROS) {
    const v = num(form[k])
    if (v != null && v < 0) return { error: 'Macros cannot be negative.' }
    const t = v == null ? null : round1(v * f)
    if (t != null && t > LIMITS.macro) return { error: `That is more than ${LIMITS.macro} g in one meal.` }
    macros[k] = t
  }
  const label = form.label.trim().replace(/\s+/g, ' ').slice(0, LIMITS.label) || null
  return { entry: { label, kcal: total, grams: grams != null ? round1(grams) : null, ...macros } }
}

/** A stored entry back into the form, as totals: the basis it was typed in
 *  is not kept, only what it came to. */
export function formFrom(row: Partial<Record<keyof QuickEntry, unknown>>): QuickForm {
  const s = (v: unknown) => (v == null || v === '' ? '' : String(v))
  return {
    ...EMPTY_FORM,
    label: s(row.label), kcal: s(row.kcal), grams: s(row.grams),
    protein_g: s(row.protein_g), carbs_g: s(row.carbs_g), fat_g: s(row.fat_g), fiber_g: s(row.fiber_g),
  }
}

/** A slot or a log that carries its own numbers rather than a recipe. */
export function isQuick(row: { recipe_id?: string | null; food_id?: string | null; kcal?: number | string | null }): boolean {
  return !row.recipe_id && !row.food_id && row.kcal != null && row.kcal !== ''
}

/** The five figures of a quick row, unknown macros as zero for adding up. */
export function quickMacros(row: Partial<Record<Nutrient, number | string | null>>): Record<Nutrient, number> {
  const n = (v: unknown) => num(v as string | number | null) ?? 0
  return { kcal: n(row.kcal), protein_g: n(row.protein_g), carbs_g: n(row.carbs_g), fat_g: n(row.fat_g), fiber_g: n(row.fiber_g) }
}

/** How much of it, when it was counted in a unit: "2 eggs". Null otherwise,
 *  and null when the count no longer agrees with the grams saved beside it
 *  (an older version changed the grams): the grams are shown then. `units`
 *  are the food's the entry was worked out from, when it is known (a quick
 *  entry keeps the food's name as its label); without them the count stands. */
export function quickCount(row: { unit?: string | null; unit_qty?: number | string | null; grams?: number | string | null }, units: FoodUnit[] = []): string | null {
  const qty = row.unit_qty == null || row.unit_qty === '' ? NaN : Number(row.unit_qty)
  if (!row.unit || !Number.isFinite(qty)) return null
  const u = findUnit(units, row.unit)
  if (!countFits(qty, u?.g, row.grams)) return null
  return formatCount(qty, u ?? { name: row.unit })
}

/** The meal's task title: "Lunch: sandwich · 450 kcal", or "Lunch · 450 kcal"
 *  when it has no name; "Breakfast: Eggs, 2 eggs · 143 kcal" when counted. */
export function quickTitle(slotLabel: string, row: { label?: string | null; kcal?: number | string | null; unit?: string | null; unit_qty?: number | string | null; grams?: number | string | null }, units: FoodUnit[] = []): string {
  const kcal = Math.round(num(row.kcal as string | number | null) ?? 0)
  const count = quickCount(row, units)
  const label = [row.label?.trim(), count].filter(Boolean).join(', ')
  return label ? `${slotLabel}: ${label} · ${kcal} kcal` : `${slotLabel} · ${kcal} kcal`
}

/** "2 eggs (100 g)" for a counted entry, "180 g" with grams only, or null. */
export function quickAmount(row: { grams?: number | string | null; unit?: string | null; unit_qty?: number | string | null }, units: FoodUnit[] = []): string | null {
  const g = num(row.grams as string | number | null)
  const count = quickCount(row, units)
  if (count) return g ? `${count} (${gramsLabel(g)})` : count
  return g ? gramsLabel(g) : null
}

/* ---------- what the food screens show ------------------------------------- */

/** Calories always, then the tracked nutrients in the app's order. */
export function shownNutrients(settings: Pick<ProfileSettings, 'nutrients'>): Nutrient[] {
  return ['kcal', ...NUTRIENTS.map((n) => n.key).filter((k) => k !== 'kcal' && settings.nutrients.includes(k))]
}

export function nutrientLabel(key: Nutrient): string {
  return NUTRIENTS.find((n) => n.key === key)?.label ?? key
}

/** "450 kcal · 30 g protein · 6 g fibre": one amount per shown nutrient. */
export function amountLine(m: Partial<Record<Nutrient, number>>, keys: Nutrient[]): string {
  return keys.map((k) => k === 'kcal'
    ? `${Math.round(m.kcal ?? 0)} kcal`
    : `${Math.round(m[k] ?? 0)} g ${nutrientLabel(k).toLowerCase()}`).join(' · ')
}

/** Today's one figure: "1200 / 2600 kcal", "Protein 40 / 150 g", or without
 *  a target just what was eaten. Null when nothing is to be shown. */
export function metricLine(
  metric: Nutrient | 'none',
  eaten: Partial<Record<Nutrient, number>>,
  target: Partial<Record<Nutrient, number | null>> | null,
): { text: string; share: number | null } | null {
  if (metric === 'none') return null
  const have = Math.round(eaten[metric] ?? 0)
  const goal = target ? Math.round(Number(target[metric] ?? 0)) : 0
  const unit = metric === 'kcal' ? 'kcal' : 'g'
  const amount = goal > 0 ? `${have} / ${goal} ${unit}` : `${have} ${unit}`
  return {
    text: metric === 'kcal' ? amount : `${nutrientLabel(metric)} ${amount}`,
    share: goal > 0 ? Math.min(1, Math.max(0, have / goal)) : null,
  }
}
