/** Recipes in and out of GetIt (DATA-05, REC-07): GetIt's own JSON, a CSV
 *  with one ingredient a row, and schema.org Recipe (the JSON-LD most recipe
 *  sites carry), read from a file, from a page's source pasted in, or from
 *  plain text ("200 g oats, 2 eggs"). Pure: the caller matches ingredient
 *  names to foods. Checked in src/test/recipeio.check.mjs. */

import { plainFractions, pluralOf, readQty, findUnit, defaultUnit, readUnits, gramsOf, type FoodUnit } from './units-rules.ts'
import { roleLabel, ROLES } from './recipe-rules.ts'

// ---- what an import reads into ----------------------------------------------------------

export interface ImportedLine {
  /** The line as the source wrote it: "2 tbsp olive oil, warmed". */
  text: string
  /** The food's name as read from the line: "olive oil". */
  name: string
  /** How much for the whole batch, and in what: 2 and "tbsp"; 200 and "g";
   *  2 and null for "2 eggs". Null when the line gives no amount. */
  qty: number | null
  unit: string | null
  note: string | null
  state: 'raw' | 'cooked' | null
  /** From a GetIt file: the amount a portion, in grams, and the food's NEVO
   *  code, so the same food is found again. */
  grams_per_portion?: number | null
  nevo_code?: number | null
  unit_name?: string | null
  unit_qty?: number | null
}

export interface ImportedRecipe {
  name: string
  role: string | null
  portions: number
  minutes: number | null
  steps: string | null
  lines: ImportedLine[]
  /** Where it came from, when known ("schema.org", "GetIt file"). */
  from: string
}

// ---- reading an ingredient line --------------------------------------------------------

/** Measures a line may give, to the name they are kept under. */
const MEASURES: Record<string, string> = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml', cl: 'cl', dl: 'dl', l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tl: 'tsp', theelepel: 'tsp', theelepels: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', el: 'tbsp', eetlepel: 'tbsp', eetlepels: 'tbsp', tbs: 'tbsp',
  cup: 'cup', cups: 'cup', pinch: 'pinch', pinches: 'pinch', snufje: 'pinch',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin',
  piece: 'piece', pieces: 'piece', stuk: 'piece', stuks: 'piece', handful: 'handful', handfuls: 'handful',
  bunch: 'bunch', bunches: 'bunch', sprig: 'sprig', sprigs: 'sprig', head: 'head', heads: 'head',
}
/** Millilitres in a volume measure (an EU cup is 250 ml). */
export const ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 5, tbsp: 15, cup: 250 }
const COOKED = /\b(cooked|boiled|steamed|grilled|baked|roasted|fried|drained)\b/i

/** "2 tbsp olive oil, warmed" is 2, tbsp, "olive oil", note "warmed";
 *  "½ onion (finely chopped)" is 0.5, none, "onion", note "finely chopped";
 *  "200g oats" is 200 g oats; "salt to taste" has no amount. */
export function readLine(raw: string): ImportedLine {
  const text = raw.replace(/\s+/g, ' ').replace(/^[\s•·*\-–—]+/, '').trim()
  const plain = plainFractions(text)
  let rest = plain
  let qty: number | null = null
  let unit: string | null = null
  // A range ("2-3 cloves") counts the first number.
  const num = /^(\d+ \d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*/.exec(rest)
  if (num) {
    qty = readQty(num[1])
    rest = rest.slice(num[0].length)
    const m = /^([a-zA-Z]+)\.?(?:\s+of)?\b\s*/.exec(rest)
    if (m && MEASURES[m[1].toLowerCase()]) { unit = MEASURES[m[1].toLowerCase()]; rest = rest.slice(m[0].length) }
  }
  // A bracket in the middle of a line ("1 cup (250 ml) milk") repeats the
  // amount; one at the end, or after a comma, is a note.
  rest = rest.replace(/^\(\s*\d[^)]*\)\s*/, '')
  let note: string | null = null
  const bracket = /\s*\(([^)]*)\)\s*$/.exec(rest)
  if (bracket) { note = bracket[1].trim() || null; rest = rest.slice(0, bracket.index) }
  const comma = rest.indexOf(',')
  if (comma > 0) { note = [rest.slice(comma + 1).trim(), note].filter(Boolean).join('; ') || null; rest = rest.slice(0, comma) }
  const name = rest.replace(/^of\s+/i, '').trim() || text
  return { text, name, qty, unit, note, state: COOKED.test(`${name} ${note ?? ''}`) ? 'cooked' : null }
}

