/** A day's food as a share of the reference intake (FOOD-06): energy, fat,
 *  saturates, carbohydrate, sugars, protein and salt against an average
 *  adult's (Regulation (EU) No 1169/2011, Annex XIII part B: 8,400 kJ /
 *  2,000 kcal, 70 g fat, 20 g saturates, 260 g carbohydrate, 90 g sugars,
 *  50 g protein, 6 g salt). Pure, checked in src/test/dayri.check.mjs.
 *
 *  Each figure adds up what is known. A food or a quick entry without a
 *  figure (a quick entry never has salt) is counted, so the line can say
 *  "at least": an unknown is never read as nothing. */

import { figureOf, riPercent, type LabelKey } from './eu-label-rules.ts'
import { rawGrams } from './calc.ts'
import type { Food, RecipeLine } from './types'

export const RI_KEYS = ['kcal', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'protein_g', 'salt_g'] as const
export type RiKey = (typeof RI_KEYS)[number]

/** The short names a day's line uses. */
export const RI_NAMES: Record<RiKey, string> = {
  kcal: 'energy', fat_g: 'fat', sat_fat_g: 'saturates', carbs_g: 'carbohydrate', sugars_g: 'sugars', protein_g: 'protein', salt_g: 'salt',
}

/** One item of the day as the sum needs it. */
export interface RiItem {
  food_id?: string | null
  recipe_id?: string | null
  grams?: number | string | null
  portion_multiplier?: number | string | null
  status?: string | null
  /** A quick entry's own numbers. */
  kcal?: number | string | null
  protein_g?: number | string | null
  carbs_g?: number | string | null
  fat_g?: number | string | null
}

export interface DayRi {
  /** What is known of each figure. */
  total: Record<RiKey, number>
  /** How many items did not give the figure. */
  missing: Record<RiKey, number>
}

const zero = (): Record<RiKey, number> => ({ kcal: 0, fat_g: 0, sat_fat_g: 0, carbs_g: 0, sugars_g: 0, protein_g: 0, salt_g: 0 })
const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(x) ? x : null
}

/** A food's figures per 100 g, or null for each it does not give. */
function per100(f: Food): Record<RiKey, number | null> {
  const out = {} as Record<RiKey, number | null>
  for (const k of RI_KEYS) out[k] = figureOf(f as unknown as Record<string, unknown>, k as LabelKey)
  return out
}

/** What the day's live items come to (skipped ones are not eaten). */
export function dayRi(items: RiItem[], foods: Map<string, Food>, lines: Map<string, RecipeLine[]>): DayRi {
  const total = zero()
  const missing = zero()
  const add = (k: RiKey, v: number | null, times: number) => {
    if (v === null) missing[k]++
    else total[k] += v * times
  }
  for (const i of items) {
    if (i.status === 'skipped') continue
    if (i.food_id) {
      const f = foods.get(i.food_id)
      const g = n(i.grams) ?? 0
      if (!f) { for (const k of RI_KEYS) missing[k]++; continue }
      const per = per100(f)
      for (const k of RI_KEYS) add(k, per[k] === null ? null : (per[k]! * g) / 100, 1)
    } else if (i.recipe_id) {
      const ls = lines.get(i.recipe_id) ?? []
      const times = n(i.portion_multiplier) || 1
      // A recipe's lines are one portion; a figure a line's food lacks
      // leaves the recipe's figure unknown for the day too.
      const sum = zero()
      const gap = new Set<RiKey>()
      for (const l of ls) {
        const f = l.food_id ? foods.get(l.food_id) : undefined
        if (!f) continue
        const per = per100(f)
        const g = rawGrams(l, f)
        for (const k of RI_KEYS) {
          if (per[k] === null) gap.add(k)
          else sum[k] += (per[k]! * g) / 100
        }
      }
      for (const k of RI_KEYS) add(k, gap.has(k) ? null : sum[k], times)
    } else if (n(i.kcal) !== null) {
      // A quick entry: what was typed; saturates, sugars and salt unknown.
      for (const k of RI_KEYS) add(k, k === 'kcal' || k === 'protein_g' || k === 'carbs_g' || k === 'fat_g' ? n(i[k]) : null, 1)
    }
  }
  return { total, missing }
}

/** The day's line: "energy 64% · fat 51% · … · salt at least 40%". Figures
 *  nothing gave are left out; an empty day has no line. */
export function riLine(d: DayRi): string | null {
  const parts: string[] = []
  for (const k of RI_KEYS) {
    if (d.total[k] === 0 && d.missing[k] > 0) continue
    const pct = riPercent(k as LabelKey, d.total[k])
    if (pct === null || (d.total[k] === 0 && d.missing[k] === 0)) continue
    parts.push(`${RI_NAMES[k]} ${d.missing[k] ? 'at least ' : ''}${pct}%`)
  }
  return parts.length ? parts.join(' · ') : null
}
