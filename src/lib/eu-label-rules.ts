/** A food's figures the way an EU label gives them (Regulation (EU) No
 *  1169/2011), and where the figures came from. Pure: no database and no
 *  React, so every rule is checked in plain Node (src/test/eulabel.check.mjs).
 *
 *  Every figure is per 100 g, or per 100 ml for a drink. An empty figure is
 *  unknown and stays empty: it is never shown or added up as 0. */

export type LabelKey =
  | 'kj' | 'kcal' | 'fat_g' | 'sat_fat_g' | 'mufa_g' | 'pufa_g' | 'carbs_g' | 'sugars_g' | 'polyols_g' | 'starch_g'
  | 'fiber_g' | 'protein_g' | 'salt_g' | 'alcohol_g'

export interface LabelRow {
  key: LabelKey
  label: string
  unit: 'kJ' | 'kcal' | 'g'
  /** "of which": drawn indented under the line before. */
  sub?: boolean
  /** Part of the declaration every label must give (Article 30). */
  required?: boolean
}

/** The declaration in the order a label lists it (Annex XV), with alcohol
 *  after it (not on the label, but it counts towards energy). */
export const LABEL: LabelRow[] = [
  { key: 'kj', label: 'Energy', unit: 'kJ', required: true },
  { key: 'kcal', label: 'Energy', unit: 'kcal', required: true },
  { key: 'fat_g', label: 'Fat', unit: 'g', required: true },
  { key: 'sat_fat_g', label: 'of which saturates', unit: 'g', sub: true, required: true },
  { key: 'mufa_g', label: 'of which mono-unsaturates', unit: 'g', sub: true },
  { key: 'pufa_g', label: 'of which polyunsaturates', unit: 'g', sub: true },
  { key: 'carbs_g', label: 'Carbohydrate', unit: 'g', required: true },
  { key: 'sugars_g', label: 'of which sugars', unit: 'g', sub: true, required: true },
  { key: 'polyols_g', label: 'of which polyols', unit: 'g', sub: true },
  { key: 'starch_g', label: 'of which starch', unit: 'g', sub: true },
  { key: 'fiber_g', label: 'Fibre', unit: 'g' },
  { key: 'protein_g', label: 'Protein', unit: 'g', required: true },
  { key: 'salt_g', label: 'Salt', unit: 'g', required: true },
  { key: 'alcohol_g', label: 'Alcohol', unit: 'g' },
]

/** The figures a person can choose to see beyond calories (FOOD-16): every
 *  line of the label, in its order. kJ goes with calories. */
export const EXTRA_FIGURES: { key: Exclude<LabelKey, 'kj' | 'kcal'>; label: string }[] = [
  { key: 'fat_g', label: 'Fat' }, { key: 'sat_fat_g', label: 'Saturates' }, { key: 'mufa_g', label: 'Mono-unsaturates' },
  { key: 'pufa_g', label: 'Polyunsaturates' }, { key: 'carbs_g', label: 'Carbohydrate' }, { key: 'sugars_g', label: 'Sugars' },
  { key: 'polyols_g', label: 'Polyols' }, { key: 'starch_g', label: 'Starch' }, { key: 'fiber_g', label: 'Fibre' },
  { key: 'protein_g', label: 'Protein' }, { key: 'salt_g', label: 'Salt' }, { key: 'alcohol_g', label: 'Alcohol' },
]

/** Reference intakes of an average adult (Annex XIII, Part B). */
export const RI: Partial<Record<LabelKey, number>> = {
  kj: 8400, kcal: 2000, fat_g: 70, sat_fat_g: 20, carbs_g: 260, sugars_g: 90, protein_g: 50, salt_g: 6,
}

/** Energy per gram (Annex XIV): kJ and kcal. */
export const FACTORS = {
  carbohydrate: { kj: 17, kcal: 4 },
  polyols: { kj: 10, kcal: 2.4 },
  protein: { kj: 17, kcal: 4 },
  fat: { kj: 37, kcal: 9 },
  alcohol: { kj: 29, kcal: 7 },
  fibre: { kj: 8, kcal: 2 },
  organicAcid: { kj: 13, kcal: 3 },
} as const

/** A figure as stored: a number, or a numeric column's text, or nothing. */
type Num = number | string | null | undefined
const num = (v: Num): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const round = (n: number, places = 0) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

