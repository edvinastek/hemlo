/** Counting food the way people do: "2 eggs", "1 slice", "1 tbsp" as well as
 *  grams. Pure rules, no database and no React, so every one is checked in
 *  plain Node (src/test/units.check.mjs).
 *
 *  Grams stay the one truth. Every sum (calories, macros, stock, the shopping
 *  list) works in grams; a unit is only how an amount is typed and shown. A
 *  food keeps its units as a short list ({ name: 'egg', plural: 'eggs',
 *  g: 50 }). When an entry is typed in a unit, its grams are worked out there
 *  and then (how many × the unit's weight) and saved with it, together with
 *  the unit and how many. If the unit's weight is changed later, entries
 *  already saved keep their grams: nothing changes behind the person's back. */

export interface FoodUnit {
  /** "egg", "slice", "tbsp". */
  name: string
  /** "eggs"; worked out from the name when left out. */
  plural?: string
  /** What one weighs, in grams (a millilitre of a drink counts as a gram). */
  g: number
}

/** The database's limits (migration 022), so nothing is offered that it refuses. */
export const MAX_UNITS = 8
export const UNIT_NAME_MAX = 24
export const UNIT_G_MIN = 0.1
export const UNIT_G_MAX = 5000
/** How many of a unit one entry can hold. */
export const QTY_MAX = 100000
/** The most grams anything holds (the stock's limit, the largest there is). */
export const GRAMS_MAX = 1_000_000

