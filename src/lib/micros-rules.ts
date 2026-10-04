/** Vitamins and minerals (FOOD-17, SUP-07), with no database and no React
 *  (checked in src/test/micros.check.mjs).
 *
 *  Which ones: the vitamins and minerals of Regulation (EU) No 1169/2011,
 *  Annex XIII part A, with their nutrient reference values (NRVs) and the
 *  units the annex gives them in. NEVO-online 2025/9.0 publishes 20 of the
 *  27 (not biotin, pantothenic acid, chloride, manganese, fluoride, chromium
 *  or molybdenum); the other seven can still come from a label typed in or a
 *  supplement.
 *
 *  Where they live: one `micros` object on a food, keyed by the short code
 *  below, per 100 g or 100 ml, in the annex's unit (which is also NEVO's
 *  unit for every one NEVO publishes, so NEVO's numbers go in unchanged). A
 *  key that is absent is unknown, never 0; a published 0 is kept.
 *
 *  They are shown only when the person picks them (Settings → Food →
 *  Vitamins and minerals), as a share of the NRV. */

export type MicroCode =
  | 'va' | 'vd' | 've' | 'vk' | 'vc' | 'b1' | 'b2' | 'b3' | 'b6' | 'b9' | 'b12' | 'b7' | 'b5'
  | 'k' | 'cl' | 'ca' | 'p' | 'mg' | 'fe' | 'zn' | 'cu' | 'mn' | 'f' | 'se' | 'cr' | 'mo' | 'i'

export interface Micro {
  code: MicroCode
  /** As a person says it: "Vitamin D", "Iron". */
  name: string
  unit: 'mg' | 'µg'
  /** Annex XIII part A. */
  nrv: number
  /** The NEVO column it is read from, or null when NEVO does not publish it. */
  nevo: string | null
  vitamin: boolean
}

/** In the annex's own order: vitamins, then minerals. NEVO's columns:
 *  vitamin A as retinol equivalents (RE, the basis the 800 µg NRV was set
 *  on), niacin as published niacin (NIA, what labels declare), folate as
 *  dietary folate equivalents (FOL). */
export const MICROS: Micro[] = [
  { code: 'va', name: 'Vitamin A', unit: 'µg', nrv: 800, nevo: 'VITA_RE', vitamin: true },
  { code: 'vd', name: 'Vitamin D', unit: 'µg', nrv: 5, nevo: 'VITD', vitamin: true },
  { code: 've', name: 'Vitamin E', unit: 'mg', nrv: 12, nevo: 'VITE', vitamin: true },
  { code: 'vk', name: 'Vitamin K', unit: 'µg', nrv: 75, nevo: 'VITK', vitamin: true },
  { code: 'vc', name: 'Vitamin C', unit: 'mg', nrv: 80, nevo: 'VITC', vitamin: true },
  { code: 'b1', name: 'Thiamin', unit: 'mg', nrv: 1.1, nevo: 'THIA', vitamin: true },
  { code: 'b2', name: 'Riboflavin', unit: 'mg', nrv: 1.4, nevo: 'RIBF', vitamin: true },
  { code: 'b3', name: 'Niacin', unit: 'mg', nrv: 16, nevo: 'NIA', vitamin: true },
  { code: 'b6', name: 'Vitamin B6', unit: 'mg', nrv: 1.4, nevo: 'VITB6', vitamin: true },
  { code: 'b9', name: 'Folate', unit: 'µg', nrv: 200, nevo: 'FOL', vitamin: true },
  { code: 'b12', name: 'Vitamin B12', unit: 'µg', nrv: 2.5, nevo: 'VITB12', vitamin: true },
  { code: 'b7', name: 'Biotin', unit: 'µg', nrv: 50, nevo: null, vitamin: true },
  { code: 'b5', name: 'Pantothenic acid', unit: 'mg', nrv: 6, nevo: null, vitamin: true },
  { code: 'k', name: 'Potassium', unit: 'mg', nrv: 2000, nevo: 'K', vitamin: false },
  { code: 'cl', name: 'Chloride', unit: 'mg', nrv: 800, nevo: null, vitamin: false },
  { code: 'ca', name: 'Calcium', unit: 'mg', nrv: 800, nevo: 'CA', vitamin: false },
  { code: 'p', name: 'Phosphorus', unit: 'mg', nrv: 700, nevo: 'P', vitamin: false },
  { code: 'mg', name: 'Magnesium', unit: 'mg', nrv: 375, nevo: 'MG', vitamin: false },
  { code: 'fe', name: 'Iron', unit: 'mg', nrv: 14, nevo: 'FE', vitamin: false },
  { code: 'zn', name: 'Zinc', unit: 'mg', nrv: 10, nevo: 'ZN', vitamin: false },
  { code: 'cu', name: 'Copper', unit: 'mg', nrv: 1, nevo: 'CU', vitamin: false },
  { code: 'mn', name: 'Manganese', unit: 'mg', nrv: 2, nevo: null, vitamin: false },
  { code: 'f', name: 'Fluoride', unit: 'mg', nrv: 3.5, nevo: null, vitamin: false },
  { code: 'se', name: 'Selenium', unit: 'µg', nrv: 55, nevo: 'SE', vitamin: false },
  { code: 'cr', name: 'Chromium', unit: 'µg', nrv: 40, nevo: null, vitamin: false },
  { code: 'mo', name: 'Molybdenum', unit: 'µg', nrv: 50, nevo: null, vitamin: false },
  { code: 'i', name: 'Iodine', unit: 'µg', nrv: 150, nevo: 'ID', vitamin: false },
]

