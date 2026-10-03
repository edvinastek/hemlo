/** A recipe written into a task's note (NOT-20 to NOT-23): its ingredients
 *  as a checklist, scaled to the portions being made, its steps, and its
 *  figures, with a line that links back to the recipe. Pure. */
import { entryText, readUnits, type FoodUnit } from './units-rules.ts'

export interface NoteRecipe {
  id: string
  name: string
  portions_per_batch: number
  steps: string | null
}
export interface NoteLine {
  name: string
  /** Grams per portion, and the unit it was written in. */
  grams_per_portion: number | null
  unit?: string | null
  unit_qty?: number | null
  units?: FoodUnit[] | unknown
  /** A free-text line ("salt to taste"). */
  raw_text?: string | null
}
export interface NoteRecipeOptions {
  portions: number
  ingredients: boolean
  steps: boolean
  /** "One portion: 520 kcal · 38 g protein", worked out by the caller. */
  figures?: string | null
}

/** The line that links a note back to its recipe. The note page shows it as
 *  "From Chicken curry · 4 portions · Open recipe"; anywhere else it reads
 *  as plain words. */
export const recipeLink = (r: Pick<NoteRecipe, 'id' | 'name'>, portions: number) =>
  `From recipe: ${r.name} · ${fmt(portions)} ${portions === 1 ? 'portion' : 'portions'} {recipe:${r.id}}`