/** Names that already mean a weight: as a unit they would read as grams. */
const RESERVED = new Set(['g', 'gr', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms'])

const round = (n: number, places: number) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** A name as kept: spaces tidied, at most 24 characters. Case is kept as typed. */
export function cleanUnitName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, UNIT_NAME_MAX).trim() : ''
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** One unit, its plural left out when there is none or it is the name. */
function makeUnit(name: string, plural: string, g: number): FoodUnit {
  return plural && !same(plural, name) ? { name, plural, g } : { name, g }
}

/** A food's units as stored, read strictly: anything that is not a whole,
 *  sane unit is left out, a name used twice keeps the first, and there are
 *  never more than eight. What another device or an old version wrote can
 *  never break a screen. */
export function readUnits(v: unknown): FoodUnit[] {
  if (!Array.isArray(v)) return []
  const out: FoodUnit[] = []
  for (const raw of v) {
    if (out.length >= MAX_UNITS) break
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = cleanUnitName(r.name)
    const g = typeof r.g === 'number' ? r.g : typeof r.g === 'string' ? Number(r.g) : NaN
    if (!name || RESERVED.has(name.toLowerCase()) || !Number.isFinite(g) || g < UNIT_G_MIN || g > UNIT_G_MAX) continue
    if (out.some((u) => same(u.name, name))) continue
    out.push(makeUnit(name, cleanUnitName(r.plural), round(g, 1)))
  }
  return out
}

/** The unit with this name (or plural), whatever the capitals. */
export function findUnit(units: FoodUnit[], name: string | null | undefined): FoodUnit | undefined {
  if (!name) return undefined
  const n = name.trim()
  return units.find((u) => same(u.name, n) || same(u.plural ?? pluralOf(u.name), n))
}

/* ---------- words and numbers --------------------------------------------- */

/** Short forms stay as they are: "2 tbsp", "250 ml". */
const noVowel = (w: string) => !/[aeiouy]/i.test(w)
const F_TO_VES: Record<string, string> = { leaf: 'leaves', loaf: 'loaves', half: 'halves', knife: 'knives' }

/** The plural a unit gets when none was given: egg → eggs, glass → glasses,
 *  berry → berries, loaf → loaves; tbsp and ml stay as they are. */
export function pluralOf(name: string): string {
  const w = name.trim()
  if (!w || noVowel(w) || w.includes('.')) return w
  const lower = w.toLowerCase()
  if (F_TO_VES[lower]) return F_TO_VES[lower]
  if (/(ss|x|z|ch|sh)$/i.test(w)) return `${w}es`
  if (/s$/i.test(w)) return w
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`
  return `${w}s`
}

/** The word to go with a number: "1 egg", "0.5 cup", "2 eggs". */
export function unitWord(unit: Pick<FoodUnit, 'name' | 'plural'>, qty: number): string {
  return qty > 0 && qty <= 1 ? unit.name : unit.plural ?? pluralOf(unit.name)
}

/** A count as written: at most two decimals and none trailing ("0.5", "1.5", "2"). */
export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(round(n, 2))
}

/** "2 eggs", "1 slice", "1.5 tbsp". */
export function formatCount(qty: number, unit: Pick<FoodUnit, 'name' | 'plural'>): string {
  return `${formatQty(qty)} ${unitWord(unit, qty)}`
}

/** Grams as a person writes them: a tenth under 10 g ("4.5 g"), whole up to
 *  a kilo, then kilos ("1.25 kg"). */
export function gramsLabel(g: number): string {
  if (!Number.isFinite(g) || g <= 0) return '0 g'
  if (g < 10) return `${round(g, 1)} g`
  if (g < 1000) return `${Math.round(g)} g`
  return `${round(g / 1000, 2)} kg`
}

/** The fractions a keyboard or a recipe writes as one character. */
export const VULGAR: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' }

/** Fractions written the plain way: "½" is "1/2", "1½" is "1 1/2", and the
 *  fraction slash (⁄) that Unicode's tidying turns "½" into is a slash. Done
 *  before anything else reads the text, so "1½" never becomes "11/2". */
export function plainFractions(text: string): string {
  return text
    // Every fraction character Unicode has (¼ ½ ¾ and ⅐ to ⅞): its own
    // tidy form is "1⁄8", which becomes "1/8" below.
    .replace(/(?:(\d)\s*)?([\u00BC-\u00BE\u2150-\u215E])/g, (_m, d: string | undefined, f: string) =>
      `${d ? `${d} ` : ''}${VULGAR[f] ?? f.normalize('NFKC')}`)
    .replace(/\s*⁄\s*/g, '/')
}

/** A number as typed, or null when it is not one. A comma is the decimal
 *  point on many phones; ½, ¼, ¾, "1/2", "1 1/2" and "1½" are read as well.
 *  Never below zero or past what one entry holds; three decimals at most. */
export function readQty(text: string | number | null | undefined, max = QTY_MAX): number | null {
  if (text === null || text === undefined) return null
  let n: number
  if (typeof text === 'number') n = text
  else {
    const plain = plainFractions(text).trim().replace(/\s+/g, ' ').replace(',', '.')
    if (!plain) return null
    // One and a half, before spaces between digits are closed up: "1 1/2"
    // is not eleven halves.
    const mixed = /^(\d+) (\d+) ?\/ ?(\d+)$/.exec(plain)
    // "2 000" is two thousand.
    const t = plain.replace(/(\d)\s+(?=\d)/g, '$1')
    const slash = /^(\d+) ?\/ ?(\d+)$/.exec(t)
    if (mixed) n = Number(mixed[3]) > 0 ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN
    else if (slash) n = Number(slash[2]) > 0 ? Number(slash[1]) / Number(slash[2]) : NaN
    else n = /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN
  }
  if (!Number.isFinite(n) || n < 0 || n > max) return null
  return round(n, 3)
}

/** How many of a unit, in grams: saved with the entry. */
export const gramsOf = (qty: number, unit: Pick<FoodUnit, 'g'>) => round(qty * unit.g, 2)

/* ---------- a food's own units, edited ------------------------------------- */

export type UnitsResult = { units: FoodUnit[]; error?: undefined } | { units?: undefined; error: string }

/** A unit from the little form on a food's page, or what is wrong with it. */
export function readUnitForm(form: { name: string; plural: string; g: string }): { unit: FoodUnit } | { error: string } {
  const name = cleanUnitName(form.name)
  if (!name) return { error: 'Name the unit: egg, slice, tbsp.' }
  if (form.name.trim().length > UNIT_NAME_MAX) return { error: `A unit's name is at most ${UNIT_NAME_MAX} characters.` }
  if (RESERVED.has(name.toLowerCase())) return { error: 'Grams are always there; name a unit that is not a weight.' }
  const g = readQty(form.g)
  if (g === null || g < UNIT_G_MIN || g > UNIT_G_MAX) return { error: `Say what one weighs, from ${UNIT_G_MIN} to ${UNIT_G_MAX} g.` }
  return { unit: makeUnit(name, cleanUnitName(form.plural), round(g, 1)) }
}

export function addUnit(units: FoodUnit[], unit: FoodUnit): UnitsResult {
  if (units.length >= MAX_UNITS) return { error: `A food can have at most ${MAX_UNITS} units.` }
  if (findUnit(units, unit.name) || (unit.plural && findUnit(units, unit.plural))) return { error: `There is already a unit called ${unit.name}.` }
  return { units: [...units, unit] }
}

export function removeUnit(units: FoodUnit[], name: string): FoodUnit[] {
  return units.filter((u) => !same(u.name, name))
}

/** "egg = 50 g", "slice = 35 g": one unit as a line for a food's page. */
export const unitLine = (u: FoodUnit) => `1 ${u.name} = ${gramsLabel(u.g)}`

/** Units as one cell of an export: "egg/eggs = 50 g; slice = 35 g". */
export function unitsText(units: FoodUnit[]): string {
  return units.map((u) => `${u.name}${u.plural ? `/${u.plural}` : ''} = ${round(u.g, 1)} g`).join('; ')
}

/** That cell read back: the units, or the first thing wrong with it. An
 *  empty cell is no units. */
export function parseUnitsText(text: unknown): UnitsResult {
  const t = typeof text === 'string' ? text.trim() : ''
  if (!t) return { units: [] }
  let units: FoodUnit[] = []
  for (const part of t.split(';').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.+?)(?:\s*\/\s*(.+?))?\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:g|grams?)?$/i.exec(part)
    if (!m) return { error: `"${part}" is not a unit: write it as egg = 50 g.` }
    const read = readUnitForm({ name: m[1], plural: m[2] ?? '', g: m[3] })
    if ('error' in read) return { error: read.error }
    const next = addUnit(units, read.unit)
    if (next.error !== undefined) return next
    units = next.units
  }
  return { units }
}