export const MICRO_CODES = MICROS.map((m) => m.code)
const BY_CODE = new Map(MICROS.map((m) => [m.code, m]))
export const microInfo = (code: string): Micro | undefined => BY_CODE.get(code as MicroCode)
export const isMicroCode = (v: unknown): v is MicroCode => typeof v === 'string' && BY_CODE.has(v as MicroCode)

/** The highest amount kept per 100 g or a dose, in the nutrient's unit: far
 *  above any food (a vitamin D tablet is 25–100 µg; NEVO's highest copper is
 *  in the hundreds of mg per 100 g of a premix), so it only stops a typo. The
 *  database checks the same (migration 036). */
export const MICRO_MAX = 1_000_000

export type Micros = Partial<Record<MicroCode, number>>

const num = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(x) ? x : null
}

/** A stored micros object as figures: unknown codes and odd values are left
 *  out (unknown), a 0 is kept. */
export function readMicros(v: unknown): Micros {
  const out: Micros = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!isMicroCode(k)) continue
    const x = num(raw)
    if (x !== null && x >= 0 && x <= MICRO_MAX) out[k] = x
  }
  return out
}

/** One figure of a food per 100 g or 100 ml, or null when unknown. */
export function microOf(food: { micros?: unknown } | null | undefined, code: MicroCode): number | null {
  return readMicros(food?.micros)[code] ?? null
}

/** Share of the NRV as a whole percent (as on an EU label); null for none. */
export function nrvPercent(code: MicroCode, amount: number | null): number | null {
  const m = BY_CODE.get(code)
  if (!m || amount === null || !Number.isFinite(amount)) return null
  return Math.round((amount / m.nrv) * 100)
}

/** An amount in its unit, rounded the way a label rounds it: three
 *  significant figures, no trailing zeros ("0.12 mg", "450 mg", "2.5 µg"). */
export function microText(code: MicroCode, amount: number | null): string {
  const m = BY_CODE.get(code)
  if (!m) return ''
  if (amount === null) return '–'
  if (amount === 0) return `0 ${m.unit}`
  const r = Number(amount.toPrecision(3))
  return `${r >= 1000 ? Math.round(r).toLocaleString('en-GB') : String(r)} ${m.unit}`
}

// ---- the person's choice ------------------------------------------------------------