/** A line's grams for the whole batch, from the food it was matched to:
 *  grams and kilos as they are; a volume by the food's density (1 for a food
 *  given per 100 ml); a count or a spoon by the food's own unit of that name,
 *  else its usual one ("2 eggs" are two medium eggs). Null when the food does
 *  not say what that amount weighs: the line is kept with its text for the
 *  person to finish. */
export function lineGrams(l: Pick<ImportedLine, 'qty' | 'unit'>, food: { units?: unknown; per_ml?: boolean; density?: number | string | null } | null):
  { grams: number; unit?: string; unit_qty?: number } | null {
  if (l.qty === null || !food) return null
  const units = readUnits(food.units)
  if (l.unit === 'g') return { grams: l.qty }
  if (l.unit === 'kg') return { grams: l.qty * 1000 }
  const own = l.unit ? findUnit(units, l.unit) : undefined
  if (own) return { grams: gramsOf(l.qty, own), unit: own.name, unit_qty: l.qty }
  if (l.unit && ML[l.unit]) {
    const d = food.per_ml ? 1 : Number(food.density)
    if (!(d > 0)) return null
    const g = Math.round(l.qty * ML[l.unit] * d * 10) / 10
    return l.unit === 'ml' || l.unit === 'cl' || l.unit === 'dl' || l.unit === 'l' ? { grams: g } : { grams: g, unit: l.unit, unit_qty: l.qty }
  }
  if (!l.unit || l.unit === 'piece') {
    const u: FoodUnit | null = defaultUnit(units)
    return u ? { grams: gramsOf(l.qty, u), unit: u.name, unit_qty: l.qty } : null
  }
  return null
}

// ---- schema.org Recipe ------------------------------------------------------------------

