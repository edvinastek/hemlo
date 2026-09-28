// Generated from src/lib/types.ts (only the types the rules use) by scripts/copy-shared.mjs. Do not edit here:
// change the original and run `node scripts/copy-shared.mjs`.

export type UUID = string

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
