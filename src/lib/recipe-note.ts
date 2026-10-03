import { db } from './db'
import { recipeMacros } from './calc'
import { figuresLine, recipeToNote, type NoteLine } from './recipe-note-rules'
import type { Food, Recipe, RecipeLine } from './types'

/** A recipe with what the note needs of it: its lines in order and their
 *  foods. Read from the local copy, so inserting works offline. */
export interface RecipeData { recipe: Recipe; lines: RecipeLine[]; foods: Map<string, Food> }

export async function loadRecipes(ids: string[]): Promise<Map<string, RecipeData>> {
  const out = new Map<string, RecipeData>()
  const wanted = [...new Set(ids)]
  if (!wanted.length) return out
  const recipes = (await db.recipe.bulkGet(wanted)).filter((r): r is Recipe => !!r && !r.deleted_at)
  const lines = await db.recipe_line.where('recipe_id').anyOf(recipes.map((r) => r.id)).toArray()
  const foodIds = [...new Set(lines.map((l) => l.food_id).filter((id): id is string => !!id))]
  const foods = new Map((await db.food.bulkGet(foodIds)).filter((f): f is Food => !!f).map((f) => [f.id, f]))
  for (const r of recipes) {
    out.set(r.id, { recipe: r, lines: lines.filter((l) => l.recipe_id === r.id).sort((a, b) => a.sort_order - b.sort_order), foods })
  }
  return out
}

/** The recipe's lines as the note writes them: the food's name, or the
 *  free text a line was written as. */
export function noteLinesOf(d: RecipeData): NoteLine[] {
  return d.lines.map((l) => {
    const food = l.food_id ? d.foods.get(l.food_id) : undefined
    if (!food) return { name: l.raw_text ?? 'Ingredient', grams_per_portion: null, raw_text: l.raw_text }
    return { name: food.name, grams_per_portion: l.grams_per_portion, unit: l.unit ?? null, unit_qty: l.unit_qty ?? null, units: food.units ?? [] }
  })
}

/** One portion's figures, or nothing when a food behind a line is not on
 *  this phone: a figure that leaves part of the dish out is not shown (P8). */
export function figuresOf(d: RecipeData): string | null {
  const withFood = d.lines.filter((l) => l.food_id)
  if (!withFood.length || withFood.some((l) => !d.foods.has(l.food_id!))) return null
  return figuresLine(recipeMacros(d.lines, d.foods))
}

export interface InsertParts { portions: number; ingredients: boolean; steps: boolean; figures: boolean }

/** The block for one recipe as it is now, with the parts asked for. */
export function recipeBlockText(d: RecipeData, o: InsertParts): string {
  return recipeToNote(
    { id: d.recipe.id, name: d.recipe.name, portions_per_batch: d.recipe.portions_per_batch, steps: d.recipe.steps },
    noteLinesOf(d),
    { portions: o.portions, ingredients: o.ingredients, steps: o.steps, figures: o.figures ? figuresOf(d) : null },
  )
}