/** Which ones the person shows (kept in nutrition's module settings,
 *  'micros'): in the annex's order; none by default. */
export function readMicroChoice(v: unknown): MicroCode[] {
  const list = Array.isArray(v) ? v : []
  return MICRO_CODES.filter((c) => list.includes(c))
}

// ---- adding them up ---------------------------------------------------------------------

/** A sum and how many items did not give each figure, so a total can say
 *  "at least" rather than read an unknown as nothing. */
export interface MicroSum {
  total: Partial<Record<MicroCode, number>>
  missing: Partial<Record<MicroCode, number>>
}

export const emptySum = (): MicroSum => ({ total: {}, missing: {} })

/** Add `per100 × grams / 100` for each chosen code to a sum. */
export function addFood(sum: MicroSum, food: { micros?: unknown } | null | undefined, grams: number, codes: MicroCode[], times = 1): void {
  const per = readMicros(food?.micros)
  for (const c of codes) {
    const v = per[c]
    if (v === undefined) sum.missing[c] = (sum.missing[c] ?? 0) + 1
    else sum.total[c] = (sum.total[c] ?? 0) + (v * grams * times) / 100
  }
}

/** Add amounts that are already whole (a supplement's dose). */
export function addAmounts(sum: MicroSum, amounts: Micros, codes: MicroCode[], times = 1): void {
  for (const c of codes) {
    const v = amounts[c]
    if (v !== undefined) sum.total[c] = (sum.total[c] ?? 0) + v * times
  }
}

/** One recipe line as the sum needs it: the food and its raw grams for one
 *  portion (calc.ts rawGrams). */
export interface MicroPart { food: { micros?: unknown } | undefined; grams: number }

/** A recipe's figures for `portions`: a line whose food lacks a figure
 *  leaves it "at least". Lines without a food (plain text) are not counted,
 *  as for the macros. */
export function partsMicros(parts: MicroPart[], codes: MicroCode[], portions = 1): MicroSum {
  const sum = emptySum()
  for (const p of parts) {
    if (!p.food || !(p.grams > 0)) continue
    addFood(sum, p.food, p.grams, codes, portions)
  }
  return sum
}

/** Merge a recipe's sum (already for its portions) into the day's: any
 *  line that lacked a figure makes the day's figure "at least" once. */
export function addSum(into: MicroSum, from: MicroSum, codes: MicroCode[]): void {
  for (const c of codes) {
    if (from.total[c] !== undefined) into.total[c] = (into.total[c] ?? 0) + from.total[c]!
    if (from.missing[c]) into.missing[c] = (into.missing[c] ?? 0) + 1
  }
}

/** One item of the day: a food with grams, a recipe with portions, or a
 *  quick entry (which never gives a vitamin). Skipped items are not eaten. */
export interface MicroItem {
  food_id?: string | null
  recipe_id?: string | null
  grams?: number | string | null
  portion_multiplier?: number | string | null
  status?: string | null
  kcal?: number | string | null
}

/** A supplement ticked on the day, with what one dose gives (SUP-07). */
export interface MicroDose { amounts: Micros }

/** What the day comes to for the chosen codes: foods and recipes planned or
 *  eaten (skipped left out) and the supplements ticked. */
export function dayMicros(
  items: MicroItem[], foods: Map<string, { micros?: unknown }>, recipeParts: Map<string, MicroPart[]>,
  doses: MicroDose[], codes: MicroCode[],
): MicroSum {
  const sum = emptySum()
  if (!codes.length) return sum
  for (const i of items) {
    if (i.status === 'skipped') continue
    if (i.food_id) {
      const f = foods.get(i.food_id)
      if (!f) { for (const c of codes) sum.missing[c] = (sum.missing[c] ?? 0) + 1; continue }
      addFood(sum, f, num(i.grams) ?? 0, codes)
    } else if (i.recipe_id) {
      addSum(sum, partsMicros(recipeParts.get(i.recipe_id) ?? [], codes, num(i.portion_multiplier) || 1), codes)
    } else if (num(i.kcal) !== null) {
      // A quick entry is numbers typed in: its vitamins are unknown.
      for (const c of codes) sum.missing[c] = (sum.missing[c] ?? 0) + 1
    }
  }
  for (const d of doses) addAmounts(sum, d.amounts, codes)
  return sum
}