/** Minutes from an ISO 8601 duration ("PT1H30M" is 90). */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim())
  if (!m) return null
  const min = (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60)
  return min > 0 ? min : null
}
export const isoDuration = (minutes: number) => `PT${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}H` : ''}${minutes % 60 ? `${minutes % 60}M` : ''}` || 'PT0M'

/** Portions from a recipe's yield: "4", "4 servings", ["4", "4 porties"]. */
export function yieldPortions(v: unknown): number {
  const one = Array.isArray(v) ? v[0] : v
  const n = typeof one === 'number' ? one : typeof one === 'string' ? Number(/\d+(?:[.,]\d+)?/.exec(one)?.[0]?.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 && n <= 999 ? n : 1
}

const text = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? (v as { text: string }).text : '')
/** Steps from recipeInstructions: text, a list of steps, or sections of steps. */
function stepsOf(v: unknown): string | null {
  const out: string[] = []
  const walk = (x: unknown) => {
    if (typeof x === 'string') { out.push(...x.split(/\r?\n/)); return }
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      if (Array.isArray(o.itemListElement)) { walk(o.itemListElement); return }
      if (typeof o.text === 'string') out.push(o.text)
      else if (typeof o.name === 'string') out.push(o.name)
    }
  }
  walk(v)
  const lines = out.map((s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  return lines.length ? lines.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join('\n').slice(0, 4000) : null
}

const ROLE_WORDS: [RegExp, string][] = [
  [/breakfast|ontbijt/i, 'breakfast'], [/lunch/i, 'lunch'], [/dinner|main|hoofdgerecht|diner/i, 'dinner'],
  [/snack|tussendoor/i, 'snack'], [/shake|smoothie/i, 'shake'],
]
function roleOf(category: unknown): string | null {
  const t = (Array.isArray(category) ? category.join(' ') : typeof category === 'string' ? category : '')
  return ROLE_WORDS.find(([re]) => re.test(t))?.[1] ?? null
}

function isRecipe(o: Record<string, unknown>): boolean {
  const t = o['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

/** Every schema.org Recipe in some JSON-LD: on its own, in a list, or in a
 *  graph. */
export function recipesInJsonLd(json: unknown): ImportedRecipe[] {
  const found: Record<string, unknown>[] = []
  const walk = (x: unknown, depth = 0) => {
    if (depth > 6 || !x) return
    if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (isRecipe(o)) { found.push(o); return }
    if (o['@graph']) walk(o['@graph'], depth + 1)
    if (o.mainEntity) walk(o.mainEntity, depth + 1)
  }
  walk(json)
  return found.map((o) => {
    const portions = yieldPortions(o.recipeYield)
    const ingredients = Array.isArray(o.recipeIngredient) ? o.recipeIngredient : Array.isArray(o.ingredients) ? o.ingredients : []
    return {
      name: (text(o.name) || 'Imported recipe').replace(/\s+/g, ' ').trim().slice(0, 120),
      role: roleOf(o.recipeCategory),
      portions,
      minutes: isoMinutes(o.totalTime) ?? ((isoMinutes(o.prepTime) ?? 0) + (isoMinutes(o.cookTime) ?? 0) || null),
      steps: stepsOf(o.recipeInstructions),
      lines: (ingredients as unknown[]).map((i) => text(i)).filter(Boolean).slice(0, 80).map(readLine),
      from: 'schema.org',
    }
  })
}

/** The JSON-LD blocks in a page's source. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = []
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1].trim())) } catch { /* a broken block is skipped */ }
  }
  return out
}

// ---- GetIt's own file, CSV and plain text ----------------------------------------------------

export const FORMAT = 'getit-recipes'

export interface ExportLine { text: string; food: string | null; nevo_code: number | null; grams_per_portion: number | null; unit: string | null; unit_qty: number | null; state: string | null; note: string | null }
export interface ExportRecipe { name: string; role: string | null; portions: number; minutes: number | null; steps: string | null; lines: ExportLine[]; per_portion?: Record<string, number> }

/** GetIt's own recipe file: everything a recipe holds, amounts a portion. */
export function toGetItJson(recipes: ExportRecipe[], attribution: string | null): string {
  return JSON.stringify({ format: FORMAT, version: 1, ...(attribution ? { attribution } : {}), recipes }, null, 2)
}

function fromGetIt(o: Record<string, unknown>): ImportedRecipe[] {
  const list = Array.isArray(o.recipes) ? o.recipes : []
  return list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map((r) => ({
    name: String(r.name ?? 'Imported recipe').slice(0, 120),
    role: typeof r.role === 'string' && ROLES.some((x) => x.value === r.role) ? r.role : null,
    portions: yieldPortions(r.portions),
    minutes: Number.isFinite(Number(r.minutes)) && Number(r.minutes) > 0 ? Math.round(Number(r.minutes)) : null,
    steps: typeof r.steps === 'string' ? r.steps.slice(0, 4000) : null,
    lines: (Array.isArray(r.lines) ? r.lines : []).filter((l): l is Record<string, unknown> => !!l && typeof l === 'object').map((l) => ({
      ...readLine(String(l.text ?? l.food ?? '')),
      name: String(l.food ?? l.text ?? ''),
      grams_per_portion: Number.isFinite(Number(l.grams_per_portion)) && l.grams_per_portion !== null ? Number(l.grams_per_portion) : null,
      nevo_code: Number.isInteger(Number(l.nevo_code)) && l.nevo_code !== null ? Number(l.nevo_code) : null,
      unit_name: typeof l.unit === 'string' ? l.unit : null,
      unit_qty: Number.isFinite(Number(l.unit_qty)) && l.unit_qty !== null ? Number(l.unit_qty) : null,
      state: l.state === 'cooked' ? 'cooked' : l.state === 'raw' ? 'raw' : null,
      note: typeof l.note === 'string' ? l.note : null,
    })),
    from: 'GetIt file',
  }))
}

export const CSV_HEAD = ['recipe', 'for', 'portions', 'minutes', 'ingredient', 'grams_per_portion', 'unit', 'how_many', 'state', 'note', 'steps']

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per ingredient; the recipe's own fields on each row, the steps on
 *  its first. Opens in any spreadsheet. */
export function toCsv(recipes: ExportRecipe[]): string {
  const rows = [CSV_HEAD.join(',')]
  for (const r of recipes) {
    const lines = r.lines.length ? r.lines : [null]
    lines.forEach((l, i) => rows.push([
      r.name, roleLabel(r.role), r.portions, r.minutes ?? '', l?.food ?? l?.text ?? '', l?.grams_per_portion ?? '', l?.unit ?? '',
      l?.unit_qty ?? '', l?.state ?? '', l?.note ?? '', i === 0 ? r.steps ?? '' : '',
    ].map(cell).join(',')))
  }
  return rows.join('\r\n')
}

/** Rows of a CSV, quotes and line breaks inside quotes understood. */
export function csvRows(t: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let f = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true
    else if (c === ',' || c === ';') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = [] }
    else f += c
  }
  row.push(f)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

function fromCsv(t: string): ImportedRecipe[] {
  const [head, ...rows] = csvRows(t.replace(/^﻿/, ''))
  const at = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n)
  const [ri, fi, pi, mi, ii, gi, ui, qi, si, ni, ti] = CSV_HEAD.map(at)
  const by = new Map<string, ImportedRecipe>()
  for (const r of rows) {
    const name = (r[ri] ?? '').trim()
    if (!name) continue
    let rec = by.get(name)
    if (!rec) {
      const role = ROLES.find((x) => x.label.toLowerCase() === (r[fi] ?? '').trim().toLowerCase())?.value || null
      rec = { name: name.slice(0, 120), role, portions: yieldPortions(r[pi]), minutes: Number(r[mi]) > 0 ? Math.round(Number(r[mi])) : null, steps: null, lines: [], from: 'CSV' }
      by.set(name, rec)
    }
    if (ti >= 0 && r[ti]?.trim() && !rec.steps) rec.steps = r[ti].trim().slice(0, 4000)
    const what = (r[ii] ?? '').trim()
    if (!what) continue
    const grams = readQty(r[gi] ?? '', 1_000_000)
    rec.lines.push({
      ...readLine(what), name: what, grams_per_portion: grams,
      unit_name: (r[ui] ?? '').trim() || null, unit_qty: readQty(r[qi] ?? ''),
      state: (r[si] ?? '').trim() === 'cooked' ? 'cooked' : (r[si] ?? '').trim() === 'raw' ? 'raw' : null,
      note: (r[ni] ?? '').trim() || null,
    })
  }
  return [...by.values()]
}

/** Plain text: a name on the first line, then the ingredients one a line
 *  (or one line with commas: "200 g oats, 2 eggs, 1 banana"), then the steps
 *  after a line that says so ("Steps", "Method", "Bereiding"). */
function fromText(t: string): ImportedRecipe[] {
  const all = t.split(/\r?\n/).map((l) => l.trim())
  const stepsAt = all.findIndex((l) => /^(steps|method|instructions|directions|preparation|bereiding|werkwijze)\s*:?$/i.test(l))
  const body = (stepsAt >= 0 ? all.slice(0, stepsAt) : all).filter(Boolean)
  const steps = stepsAt >= 0 ? all.slice(stepsAt + 1).filter(Boolean).join('\n').slice(0, 4000) || null : null
  if (!body.length) return []
  // The first line is the name unless it reads as an ingredient (starts with an amount).
  const first = body[0]
  const named = !/^[\d½¼¾⅓⅔⅛]/.test(first) && !/,/.test(first)
  const name = named ? first.replace(/^#+\s*/, '').slice(0, 120) : 'Pasted recipe'
  let lines = named ? body.slice(1) : body
  if (lines.length === 1 && lines[0].includes(',')) lines = lines[0].split(',')
  const portions = /\b(?:serves|for|voor)\s+(\d+)/i.exec(t)?.[1]
  return [{
    name, role: null, portions: portions ? yieldPortions(portions) : 1, minutes: null, steps,
    lines: lines.map((l) => l.replace(/^ingredients?\s*:?\s*/i, '').trim()).filter(Boolean).slice(0, 80).map(readLine),
    from: 'text',
  }]
}

/** Whatever was given (a file's text, a page's source, pasted text), read
 *  as recipes, the way it was written. */
export function readRecipes(input: string): { recipes: ImportedRecipe[]; kind: string } {
  const t = input.replace(/^﻿/, '').trim()
  if (!t) return { recipes: [], kind: 'nothing' }
  if (/^[[{]/.test(t)) {
    try {
      const json = JSON.parse(t)
      if (json && typeof json === 'object' && (json as Record<string, unknown>).format === FORMAT) return { recipes: fromGetIt(json as Record<string, unknown>), kind: 'GetIt file' }
      const ld = recipesInJsonLd(json)
      if (ld.length) return { recipes: ld, kind: 'schema.org' }
    } catch { /* not JSON after all: read as text */ }
  }
  if (/<script[^>]*application\/ld\+json/i.test(t)) {
    const ld = jsonLdBlocks(t).flatMap(recipesInJsonLd)
    return { recipes: ld, kind: ld.length ? 'schema.org' : 'a page without recipe data' }
  }
  const firstLine = t.split(/\r?\n/)[0].toLowerCase()
  if (firstLine.includes('recipe') && firstLine.includes('ingredient') && /[,;]/.test(firstLine)) return { recipes: fromCsv(t), kind: 'CSV' }
  return { recipes: fromText(t), kind: 'text' }
}

/** schema.org Recipe for one recipe, amounts for the whole batch, figures a
 *  portion (as recipe sites give them). */
export function toSchemaOrg(r: ExportRecipe, attribution: string | null): Record<string, unknown> {
  const fmt = (n: number) => String(Math.round(n * 100) / 100)
  const n = r.per_portion ?? {}
  const nutrition: Record<string, string> = { '@type': 'NutritionInformation' }
  if (n.kcal !== undefined) nutrition.calories = `${Math.round(n.kcal)} kcal`
  const g: [string, string][] = [['protein_g', 'proteinContent'], ['fat_g', 'fatContent'], ['sat_fat_g', 'saturatedFatContent'],
    ['carbs_g', 'carbohydrateContent'], ['sugars_g', 'sugarContent'], ['fiber_g', 'fiberContent']]
  for (const [k, s] of g) if (n[k] !== undefined) nutrition[s] = `${fmt(n[k])} g`
  if (n.salt_g !== undefined) nutrition.sodiumContent = `${fmt((n.salt_g / 2.5) * 1000)} mg`
  return {
    '@context': 'https://schema.org', '@type': 'Recipe', name: r.name,
    ...(r.role ? { recipeCategory: roleLabel(r.role) } : {}),
    recipeYield: `${fmt(r.portions)} ${r.portions === 1 ? 'portion' : 'portions'}`,
    ...(r.minutes ? { totalTime: isoDuration(r.minutes) } : {}),
    recipeIngredient: r.lines.map((l) => {
      if (l.grams_per_portion === null) return l.text
      const batch = l.grams_per_portion * r.portions
      const what = l.food ?? l.text
      if (l.unit && l.unit_qty !== null) {
        const q = l.unit_qty * r.portions
        return `${fmt(q)} ${q > 0 && q <= 1 ? l.unit : pluralOf(l.unit)} (${what})${l.note ? `, ${l.note}` : ''}`
      }
      return `${fmt(batch)} g ${what}${l.note ? `, ${l.note}` : ''}`
    }),
    ...(r.steps ? { recipeInstructions: r.steps.split(/\r?\n/).map((s) => s.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean).map((s) => ({ '@type': 'HowToStep', text: s })) } : {}),
    ...(Object.keys(nutrition).length > 1 ? { nutrition } : {}),
    ...(attribution ? { comment: attribution } : {}),
  }
}

// ---- an import planned before anything is saved ----------------------------------------

export interface PlannedLine {
  food_id: string | null
  raw_text: string
  grams_per_portion: number | null
  unit: string | null
  unit_qty: number | null
  state: string | null
  note: string | null
}
export interface PlannedRecipe {
  name: string
  role: string | null
  portions_per_batch: number
  cook_minutes: number | null
  steps: string | null
  lines: PlannedLine[]
  matched: number
  /** Lines kept as text, for the person to finish: no food found, or an
   *  amount the food cannot weigh. */
  unmatched: string[]
}

type Matchable = { id: string; name: string; nevo_code?: number | null; units?: unknown; per_ml?: boolean; density?: number | string | null }

/** Recipes read from a file or a page, as rows to save: each line matched to
 *  a food (`match` finds one by name; a GetIt file's NEVO code finds it
 *  first), its amount for the whole batch turned into grams a portion, in the
 *  food's unit where it was counted. A line that finds no food, or whose
 *  amount the food cannot weigh, is kept as a line of text. */
export function planRecipes<T extends Matchable>(recipes: ImportedRecipe[], foods: T[], match: (name: string) => T | null): PlannedRecipe[] {
  const byCode = new Map(foods.filter((f) => f.nevo_code).map((f) => [f.nevo_code!, f]))
  const round = (n: number) => Math.round(n * 100) / 100
  return recipes.map((r) => {
    const portions = r.portions > 0 ? r.portions : 1
    const out: PlannedRecipe = {
      name: r.name.trim().slice(0, 120) || 'Imported recipe', role: r.role, portions_per_batch: round(Math.min(999, portions)),
      cook_minutes: r.minutes && r.minutes <= 10000 ? r.minutes : null, steps: r.steps, lines: [], matched: 0, unmatched: [],
    }
    for (const l of r.lines) {
      const food = (l.nevo_code ? byCode.get(l.nevo_code) : undefined) ?? match(l.name)
      const said = l.text.slice(0, 200)
      // A GetIt file says the grams a portion itself.
      if (food && l.grams_per_portion != null && l.grams_per_portion > 0) {
        out.lines.push({ food_id: food.id, raw_text: said, grams_per_portion: round(l.grams_per_portion), unit: l.unit_name && l.unit_qty ? l.unit_name : null,
          unit_qty: l.unit_name && l.unit_qty ? l.unit_qty : null, state: l.state, note: l.note })
        out.matched++
        continue
      }
      const g = food ? lineGrams(l, food) : null
      if (food && g && g.grams / portions <= 10000) {
        const perUnit = g.unit && g.unit_qty ? round(g.unit_qty / portions) : null
        out.lines.push({ food_id: food.id, raw_text: said, grams_per_portion: round(g.grams / portions), unit: perUnit ? g.unit! : null,
          unit_qty: perUnit, state: l.state, note: l.note })
        out.matched++
      } else {
        out.lines.push({ food_id: null, raw_text: said, grams_per_portion: null, unit: null, unit_qty: null, state: null, note: null })
        out.unmatched.push(said)
      }
    }
    return out
  })
}
