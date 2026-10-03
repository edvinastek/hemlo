import { format } from 'date-fns'
import { db } from './db'
import { queueChange } from './sync'
import { recipeMacros, type Macros as CalcMacros } from './calc'
import { blankTask, saveTask } from './tasks'
import { readSettings, type ProfileSettings } from './settings'
import { isQuick } from './quick-food'
import { consumeForMeal } from './stock'
import { useApp } from './store'
import {
  copyItems, groupDay, groupKey, groupRef, isContent, itemKind, itemTime, minutesOf, nextSort, taskStatus, taskTitle,
  type FoodFacts, type Lookup, type Macros, type MealGroup, type MealsCtx, type RecipeFacts,
} from './meal-rules'
import { builtinRuleOn } from '../modules/rule-switch'
import type { Food, FoodLogEntry, MealPlanSlot, Recipe, RecipeLine, Task } from './types'

/** The day's food, written. The rules (what a meal is, what it comes to,
 *  its task) are in meal-rules.ts; this file reads and writes the local copy
 *  and queues every change for the server, like the rest of the app.
 *
 *  One row of meal_plan_slot is one item: a food and how much, a recipe and
 *  how many portions, or plain numbers. Items sharing a meal label (or with
 *  none, a time) make one meal. Eating an item logs it in food_log under the
 *  item's own id, so unticking, correcting and ticking again always reach
 *  exactly that log. Each meal has one task on Today (when the Nutrition rule
 *  "every planned meal becomes a task" is on), found again by an id worked
 *  out from the day and the meal; ticking either side ticks both (GEN-31). */

const SLOT_FIELDS: (keyof MealPlanSlot & string)[] = [
  'profile_id', 'slot_date', 'slot', 'recipe_id', 'food_id', 'portion_multiplier', 'status', 'slot_time', 'sort_order',
  'label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'grams', 'deleted_at',
]
const LOG_FIELDS: (keyof FoodLogEntry & string)[] = [
  'profile_id', 'log_date', 'log_time', 'food_id', 'recipe_id', 'grams', 'portions', 'planned',
  'label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'deleted_at',
]
const NO_NUMBERS = { label: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null }

/** The unit columns go with a row only when it has them (set, or cleared
 *  from a unit it had), so a server without them (before 022) still takes
 *  every row that was not counted in a unit. */
const unitKeys = (row: { unit?: unknown; unit_qty?: unknown }): ('unit' | 'unit_qty')[] =>
  row.unit !== undefined || row.unit_qty !== undefined ? ['unit', 'unit_qty'] : []

const now = () => new Date().toISOString()
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

/** What the meal rules need from a person's settings. */
export const mealsCtx = (s: ProfileSettings): MealsCtx => ({ meals: s.meals, meal_times: s.meal_times })

async function ctxFor(profileId: string): Promise<MealsCtx> {
  return mealsCtx(readSettings(await db.profile.get(profileId)))
}

/** Where the rules look foods and recipes up, from rows already loaded. */
export function makeLookup(foods: Iterable<Food>, recipes: Iterable<Recipe>, lines: RecipeLine[]): Lookup {
  const foodMap = new Map<string, FoodFacts>()
  const full = new Map<string, Food>()
  for (const f of foods) { foodMap.set(f.id, f); full.set(f.id, f) }
  const recipeMap = new Map<string, RecipeFacts>()
  for (const r of recipes) recipeMap.set(r.id, r)
  const byRecipe = new Map<string, RecipeLine[]>()
  for (const l of lines) byRecipe.set(l.recipe_id, [...(byRecipe.get(l.recipe_id) ?? []), l])
  const cache = new Map<string, Macros | null>()
  return {
    foods: foodMap, recipes: recipeMap,
    perPortion: (id) => {
      if (!cache.has(id)) {
        const ls = byRecipe.get(id)
        cache.set(id, recipeMap.has(id) && ls ? (recipeMacros(ls, full) as Macros) : recipeMap.has(id) ? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 } : null)
      }
      return cache.get(id)!
    },
  }
}

async function loadLookup(): Promise<Lookup> {
  const [foods, recipes, lines] = await Promise.all([db.food.toArray(), db.recipe.toArray(), db.recipe_line.toArray()])
  return makeLookup(foods, recipes, lines)
}

