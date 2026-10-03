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
  /** The Projects record this task belongs to (026). */
  project_id?: UUID | null
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
  /** Where the row came from: 'catalogue', 'import', or 'off' for a product
   *  added from Open Food Facts. */
  source?: string | null
  /** A supermarket product's barcode, brand, shops and picture (021). */
  barcode?: string | null
  brand?: string | null
  stores?: string[] | null
  source_ref?: string | null
  image_url?: string | null
  /** How it is counted besides grams: [{ name: 'egg', plural: 'eggs', g: 50 }]
   *  (022). Read through readUnits in units-rules.ts; rows from before 022
   *  have none. */
  units?: import('./units-rules').FoodUnit[] | null
  /** The rest of the EU label, per 100 g or 100 ml (026). Empty is unknown. */
  kj?: number | null
  sat_fat_g?: number | null
  mufa_g?: number | null
  pufa_g?: number | null
  sugars_g?: number | null
  polyols_g?: number | null
  starch_g?: number | null
  salt_g?: number | null
  alcohol_g?: number | null
  /** Figures are per 100 ml (a drink) rather than per 100 g. */
  per_ml?: boolean
  /** 'eu': carbohydrate leaves fibre out, as on an EU label (every row
   *  since 026). 'us': the older figure that included it. */
  carb_basis?: 'eu' | 'us'
  /** Where a shared food came from (027): NEVO's code, its Dutch and English
   *  names and synonyms as published, its food group and remark, and the
   *  version of the source. NEVO publishes sodium (mg); salt is worked out
   *  from it where it is shown (eu-label-rules.ts saltOf). */
  nevo_code?: number | null
  name_nl?: string | null
  name_en?: string | null
  synonyms?: string | null
  food_group?: string | null
  source_note?: string | null
  source_version?: string | null
  sodium_mg?: number | null
  /** Grams per millilitre, so a spoon or a cup of it can be counted (027). */
  density?: number | null
  /** The shared food that took this one's place (027): set on old catalogue
   *  rows NEVO replaced, which are hidden. */
  replaced_by?: string | null
  deleted_at?: string | null
}

/** An amount typed in one of the food's units (022). Both are set or both
 *  are empty; empty means grams. The grams beside them are what count. */
