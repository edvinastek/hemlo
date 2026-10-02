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