/** A day's items, live ones only. */
export async function slotsFor(profileId: string, day: string): Promise<MealPlanSlot[]> {
  return (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => s.slot_date === day && !s.deleted_at)
}

/** Everything the person has eaten or planned, for "Recent" and go-tos. */
export async function itemHistory(profileId: string): Promise<MealPlanSlot[]> {
  return (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && isContent(s))
}

async function saveSlot(slot: MealPlanSlot, fields: (keyof MealPlanSlot & string)[] = SLOT_FIELDS) {
  const row = { ...slot, updated_at: now() }
  await db.meal_plan_slot.put(row)
  await queueChange('meal_plan_slot', row, [...fields, ...unitKeys(row)])
  return row
}

function newSlot(profileId: string, day: string, fields: Partial<MealPlanSlot>): MealPlanSlot {
  return {
    id: crypto.randomUUID(), profile_id: profileId, slot_date: day, slot: '', recipe_id: null, food_id: null,
    portion_multiplier: 1, status: 'planned', slot_time: null, sort_order: 0, ...NO_NUMBERS, grams: null,
    updated_at: now(), deleted_at: null, ...fields,
  }
}

/* ---------- eaten: the food log ----------------------------------------------- */

/** Log an eaten item under its own id: a food by its id and grams (so later
 *  corrections to the food carry through, MEAL-16), a recipe by its portions
 *  (worked out live from its lines), plain numbers as they are. */
async function logItem(row: MealPlanSlot, ctx: MealsCtx) {
  const kind = itemKind(row)
  if (kind === 'empty') return
  const log: FoodLogEntry = {
    id: row.id, profile_id: row.profile_id, log_date: row.slot_date, log_time: itemTime(row, ctx),
    food_id: kind === 'food' ? row.food_id! : null,
    recipe_id: kind === 'recipe' ? row.recipe_id : null,
    grams: kind === 'recipe' ? null : row.grams ?? null,
    portions: kind === 'recipe' ? row.portion_multiplier : 1,
    planned: true,
    ...(kind === 'quick'
      ? { label: row.label ?? null, kcal: row.kcal ?? null, protein_g: row.protein_g ?? null, carbs_g: row.carbs_g ?? null, fat_g: row.fat_g ?? null, fiber_g: row.fiber_g ?? null }
      : NO_NUMBERS),
    // What was eaten in a unit is logged in it too.
    ...(unitKeys(row).length ? { unit: kind === 'recipe' ? null : row.unit ?? null, unit_qty: kind === 'recipe' ? null : row.unit_qty ?? null } : {}),
    updated_at: now(), deleted_at: null,
  }
  await db.food_log.put(log)
  await queueChange('food_log', log, [...LOG_FIELDS, ...unitKeys(log)])
}

/** Take an item's log back. Logs from before items had their own (a recipe
 *  logged under a random id) are found by recipe and day, so an old eaten
 *  meal can still be unticked. */
async function unlogItem(row: MealPlanSlot) {
  const logs = (await db.food_log.where('profile_id').equals(row.profile_id).toArray())
    .filter((l) => l.log_date === row.slot_date && !l.deleted_at)
  let mine = logs.filter((l) => l.id === row.id)
  if (!mine.length && row.recipe_id) {
    const others = new Set((await slotsFor(row.profile_id, row.slot_date)).map((s) => s.id))
    mine = logs.filter((l) => l.recipe_id === row.recipe_id && !others.has(l.id)).slice(0, 1)
  }
  for (const l of mine) {
    const gone = { ...l, deleted_at: now(), updated_at: now() }
    await db.food_log.put(gone)
    await queueChange('food_log', gone, ['deleted_at'])
  }
}

/** Eaten or not, one item at a time, with stock following when the person
 *  switched that on (stock.ts decides; a recipe's ingredients only). */
