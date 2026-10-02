import type { Task } from '../lib/types'

/** What is being copied: one task, a whole day, or a whole week (Monday). */
export type CopyWhat =
  | { kind: 'task'; task: Task }
  | { kind: 'day'; day: string }
  | { kind: 'week'; monday: string }

/** THE copy dialog (GEN-55, TSK-20 to TSK-25, PLN-06, PLN-08): pick one or
 *  many days, keep or change the time, choose what the notes become. Tasks,
 *  days and weeks all copy through it. Filled in by the Plan work; anything
 *  can open it now. */
export function CopySheet(_props: { what: CopyWhat; onClose: () => void; onDone?: (days: string[]) => void }) {
  return null
}
