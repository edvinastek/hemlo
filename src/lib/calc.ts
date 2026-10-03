/** The five calculations the whole app runs on (spec §6). Every number the
 *  user sees comes from here; nothing is typed in and stored. */

import type { Food, Profile, RecipeLine, Target } from './types'

export function ageFrom(birthDate: string | null, on = new Date()): number | null {
  if (!birthDate) return null
  // Read the date as a calendar day. new Date('1996-05-10') is midnight UTC,
  // which west of Greenwich is the 9th, so the age turned over a day late.
  const [y, mo, d] = birthDate.slice(0, 10).split('-').map(Number)
  if (!y || !mo || !d) return null
  let age = on.getFullYear() - y
  const m = on.getMonth() + 1 - mo
  if (m < 0 || (m === 0 && on.getDate() < d)) age--
  return age
}

/** Mifflin-St Jeor. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export const GOAL_ADJUSTMENT = { cut: -500, recomp: 0, bulk: 300 } as const
export type Goal = keyof typeof GOAL_ADJUSTMENT
export const PROTEIN_PER_KG: Record<Goal, number> = { cut: 2.2, recomp: 1.9, bulk: 1.7 }
export const FAT_SHARE = 0.27

/** The numbers behind the targets that a person may change (BODY-03): the
 *  goal's adjustment, protein per kg for each goal, and fat's share of the
 *  budget. The defaults stay the app's. */
export interface BodyPlan {
  adjust: Record<Goal, number>
  protein: Record<Goal, number>
  fat_share: number
}
export const DEFAULT_PLAN: BodyPlan = { adjust: { ...GOAL_ADJUSTMENT }, protein: { ...PROTEIN_PER_KG }, fat_share: FAT_SHARE }

/** The limits a changed number must keep to: a cut takes off, a bulk adds,
 *  recomp stays near maintenance; protein 1 to 3 g per kg; fat 15–45%. */
export const PLAN_LIMITS = {
  adjust: { cut: [-1000, 0], recomp: [-300, 300], bulk: [0, 1000] } as Record<Goal, [number, number]>,
  protein: [1, 3] as [number, number],
  fat_share: [0.15, 0.45] as [number, number],
}

/** A stored plan, every number checked; anything out of bounds takes the
 *  default, so an odd value can never produce odd targets. */
export function readPlan(v: unknown): BodyPlan {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, Record<string, unknown> | unknown>
  const within = (x: unknown, [lo, hi]: [number, number], d: number) => {
    const n = Number(x)
    return x !== null && x !== undefined && x !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : d
  }
  const goals: Goal[] = ['cut', 'recomp', 'bulk']
  const adj = (r.adjust ?? {}) as Record<string, unknown>
  const pro = (r.protein ?? {}) as Record<string, unknown>
  return {
    adjust: Object.fromEntries(goals.map((g) => [g, Math.round(within(adj[g], PLAN_LIMITS.adjust[g], GOAL_ADJUSTMENT[g]))])) as Record<Goal, number>,
    protein: Object.fromEntries(goals.map((g) => [g, Math.round(within(pro[g], PLAN_LIMITS.protein, PROTEIN_PER_KG[g]) * 100) / 100])) as Record<Goal, number>,
    fat_share: Math.round(within(r.fat_share, PLAN_LIMITS.fat_share, FAT_SHARE) * 100) / 100,
  }
}

export function calorieBudget(p: {
  weightKg: number; heightCm: number; age: number
  sex: 'male' | 'female'; activity: number; goal: Goal
  /** The goal's adjustment, when the person changed it (BODY-03). */
  adjust?: number
}): { bmr: number; maintenance: number; target: number } {
  const b = bmr(p.weightKg, p.heightCm, p.age, p.sex)
  const maintenance = b * p.activity
  return {
    bmr: Math.round(b),
    maintenance: Math.round(maintenance),
    target: Math.round(maintenance + (p.adjust ?? GOAL_ADJUSTMENT[p.goal])),
  }
}

/** Protein follows body weight and goal; fat takes a share of the budget;
 *  carbohydrate is whatever the budget has left. Never typed in by hand. */
export function macroSplit(
  targetKcal: number,
  weightKg: number,
  goal: Goal,
  plan: Pick<BodyPlan, 'protein' | 'fat_share'> = DEFAULT_PLAN,
): { protein_g: number; fat_g: number; carbs_g: number; fiber_g: number } {
  const proteinPerKg = plan.protein[goal]
  const protein_g = Math.round(weightKg * proteinPerKg)
  const fat_g = Math.round((targetKcal * plan.fat_share) / 9)
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

/** What the targets need from the profile that it does not have. Without
 *  these the targets are not worked out at all (BODY-05): no guessed
 *  height, age or sex behind numbers that look precise. */
export function missingForCalc(p: Pick<Profile, 'sex' | 'height_cm' | 'birth_date'>): ('sex' | 'height' | 'birth_date')[] {
  const out: ('sex' | 'height' | 'birth_date')[] = []
  if (p.sex !== 'male' && p.sex !== 'female') out.push('sex')
  const h = Number(p.height_cm)
  if (!p.height_cm || !Number.isFinite(h) || h <= 0) out.push('height')
  if (!p.birth_date || ageFrom(p.birth_date) === null) out.push('birth_date')
  return out
}

export interface Targets { kcal: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number; explain: string }

/** Targets for a profile on a given day, from the most recent weight, or
 *  null when the profile lacks what they need (missingForCalc). `why` says
 *  what led to them ("after the activity changed"); `trainingAdded` that the
 *  factor leaves training out, to be added on the day (BODY-16). */
export function targetsFor(
  profile: Pick<Profile, 'sex' | 'height_cm' | 'birth_date' | 'activity_level' | 'goal'>,
  weightKg: number,
  on = new Date(),
  opts: { plan?: BodyPlan; why?: string; trainingAdded?: boolean } = {},
): Targets | null {
  if (missingForCalc(profile).length) return null
  const age = ageFrom(profile.birth_date, on)
  if (age === null) return null
  const plan = opts.plan ?? DEFAULT_PLAN
  const activity = Number(profile.activity_level)
  const adjust = plan.adjust[profile.goal]
  const { target, bmr: b, maintenance } = calorieBudget({
    weightKg, heightCm: Number(profile.height_cm), age, sex: profile.sex as 'male' | 'female', activity, goal: profile.goal, adjust,
  })
  const split = macroSplit(target, weightKg, profile.goal, plan)
  const signed = adjust === 0 ? '' : ` (${adjust > 0 ? '+' : '−'}${Math.abs(adjust)})`
  const parts = [
    `from ${weightKg} kg`, `plan ${profile.goal}${signed}`, `BMR ${b} × ${Math.round(activity * 100) / 100} = ${maintenance}`,
    opts.trainingAdded ? 'training not included: add it on the day' : null, opts.why ?? null,
  ].filter(Boolean)
  // Shown with the number, so nothing looks like a magic figure.
  return { kcal: target, ...split, explain: parts.join(' · ') }
}