/* ---------- choosing a unit when typing an amount --------------------------- */

/** One choice beside an amount field: grams, kilos, packs or one of the
 *  food's units. `g` is what one of it weighs. */
export interface AmountChoice {
  key: string
  label: string
  g: number
  /** Set for a food's own unit, which the entry remembers. */
  unit: FoodUnit | null
}

export const unitKey = (name: string) => `u:${name.toLowerCase()}`

/** Grams first, then (where it makes sense) kilos and packs, then the food's
 *  units. `keep` is a unit an entry was saved in that the food no longer has:
 *  it stays on offer at the weight it was saved with, so opening an entry
 *  never changes it. */
export function amountChoices(units: FoodUnit[], opts: { kilos?: boolean; pack?: number | null; keep?: FoodUnit | null } = {}): AmountChoice[] {
  const out: AmountChoice[] = []
  if (opts.pack && opts.pack > 0) out.push({ key: 'packs', label: 'packs', g: opts.pack, unit: null })
  out.push({ key: 'g', label: 'g', g: 1, unit: null })
  if (opts.kilos) out.push({ key: 'kg', label: 'kg', g: 1000, unit: null })
  for (const u of units) out.push({ key: unitKey(u.name), label: u.name, g: u.g, unit: u })
  const kept = opts.keep
  if (kept && !findUnit(units, kept.name)) out.push({ key: unitKey(kept.name), label: kept.name, g: kept.g, unit: kept })
  return out
}

export interface Amount {
  grams: number
  /** The food's unit it was typed in, or null for grams (and kilos, packs). */
  unit: string | null
  unit_qty: number | null
}

/** What an amount field holds, read: the grams, and the unit and how many
 *  when a food's unit was chosen. Null when it is not an amount. */