async function eatOne(row: MealPlanSlot, eaten: boolean, ctx: MealsCtx): Promise<MealPlanSlot> {
  if (!isContent(row)) return row
  if ((row.status === 'eaten') === eaten && row.status !== 'skipped') {
    // Already so; make sure the log agrees (a log lost on another device).
    if (eaten) await logItem(row, ctx)
    return row
  }
  await consumeForMeal(row, eaten ? 1 : -1)
  const saved = await saveSlot({ ...row, status: eaten ? 'eaten' : 'planned' }, ['status'])
  if (eaten) await logItem(saved, ctx)
  else await unlogItem(row)
  return saved
}

/* ---------- the meal's task on Today ---------------------------------------------- */

/** Bring a day's meal tasks in step with its meals: one task per meal with
 *  something in it, titled from what is in it, ticked when all of it is
 *  eaten; none for a skipped meal. `oldKeys` are meals the change just
 *  emptied or renamed, whose tasks go. `retime` are meals whose time just
 *  changed: their tasks move with them. Otherwise a task keeps its time, so
 *  a push made on Today is never undone by ticking a meal eaten. */
export async function syncDayTasks(profileId: string, day: string, opts: { oldKeys?: string[]; retime?: string[] } = {}) {
  const ctx = await ctxFor(profileId)
  const all = (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray()).filter((s) => s.slot_date === day)
  const groups = groupDay(all, { ...ctx, meals: { ...ctx.meals, cards: false } })
  const on = await builtinRuleOn(profileId, 'nutrition', 'meal_tasks')
  const tasks = (await db.task.where('profile_id').equals(profileId).toArray()).filter((t) => t.source === 'meal')
  const look = await loadLookup()
  const used = new Set<string>()

  for (const g of groups) {
    const ref = groupRef(profileId, day, g.key)
    const ids = new Set([...g.items, ...g.holders].map((i) => i.id))
    // Its task, or a task from before meals had refs (it pointed at an item).
    const existing = tasks.find((t) => t.source_ref === ref) ?? tasks.find((t) => !!t.source_ref && ids.has(t.source_ref) && !used.has(t.id))
    if (existing) used.add(existing.id)
    const live = existing && !existing.deleted_at ? existing : null
    const status = taskStatus(g, live?.status ?? null)
    if (!on || status === null) {
      // Off, a meal already eaten keeps its ticked task as a record of the day.
      if (live && (on || live.status !== 'done')) await saveTask({ ...live, deleted_at: now() }, ['deleted_at'])
      continue
    }
    const title = taskTitle(g, look)
    const done = status === 'done'
    if (existing) {
      const revive = !!existing.deleted_at
      const setTime = revive || (opts.retime ?? []).includes(g.key)
      const next: Task = {
        ...existing, title, source_ref: ref, status: status as Task['status'], deleted_at: null,
        completed_at: done ? existing.completed_at ?? now() : null,
        ...(revive ? { planned_date: day } : {}),
        ...(setTime ? { planned_time: g.time } : {}),
      }
      const changed = (['title', 'source_ref', 'status', 'deleted_at', 'completed_at', 'planned_date', 'planned_time'] as const)
        .filter((k) => next[k] !== existing[k])
      if (changed.length) await saveTask(next, [...changed])
    } else {
      await saveTask(blankTask(profileId, day, {
        title, category: 'Meal', planned_time: g.time, duration_min: 20,
        source: 'meal', source_ref: ref, module_key: 'nutrition', status: status as Task['status'],
        completed_at: done ? now() : null,
      }))
    }
  }

  // Tasks of meals that are no longer there: ones the change just emptied,
  // and old tasks pointing at an item of this day that has gone.
  const stale = new Set([...(opts.oldKeys ?? []).map((k) => groupRef(profileId, day, k)), ...all.filter((s) => s.deleted_at).map((s) => s.id)])
  for (const t of tasks) {
    if (used.has(t.id) || t.deleted_at || !t.source_ref || !stale.has(t.source_ref)) continue
    if (on || t.status !== 'done') await saveTask({ ...t, deleted_at: now() }, ['deleted_at'])
  }
}

/** After the meal-task rule is switched on or off: every day from today on
 *  gets its meals' tasks back, or loses them. Past days stay as they were. */
export async function syncMealTasks(profileId: string) {
  const today = todayStr()
  const days = new Set((await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => s.slot_date >= today).map((s) => s.slot_date))
  for (const d of [...days].sort()) await syncDayTasks(profileId, d)
}