export interface Macros {
  carbs_g?: Num
  polyols_g?: Num
  protein_g?: Num
  fat_g?: Num
  fiber_g?: Num
  alcohol_g?: Num
  /** Organic acids, when known (NEVO's OA); not a label figure. */
  organic_acid_g?: Num
}

/** Energy worked out from the macros with the Annex XIV factors. On the EU
 *  basis carbohydrate includes polyols, which count at their own factor.
 *  Protein, fat and carbohydrate must be known; fibre, polyols, alcohol and
 *  organic acids count when they are. Null when it cannot be worked out. */
export function energyFrom(m: Macros): { kcal: number; kj: number } | null {
  const carbs = num(m.carbs_g)
  const protein = num(m.protein_g)
  const fat = num(m.fat_g)
  if (carbs === null || protein === null || fat === null) return null
  const polyols = Math.min(carbs, num(m.polyols_g) ?? 0)
  const parts: [number, { kj: number; kcal: number }][] = [
    [carbs - polyols, FACTORS.carbohydrate], [polyols, FACTORS.polyols], [protein, FACTORS.protein], [fat, FACTORS.fat],
    [num(m.fiber_g) ?? 0, FACTORS.fibre], [num(m.alcohol_g) ?? 0, FACTORS.alcohol], [num(m.organic_acid_g) ?? 0, FACTORS.organicAcid],
  ]
  let kj = 0
  let kcal = 0
  for (const [g, f] of parts) { kj += g * f.kj; kcal += g * f.kcal }
  return { kj: round(kj), kcal: round(kcal) }
}

/** How far the stated energy is from the macros, for the review (FOOD-04):
 *  flagged when the two differ by more than 15% of the stated figure. Small
 *  foods (under 20 kcal) are judged by 4 kcal instead, since a gram of
 *  rounding on a cucumber is already 15%. Null when either is unknown. */
export const ENERGY_TOLERANCE = 0.15
export function energyCheck(f: Macros & { kcal?: Num }): { stated: number; worked: number; share: number; flagged: boolean } | null {
  const stated = num(f.kcal)
  const worked = energyFrom(f)
  if (stated === null || !worked) return null
  const diff = Math.abs(stated - worked.kcal)
  const share = stated > 0 ? diff / stated : worked.kcal > 0 ? 1 : 0
  const flagged = stated < 20 ? diff > 4 : share > ENERGY_TOLERANCE
  return { stated, worked: worked.kcal, share: round(share, 3), flagged }
}

/** kJ from kcal and back (1 kcal = 4.184 kJ), for a label that gives only one. */
export const kjFromKcal = (kcal: number) => round(kcal * 4.184)
export const kcalFromKj = (kj: number) => round(kj / 4.184)

/** Salt in grams: as stored, or worked out from the sodium a source gives
 *  (NEVO publishes sodium in mg): salt = sodium × 2.5 (Annex I). */
export function saltOf(f: { salt_g?: Num; sodium_mg?: Num }): number | null {
  const salt = num(f.salt_g)
  if (salt !== null) return salt
  const na = num(f.sodium_mg)
  return na === null ? null : (na * 2.5) / 1000
}

/** Sodium in grams, when it is shown: salt ÷ 2.5 (FOOD-05), or as published. */
export function sodiumOf(f: { salt_g?: Num; sodium_mg?: Num }): number | null {
  const na = num(f.sodium_mg)
  if (na !== null) return na / 1000
  const salt = num(f.salt_g)
  return salt === null ? null : salt / 2.5
}

/** One figure of a food, read for showing: salt worked out when needed. */
export function figureOf(f: Record<string, unknown>, key: LabelKey): number | null {
  if (key === 'salt_g') return saltOf(f as { salt_g?: Num; sodium_mg?: Num })
  return num(f[key] as Num)
}

/** Share of the reference intake, as a whole percent; null without one. */
export function riPercent(key: LabelKey, value: number | null): number | null {
  const ri = RI[key]
  if (!ri || value === null) return null
  return round((value / ri) * 100)
}

/** A figure as a label prints it: whole kJ and kcal; grams to one decimal
 *  (two under 1 g, so 0.03 g of salt is not shown as 0); salt to two. */
export function figureText(value: number | null, unit: 'kJ' | 'kcal' | 'g', key?: LabelKey): string {
  if (value === null) return '–'
  if (unit !== 'g') return `${round(value)} ${unit}`
  const places = key === 'salt_g' || value < 1 ? 2 : 1
  const v = round(value, places)
  return `${v === 0 && value > 0 ? `<${1 / 10 ** places}` : v} g`
}