export function readAmount(text: string, choice: AmountChoice | undefined): Amount | null {
  if (!choice) return null
  const qty = readQty(text, choice.unit ? QTY_MAX : GRAMS_MAX)
  if (qty === null) return null
  const grams = choice.key === 'g' ? qty : round(qty * choice.g, 2)
  if (grams > GRAMS_MAX) return null
  return choice.unit ? { grams, unit: choice.unit.name, unit_qty: qty } : { grams, unit: null, unit_qty: null }
}

/** An amount as shown: "2 eggs (100 g)", "1.5 kg", "2 packs (1 kg)". */
export function amountHint(text: string, choice: AmountChoice | undefined): string {
  const a = readAmount(text, choice)
  if (!a || !choice) return ''
  if (choice.unit) return `${formatCount(a.unit_qty!, choice.unit)} (${gramsLabel(a.grams)})`
  if (choice.key === 'packs') {
    const n = readQty(text, GRAMS_MAX)!
    return `${formatQty(n)} ${n === 1 ? 'pack' : 'packs'} (${gramsLabel(a.grams)})`
  }
  return gramsLabel(a.grams)
}

/** How far a count may be from its grams and still be shown: 5%. */
export const COUNT_TOLERANCE = 0.05

/** Whether a saved count still agrees with the saved grams: how many times
 *  what one weighs, within 5% of the grams. An older version of the app,
 *  which knows nothing of units, can change the grams of an entry and leave
 *  "2 eggs" beside 300 g; then the count is stale and grams are shown
 *  instead, since grams are the truth. When what one weighs is not known (the
 *  food no longer has the unit, or is not on this device) there is nothing
 *  to judge by, and the count stands. */
export function countFits(qty: number, unitG: number | null | undefined, grams: number | string | null | undefined): boolean {
  if (unitG === null || unitG === undefined || !(unitG > 0)) return true
  if (grams === null || grams === undefined || grams === '') return true
  const g = Number(grams)
  if (!Number.isFinite(g)) return true
  const want = qty * unitG
  if (g <= 0) return want <= 0
  return Math.abs(want - g) <= COUNT_TOLERANCE * g
}

/** A saved entry as shown: "2 eggs (100 g)" when it was typed in a unit,
 *  "100 g" when not, or when the count no longer agrees with the grams (see
 *  countFits). The unit's plural comes from the food when it still has the
 *  unit; the grams are always the saved ones. */
export function entryText(e: { grams: number | null; unit?: string | null; unit_qty?: number | string | null }, units: FoodUnit[] = [], withGrams = true): string {
  const g = Number(e.grams ?? 0)
  const qty = e.unit_qty === null || e.unit_qty === undefined || e.unit_qty === '' ? null : Number(e.unit_qty)
  if (e.unit && qty !== null && Number.isFinite(qty)) {
    const known = findUnit(units, e.unit)
    if (!countFits(qty, known?.g, e.grams)) return gramsLabel(g)
    const count = formatCount(qty, known ?? { name: e.unit })
    return withGrams && g > 0 ? `${count} (${gramsLabel(g)})` : count
  }
  return gramsLabel(g)
}

/** The unit columns a write carries: set for an amount in a unit; both null
 *  to clear a unit an entry had; and none at all for grams on an entry that
 *  never had a unit, so a server without the columns yet (before migration
 *  022) still takes every plain-gram entry. */
export function unitColumns(a: Pick<Amount, 'unit' | 'unit_qty'>, had: boolean): { unit?: string | null; unit_qty?: number | null } {
  if (a.unit && a.unit_qty !== null) return { unit: a.unit, unit_qty: a.unit_qty }
  return had ? { unit: null, unit_qty: null } : {}
}

/* ---------- lists that add amounts up --------------------------------------- */

/** A number of one unit, as a list adds them up. */
export interface Count { qty: number; unit: Pick<FoodUnit, 'name' | 'plural'> }

/** Two counts of the same food added up: kept when both are in the same
 *  unit, else none (the list then shows grams, which always add up). */
export function addCounts(a: Count | null, b: Count | null): Count | null {
  if (!a || !b || !same(a.unit.name, b.unit.name)) return null
  return { qty: round(a.qty + b.qty, 3), unit: a.unit.plural ? a.unit : b.unit }
}