/** After a meal's default time changes: from today on, a meal that follows
 *  the default (no time of its own) moves with it, and its task too, unless
 *  the task was moved by hand on Today. */
export async function retimeMeals(profileId: string, before: ProfileSettings, after: ProfileSettings) {
  const today = todayStr()
  const rows = (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && s.slot_date >= today)
  if (!rows.length) return
  const tasks = (await db.task.where('profile_id').equals(profileId).toArray()).filter((t) => t.source === 'meal' && !t.deleted_at)
  const days = [...new Set(rows.map((r) => r.slot_date))]
  for (const day of days) {
    const onDay = rows.filter((r) => r.slot_date === day)
    const was = groupDay(onDay, mealsCtx(before))
    const now = groupDay(onDay, mealsCtx(after))
    for (const g of now) {
      const old = was.find((w) => w.key === g.key)
      if (!old || old.time === g.time || !g.meal) continue
      const task = tasks.find((t) => t.source_ref === groupRef(profileId, day, g.key))
      if (!task || (task.planned_time?.slice(0, 5) ?? null) !== old.time) continue
      await saveTask({ ...task, planned_time: g.time }, ['planned_time'])
    }
  }
}

/** Ticking a meal's task (on Today, Plan or the widget) eats the meal, and
 *  unticking un-eats it (GEN-31). Called from setTaskDone in tasks.ts. */
export async function mealTaskTicked(task: Task, done: boolean) {
  if (task.source !== 'meal' || !task.source_ref) return
  const ctx = await ctxFor(task.profile_id)
  const rows = (await db.meal_plan_slot.where('profile_id').equals(task.profile_id).toArray()).filter((s) => !s.deleted_at)
  // A task from before meals had refs points at one of its items.
  const direct = rows.find((r) => r.id === task.source_ref)
  const byDay = new Map<string, MealPlanSlot[]>()
  for (const r of rows) byDay.set(r.slot_date, [...(byDay.get(r.slot_date) ?? []), r])
  // The task's own day first: that is nearly always where its meal is.
  const days = direct ? [direct.slot_date] : [...byDay.keys()].sort((a, b) => (a === task.planned_date ? -1 : b === task.planned_date ? 1 : 0))
  for (const day of days) {
    const groups = groupDay(byDay.get(day) ?? [], ctx)
    const g = direct
      ? groups.find((x) => x.items.some((i) => i.id === direct.id))
      : groups.find((x) => groupRef(task.profile_id, day, x.key) === task.source_ref)
    if (!g) continue
    await setEaten(g.items.filter((i) => i.status !== 'skipped') as MealPlanSlot[], done)
    return
  }
}

/* ---------- writing items ----------------------------------------------------------- */

/** Where new items go: a meal label ('' for none) and a time (null for none,
 *  or the meal's own default when it has one). */
export interface Target { meal: string; time: string | null }

/** Add items to a day's meal in one go (the plate), eaten or planned. A
 *  holder row that only kept the meal's time or its "skipped" gives way to
 *  real items, its time going on to them. Returns the rows made, for Undo. */
export async function addItems(profileId: string, day: string, target: Target, items: Partial<MealPlanSlot>[], eaten: boolean): Promise<MealPlanSlot[]> {
  if (!items.length) return []
  const ctx = await ctxFor(profileId)
  const rows = await slotsFor(profileId, day)
  const key = groupKey({ slot: target.meal, slot_time: target.time })
  const there = rows.filter((r) => groupKey(r) === key || (target.meal && r.slot === target.meal))
  const holders = there.filter((r) => !isContent(r))
  const content = there.filter(isContent)
  // A meal has one time on a day: added to a meal already there, new items
  // take its time (the meal's card changes it for all of them).
  const time = target.meal && content.length ? content[0].slot_time ?? null : target.time ?? holders.map((h) => h.slot_time).find(Boolean) ?? null
  let sort = nextSort(there)
  const made: MealPlanSlot[] = []
  for (const fields of items) {
    const row = newSlot(profileId, day, { ...fields, slot: target.meal, slot_time: time, sort_order: sort++, status: 'planned' })
    const saved = await saveSlot(row)
    made.push(eaten ? await eatOne(saved, true, ctx) : saved)
  }
  for (const h of holders) await saveSlot({ ...h, deleted_at: now() }, ['deleted_at'])
  await syncDayTasks(profileId, day)
  return made
}

