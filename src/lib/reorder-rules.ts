import type { Task } from './types'
import type { WorkHours } from './settings.ts'
import { span, toMinutes } from './work-rules.ts'
import { weekdayOf, addDays } from './series-rules.ts'

/** Moving tasks by hand: dragging on Today and swapping days on Plan's week.
 *  Pure: what moves where, and what to warn about first. The writing is in
 *  ui/DragList.tsx and ui/WeekSwap.tsx.
 *
 *  The rules the owner can rely on:
 *  - A task stays among its own kind. Tasks with a time are dragged among
 *    tasks with a time, the rest among the rest. To give a task a time, or
 *    take it away, open the task.
 *  - Tasks without a time just change places in the list.
 *  - A task with a time swaps times with the task it is dropped on. The two
 *    trade places and nothing else on the day moves.
 *  - Before anything locked, fixed, in locked work hours or on top of
 *    another task is moved, the app asks. */

/** The parts of a task these rules look at. */
export type Item = Pick<Task, 'id' | 'title' | 'planned_time' | 'sort_order' | 'duration_min' | 'locked' | 'fixed'>
  & Partial<Pick<Task, 'status' | 'series_id' | 'planned_date'>>

/** What a move changes on one task. Only the fields that change are there. */
export interface Change {
  id: string
  planned_time?: string | null
  sort_order?: number
  planned_date?: string
}

export interface Warning {
  kind: 'locked' | 'fixed' | 'work' | 'overlap' | 'repeating'
  text: string
}

export type WorkWindow = Pick<WorkHours, 'on' | 'locked' | 'start' | 'end' | 'days'>

const DAY = 24 * 60
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)
export const isTimed = (t: Pick<Item, 'planned_time'>) => !!t.planned_time

/* ---------- where a drag may land ---------------------------------------- */

/** The first and last place a task may be dragged to: the run of tasks of
 *  its own kind (with a time, or without) that it sits in. */
export function zone(list: Item[], from: number): [number, number] {
  const timed = isTimed(list[from])
  let lo = from
  let hi = from
  while (lo > 0 && isTimed(list[lo - 1]) === timed) lo--
  while (hi < list.length - 1 && isTimed(list[hi + 1]) === timed) hi++
  return [lo, hi]
}

/** A drop point kept inside the task's own kind. */
export function clampTarget(list: Item[], from: number, to: number): number {
  const [lo, hi] = zone(list, from)
  return Math.max(lo, Math.min(hi, to))
}

/** One place up (-1) or down (+1), for the Move up and Move down buttons;
 *  null when the task is already at the end of its kind. */
export function stepTarget(list: Item[], from: number, dir: -1 | 1): number | null {
  const to = clampTarget(list, from, from + dir)
  return to === from ? null : to
}

/** How the list will read after the drop, as the old places in their new
 *  order. A task with a time trades places with the one it lands on; a task
 *  without one slides in and the others close up. The drag shows exactly
 *  this, so what you see while dragging is what you get. */
export function previewOrder(list: Item[], from: number, to: number): number[] {
  const order = list.map((_, i) => i)
  to = clampTarget(list, from, to)
  if (to === from) return order
  if (isTimed(list[from])) {
    order[from] = to
    order[to] = from
    return order
  }
  order.splice(from, 1)
  order.splice(to, 0, from)
  return order
}

/* ---------- what the drop writes ----------------------------------------- */

/** The changes a drop makes. Nothing when it lands where it started. */
export function planMove(list: Item[], from: number, to: number): Change[] {
  to = clampTarget(list, from, to)
  if (to === from) return []
  const moved = list[from]
  if (isTimed(moved)) {
    const other = list[to]
    const a: Change = { id: moved.id }
    const b: Change = { id: other.id }
    if (hhmm(moved.planned_time) !== hhmm(other.planned_time)) {
      a.planned_time = other.planned_time
      b.planned_time = moved.planned_time
    } else if (moved.sort_order !== other.sort_order) {
      // The same time: the list goes by the order number instead, so swap those.
      a.sort_order = other.sort_order
      b.sort_order = moved.sort_order
    } else {
      // Same time and same number: nudge the moved one past the other.
      a.sort_order = other.sort_order + (to > from ? 1 : -1)
    }
    return [a, b].filter((c) => Object.keys(c).length > 1)
  }

  // Without a time: the tasks in this run keep the order numbers they had
  // between them, handed out again in the new order. Tasks on other tabs
  // that share the numbers stay where they were. Numbers that tie (a new
  // task starts at 0) are spread out first, so the order sticks.
  const [lo, hi] = zone(list, from)
  const order = previewOrder(list, from, to).slice(lo, hi + 1)
  const numbers = order.map((i) => list[i].sort_order).sort((x, y) => x - y)
  for (let i = 1; i < numbers.length; i++) if (numbers[i] <= numbers[i - 1]) numbers[i] = numbers[i - 1] + 1
  const out: Change[] = []
  order.forEach((i, k) => {
    if (list[i].sort_order !== numbers[k]) out.push({ id: list[i].id, sort_order: numbers[k] })
  })
  return out
}

