/** The activity factors a person can pick, each with the number shown, so the
 *  step from a desk job to a very active one is visible rather than guessed.
 *  The factor multiplies the resting burn (BMR) to give maintenance. Pure. */

export interface ActivityLevel { value: number; label: string }

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  { value: 1.2, label: 'desk job, little walking' },
  { value: 1.3, label: 'desk job, a daily walk' },
  { value: 1.375, label: 'light exercise 1 to 3 days a week' },
  { value: 1.45, label: 'on your feet part of the day' },
  { value: 1.5, label: 'desk job and hard training most days' },
  { value: 1.55, label: 'moderate exercise 3 to 5 days a week' },
  { value: 1.65, label: 'on your feet all day: shop, warehouse, care' },
  { value: 1.725, label: 'hard exercise 6 or 7 days a week' },
  { value: 1.8, label: 'physical job and regular training' },
  { value: 1.9, label: 'heavy manual work, or training twice a day' },
]

/** The listed level closest to a stored factor, so an older typed-in value
 *  (1.6, say) still shows as a choice instead of an empty picker. */
export function nearestActivity(value: number | null | undefined): number {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return 1.375
  return ACTIVITY_LEVELS.reduce((best, l) => (Math.abs(l.value - v) < Math.abs(best - v) ? l.value : best), ACTIVITY_LEVELS[0].value)
}