export interface UnitAmount {
  /** The unit's name as the food has it: "egg". */
  unit?: string | null
  /** How many: 2 (eggs). */
  unit_qty?: number | null
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

export interface RecipeLine extends UnitAmount {
  id: UUID
  recipe_id: UUID
  food_id: UUID | null
  raw_text: string | null
  grams_per_portion: number | null
  state: string | null
  /** A short note on the line: "finely chopped" (003). */
  note?: string | null
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

export interface FoodLogEntry extends UnitAmount {
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

export interface MealPlanSlot extends UnitAmount {
  id: UUID
  profile_id: UUID
  slot_date: string
  slot: string
  recipe_id: UUID | null
  portion_multiplier: number
  status: 'planned' | 'eaten' | 'skipped'
  /** This meal's time on this day; none unless set here or by a default. */
  slot_time?: string | null
  /** A single food planned as this meal or part of it (026), in the
   *  amount `grams` (and unit/unit_qty). */
  food_id?: UUID | null
  /** Order among the items of the same meal on the same day (026). */
  sort_order?: number
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

/** What is in the cupboard, shared by the household. grams_on_hand is the
 *  amount; unit and unit_qty only say how to show it ("12 eggs"). */
export interface Stock extends UnitAmount {
  id: UUID
  household_id: UUID
  food_id: UUID
  grams_on_hand: number
  note: string | null
  /** Where it is kept (028): fridge, freezer, cupboard, or the person's own word. */
  place?: string | null
  /** Its best-before or use-by date (028), 'yyyy-MM-dd'. */
  best_before?: string | null
  /** Below this many grams it goes on the shopping list (028). */
  min_grams?: number | null
  updated_at: string
  deleted_at: string | null
}

export interface Series {
  id: UUID
  profile_id: UUID
  title: string
  /** daily | weekdays | weekends | weekly | every_n_weeks | monthly |
   *  monthly_nth | yearly | dates (schedule-rules.ts reads every one) */
  rule: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'every_n_weeks' | 'monthly' | 'monthly_nth' | 'yearly' | 'dates'
  /** {n: 2, weekdays: [1,3,5], day_of_month: 15, nth: 2, weekday: 2,
   *  month: 3} — weekdays are 0 (Sunday) to 6. A 'dates' series keeps the
   *  days picked by hand in `dates`, as sorted, unique 'yyyy-MM-dd' strings
   *  (at most 366). */
  rule_config: {
    n?: number; weekdays?: number[]; day_of_month?: number; dates?: string[]
    nth?: number; weekday?: number; month?: number; day?: number; times?: number
  }
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
  /** The schedule before 026. Still read when `rule` is empty. */
  schedule: 'daily' | 'weekdays' | 'weekly'
  /** Any schedule (026), the same shapes a repeating task has plus
   *  'times_per_week'. Read through schedule-rules.ts. */
  rule?: import('./schedule-rules').RuleKind | null
  rule_config?: import('./schedule-rules').RuleConfig
  start_date?: string | null
  end_date?: string | null
  /** 'HH:MM' or 'HH:MM:SS'; none puts it under "Any time". */
  time_of_day?: string | null
  /** A note pinned to the habit (the exercises of "Mobility"). */
  note?: string | null
  /** A count to reach each time it is due ("8" glasses), and its unit. */
  target?: number | null
  unit?: string | null
  /** A colour of the person's choosing (030), '#rrggbb', and a mark of one
   *  or two characters shown in it. */
  colour?: string | null
  mark?: string | null
  /** Part of the day when it has no clock time (030). */
  day_part?: 'morning' | 'afternoon' | 'evening' | null
  /** The goal this habit works towards (029). */
  goal_id?: UUID | null
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
  /** How much of a count habit was done that day (026). */
  amount?: number | null
  /** Which lines of the pinned note's checklist were ticked that day, by
   *  their index among the checklist items (026). */
  checks?: number[]
  updated_at: string
}

/** One thing on the household's shopping list (026): written by hand, or a
 *  tick on an item the meal plan put there (plan_key says which). Shared by
 *  everyone in the household. */
export interface ShoppingEntry extends UnitAmount {
  id: UUID
  household_id: UUID
  plan_key: string | null
  food_id: UUID | null
  name: string | null
  qty: number | null
  grams: number | null
  note: string | null
  aisle: string | null
  shop: string | null
  checked: boolean
  checked_at: string | null
  sort_order: number
  added_by: UUID | null
  /** Which of the household's lists it is on (028); none is the main list. */
  list?: string | null
  /** When it was bought (028): what the "recently bought" tiles are made of. */
  bought_at?: string | null
  /** An item the meal plan put there, bought or "not needed this time"
   *  (028): the plan's needs up to this day count as dealt with, by `grams`. */
  done_until?: string | null
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

/** A household chore (026), shared by the household. */
export interface Chore {
  id: UUID
  household_id: UUID
  name: string
  room: string | null
  /** fixed: on its rule's days; after: every_days after last done;
   *  flexible: about every every_days, shown by how due it is. */
  mode: 'fixed' | 'after' | 'flexible'
  rule: import('./schedule-rules').RuleKind | null
  rule_config: import('./schedule-rules').RuleConfig
  every_days: number | null
  start_date: string | null
  end_date: string | null
  time_of_day: string | null
  minutes: number | null
  /** Household members (auth user ids) in rotation order. */
  assignees: UUID[]
  rotation: 'none' | 'each_time' | 'each_week' | 'least_recent'
  note: string | null
  paused: boolean
  /** A pause between two dates, for a holiday (030). */
  paused_from?: string | null
  paused_until?: string | null
  sort_order: number
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

export interface ChoreLog {
  id: UUID
  chore_id: UUID
  done_on: string
  done_by: UUID | null
  updated_at: string
  deleted_at: string | null
}

export interface Supplement {
  id: UUID
  profile_id: UUID
  name: string
  dose_text: string | null
  /** One of the person's slots (030: their own, kept in the supplements
   *  module's settings; 'morning', 'midday' and 'evening' by default). */
  time_slot: string | null
  /** Its own schedule (030); none means every day. */
  rule?: import('./schedule-rules').RuleKind | null
  rule_config?: import('./schedule-rules').RuleConfig
  start_date?: string | null
  end_date?: string | null
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
  /** https only; the server fetches it (calendar-fetch). Empty once the
   *  calendar is removed (deleted_at set): the secret address is wiped (024). */
  url: string | null
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
  /** 029: a note; where progress comes from (a number updated by hand, the
   *  linked tasks, projects and habits, or the body weight); the number now
   *  and where it started; the order on the Goals page. */
  note?: string | null
  measure_source?: 'manual' | 'linked' | 'weight'
  measure_current?: number | null
  measure_start?: number | null
  sort_order?: number
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
  /** The routine whose session this set was logged in (029). */
  routine_id?: UUID | null
  set_number: number | null
  reps_achieved: number | null
  load_kg: number | null
  seconds: number | null
  note: string | null
  updated_at: string
  deleted_at: string | null
}