/* ---------- warnings ------------------------------------------------------ */

/** Start and end in minutes after midnight. A task with no length counts as
 *  a moment (one minute), so two tasks at the same time still clash. */
function interval(t: Pick<Item, 'planned_time' | 'duration_min'>): [number, number] | null {
  if (!t.planned_time) return null
  const s = toMinutes(t.planned_time)
  return [s, s + Math.max(1, t.duration_min ?? 0)]
}

/** Do two tasks' times overlap? Either may run past midnight. */
export function overlaps(a: Pick<Item, 'planned_time' | 'duration_min'>, b: Pick<Item, 'planned_time' | 'duration_min'>): boolean {
  const x = interval(a)
  const y = interval(b)
  if (!x || !y) return false
  return x[0] < y[1] && y[0] < x[1]
}

/** Does a task at this time, on this weekday (0 Sunday), fall in locked work
 *  hours? A night shift that started the evening before counts too. Work
 *  that is not locked keeps nothing out, so it never warns. */
export function inLockedWork(t: Pick<Item, 'planned_time' | 'duration_min'>, work: WorkWindow, weekday: number): boolean {
  const x = interval(t)
  if (!x || !work.on || !work.locked) return false
  const start = toMinutes(work.start)
  const length = span(work.start, work.end)
  if (length === 0) return false
  const hits = (from: number) => x[0] < from + length && from < x[1]
  return (work.days.includes(weekday) && hits(start))
    || (work.days.includes((weekday + 6) % 7) && hits(start - DAY))
}

/** "09:00 to 17:00" */
export const workHours = (work: WorkWindow) => `${work.start.slice(0, 5)} to ${work.end.slice(0, 5)}`

const quoted = (t: Pick<Item, 'title'>) => `“${t.title || 'Untitled'}”`

function lockWarning(t: Item): Warning | null {
  if (t.locked) return { kind: 'locked', text: `${quoted(t)} is locked. Nothing is meant to move it.` }
  if (t.fixed) return { kind: 'fixed', text: `${quoted(t)} is fixed in place.` }
  return null
}

/** What to ask about before a move on one day. `day` is every task on the
 *  day (not only the tab showing), `movedId` the task that was dragged, and
 *  `date` the day, for the work hours.
 *
 *  - The dragged task being locked or fixed. Another task is only asked
 *    about when its time changes (the one it swaps with); a task that just
 *    slides up a place to close the gap is not.
 *  - A new time inside locked work hours, when the task was not already
 *    inside them.
 *  - A new overlap with another task. One that was there before the move
 *    is not news and is not mentioned. */
export function moveWarnings(day: Item[], changes: Change[], movedId: string, work: WorkWindow, date: string): Warning[] {
  const out: Warning[] = []
  const byId = new Map(changes.map((c) => [c.id, c]))
  const after = day.map((t) => ({ ...t, ...byId.get(t.id) }))
  const weekday = weekdayOf(date)
  const retimed = (t: Item) => {
    const c = byId.get(t.id)
    return !!c && 'planned_time' in c && hhmm(c.planned_time) !== hhmm(t.planned_time)
  }

  for (const t of day) {
    if (!byId.has(t.id)) continue
    if (t.id === movedId || retimed(t)) {
      const w = lockWarning(t)
      if (w) out.push(w)
    }
  }

  const inWork = new Set<string>()
  for (const t of day) {
    if (!retimed(t) || t.locked) continue
    const now = after.find((a) => a.id === t.id)!
    if (inLockedWork(now, work, weekday) && !inLockedWork(t, work, weekday)) {
      inWork.add(t.id)
      out.push({ kind: 'work', text: `${quoted(t)} would land in your locked work hours (${workHours(work)}).` })
    }
  }

  const told = new Set<string>()
  // The dragged task first, so a clash is told from its side.
  const order = day.map((_, i) => i).sort((x, y) => Number(day[y].id === movedId) - Number(day[x].id === movedId))
  for (const i of order) {
    for (const j of order) {
      if (i === j || !retimed(day[i])) continue
      const [a, b] = [day[i], day[j]]
      const key = [a.id, b.id].sort().join('|')
      if (told.has(key)) continue
      // The work block itself: the work warning already says it.
      if (inWork.has(a.id) && b.locked) continue
      if (overlaps(after[i], after[j]) && !overlaps(a, b)) {
        told.add(key)
        out.push({ kind: 'overlap', text: `${quoted(a)} would overlap ${quoted(b)}.` })
      }
    }
  }
  return out
}

/* ---------- Plan's week: whole days and single tasks ---------------------- */

/** Why a task stays put when its day is swapped, or null when it moves. A
 *  done task happened on its day, so it stays there too. */
export function staysPut(t: Item): 'locked' | 'fixed' | 'done' | null {
  if (t.locked) return 'locked'
  if (t.fixed) return 'fixed'
  if (t.status === 'done') return 'done'
  return null
}

