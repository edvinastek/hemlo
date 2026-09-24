/** Saves a workbook the person has already seen in the preview. The plan is
 *  made against what this device holds right now, so a food that arrived by
 *  sync between the preview and the tap is still found and not added twice. */

import { db } from './db'
import { push } from './sync'
import type { ImportPreview } from './excel'
import {
  planImport, pendingEntry, type ImportPlan, type FoodRowPlan, type RecipeRowPlan, type LineRowPlan,
} from './match-food'

export type { ImportPlan }

export interface ImportSummary {
  foodsAdded: number
  foodsExisting: number
  recipesAdded: number
  recipesExisting: number
  linesMatched: number
  linesUnmatched: number
  unmatched: string[]
  exercises: number
}

// Every field the import sets, so the server receives the whole row. updated_at
// is left out: the server keeps its own.
const FOOD_FIELDS: (keyof FoodRowPlan)[] = [
  'owner_id', 'name', 'kcal', 'carbs_g', 'fiber_g', 'fat_g', 'protein_g',
  'state', 'cook_yield', 'pack_size_g', 'store_section', 'source', 'deleted_at',
]
const RECIPE_FIELDS: (keyof RecipeRowPlan)[] = [
  'owner_id', 'name', 'role', 'portions_per_batch', 'cook_minutes', 'steps',
  'kcal', 'carbs_g', 'fiber_g', 'fat_g', 'protein_g', 'deleted_at',
]
const LINE_FIELDS: (keyof LineRowPlan)[] = [
  'recipe_id', 'food_id', 'raw_text', 'grams_per_portion', 'state', 'note', 'sort_order',
]

/** What an import would do, for the preview. Reads only. */
export async function planWorkbook(preview: ImportPreview, ownerId: string): Promise<ImportPlan> {
  // Visible means the shared catalogue or the person's own, and not deleted.
  const visible = (r: { owner_id: string | null; deleted_at?: string | null }) =>
    !r.deleted_at && (!r.owner_id || r.owner_id === ownerId)
  const foods = (await db.food.toArray()).filter(visible)
  const recipes = (await db.recipe.toArray()).filter(visible)
  // The person's own foods first, so a line matches their "Oats" over the
  // catalogue's when both exist.
  const ordered = [...foods.filter((f) => f.owner_id === ownerId), ...foods.filter((f) => f.owner_id !== ownerId)]
  return planImport(preview, { foods: ordered, recipes }, ownerId, () => crypto.randomUUID(), new Date().toISOString())
}

/** Writes the plan locally and queues it for the server in one transaction,
 *  so the screens never show a recipe without its lines and no saved row can
 *  miss the queue, then sends the queue once.
 *
 *  The queue entries are written here rather than through queueChange, in
 *  exactly the shape it writes. queueChange starts a push after every row,
 *  and pushes do not wait for each other: an import of a few hundred rows
 *  would start a few hundred pushes, each sending every row it can see, which
 *  means tens of thousands of requests and a page of refused duplicates in
 *  the merges list. */
export async function saveWorkbook(preview: ImportPreview, ownerId: string): Promise<ImportSummary> {
  const plan = await planWorkbook(preview, ownerId)
  const lines = plan.recipes.flatMap((r) => r.lines)
  const at = new Date().toISOString()

  // Order matters: the server refuses a line whose recipe or food it does not
  // have yet, and the queue is sent in the order it was written. So foods
  // first, then each recipe followed by its own lines.
  const queue = [
    ...plan.foods.map((f) => pendingEntry('food', f, FOOD_FIELDS, at)),
    ...plan.recipes.flatMap(({ recipe, lines: own }) => [
      pendingEntry('recipe', recipe, RECIPE_FIELDS, at),
      ...own.map((l) => pendingEntry('recipe_line', l, LINE_FIELDS, at)),
    ]),
  ]

  await db.transaction('rw', [db.food, db.recipe, db.recipe_line, db.pending], async () => {
    // The plan rows carry server columns the local types do not list (source,
    // note, the stated recipe macros); they are kept so the insert sends them.
    if (plan.foods.length) await db.food.bulkPut(plan.foods as never[])
    if (plan.recipes.length) await db.recipe.bulkPut(plan.recipes.map((r) => r.recipe) as never[])
    if (lines.length) await db.recipe_line.bulkPut(lines as never[])
    if (queue.length) await db.pending.bulkAdd(queue)
  })

  if (queue.length && navigator.onLine) void push()

  return {
    foodsAdded: plan.foods.length,
    foodsExisting: plan.foodsExisting,
    recipesAdded: plan.recipes.length,
    recipesExisting: plan.recipesExisting,
    linesMatched: plan.linesMatched,
    linesUnmatched: plan.linesUnmatched,
    unmatched: plan.unmatched,
    exercises: plan.exercises,
  }
}
