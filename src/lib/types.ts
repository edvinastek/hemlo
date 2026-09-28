/** Entities mirror the Postgres schema in supabase/migrations. Every record is
 *  owned by a profile (or a household) and never leaves that owner's account. */

export type UUID = string

export interface Profile {
  id: UUID
  household_id: UUID
  user_id: UUID | null
  name: string
  sex: 'male' | 'female' | null
  birth_date: string | null
  height_cm: number | null
  activity_level: number
  goal: 'cut' | 'recomp' | 'bulk'
  timezone: string
  day_start: string
  day_end: string
  ai_persona_name: string | null
  is_default: boolean
  /** Two-letter ISO code, for shops and public holidays. Optional. */
  country?: string | null
  city?: string | null
  /** Personal choices that shape the app; read through lib/settings.ts,
   *  which fills in a default for every key. */
  settings?: Partial<import('./settings').ProfileSettings> | null
  updated_at: string
  deleted_at: string | null
}

export type TaskStatus = 'todo' | 'done' | 'pushed' | 'stuck' | 'dropped'
export type Horizon = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface Task {
  id: UUID
  profile_id: UUID
  title: string
  category: string | null
  module_key: string | null
  horizon: Horizon
  goal_id: UUID | null
  series_id: UUID | null
  duration_min: number | null
  total_effort_min: number | null
  daily_quota_min: number | null
  fixed: boolean
  locked: boolean
  planned_date: string | null
  planned_time: string | null
  start_date: string | null
  due_date: string | null
  sort_order: number
  status: TaskStatus
  push_count: number
  extension_count: number
  needs_review: boolean
  source: 'meal' | 'workout' | 'habit' | 'manual' | 'ai' | 'module' | 'shopping'
  source_ref: UUID | null
  notes: string | null
  updated_at: string
  completed_at: string | null
  deleted_at: string | null
}

export interface Food {
  id: UUID
  owner_id: UUID | null
  name: string
  kcal: number | null
  carbs_g: number | null
  fiber_g: number | null
  fat_g: number | null
  protein_g: number | null
  state: 'raw' | 'cooked' | 'canned' | 'dried' | 'frozen'
  cook_yield: number | null
  pack_size_g: number | null
  store_section: string | null
}

export interface Recipe {
  id: UUID
  owner_id: UUID | null
  name: string
  role: string | null
  portions_per_batch: number
  cook_minutes: number | null
  steps: string | null
  /** Who can see it (migration 019). Rows from before it have none of these;
   *  lib/sharing-rules.ts reads them with the database's defaults. */
  sharing?: import('./sharing-rules').Sharing
  proposed_at?: string | null
  reviewed_at?: string | null
  /** The reviewer's note, shown to the owner when it was not accepted. */
  review_note?: string | null
  deleted_at?: string | null
}

export interface RecipeLine {
  id: UUID
  recipe_id: UUID
  food_id: UUID | null
  raw_text: string | null
  grams_per_portion: number | null
  state: string | null
  sort_order: number
}

export interface Target {
  id: UUID
  profile_id: UUID
  from_date: string
  kcal: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  fiber_g: number | null
  reason: string | null
  updated_at?: string
  deleted_at?: string | null
}

export interface BodyLog {
  id: UUID
  profile_id: UUID
  log_date: string
  weight_kg: number | null
  waist_cm: number | null
  note: string | null
  updated_at?: string
  deleted_at?: string | null
}

export interface FoodLogEntry {
  id: UUID
  profile_id: UUID
  log_date: string
  log_time: string | null
  food_id: UUID | null
  recipe_id: UUID | null
  grams: number | null
  portions: number | null
  planned: boolean
  /** A quick entry carries its own numbers instead of a food or recipe. */
  label?: string | null
  kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  updated_at?: string
  deleted_at?: string | null
}

export interface MealPlanSlot {
  id: UUID
  profile_id: UUID
  slot_date: string
  slot: string
  recipe_id: UUID | null
  portion_multiplier: number
  status: 'planned' | 'eaten' | 'skipped'
  /** This meal's time on this day; none unless set here or by a default. */
  slot_time?: string | null
  /** Planned as plain numbers instead of a recipe ("sandwich, 450 kcal"). */
  label?: string | null
  kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  grams?: number | null
  updated_at: string
  deleted_at: string | null
}

/** What is in the cupboard, shared by the household. */
export interface Stock {
  id: UUID
  household_id: UUID
  food_id: UUID
  grams_on_hand: number
  note: string | null
  updated_at: string
  deleted_at: string | null
}

