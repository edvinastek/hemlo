/** Rows of the training tables added in migration 029, as the app keeps
 *  them. Kept apart from types.ts so the training work stays in its own files. */
import type { UUID } from './types'
import type { RuleConfig, RuleKind } from './schedule-rules'

/** Muscle groups, for own exercises and for the stats per group. */
export type Muscle = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core' | 'full_body' | 'cardio' | 'mobility'

/** An exercise: one of the shared catalogue (owner_id null) or the person's own. */
export interface Exercise {
  id: UUID
  owner_id: UUID | null
  name: string
  type?: string | null
  equipment: string | null
  notes: string | null
  muscle?: Muscle | null
  created_at?: string
  updated_at: string
  deleted_at?: string | null
}

/** A routine: a named list of exercises with target sets and reps, and an
 *  optional schedule that puts its session on the planner. */
export interface Routine {
  id: UUID
  profile_id: UUID
  name: string
  note: string | null
  /** No "N times a week": a planned session has a day. */
  rule: Exclude<RuleKind, 'times_per_week'> | null
  rule_config: RuleConfig
  start_date: string | null
  end_date: string | null
  time_of_day: string | null
  minutes: number | null
  /** The task series that makes the planned sessions. */
  series_id: UUID | null
  goal_id: UUID | null
  sort_order: number
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

export interface RoutineLine {
  id: UUID
  routine_id: UUID
  exercise_id: UUID | null
  sets: number
  reps: number | null
  /** With reps, a range: "8 to 12". */
  reps_max: number | null
  load_kg: number | null
  seconds: number | null
  /** Rest after each set, in seconds, for the rest timer. */
  rest_s: number | null
  note: string | null
  sort_order: number
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

/** A training phase (TRN-07): a named block of weeks ("Strength, 6 weeks"),
 *  drawn as a band on Plan's Year view and on Training. The `phase` table of
 *  migration 002, with colour, updated_at and deleted_at from 037. */
export interface Phase {
  id: string
  profile_id: string
  name: string
  start_date: string
  /** The last day of the phase: start + weeks × 7 − 1. */
  end_date: string | null
  /** '#rrggbb' from the swatches; null: the accent. */
  colour: string | null
  template: Record<string, unknown>
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}
