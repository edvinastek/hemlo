import { db } from './db'
import { edit } from './write'
import { findReadyMeal, readyMealRows, type PortionChoice } from './ready-meal-rules'
import type { Food, Recipe, RecipeLine } from './types'

/** Save a food (a scanned product) as a ready meal (PROD-10): a private
 *  recipe of one line, one portion being the pack or the stated serving.
 *  The shape is set out in ready-meal-rules.ts. The same food made a ready
 *  meal before gives that one back rather than a second. */
export async function saveReadyMeal(food: Pick<Food, 'id' | 'name'>, portion: Pick<PortionChoice, 'grams' | 'unit'>, userId: string): Promise<{ recipe: Recipe; existed: boolean }> {
  const [recipes, lines] = await Promise.all([db.recipe.toArray(), db.recipe_line.toArray()])
  const have = findReadyMeal(recipes, lines, food.id, userId)
  if (have) return { recipe: have, existed: true }
  const rows = readyMealRows(food, portion, userId, { recipe: crypto.randomUUID(), line: crypto.randomUUID() })
  const { id: recipeId, ...recipeFields } = rows.recipe
  // The recipe first, so the server has it before its line arrives.
  const recipe = await edit('recipe', { id: recipeId } as Recipe, { ...recipeFields, sharing: 'private', deleted_at: null } as Partial<Recipe>)
  const { id: lineId, ...lineFields } = rows.line
  await edit('recipe_line', { id: lineId } as RecipeLine, lineFields as Partial<RecipeLine>)
  return { recipe, existed: false }
}
