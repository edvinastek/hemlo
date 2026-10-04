/** Training phases (TRN-07), worked out with no database and no React
 *  (checked in src/test/phases.check.mjs): a phase is a name, a first day, a
 *  length in whole weeks and a colour; it is kept with its last day, so the
 *  server's phase table (start_date, end_date) holds it as it always could.
 *  Days are 'yyyy-MM-dd'. */
import { addDays, toDayNumber } from './series-rules.ts'
import { SWATCHES } from './colours-rules.ts'
import type { Phase } from './training-types'

export const MAX_PHASE_WEEKS = 52
export const PHASE_NAME_MAX = 60
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The last day of a phase that starts on `start` and lasts `weeks`. */
export const phaseEnd = (start: string, weeks: number) => addDays(start, weeks * 7 - 1)

/** Its length in whole weeks (a phase kept by another app may end mid-week: rounded up). */
export function phaseWeeks(p: Pick<Phase, 'start_date' | 'end_date'>): number {
  if (!p.end_date) return 1
  return Math.max(1, Math.ceil((toDayNumber(p.end_date) - toDayNumber(p.start_date) + 1) / 7))
}

export interface PhaseDraft { name: string; start: string; weeks: number | string; colour: string | null }

/** What is wrong with a phase before it is saved, or null. */
export function phaseProblem(d: PhaseDraft): string | null {
  if (!d.name.trim()) return 'Give the phase a name.'
  if (d.name.trim().length > PHASE_NAME_MAX) return `Keep the name under ${PHASE_NAME_MAX} characters.`
  if (!DAY.test(d.start)) return 'Pick the day it starts.'
  const w = Number(d.weeks)
  if (!Number.isInteger(w) || w < 1 || w > MAX_PHASE_WEEKS) return `Weeks: 1 to ${MAX_PHASE_WEEKS}.`
  if (d.colour != null && !SWATCHES.some((s) => s.hex === d.colour)) return 'Pick one of the colours.'
  return null
}

/** The fields a draft gives a phase row. */
export function phaseFields(d: PhaseDraft): Pick<Phase, 'name' | 'start_date' | 'end_date' | 'colour'> {
  return { name: d.name.trim(), start_date: d.start, end_date: phaseEnd(d.start, Number(d.weeks)), colour: d.colour }
}

const live = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at)
const endOf = (p: Pick<Phase, 'start_date' | 'end_date'>) => p.end_date ?? p.start_date

/** Phases in the order the list shows them: by first day, then name. */
export const orderPhases = <T extends Phase>(phases: T[]): T[] =>
  live(phases).sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name))

export interface Band<T extends Phase = Phase> {
  phase: T
  /** Where it starts and ends across the year, 0 to 1. */
  from: number
  to: number
  /** Its row: overlapping phases stack. */
  lane: number
  /** It began before the year, or runs on after it. */
  before: boolean
  after: boolean
}

/** The phases that touch a year, as bands across it, overlapping ones on
 *  lanes of their own (the first free lane, in order of start). */
export function yearBands<T extends Phase>(phases: T[], year: number): Band<T>[] {
  const first = toDayNumber(`${year}-01-01`)
  const last = toDayNumber(`${year}-12-31`)
  const days = last - first + 1
  const lanes: number[] = []
  const out: Band<T>[] = []
  for (const p of orderPhases(phases)) {
    const s = toDayNumber(p.start_date)
    const e = toDayNumber(endOf(p))
    if (e < first || s > last || e < s) continue
    const a = Math.max(s, first)
    const b = Math.min(e, last)
    let lane = lanes.findIndex((end) => end < a)
    if (lane === -1) { lane = lanes.length; lanes.push(b) } else lanes[lane] = b
    out.push({ phase: p, from: (a - first) / days, to: (b - first + 1) / days, lane, before: s < first, after: e > last })
  }
  return out
}

/** The phase a day falls in, and which of its weeks (the latest-starting one when two overlap). */
export function phaseOn<T extends Phase>(phases: T[], day: string): { phase: T; week: number; weeks: number } | null {
  const n = toDayNumber(day)
  const on = orderPhases(phases).filter((p) => toDayNumber(p.start_date) <= n && n <= toDayNumber(endOf(p)))
  const p = on.at(-1)
  if (!p) return null
  return { phase: p, week: Math.floor((n - toDayNumber(p.start_date)) / 7) + 1, weeks: phaseWeeks(p) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "5 Jan", "5 Jan 2027" when not in `year`. */
export function shortDay(day: string, year?: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${year != null && y !== year ? ` ${y}` : ''}`
}

/** "6 weeks · 5 Jan to 15 Feb". */
export function describePhase(p: Pick<Phase, 'start_date' | 'end_date'>, year?: number): string {
  const w = phaseWeeks(p)
  return `${w} ${w === 1 ? 'week' : 'weeks'} · ${shortDay(p.start_date, year)} to ${shortDay(endOf(p), year)}`
}

/** The day after the last phase ends: where a new one most likely starts. */
export function nextPhaseStart(phases: Phase[], today: string): string {
  const ends = live(phases).map(endOf).filter((d) => d >= today).sort()
  return ends.length ? addDays(ends.at(-1)!, 1) : today
}

/** A phase's colour: its own, else the accent. */
export const phaseColour = (p: Pick<Phase, 'colour'>) => p.colour ?? 'var(--e-accent)'