/** Finds the recipe links in a note: id and portions. */
export function recipeLinks(note: string): { id: string; name: string; portions: number }[] {
  const out: { id: string; name: string; portions: number }[] = []
  for (const m of note.matchAll(/^From recipe: (.+) · ([\d.]+) portions? \{recipe:([0-9a-f-]{36})\}$/gm)) {
    out.push({ name: m[1], portions: Number(m[2]), id: m[3] })
  }
  return out
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

/** The block to insert. Amounts are the per-portion amounts times the
 *  portions, in the unit each line was written in ("3 eggs (150 g)"). */
export function recipeToNote(r: NoteRecipe, lines: NoteLine[], o: NoteRecipeOptions): string {
  const out: string[] = [`## ${r.name}`, recipeLink(r, o.portions)]
  if (o.figures) out.push(o.figures)
  if (o.ingredients && lines.length) {
    out.push('', '### Ingredients')
    for (const l of lines) {
      if (l.grams_per_portion == null) { out.push(`- [ ] ${l.raw_text ?? l.name}`); continue }
      const grams = l.grams_per_portion * o.portions
      const qty = l.unit_qty != null ? Number(l.unit_qty) * o.portions : null
      out.push(`- [ ] ${l.name}, ${entryText({ grams, unit: l.unit ?? null, unit_qty: qty }, readUnits(l.units))}`)
    }
  }
  if (o.steps && r.steps?.trim()) out.push('', '### Steps', r.steps.trim())
  return out.join('\n')
}

/** The figures line under a recipe's link, for one portion, as the note
 *  keeps it. Unknown figures are left out, never written as 0 (P8). */
export function figuresLine(m: { kcal?: number | null; protein_g?: number | null; fat_g?: number | null; carbs_g?: number | null; fiber_g?: number | null } | null): string | null {
  if (!m) return null
  const parts: string[] = []
  const g = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
  if (m.kcal != null) parts.push(`${Math.round(m.kcal)} kcal`)
  if (m.protein_g != null) parts.push(`protein ${g(m.protein_g)} g`)
  if (m.carbs_g != null) parts.push(`carbohydrate ${g(m.carbs_g)} g`)
  if (m.fat_g != null) parts.push(`fat ${g(m.fat_g)} g`)
  if (m.fiber_g != null) parts.push(`fibre ${g(m.fiber_g)} g`)
  return parts.length ? `One portion: ${parts.join(' · ')}` : null
}

/** Where each inserted recipe sits in a note, and which parts it was
 *  inserted with. A block runs from its "## Name" heading (or its link line
 *  when the heading was removed) up to the next "## " heading or the end. */
export interface RecipeBlock {
  id: string
  name: string
  portions: number
  /** Lines [start, end) of the note. */
  start: number
  end: number
  ingredients: boolean
  steps: boolean
  figures: boolean
}

const LINK = /^From recipe: (.+) · ([\d.]+) portions? \{recipe:([0-9a-f-]{36})\}$/

export function recipeBlocks(note: string): RecipeBlock[] {
  const lines = note.split('\n').map((l) => l.replace(/\r$/, ''))
  const out: RecipeBlock[] = []
  lines.forEach((l, i) => {
    const m = LINK.exec(l)
    if (!m) return
    const start = i > 0 && /^## /.test(lines[i - 1]) ? i - 1 : i
    let end = i + 1
    while (end < lines.length && !/^## /.test(lines[end]) && !LINK.test(lines[end])) end++
    const body = lines.slice(i + 1, end)
    out.push({
      id: m[3], name: m[1], portions: Number(m[2]), start, end,
      ingredients: body.some((b) => /^### Ingredients\s*$/.test(b)),
      steps: body.some((b) => /^### Steps\s*$/.test(b)),
      figures: /^One portion: /.test(body[0] ?? ''),
    })
  })
  return out
}

/** A block's text with every tick cleared and trailing blank lines dropped,
 *  so a block and a fresh one compare on what the recipe says, not on how
 *  far the cooking got. */
const plain = (lines: string[]) => lines.map((l) => l.replace(/^(\s*[-*+]\s+)\[[xX]\]/, '$1[ ]').replace(/\s+$/, '')).join('\n').replace(/\n+$/, '')

/** Has the recipe changed since it was put in the note (NOT-22)? The fresh
 *  block is what recipeToNote makes now, with the same parts and portions. */
export function blockChanged(note: string, block: RecipeBlock, fresh: string): boolean {
  const lines = note.split('\n').map((l) => l.replace(/\r$/, ''))
  return plain(lines.slice(block.start, block.end)) !== plain(fresh.split('\n'))
}

/** The note with one block replaced by the recipe as it is now. Ingredient
 *  lines that are still the same keep their tick; the rest of the note is
 *  left exactly as it was. Never done by itself: only when asked. */
export function replaceBlock(note: string, block: RecipeBlock, fresh: string): string {
  const lines = note.split('\n')
  const old = lines.slice(block.start, block.end)
  const ticked = new Set(old.map((l) => /^\s*[-*+]\s+\[[xX]\]\s?(.*)$/.exec(l.replace(/\r$/, ''))?.[1]).filter((t): t is string => t !== undefined))
  const trailing = old.length - plain(old).split('\n').length
  const next = fresh.split('\n').map((l) => {
    const m = /^(\s*[-*+]\s+)\[ \]\s?(.*)$/.exec(l)
    return m && ticked.has(m[2]) ? `${m[1]}[x] ${m[2]}` : l
  })
  for (let i = 0; i < trailing; i++) next.push('')
  return [...lines.slice(0, block.start), ...next, ...lines.slice(block.end)].join('\n')
}

/** Several recipes' ingredients added up into one shopping-style checklist
 *  (NOT-23): the same food in the same unit is summed, each recipe scaled
 *  to its own portions. Free-text lines are listed once each. */
export function combinedIngredients(entries: { lines: NoteLine[]; portions: number }[]): string {
  const sums = new Map<string, { name: string; grams: number; unit: string | null; qty: number | null; units: FoodUnit[] }>()
  const loose: string[] = []
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.grams_per_portion == null) {
        const text = (l.raw_text ?? l.name).trim()
        if (text && !loose.includes(text)) loose.push(text)
        continue
      }
      const unit = l.unit_qty != null && l.unit ? l.unit : null
      const key = `${l.name.trim().toLowerCase()}|${unit ?? 'g'}`
      const was = sums.get(key) ?? { name: l.name.trim(), grams: 0, unit, qty: unit ? 0 : null, units: readUnits(l.units) }
      was.grams += l.grams_per_portion * e.portions
      if (unit && was.qty != null) was.qty += Number(l.unit_qty) * e.portions
      sums.set(key, was)
    }
  }
  const rows = [...sums.values()].sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- [ ] ${s.name}, ${entryText({ grams: Math.round(s.grams), unit: s.unit, unit_qty: s.qty != null ? Math.round(s.qty * 100) / 100 : null }, s.units)}`)
  return ['## All ingredients', ...rows, ...loose.map((t) => `- [ ] ${t}`)].join('\n')
}