export interface DaySwap<T extends Item> {
  /** From the first day to the second, and back. Each keeps its time. */
  there: T[]
  back: T[]
  /** Staying where they are, and why. */
  stay: { task: T; why: 'locked' | 'fixed' | 'done' }[]
  /** How many of the moving tasks belong to a repeating series. */
  repeating: number
  warnings: Warning[]
}

/** Swap the movable tasks of two days. Each task keeps its time. The sheet
 *  asks first, and the warnings say:
 *  - which locked or fixed tasks stay where they are (done ones stay too,
 *    but that needs no second look);
 *  - that repeating tasks move for these days only;
 *  - where a moving task would land in locked work hours on its new day
 *    (when it was not already in them on the old one), or on top of a task
 *    that stays there. */
export function planDaySwap<T extends Item>(dayA: string, a: T[], dayB: string, b: T[], work: WorkWindow): DaySwap<T> {
  const stay: DaySwap<T>['stay'] = []
  const split = (list: T[]) => list.filter((t) => {
    const why = staysPut(t)
    if (why) stay.push({ task: t, why })
    return !why
  })
  const there = split(a)
  const back = split(b)
  const moving = [...there, ...back]
  const staying = (list: T[]) => list.filter((t) => staysPut(t))
  const warnings: Warning[] = []
  for (const { task, why } of stay) {
    if (why !== 'done') warnings.push({ kind: why, text: `${quoted(task)} is ${why} and stays where it is.` })
  }
  const series = repeatWarning(moving)
  if (series) warnings.push(series)
  warnings.push(
    ...landingWarnings(there, dayA, staying(b), dayB, work),
    ...landingWarnings(back, dayB, staying(a), dayA, work),
  )
  return { there, back, stay, repeating: moving.filter((t) => !!t.series_id).length, warnings }
}

/** Moving one task to another day. Asks first when it is locked or fixed,
 *  repeats, or would land in locked work hours or on top of another task. */
export function singleMoveWarnings<T extends Item>(task: T, from: string, to: string, target: T[], work: WorkWindow): Warning[] {
  const lock = lockWarning(task)
  const series = repeatWarning([task])
  return [
    ...(lock ? [lock] : []), ...(series ? [series] : []),
    ...landingWarnings([task], from, target.filter((t) => t.id !== task.id), to, work),
  ]
}

/** Repeating tasks move for that day alone; the series keeps its days. */
function repeatWarning(moving: Item[]): Warning | null {
  const rep = moving.filter((t) => !!t.series_id)
  if (rep.length === 0) return null
  return {
    kind: 'repeating',
    text: rep.length === 1
      ? `${quoted(rep[0])} repeats. Only this day moves; the series keeps its days.`
      : `${rep.length} of these repeat. Only these days move; each series keeps its days.`,
  }
}

function landingWarnings(moving: Item[], from: string, there: Item[], to: string, work: WorkWindow): Warning[] {
  const out: Warning[] = []
  const was = weekdayOf(from)
  const now = weekdayOf(to)
  for (const t of moving) {
    const intoWork = inLockedWork(t, work, now) && !inLockedWork(t, work, was)
    if (intoWork) out.push({ kind: 'work', text: `${quoted(t)} would land in your locked work hours (${workHours(work)}).` })
    for (const o of there) {
      if (intoWork && o.locked) continue
      if (overlaps(t, o)) out.push({ kind: 'overlap', text: `${quoted(t)} would overlap ${quoted(o)}.` })
    }
  }
  return out
}

/** "1 task" or "3 tasks". */
export const count = (n: number, word = 'task') => `${n} ${word}${n === 1 ? '' : 's'}`

/* ---------- push 15 / 30 / 60 (TOD-15) ------------------------------------ */

/** What a push writes: a later time, past midnight onto the next day (never
 *  wrapping round on the same date), one more push counted, and the task
 *  flagged once it has been pushed three times. A task with no time cannot
 *  be pushed from nothing: null, and the screen asks for a time instead. */
export function pushTask(
  t: Pick<Task, 'planned_date' | 'planned_time' | 'push_count'>, minutes: number, day: string,
): Pick<Task, 'planned_date' | 'planned_time' | 'push_count' | 'status' | 'needs_review'> | null {
  if (!t.planned_time) return null
  const total = toMinutes(t.planned_time) + Math.round(minutes)
  const days = Math.floor(total / DAY)
  const at = ((total % DAY) + DAY) % DAY
  const push_count = t.push_count + 1
  return {
    planned_date: addDays(t.planned_date ?? day, days),
    planned_time: `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
    push_count,
    status: 'pushed',
    needs_review: push_count >= 3,
  }
}

/** A time to offer when an untimed task is pushed: the clock plus the push,
 *  rounded up to five minutes, and never past 23:55 on the same day. */
export function suggestPushTime(now: string, minutes: number): string {
  const raw = toMinutes(now) + Math.round(minutes)
  const at = Math.min(DAY - 5, Math.ceil(raw / 5) * 5)
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
}