/** Change an item: its amount, portions, numbers, or what it is. An eaten
 *  item's log follows (and its stock, for a recipe's portions). */
export async function updateItem(row: MealPlanSlot, changes: Partial<MealPlanSlot>): Promise<MealPlanSlot> {
  const ctx = await ctxFor(row.profile_id)
  const eaten = row.status === 'eaten'
  if (eaten && row.recipe_id) await consumeForMeal(row, -1)
  const next = { ...row, ...changes }
  const saved = await saveSlot(next)
  if (eaten) {
    if (row.recipe_id) await consumeForMeal({ ...saved, status: 'planned' }, 1)
    if (isContent(saved)) await logItem(saved, ctx)
    else await unlogItem(row)
  }
  await syncDayTasks(row.profile_id, row.slot_date)
  return saved
}

/** Take items off their day. Eaten ones are un-logged (and stock given back).
 *  Undo with restoreItems. */
export async function removeItems(rows: MealPlanSlot[]): Promise<void> {
  if (!rows.length) return
  const keys = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.status === 'eaten') {
      await consumeForMeal(row, -1)
      await unlogItem(row)
    }
    await saveSlot({ ...row, deleted_at: now() }, ['deleted_at'])
    keys.set(row.slot_date, (keys.get(row.slot_date) ?? new Set()).add(groupKey(row)))
  }
  for (const [day, k] of keys) await syncDayTasks(rows[0].profile_id, day, { oldKeys: [...k] })
}

/** Put items back exactly as they were before removeItems (Undo). */
export async function restoreItems(rows: MealPlanSlot[]): Promise<void> {
  if (!rows.length) return
  const ctx = await ctxFor(rows[0].profile_id)
  for (const row of rows) {
    const saved = await saveSlot({ ...row, deleted_at: null })
    if (row.status === 'eaten') {
      await consumeForMeal({ ...saved, status: 'planned' }, 1)
      await logItem(saved, ctx)
    }
  }
  for (const day of new Set(rows.map((r) => r.slot_date))) await syncDayTasks(rows[0].profile_id, day)
}

/** Eaten or not, for one item or a whole meal. */
export async function setEaten(rows: MealPlanSlot[], eaten: boolean): Promise<void> {
  if (!rows.length) return
  const ctx = await ctxFor(rows[0].profile_id)
  for (const row of rows) await eatOne(row, eaten, ctx)
  for (const day of new Set(rows.map((r) => r.slot_date))) await syncDayTasks(rows[0].profile_id, day)
}

/** Skip a meal (MEAL-06), or take the skip back. Skipped, its items are not
 *  eaten, it has no task, and the shopping list leaves it out. An empty meal
 *  can be skipped too ("no breakfast today"): a row holds the skip. */
export async function setSkipped(profileId: string, day: string, group: Pick<MealGroup, 'meal' | 'key' | 'items' | 'holders' | 'time'>, skipped: boolean): Promise<void> {
  const ctx = await ctxFor(profileId)
  const items = group.items as MealPlanSlot[]
  const holders = group.holders as MealPlanSlot[]
  if (skipped) {
    for (const i of items) {
      if (i.status === 'eaten') await eatOne(i, false, ctx)
      await saveSlot({ ...i, status: 'skipped' }, ['status'])
    }
    if (!items.length && !holders.length && group.meal) {
      await saveSlot(newSlot(profileId, day, { slot: group.meal, status: 'skipped', sort_order: 0 }))
    }
    for (const h of holders) await saveSlot({ ...h, status: 'skipped' }, ['status'])
  } else {
    for (const i of items) await saveSlot({ ...i, status: 'planned' }, ['status'])
    // A row kept only for the skip goes; one that also holds a time stays.
    for (const h of holders) await saveSlot(h.slot_time ? { ...h, status: 'planned' } : { ...h, deleted_at: now() }, h.slot_time ? ['status'] : ['deleted_at'])
  }
  await syncDayTasks(profileId, day, { retime: skipped ? [] : [group.key] })
}