export interface Series {
  id: UUID
  profile_id: UUID
  title: string
  /** daily | weekdays | weekly | every_n_weeks | monthly | dates */
  rule: 'daily' | 'weekdays' | 'weekly' | 'every_n_weeks' | 'monthly' | 'dates'
  /** {n: 2, weekdays: [1,3,5], day_of_month: 15} — weekdays are 0 (Sunday) to 6.
   *  A 'dates' series keeps the days picked by hand in `dates`, as sorted,
   *  unique 'yyyy-MM-dd' strings (at most 366). */
  rule_config: { n?: number; weekdays?: number[]; day_of_month?: number; dates?: string[] }
  start_date: string
  end_date: string | null
  occurrence_count: number | null
  time_of_day: string | null
  /** Fields copied onto every generated task: category, duration_min, locked, notes */
  task_template: Partial<Pick<Task, 'category' | 'duration_min' | 'locked' | 'notes'>>
  module_key: string | null
  active: boolean
  updated_at: string
  deleted_at: string | null
}

export interface SeriesException {
  id: UUID
  series_id: UUID
  exception_date: string
  action: 'skip' | 'move' | 'change'
  moved_to: string | null
  changes: Record<string, unknown>
  updated_at: string
  deleted_at: string | null
}

export interface Habit {
  id: UUID
  profile_id: UUID
  name: string
  schedule: 'daily' | 'weekdays' | 'weekly'
  sort_order: number
  active: boolean
  updated_at: string
  deleted_at: string | null
}

export interface HabitLog {
  id: UUID
  habit_id: UUID
  log_date: string
  done: boolean
  updated_at: string
}

export interface Supplement {
  id: UUID
  profile_id: UUID
  name: string
  dose_text: string | null
  time_slot: 'morning' | 'midday' | 'evening' | null
  active: boolean
  sort_order: number
  updated_at: string
  deleted_at: string | null
}

export interface SupplementLog {
  id: UUID
  supplement_id: UUID
  log_date: string
  done: boolean
  updated_at: string
}

export interface ModuleInstance {
  id: UUID
  profile_id: UUID
  module_key: string
  enabled: boolean
  sort_order: number
  settings: Record<string, unknown>
  updated_at: string
}

/** Local-only: rows waiting to reach Supabase, and merges the app had to
 *  resolve on its own. Both are shown to the user rather than hidden. */
export interface PendingChange {
  id?: number
  table: string
  row_id: UUID
  op: 'upsert' | 'delete'
  payload: Record<string, unknown>
  changed_at: string
  fields: string[]
}

export interface ConflictEntry {
  id?: number
  table: string
  row_id: UUID
  field: string
  local_value: unknown
  remote_value: unknown
  kept: 'local' | 'remote' | 'rejected'
  at: string
}

/** A module someone built (builtin = false), synced from the `module` table.
 *  Locally `id` mirrors `key`, because the sync addresses every row by id. */
export interface ModuleRow {
  id: string
  key: string
  name: string
  builtin: boolean
  created_by: UUID | null
  definition: Record<string, unknown>
  version?: number
  updated_at: string
  deleted_at: string | null
}

/** One record of a module that has no table of its own (a custom module, or
 *  Projects, Finance, Learning, Household). `data` holds its fields. */
export interface ModuleRecord {
  id: UUID
  profile_id: UUID
  module_key: string
  entity: string
  data: Record<string, unknown>
  record_date: string | null
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

export interface CalendarEvent {
  id: UUID
  profile_id: UUID
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  /** Set on an event from a calendar the person follows (migration 020).
   *  Such events are kept on this device only, never sent, and read-only. */
  subscription_id?: UUID | null
  /** That calendar's own id for the event (its UID). */
  external_uid?: string | null
  updated_at: string
  deleted_at: string | null
}

/** A calendar the person follows by its secret iCal address. Synced, so it
 *  follows them to every device; its events are fetched on each device. */
export interface CalendarSubscription {
  id: UUID
  profile_id: UUID
  name: string
  /** https only; the server fetches it (calendar-fetch). */
  url: string
  /** #rrggbb, one of the swatches. */
  colour: string
  last_synced_at: string | null
  last_error: string | null
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

export interface Goal {
  id: UUID
  profile_id: UUID
  title: string
  measure_type: 'count' | 'amount' | 'duration' | 'boolean' | 'weight' | null
  measure_target: number | null
  measure_unit: string | null
  start_date: string | null
  end_date: string | null
  status: 'active' | 'done' | 'dropped' | 'paused'
  horizon: 'week' | 'month' | 'quarter' | 'year' | 'multi_year' | null
  updated_at: string
  deleted_at: string | null
}

export interface SleepLog {
  id: UUID
  profile_id: UUID
  log_date: string
  went_to_bed: string | null
  woke_at: string | null
  hours: number | null
  quality: number | null
  updated_at: string
  deleted_at: string | null
}

export interface WorkoutLog {
  id: UUID
  profile_id: UUID
  log_date: string
  exercise_id: UUID | null
  workout_id: UUID | null
  set_number: number | null
  reps_achieved: number | null
  load_kg: number | null
  seconds: number | null
  note: string | null
  updated_at: string
  deleted_at: string | null
}
