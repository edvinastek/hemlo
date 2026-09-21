/** The five calculations the whole app runs on (spec §6). Every number the
 *  user sees comes from here; nothing is typed in and stored. */

import type { Food, Profile, RecipeLine, Target } from './types'

export const ACTIVITY = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const

export function ageFrom(birthDate: string | null, on = new Date()): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  let age = on.getFullYear() - b.getFullYear()
  const m = on.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--
  return age
}

/** Mifflin-St Jeor. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export const GOAL_ADJUSTMENT = { cut: -500, recomp: 0, bulk: 300 } as const

export function calorieBudget(p: {
  weightKg: number; heightCm: number; age: number
  sex: 'male' | 'female'; activity: number; goal: keyof typeof GOAL_ADJUSTMENT
}): { bmr: number; maintenance: number; target: number } {
  const b = bmr(p.weightKg, p.heightCm, p.age, p.sex)
  const maintenance = b * p.activity
  return {
    bmr: Math.round(b),
    maintenance: Math.round(maintenance),
    target: Math.round(maintenance + GOAL_ADJUSTMENT[p.goal]),
  }
}

/** Protein follows body weight and goal; fat takes a share of the budget;
 *  carbohydrate is whatever the budget has left. Never typed in by hand. */
export function macroSplit(
  targetKcal: number,
  weightKg: number,
  goal: keyof typeof GOAL_ADJUSTMENT,
): { protein_g: number; fat_g: number; carbs_g: number; fiber_g: number } {
  const proteinPerKg = goal === 'cut' ? 2.2 : goal === 'recomp' ? 1.9 : 1.7
  const protein_g = Math.round(weightKg * proteinPerKg)
  const fat_g = Math.round((targetKcal * 0.27) / 9)
  const carbs_g = Math.max(0, Math.round((targetKcal - protein_g * 4 - fat_g * 9) / 4))
  const fiber_g = Math.round((targetKcal / 1000) * 14)
  return { protein_g, fat_g, carbs_g, fiber_g }
}

export interface Macros { kcal: number; carbs_g: number; fiber_g: number; fat_g: number; protein_g: number }

const ZERO: Macros = { kcal: 0, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 }

/** A line may be written as a cooked weight while the catalogue stores the
 *  food raw, so it is converted back before the per-100g values are applied.
 *  Foods already held on a cooked basis carry cook_yield 1 and pass through. */
export function rawGrams(line: RecipeLine, food: Food | undefined): number {
  const g = line.grams_per_portion ?? 0
  if (!food) return g
  const y = food.cook_yield ?? 0
  return line.state === 'cooked' && y > 0 ? g / y : g
}

export function recipeMacros(lines: RecipeLine[], foods: Map<string, Food>): Macros {
  return lines.reduce<Macros>((acc, line) => {
    const food = line.food_id ? foods.get(line.food_id) : undefined
    if (!food) return acc
    const factor = rawGrams(line, food) / 100
    return {
      kcal: acc.kcal + (food.kcal ?? 0) * factor,
      carbs_g: acc.carbs_g + (food.carbs_g ?? 0) * factor,
      fiber_g: acc.fiber_g + (food.fiber_g ?? 0) * factor,
      fat_g: acc.fat_g + (food.fat_g ?? 0) * factor,
      protein_g: acc.protein_g + (food.protein_g ?? 0) * factor,
    }
  }, { ...ZERO })
}

/** Main-meal sizing: the fixed meals of the day are counted first, and the
 *  rotating main meal is scaled to close whatever gap is left against the
 *  target. This is what keeps a recipe whose portions were written small from
 *  quietly under-feeding the day. */
export function mealMultiplier(
  target: Pick<Target, 'kcal' | 'protein_g'>,
  fixed: Macros,
  mainPerPortion: Macros,
  opts: { by?: 'kcal' | 'protein'; min?: number; max?: number } = {},
): number {
  const by = opts.by ?? 'kcal'
  const min = opts.min ?? 0.5
  const max = opts.max ?? 3
  const goal = by === 'kcal' ? target.kcal ?? 0 : target.protein_g ?? 0
  const have = by === 'kcal' ? fixed.kcal : fixed.protein_g
  const per = by === 'kcal' ? mainPerPortion.kcal : mainPerPortion.protein_g
  if (per <= 0) return 1
  return Math.min(max, Math.max(min, (goal - have) / per))
}

/** Shopping: what the plan needs, less what is already in the cupboard,
 *  rounded up to whole packs. */
export function shoppingQuantity(
  neededG: number,
  stockG: number,
  packSizeG: number | null,
): { toBuyG: number; packs: number | null } {
  const toBuyG = Math.max(0, neededG - stockG)
  if (!packSizeG || packSizeG <= 0) return { toBuyG, packs: null }
  return { toBuyG, packs: Math.ceil(toBuyG / packSizeG) }
}

/** Targets for a profile on a given day, from the most recent weight. */
export function targetsFor(
  profile: Profile,
  weightKg: number,
  on = new Date(),
): { kcal: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number; explain: string } {
  const age = ageFrom(profile.birth_date, on) ?? 30
  const sex = profile.sex ?? 'male'
  const { target, bmr: b, maintenance } = calorieBudget({
    weightKg,
    heightCm: profile.height_cm ?? 175,
    age,
    sex,
    activity: profile.activity_level,
    goal: profile.goal,
  })
  const split = macroSplit(target, weightKg, profile.goal)
  return {
    kcal: target,
    ...split,
    // Shown with the number, so nothing looks like a magic figure.
    explain: `from ${weightKg} kg · plan ${profile.goal} · BMR ${b} × ${profile.activity_level} = ${maintenance}`,
  }
}