/** Give a meal a time on its day, or clear the one it had (it then follows
 *  its default, if it has one). A meal of the person's with nothing in it
 *  yet can hold a time too. */
export async function setMealTime(profileId: string, day: string, group: Pick<MealGroup, 'meal' | 'key' | 'items' | 'holders'>, time: string | null): Promise<void> {
  const rows = [...group.items, ...group.holders] as MealPlanSlot[]
  if (!rows.length) {
    if (time && group.meal) await saveSlot(newSlot(profileId, day, { slot: group.meal, slot_time: time }))
  } else {
    for (const r of rows) {
      // A row kept only for a time, cleared, has nothing left to hold.
      if (!time && !isContent(r) && r.status !== 'skipped') await saveSlot({ ...r, deleted_at: now() }, ['deleted_at'])
      else await saveSlot({ ...r, slot_time: time }, ['slot_time'])
    }
  }
  const newKey = groupKey({ slot: group.meal, slot_time: time })
  await syncDayTasks(profileId, day, { oldKeys: newKey !== group.key ? [group.key] : [], retime: [newKey] })
}

/** Move items to another meal (or none), or another time, on the same day. */
export async function moveItems(rows: MealPlanSlot[], target: Target): Promise<void> {
  if (!rows.length) return
  const { profile_id: profileId, slot_date: day } = rows[0]
  const key = groupKey({ slot: target.meal, slot_time: target.time })
  const ids = new Set(rows.map((r) => r.id))
  let sort = nextSort((await slotsFor(profileId, day)).filter((r) => !ids.has(r.id) && groupKey(r) === key))
  const oldKeys = new Set<string>()
  for (const r of rows) {
    oldKeys.add(groupKey(r))
    await saveSlot({ ...r, slot: target.meal, slot_time: target.time, sort_order: sort++ }, ['slot', 'slot_time', 'sort_order'])
  }
  oldKeys.delete(key)
  await syncDayTasks(profileId, day, { oldKeys: [...oldKeys], retime: [key] })
}

/** Put a meal's items in a new order (top to bottom). */
export async function reorderItems(rows: MealPlanSlot[]): Promise<void> {
  for (const [i, r] of rows.entries()) if ((r.sort_order ?? 0) !== i) await saveSlot({ ...r, sort_order: i }, ['sort_order'])
  if (rows.length) await syncDayTasks(rows[0].profile_id, rows[0].slot_date)
}

/** Copy meals to other days (MEAL-07): 'all' for the whole day, or a list of
 *  meal keys ('m:lunch', 't:15:00', 'any'). They arrive planned, in the same
 *  meals at the same times, after anything already there. The Food page,
 *  the add sheet and the Plan's copy dialog all copy through this, so a meal
 *  copies the same way everywhere. Returns the rows made (remove them with
 *  removeItems to undo). */
export async function copyMeals(fromDay: string, toDays: string[], which: 'all' | string[] = 'all', profileId?: string): Promise<MealPlanSlot[]> {
  const pid = profileId ?? useApp.getState().profile?.id
  if (!pid) return []
  const ctx = await ctxFor(pid)
  const groups = groupDay(await slotsFor(pid, fromDay), { ...ctx, meals: { ...ctx.meals, cards: false } })
  const made: MealPlanSlot[] = []
  for (const day of toDays) {
    if (day === fromDay) continue
    const rows = copyItems(groups, which, day, await slotsFor(pid, day), ctx, () => crypto.randomUUID())
    for (const r of rows) made.push(await saveSlot({ ...newSlot(pid, day, {}), ...(r as Partial<MealPlanSlot>), profile_id: pid }))
    if (rows.length) await syncDayTasks(pid, day)
  }
  return made
}

/** The figures of a recipe's one portion, from lines already loaded. */
export function macrosFor(recipeId: string, lines: { recipe_id: string }[], foods: Map<string, Food>): CalcMacros {
  return recipeMacros(lines.filter((l) => l.recipe_id === recipeId) as never, foods)
}

/** Whether an item is plain numbers (kept for the screens that ask). */
export { isQuick }

/** Minutes past midnight of "HH:MM" (for sorting by time on screens). */
export { minutesOf }
