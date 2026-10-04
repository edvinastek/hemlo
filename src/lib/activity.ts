/** How active a person is, for the calorie budget (BODY-10 to BODY-16). The
 *  activity factor (PAL) multiplies the resting burn (BMR) to give
 *  maintenance. Two short questions (work, training) lead to one of nine
 *  lifestyle presets built on FAO/WHO/UNU 2001 and EFSA 2013 (requirements
 *  Part H5); each shows its factor, an example day and a step range. A
 *  factor can still be typed. Pure: checked in src/test/activity.check.mjs. */

export type Work = 'resting' | 'sitting' | 'standing' | 'physical' | 'heavy'
export type Training = 'none' | '1-2' | '3-4' | '5+' | '2h'

export interface Preset {
  key: string
  label: string
  factor: number
  example: string
  steps: string
}

/** The nine presets of Part H5.3, lowest first. Step ranges are a guide, not
 *  an equivalence. */
export const PRESETS: Preset[] = [
  { key: 'resting', label: 'Mostly resting', factor: 1.3,
    example: 'Housebound, recovering or ill; almost no walking', steps: 'under 3,000 steps' },
  { key: 'desk', label: 'Desk job, no exercise', factor: 1.4,
    example: '8 hours sitting at work, about 30 minutes walking, car or public transport, evenings mostly sitting', steps: '3,000–5,000 steps' },
  { key: 'desk_walk', label: 'Desk job, active commute', factor: 1.5,
    example: 'Walks or cycles to work, or a daily hour’s walk; some housework', steps: '5,000–7,500 steps' },
  { key: 'desk_train', label: 'Desk job and 2–3 workouts a week', factor: 1.6,
    example: 'As above, plus about 3 hours a week of gym or sport', steps: '6,000–9,000 steps' },
  { key: 'standing', label: 'Standing job', factor: 1.65,
    example: 'Shop, nurse, teacher, hairdresser, lab: 8 hours on your feet, no gym', steps: '8,000–12,000 steps' },
  { key: 'desk_daily', label: 'Desk job and daily training', factor: 1.75,
    example: 'About an hour of training most days (5–6 hard sessions a week)', steps: '8,000–12,000 steps' },
  { key: 'standing_train', label: 'Standing job and 3 or more workouts a week', factor: 1.8,
    example: 'On your feet all day, and training as well', steps: '10,000–14,000 steps' },
  { key: 'physical', label: 'Physical job', factor: 1.9,
    example: 'Warehouse order picking, building, courier on foot or bike, farm work: hours of carrying and walking', steps: '12,500–20,000 steps or more' },
  { key: 'heavy', label: 'Very heavy work or endurance athlete', factor: 2.2,
    example: '2 hours or more of hard training a day, or heavy manual work all day', steps: '15,000–25,000 steps or more' },
]

export const WORK: { value: Work; label: string }[] = [
  { value: 'resting', label: 'Mostly resting (housebound or recovering)' },
  { value: 'sitting', label: 'Mostly sitting (desk, study, driving)' },
  { value: 'standing', label: 'Mostly standing (shop, care, teaching)' },
  { value: 'physical', label: 'Physical (carrying, walking for hours)' },
  { value: 'heavy', label: 'Very heavy (manual labour all day)' },
]
export const TRAINING: { value: Training; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: '1-2', label: '1–2 times a week' },
  { value: '3-4', label: '3–4 times a week' },
  { value: '5+', label: '5 or more times a week' },
  { value: '2h', label: '2 hours or more a day' },
]

/** Desk job, no exercise (BODY-13): never 1.2 unless typed in. */
export const DEFAULT_FACTOR = 1.4
export const FACTOR_MIN = 1.2
export const FACTOR_MAX = 2.4
/** The range the presets cover; outside it a typed factor is warned about. */
export const USUAL_MIN = 1.3
export const USUAL_MAX = 2.2

const byKey = (key: string) => PRESETS.find((p) => p.key === key)!

/** The preset two answers lead to. Walking or cycling daily lifts a desk job
 *  with no other exercise to the active commute (1.5); a training plan
 *  already counts the walking. */
export function presetFor(work: Work, training: Training, walks = false): Preset {
  if (work === 'heavy' || training === '2h') return byKey('heavy')
  if (work === 'physical') return byKey(training === '5+' ? 'heavy' : 'physical')
  if (work === 'standing') return byKey(training === 'none' || training === '1-2' ? 'standing' : 'standing_train')
  if (work === 'resting') return byKey(training === 'none' ? 'resting' : 'desk')
  // Sitting.
  if (training === 'none') return byKey(walks ? 'desk_walk' : 'desk')
  if (training === '5+') return byKey('desk_daily')
  return byKey('desk_train')
}

/** What the work alone comes to, for a person who logs training separately
 *  and adds it (BODY-16): the same answers with no training. */
export const workOnly = (work: Work, walks = false) => presetFor(work, 'none', walks)

/** The preset a stored factor is, if it is one. */
export const presetOf = (factor: number | null | undefined) =>
  PRESETS.find((p) => Math.abs(p.factor - Number(factor)) < 0.001) ?? null

/** "1.6 · desk job and 2–3 workouts a week, about 6,000–9,000 steps", or for
 *  a factor of one's own, "1.45 · your own factor". */
export function describeFactor(factor: number): string {
  const p = presetOf(factor)
  return p ? `${p.factor} · ${p.label.charAt(0).toLowerCase()}${p.label.slice(1)}, ${p.steps}` : `${formatFactor(factor)} · your own factor`
}