/** An entry's count, or null when it was typed in grams or its count no
 *  longer agrees with its grams (countFits). `grams` is the entry's own:
 *  a recipe line's grams a portion, before `times`. */
export function countOf(e: { unit?: string | null; unit_qty?: number | string | null; grams?: number | string | null }, units: FoodUnit[] = [], times = 1): Count | null {
  const qty = e.unit_qty === null || e.unit_qty === undefined || e.unit_qty === '' ? NaN : Number(e.unit_qty)
  if (!e.unit || !Number.isFinite(qty)) return null
  const u = findUnit(units, e.unit)
  if (!countFits(qty, u?.g, e.grams)) return null
  return { qty: round(qty * times, 3), unit: u ? { name: u.name, plural: u.plural } : { name: e.unit } }
}

/** What to buy of a counted food: whole ones, since a shop sells whole eggs.
 *  A hair over a whole number (floating point) does not add one more. */
export const wholeToBuy = (qty: number) => Math.max(0, Math.ceil(qty - 0.01))

/* ---------- stock in a unit ---------------------------------------------------- */

/** How many of a unit the grams come to, to a tenth: 600 g of 50 g eggs is 12. */
export const countIn = (grams: number, unit: Pick<FoodUnit, 'g'>) => round(grams / unit.g, 1)

/** The unit columns a stock write carries, for a new amount in grams.
 *  `unit` undefined keeps the unit the row shows in; null goes back to
 *  grams; a name is that unit of the food. `units` are the food's, or null
 *  when the food is not on this device: a housemate scanned it and it has not
 *  arrived. Then nothing can be said about its units, so the row's unit and
 *  count are left exactly as they are (no columns written) rather than
 *  wiped; only choosing grams outright clears them. A unit the food no
 *  longer has goes back to grams. Grams on a row that never had a unit write
 *  no unit columns, so a server before 022 still takes it. */
export function stockUnitColumns(
  row: { unit?: string | null } | undefined, units: FoodUnit[] | null, grams: number, unit: string | null | undefined,
): { unit?: string | null; unit_qty?: number | null } {
  const want = unit === undefined ? row?.unit ?? null : unit
  const had = !!row?.unit
  if (!want) return unitColumns({ unit: null, unit_qty: null }, had)
  if (units === null) return {}
  const u = findUnit(units, want)
  const qty = u ? round(grams / u.g, 3) : null
  if (!u || qty === null || qty > QTY_MAX) return unitColumns({ unit: null, unit_qty: null }, had)
  return { unit: u.name, unit_qty: qty }
}

/** One tap of − or + on stock kept in a unit: a whole one more or less.
 *  From a part (11.4 eggs) it goes to the whole number next to it. Returns grams. */
export function nudgeCount(grams: number, unit: Pick<FoodUnit, 'g'>, dir: 1 | -1): number {
  const n = grams / unit.g
  const next = dir > 0 ? Math.floor(n + 1e-9) + 1 : Math.ceil(n - 1e-9) - 1
  return round(Math.max(0, next) * unit.g, 1)
}

/* ---------- Open Food Facts' serving sizes ----------------------------------- */

const VOLUME: Record<string, number> = { g: 1, gr: 1, gram: 1, grams: 1, ml: 1, cl: 10, dl: 100, l: 1000 }
const num = (s: string) => Number(s.replace(',', '.'))

/** A word's singular, for a serving that counts several: biscuits → biscuit. */
function singular(w: string): string {
  if (/ies$/i.test(w) && w.length > 4) return `${w.slice(0, -3)}y`
  if (/(ch|sh|x|ss)es$/i.test(w)) return w.slice(0, -2)
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w.slice(0, -1)
  return w
}

/** A product's serving as one of its food's units: "1 egg (50 g)" is an egg
 *  of 50 g, "2 biscuits (25 g)" a biscuit of 12.5 g, "30g" a portion of 30 g.
 *  `quantity` is Open Food Facts' own figure for the serving in grams (or
 *  millilitres), preferred when it is there. Null when neither says a weight. */