/** The day's line: "Vitamin D 40% · Iron at least 75%". A figure nothing
 *  gave is left out; nothing at all gives no line. */
export function microsLine(sum: MicroSum, codes: MicroCode[]): string | null {
  const parts: string[] = []
  for (const c of codes) {
    const t = sum.total[c]
    if (t === undefined) continue
    const pct = nrvPercent(c, t)
    if (pct === null) continue
    parts.push(`${BY_CODE.get(c)!.name} ${sum.missing[c] ? 'at least ' : ''}${pct}%`)
  }
  return parts.length ? parts.join(' · ') : null
}

// ---- typed in (a label, a supplement's dose) ---------------------------------------

/** A figure typed in: "25", "2,5", "0.12". Empty is unknown. */
export function readMicroText(text: string | undefined): number | null | 'bad' {
  const t = (text ?? '').trim().replace(',', '.')
  if (!t) return null
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return 'bad'
  const n = Number(t)
  return n > MICRO_MAX ? 'bad' : n
}

/** Typed figures, by code, read as a micros object (empty ones left out), or
 *  the first thing wrong. */
export function readMicroForm(texts: Partial<Record<MicroCode, string>>): { micros: Micros } | { error: string } {
  const micros: Micros = {}
  for (const m of MICROS) {
    const got = readMicroText(texts[m.code])
    if (got === 'bad') return { error: `${m.name}: a number in ${m.unit}, like 2.5, or leave it empty.` }
    if (got !== null) micros[m.code] = got
  }
  return { micros }
}

/** A micros object as form texts. */
export function microTexts(v: unknown): Partial<Record<MicroCode, string>> {
  return Object.fromEntries(Object.entries(readMicros(v)).map(([k, x]) => [k, String(x)]))
}

/** Same figures, whatever the order of keys: for "did it change". */
export function sameMicros(a: unknown, b: unknown): boolean {
  const x = readMicros(a)
  const y = readMicros(b)
  const keys = new Set([...Object.keys(x), ...Object.keys(y)])
  for (const k of keys) if (x[k as MicroCode] !== y[k as MicroCode]) return false
  return true
}

/** The stored form: null for none, so an empty object never travels. */
export const storedMicros = (m: Micros): Micros | null => (Object.keys(m).length ? m : null)

// ---- a supplement's nutrients (SUP-07) ---------------------------------------------------

/** What one dose gives, as kept on the supplement ('nutrients', migration
 *  036): the same codes and units. */
export const readDoseNutrients = readMicros

/** "Vitamin D 25 µg · Calcium 200 mg", for a supplement's summary. */
export function doseText(amounts: Micros): string {
  return MICROS.filter((m) => amounts[m.code] !== undefined).map((m) => `${m.name} ${microText(m.code, amounts[m.code]!)}`).join(' · ')
}

// ---- in the stats (additive measures) -------------------------------------------------------

/** The measure key of a vitamin or mineral among nutrition's figures:
 *  'm_vd'. Its value on a food row is read from the micros object. */
export const microMeasure = (code: MicroCode) => `m_${code}`
export const measureCode = (key: string): MicroCode | null => (key.startsWith('m_') && isMicroCode(key.slice(2)) ? key.slice(2) as MicroCode : null)

/** A food row with its micros laid out as flat figures ('m_vd': 2.1), so
 *  code that reads one figure by key (the stats) reads these the same way. */
export function withMicroFigures<T extends { micros?: unknown }>(food: T): T & Record<string, unknown> {
  const flat: Record<string, number> = {}
  for (const [k, v] of Object.entries(readMicros(food.micros))) flat[`m_${k}`] = v as number
  return { ...food, ...flat }
}