// ---- where the figures came from (FOOD-13) -------------------------------------------

export const NEVO_ATTRIBUTION = 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven'
export const NEVO_AND_OTHERS = 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven and other data sources'
export const PORTIE_ATTRIBUTION = 'Unit weights from Portie-online versie 2026/2.0, RIVM, Bilthoven'

export interface Sourced {
  source?: string | null
  source_version?: string | null
  owner_id?: string | null
  nevo_code?: number | null
  source_ref?: string | null
}

export type SourceKind = 'nevo' | 'usda' | 'off' | 'import' | 'own' | 'catalogue'

/** What kind of source a food is from. A person's own food is theirs,
 *  whatever it was copied from. */
export function sourceKind(f: Sourced): SourceKind {
  if (f.source === 'nevo' && !f.owner_id) return 'nevo'
  if (f.source === 'usda') return 'usda'
  if (f.source === 'off') return 'off'
  if (f.source === 'import') return 'import'
  if (f.owner_id) return 'own'
  return 'catalogue'
}

/** The source in a few words, with its version: "NEVO-online 2025/9.0
 *  (RIVM), code 63". */
export function sourceText(f: Sourced): string {
  switch (sourceKind(f)) {
    case 'nevo': return `${f.source_version || 'NEVO-online 2025/9.0'} (RIVM)${f.nevo_code ? `, code ${f.nevo_code}` : ''}`
    case 'usda': return 'USDA (US list from GetIt’s first catalogue)'
    case 'off': return `Open Food Facts${f.source_ref ? `, product ${f.source_ref}` : ''}`
    case 'import': return 'Imported from your workbook'
    case 'own': return copiedFromNevo(f) ? 'Your own copy of a NEVO food' : 'Your own food'
    default: return 'GetIt’s shared list'
  }
}

/** A person's copy of a NEVO food remembers the code it was copied from. */
export const copiedFromNevo = (f: Sourced) => !!f.owner_id && /^nevo:\d+$/.test(f.source_ref ?? '')

/** The line every output of NEVO figures must carry: on its own when all
 *  figures are NEVO's, "… and other data sources" when others are mixed in;
 *  nothing when no NEVO food is involved. */
export function attributionFor(foods: Sourced[]): string | null {
  const kinds = foods.map(sourceKind)
  const nevo = kinds.filter((k) => k === 'nevo').length + foods.filter(copiedFromNevo).length
  if (nevo === 0) return null
  return nevo === foods.length ? NEVO_ATTRIBUTION : NEVO_AND_OTHERS
}

// ---- a food typed in by hand (FOOD-01, FOOD-02) ------------------------------------------

export const STATES = ['raw', 'cooked', 'canned', 'dried', 'frozen'] as const
export type FoodState = typeof STATES[number]

export interface FoodDraft {
  name: string
  brand: string
  per: 'g' | 'ml'
  state: FoodState
  /** Figures as typed, per 100 g or 100 ml. */
  figures: Partial<Record<LabelKey, string>>
  cook_yield: string
  pack_size_g: string
  store_section: string
  /** Shops, one per comma. */
  stores: string
  density: string
}

export interface FoodValues {
  name: string
  brand: string | null
  per_ml: boolean
  state: FoodState
  kj: number | null
  kcal: number | null
  fat_g: number | null
  sat_fat_g: number | null
  mufa_g: number | null
  pufa_g: number | null
  carbs_g: number | null
  sugars_g: number | null
  polyols_g: number | null
  starch_g: number | null
  fiber_g: number | null
  protein_g: number | null
  salt_g: number | null
  alcohol_g: number | null
  carb_basis: 'eu'
  cook_yield: number | null
  pack_size_g: number | null
  store_section: string | null
  stores: string[] | null
  density: number | null
}

/** A number as typed: a comma is a decimal point; empty is unknown. */
export function readFigure(text: string | undefined): number | null | 'bad' {
  const t = (text ?? '').trim().replace(',', '.')
  if (!t) return null
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return 'bad'
  return Number(t)
}

const GRAM_KEYS: LabelKey[] = ['fat_g', 'sat_fat_g', 'mufa_g', 'pufa_g', 'carbs_g', 'sugars_g', 'polyols_g', 'starch_g', 'fiber_g', 'protein_g', 'salt_g', 'alcohol_g']
const NAMES: Record<LabelKey, string> = Object.fromEntries(LABEL.map((r) => [r.key, r.key === 'kj' ? 'Energy in kJ' : r.key === 'kcal' ? 'Energy in kcal' : r.label.replace(/^of which /, '')])) as Record<LabelKey, string>