export function parseServing(size: unknown, quantity: unknown): FoodUnit | null {
  const q = typeof quantity === 'number' ? quantity : typeof quantity === 'string' && quantity.trim() ? num(quantity.trim()) : NaN
  const known = Number.isFinite(q) && q > 0 ? q : null
  const text = typeof size === 'string' ? size.replace(/\s+/g, ' ').trim().toLowerCase() : ''

  let count = 1
  let word = ''
  let total: number | null = null
  const counted = /^(\d+(?:[.,]\d+)?)\s*([a-zà-ž][a-zà-ž \-]*?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml|cl|dl|l)\s*\)/i.exec(text)
  const plain = /^(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml|cl|dl|l)\b/i.exec(text)
  if (counted) {
    count = num(counted[1])
    word = counted[2].trim()
    total = num(counted[3]) * VOLUME[counted[4].toLowerCase()]
  } else if (plain) {
    total = num(plain[1]) * VOLUME[plain[2].toLowerCase()]
  }
  const grams = known ?? total
  if (grams === null || !(count > 0)) return null

  let name = word && !RESERVED.has(word) && !VOLUME[word] ? word : ''
  let plural: string | undefined
  if (name && count !== 1) {
    plural = name
    name = singular(name)
  }
  name = cleanUnitName(name) || 'portion'
  const g = round(grams / count, 1)
  if (g < UNIT_G_MIN || g > UNIT_G_MAX) return null
  return makeUnit(name, cleanUnitName(plural), g)
}

/* ---------- a workbook's ingredient amount ---------------------------------- */

/** Words that describe a whole one rather than name a unit: "1 large (50g)". */
const SIZES = new Set(['large', 'medium', 'small', 'whole', 'big'])

/** The most one portion of one ingredient can weigh. More is a slip in the
 *  workbook ("200 glasses of milk"), not a recipe. */
export const PORTION_MAX_G = 10000

/** An amount at the start of a workbook's text: "2", "1.5", "1,5", "1/2",
 *  "1 1/2", "½", "1½". */
export const AMOUNT_AT_START = String.raw`(\d+ \d+ ?\/ ?\d+|\d+ ?\/ ?\d+|\d+(?:[.,]\d+)?)`

/** The amount a workbook's text starts with, and the word after it:
 *  "1/2 egg" is ½ and "egg"; "200" is 200 and nothing. `fraction` is true
 *  when it was written as one ("½", "1/2"): nobody writes half a gram, so a
 *  bare fraction counts the food, while a bare whole number is grams. */
export function leadingAmount(text: string | null | undefined): { qty: number; word: string; fraction: boolean } | null {
  const t = plainFractions(String(text ?? '')).trim()
  const m = new RegExp(`^${AMOUNT_AT_START}\\s*([a-zà-ž]+)?`, 'i').exec(t)
  if (!m) return null
  const qty = readQty(m[1])
  if (qty === null) return null
  return { qty, word: (m[2] ?? '').toLowerCase(), fraction: m[1].includes('/') }
}

/** An ingredient amount from a workbook ("2 slices", "1 large (50g)",
 *  "½") in one of the matched food's units, or null when it does not say
 *  one. The grams the line states are kept; without them they are worked
 *  out from the unit. A bare whole number ("Milk – 200") is grams, never 200
 *  of the food's first unit; a bare fraction ("Avocado – ½") is that much of
 *  one. Anything past 10 kg a portion is not an amount. */
export function unitFromText(qtyText: string | null | undefined, units: FoodUnit[], grams: number | null, max = PORTION_MAX_G): Amount | null {
  if (!qtyText || units.length === 0) return null
  const a = leadingAmount(qtyText)
  if (!a || a.qty <= 0) return null
  if (VOLUME[a.word] !== undefined || RESERVED.has(a.word)) return null
  if (!a.word && !a.fraction) return null
  const unit = findUnit(units, a.word) ?? (!a.word || SIZES.has(a.word) ? units[0] : undefined)
  if (!unit) return null
  const g = grams ?? gramsOf(a.qty, unit)
  if (g > max) return null
  return { grams: g, unit: unit.name, unit_qty: a.qty }
}
