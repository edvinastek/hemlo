/** Milestones (029): a dated point in a project or towards a goal. Kept apart
 *  from types.ts so the projects work stays in its own files. */
import type { UUID } from './types'

export interface Milestone {
  id: UUID
  profile_id: UUID
  /** A goal, a project (a Projects record), or both. */
  goal_id: UUID | null
  project_id: UUID | null
  title: string
  due_date: string | null
  done: boolean
  note: string | null
  sort_order: number
  created_at?: string
  updated_at: string
  deleted_at: string | null
}