export const formatFactor = (n: number) => String(Math.round(n * 100) / 100)

/** A factor typed in: 1.2 to 2.4 with two decimals (BODY-14); a comma reads
 *  as a point. Outside 1.3–2.2 it is kept, with a warning. */
export function readFactor(text: string): { value: number; warning: string | null } | { error: string } {
  const t = text.trim().replace(',', '.')
  if (!/^\d(\.\d{1,2})?$/.test(t)) return { error: `A factor is a number like 1.55, from ${FACTOR_MIN} to ${FACTOR_MAX}, with up to two decimals.` }
  const value = Number(t)
  if (value < FACTOR_MIN || value > FACTOR_MAX) return { error: `A factor is from ${FACTOR_MIN} to ${FACTOR_MAX}.` }
  return { value, warning: factorWarning(value) }
}

export function factorWarning(value: number): string | null {
  if (value < USUAL_MIN) return `Below ${USUAL_MIN} is bed rest: even the least active adults are planned at 1.4 (EFSA, FAO). Only right if your training is added separately and you hardly move otherwise.`
  if (value > USUAL_MAX) return `Above ${USUAL_MAX} is hard to keep up for long (FAO); check this is what your days are really like.`
  return null
}

/** A stored factor read for the picker: a sane number, or the default. */
export function readStoredFactor(value: unknown): number {
  const v = Number(value)
  return Number.isFinite(v) && v >= FACTOR_MIN && v <= FACTOR_MAX ? Math.round(v * 100) / 100 : DEFAULT_FACTOR
}

// ---- the choices kept with the body targets ---------------------------------------------

/** Whether training is part of the factor (the default) or logged
 *  separately and added on the day (BODY-16). Never both. */
export type TrainingMode = 'inside' | 'added'

export interface ActivityAnswers { work: Work | null; training: Training | null; walks: boolean; mode: TrainingMode }

export const NO_ANSWERS: ActivityAnswers = { work: null, training: null, walks: false, mode: 'inside' }

export function readAnswers(v: unknown): ActivityAnswers {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    work: WORK.some((w) => w.value === r.work) ? (r.work as Work) : null,
    training: TRAINING.some((t) => t.value === r.training) ? (r.training as Training) : null,
    walks: r.walks === true,
    mode: r.mode === 'added' ? 'added' : 'inside',
  }
}

/** The factor the answers come to, with training inside it or not. */
export function factorFor(a: ActivityAnswers): number | null {
  if (!a.work || !a.training) return null
  return (a.mode === 'added' ? workOnly(a.work, a.walks) : presetFor(a.work, a.training, a.walks)).factor
}

// ---- training energy, added on the day (BODY-16) --------------------------------------------

/** What a logged session adds to the day's budget when training is logged
 *  separately and added. A conservative estimate from the training log, the
 *  only record of a session the app has: every logged set counts as two
 *  minutes (about 40 seconds of work and the 90 seconds of rest the app
 *  times by default), or its own time when it was longer (a timed set),
 *  at the energy cost of the kind of exercise (Ainsworth et al., 2011
 *  Compendium of Physical Activities: code 02050, resistance training,
 *  multiple exercises, 8–15 reps, MET 3.5; code 02010, stationary cycling,
 *  general, MET 7.0, the lowest common cardio machine figure), less the 1 MET
 *  of rest the day's factor already counts. 1 MET is 1 kcal per kg per hour.
 *  An hour of 25 sets at 80 kg comes to about 170 kcal: well under what most
 *  calculators say, so the budget is never raised by more than training
 *  likely burned. */
export const MET_STRENGTH = 3.5
export const MET_CARDIO = 7
export const SET_MINUTES = 2
/** The one line the screen says about it. */
export const TRAINING_ENERGY_NOTE = 'each logged set is 2 minutes (or its own time) at MET 3.5, cardio 7, less rest, × your weight'

export interface LoggedSet {
  /** How long a timed set lasted, in seconds. */
  seconds?: number | string | null
  /** A cardio exercise (running, cycling, rowing). */
  cardio?: boolean
}

/** The energy the sets add, in whole kcal; null when the weight is unknown
 *  (it cannot be worked out without it). No sets add nothing. */
export function trainingKcal(sets: LoggedSet[], weightKg: number | null | undefined): number | null {
  const kg = Number(weightKg)
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) return sets.length ? null : 0
  let kcal = 0
  for (const s of sets) {
    const sec = Number(s.seconds)
    // A timed set longer than 4 hours is a typing slip: it counts as 4 hours.
    const minutes = Math.max(SET_MINUTES, Number.isFinite(sec) && sec > 0 ? Math.min(sec, 4 * 3600) / 60 : 0)
    kcal += ((s.cardio ? MET_CARDIO : MET_STRENGTH) - 1) * kg * (minutes / 60)
  }
  return Math.round(kcal)
}

/** Whether an exercise is cardio: its muscle group or its old type says so. */
export const isCardio = (ex: { muscle?: string | null; type?: string | null } | null | undefined) =>
  ex?.muscle === 'cardio' || ex?.type === 'cardio'

/** The day's calorie budget: the target, plus training when it is added. */
export function dayBudget(targetKcal: number, training: number | null, mode: TrainingMode): number {
  return Math.round(targetKcal + (mode === 'added' && training ? training : 0))
}