/** The form read as a food, or the first thing wrong with it, and what the
 *  person should know (energy worked out, energy that does not fit). Limits
 *  are the database's (migrations 003, 026, 027). */
export function readFoodForm(d: FoodDraft): { values: FoodValues; notes: string[] } | { error: string } {
  const name = d.name.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Give the food a name.' }
  if (name.length > 120) return { error: 'A name is at most 120 characters.' }
  const brand = d.brand.replace(/\s+/g, ' ').trim()
  if (brand.length > 120) return { error: 'A brand is at most 120 characters.' }
  const per = d.per === 'ml' ? '100 ml' : '100 g'

  const v: Partial<Record<LabelKey, number | null>> = {}
  for (const row of LABEL) {
    const got = readFigure(d.figures[row.key])
    if (got === 'bad') return { error: `${NAMES[row.key]}: a number, like 12.5, or leave it empty.` }
    v[row.key] = got
  }
  for (const k of GRAM_KEYS) {
    const x = v[k]
    if (x != null && x > 100) return { error: `${NAMES[k]} cannot be more than 100 g in ${per}.` }
  }
  if (v.kcal != null && v.kcal > 900) return { error: `Energy cannot be more than 900 kcal in ${per}.` }
  if (v.kj != null && v.kj > 3800) return { error: `Energy cannot be more than 3,800 kJ in ${per}.` }
  const part = (k: LabelKey, of: LabelKey) => v[k] != null && v[of] != null && v[k]! > v[of]! + 0.05
  if (part('sat_fat_g', 'fat_g') || part('mufa_g', 'fat_g') || part('pufa_g', 'fat_g')) return { error: 'Saturates and the other fats are part of fat: none can be more than fat.' }
  const fats = (v.sat_fat_g ?? 0) + (v.mufa_g ?? 0) + (v.pufa_g ?? 0)
  if (v.fat_g != null && fats > v.fat_g + 0.5) return { error: 'Saturates, mono- and polyunsaturates together are more than the fat.' }
  if (part('sugars_g', 'carbs_g') || part('polyols_g', 'carbs_g') || part('starch_g', 'carbs_g')) return { error: 'Sugars, polyols and starch are part of carbohydrate: none can be more than it.' }
  const solids = (v.fat_g ?? 0) + (v.carbs_g ?? 0) + (v.fiber_g ?? 0) + (v.protein_g ?? 0) + (v.salt_g ?? 0) + (v.alcohol_g ?? 0)
  if (solids > 100.5) return { error: `Fat, carbohydrate, fibre, protein, salt and alcohol add up to more than ${per}.` }

  const notes: string[] = []
  // Energy: both units kept (FOOD-02). One given, the other follows; none
  // given, it is worked out from the macros with the EU factors (FOOD-04).
  if (v.kcal == null && v.kj != null) v.kcal = kcalFromKj(v.kj)
  if (v.kj == null && v.kcal != null) v.kj = kjFromKcal(v.kcal)
  if (v.kcal == null) {
    const e = energyFrom(v)
    if (e) {
      v.kcal = e.kcal
      v.kj = e.kj
      notes.push(`Energy worked out from the macros with the EU factors: ${e.kcal} kcal, ${e.kj} kJ.`)
    } else return { error: 'Give the energy, or fat, carbohydrate and protein so it can be worked out.' }
  } else {
    const c = energyCheck(v)
    if (c?.flagged) notes.push(`The macros come to ${c.worked} kcal, not ${c.stated}: check the label.`)
  }

  const yieldV = readFigure(d.cook_yield)
  if (yieldV === 'bad' || (yieldV !== null && (yieldV < 0.1 || yieldV > 9.99))) return { error: 'Cook yield: cooked weight ÷ raw weight, from 0.1 to 9.99, or empty.' }
  const pack = readFigure(d.pack_size_g)
  if (pack === 'bad' || (pack !== null && (pack <= 0 || pack > 100000))) return { error: 'Pack size: grams, more than 0, or empty.' }
  const density = readFigure(d.density)
  if (density === 'bad' || (density !== null && (density < 0.2 || density > 3))) return { error: 'Density: grams per ml, from 0.2 to 3, or empty.' }
  const section = d.store_section.replace(/\s+/g, ' ').trim()
  if (section.length > 40) return { error: 'An aisle is at most 40 characters.' }
  const stores = [...new Set(d.stores.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  if (stores.length > 20) return { error: 'At most 20 shops.' }
  if (stores.some((s) => s.length > 60)) return { error: 'A shop’s name is at most 60 characters.' }

  return {
    values: {
      name, brand: brand || null, per_ml: d.per === 'ml', state: d.state,
      kj: v.kj ?? null, kcal: v.kcal ?? null, fat_g: v.fat_g ?? null, sat_fat_g: v.sat_fat_g ?? null,
      mufa_g: v.mufa_g ?? null, pufa_g: v.pufa_g ?? null, carbs_g: v.carbs_g ?? null, sugars_g: v.sugars_g ?? null,
      polyols_g: v.polyols_g ?? null, starch_g: v.starch_g ?? null, fiber_g: v.fiber_g ?? null,
      protein_g: v.protein_g ?? null, salt_g: v.salt_g ?? null, alcohol_g: v.alcohol_g ?? null, carb_basis: 'eu',
      cook_yield: yieldV, pack_size_g: pack, store_section: section || null, stores: stores.length ? stores : null,
      density,
    },
    notes,
  }
}

/** A form filled from a food, for editing it or making a copy. Salt is the
 *  stored salt, or the salt worked out from the published sodium. */
export function draftOf(f: Partial<Record<string, unknown>> | null, name?: string): FoodDraft {
  const t = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(Number(v)))
  const figures: Partial<Record<LabelKey, string>> = {}
  if (f) for (const row of LABEL) {
    const v = row.key === 'salt_g' ? saltOf(f as never) : f[row.key]
    figures[row.key] = v === null || v === undefined ? '' : t(row.key === 'salt_g' ? round(Number(v), 3) : v)
  }
  const state = STATES.includes(f?.state as FoodState) ? (f!.state as FoodState) : 'raw'
  return {
    name: name ?? String(f?.name ?? ''), brand: String(f?.brand ?? ''), per: f?.per_ml ? 'ml' : 'g', state, figures,
    cook_yield: t(f?.cook_yield), pack_size_g: t(f?.pack_size_g), store_section: String(f?.store_section ?? ''),
    stores: Array.isArray(f?.stores) ? (f!.stores as string[]).join(', ') : '', density: t(f?.density),
  }
}

/** The search text of a food beyond its name: the published NEVO names,
 *  synonyms and brand, so "ui" finds onions and "kip" finds chicken. */
export function foodSearchText(f: { name_nl?: string | null; name_en?: string | null; synonyms?: string | null; brand?: string | null; food_group?: string | null }): string {
  return [f.name_nl, f.name_en, f.synonyms, f.brand].filter(Boolean).join(' ')
}

// ---- which figures a person sees (FOOD-16, FOOD-06) ------------------------------------

/** The label lines beyond the five the app has always counted (calories,
 *  protein, carbohydrate, fat, fibre: settings.nutrients). */
export type ExtraFigure = 'sat_fat_g' | 'mufa_g' | 'pufa_g' | 'sugars_g' | 'polyols_g' | 'starch_g' | 'salt_g' | 'alcohol_g'
export const EXTRA_KEYS: ExtraFigure[] = ['sat_fat_g', 'mufa_g', 'pufa_g', 'sugars_g', 'polyols_g', 'starch_g', 'salt_g', 'alcohol_g']

export interface LabelChoice {
  /** Extra label lines shown in the food and recipe lists, in label order. */
  figures: ExtraFigure[]
  /** Show each figure's share of the adult reference intake (%RI). */
  ri: boolean
}

/** As stored in nutrition's module settings; anything odd is left out. */
export function readLabelChoice(v: unknown): LabelChoice {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const figures = Array.isArray(r.figures) ? EXTRA_KEYS.filter((k) => (r.figures as unknown[]).includes(k)) : []
  return { figures, ri: r.ri === true }
}

/** Every figure a list shows, in label order: the five the person tracks
 *  (calories always) and the extra ones they picked. */
export function shownFigures(core: string[], extra: ExtraFigure[]): LabelKey[] {
  const want = new Set<string>(['kcal', ...core, ...extra])
  return LABEL.map((r) => r.key).filter((k) => k !== 'kj' && want.has(k))
}

/** A figure's short name for a column or a line: "Saturates", "Salt". */
export function figureName(key: LabelKey): string {
  if (key === 'kcal') return 'kcal'
  if (key === 'kj') return 'kJ'
  return EXTRA_FIGURES.find((f) => f.key === key)?.label ?? key
}
