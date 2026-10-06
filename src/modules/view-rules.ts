import type { FieldDef } from './types.ts'
import { computeFormulas, isEmpty, type ChartPeriod } from './def-rules.ts'
import { fieldMeasure } from './field-kinds.ts'
import { addDays, weekStart } from '../lib/tracking-rules.ts'

/** The arithmetic behind the board, grid and chart views, with no database
 *  and no React, so each can be checked by hand in src/test/views.check.mjs.
 *  Days are local calendar days as 'yyyy-MM-dd', as everywhere else. */

/** A record as these views see it: its id and its stored values. */
export interface ViewRec { id: string; values: Record<string, unknown> }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The day part of a date or date-time value, or null. */
export function dayOf(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const d = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/** "Sun 27 Sep" */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1].slice(0, 3)}`
}

/* ---------- board --------------------------------------------------------- */

export interface BoardColumn {
  /** The option, or '' for the records with none. */
  key: string
  label: string
  ids: string[]
}

/** One column per option of the choice field, in its order. Records with no
 *  value, or one that is no longer an option, go in a last column of their
 *  own, which is only there when something is in it. */
export function boardColumns(field: Pick<FieldDef, 'label' | 'options'>, recs: ViewRec[], name: string): BoardColumn[] {
  const options = field.options ?? []
  const cols: BoardColumn[] = options.map((o) => ({ key: o, label: o, ids: [] }))
  const none: BoardColumn = { key: '', label: `No ${field.label.toLowerCase()}`, ids: [] }
  for (const r of recs) {
    const v = r.values[name]
    const col = typeof v === 'string' ? cols.find((c) => c.key === v) : undefined
    ;(col ?? none).ids.push(r.id)
  }
  return none.ids.length ? [...cols, none] : cols
}

/** Where a card can be moved to from the column it is in: every other
 *  option, and "none" when the field may be left empty. */
export function moveTargets(field: Pick<FieldDef, 'label' | 'options' | 'required'>, current: unknown): { value: string | null; label: string }[] {
  const now = typeof current === 'string' && (field.options ?? []).includes(current) ? current : null
  const out: { value: string | null; label: string }[] = (field.options ?? []).filter((o) => o !== now).map((o) => ({ value: o, label: o }))
  if (!field.required && now !== null) out.push({ value: null, label: `No ${field.label.toLowerCase()}` })
  return out
}

/* ---------- grid ---------------------------------------------------------- */

export const GRID_SPANS = [7, 14, 30] as const
export type GridSpan = typeof GRID_SPANS[number]

/** The last `span` days up to and including today, oldest first. */
export function gridDays(today: string, span: number): string[] {
  return Array.from({ length: span }, (_, i) => addDays(today, i - span + 1))
}

/** The rows: a choice field's options in order; otherwise every value the
 *  records have, in A to Z order, each once (whatever its capitals). */
export function gridRows(row: Pick<FieldDef, 'type' | 'options' | 'name'>, recs: ViewRec[]): string[] {
  if (row.type === 'select') return [...(row.options ?? [])]
  const seen = new Map<string, string>()
  for (const r of recs) {
    const v = r.values[row.name]
    if (typeof v !== 'string' || !v.trim()) continue
    const k = v.trim().toLowerCase()
    if (!seen.has(k)) seen.set(k, v.trim())
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export interface GridFields { row: FieldDef; date: FieldDef; mark?: FieldDef }

export interface GridCell {
  /** Records on that row and day, oldest change first is not promised. */
  ids: string[]
  /** Ticked: yes, a number above nought, or (with nothing to tick) a record. */
  on: boolean
  /** A number field's total for the day; null for yes/no. */
  total: number | null
}

export const cellKey = (row: string, day: string) => `${row.trim().toLowerCase()}|${day}`

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)

/** Every cell that has records, by cellKey. Cells not in the map are empty. */
export function gridCells(g: GridFields, recs: ViewRec[], days: string[]): Map<string, GridCell> {
  const inRange = new Set(days)
  const out = new Map<string, GridCell>()
  for (const r of recs) {
    const rv = r.values[g.row.name]
    const day = dayOf(r.values[g.date.name])
    if (typeof rv !== 'string' || !rv.trim() || !day || !inRange.has(day)) continue
    const k = cellKey(rv, day)
    const cell = out.get(k) ?? { ids: [], on: false, total: g.mark && g.mark.type !== 'boolean' ? 0 : null }
    cell.ids.push(r.id)
    const mv = g.mark ? r.values[g.mark.name] : undefined
    if (!g.mark) cell.on = true
    else if (g.mark.type === 'boolean') cell.on = cell.on || mv === true
    else {
      const n = num(mv)
      if (Number.isFinite(n)) cell.total = Math.round(((cell.total ?? 0) + n) * 100) / 100
      cell.on = (cell.total ?? 0) > 0
    }
    out.set(k, cell)
  }
  return out
}

export type GridAction =
  | { kind: 'add'; values: Record<string, unknown> }
  | { kind: 'update'; changes: { id: string; values: Record<string, unknown> }[] }
  | { kind: 'open'; id: string }

/** What a tap on a cell does. An empty cell gets a record for that row and
 *  day, ticked. A yes/no cell flips: ticked records are unticked, or the
 *  first record is ticked. A number cell with a record opens it, so the
 *  number can be changed; so does a cell with nothing to tick. */
export function gridTap(g: GridFields, row: string, day: string, cell: GridCell | undefined, recs: ViewRec[]): GridAction {
  if (!cell || cell.ids.length === 0) {
    const values: Record<string, unknown> = {
      [g.row.name]: row,
      [g.date.name]: g.date.type === 'datetime' ? `${day}T12:00` : day,
    }
    if (g.mark) values[g.mark.name] = g.mark.type === 'boolean' ? true : 1
    return { kind: 'add', values }
  }
  if (g.mark?.type === 'boolean') {
    const mine = recs.filter((r) => cell.ids.includes(r.id))
    if (cell.on) {
      return { kind: 'update', changes: mine.filter((r) => r.values[g.mark!.name] === true).map((r) => ({ id: r.id, values: { [g.mark!.name]: false } })) }
    }
    return { kind: 'update', changes: [{ id: cell.ids[0], values: { [g.mark.name]: true } }] }
  }
  if (g.mark && !cell.on) {
    // A number at nought (or empty) on that day: count one.
    return { kind: 'update', changes: [{ id: cell.ids[0], values: { [g.mark.name]: 1 } }] }
  }
  return { kind: 'open', id: cell.ids[0] }
}

/** Days in a row ticked, counting back from the newest day shown. */
export function rowStreak(row: string, days: string[], cells: Map<string, GridCell>): number {
  let n = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (cells.get(cellKey(row, days[i]))?.on) n++
    else if (i === days.length - 1) continue // today not done yet does not break it
    else break
  }
  return n
}

/* ---------- chart --------------------------------------------------------- */

export interface ChartBucket {
  key: string
  /** Under the axis: "27", "21 Sep", "Sep". */
  label: string
  /** Read out when picked: "Sun 27 Sep", "Week of 21 Sep", "September 2026". */
  name: string
  start: string
  end: string
  /** The sum, or null when nothing was logged in it. */
  value: number | null
}

/** How many of each are drawn, ending with the one today is in. */
export const CHART_SPAN: Record<ChartPeriod, number> = { day: 14, week: 12, month: 12 }

function monthStart(day: string): string { return `${day.slice(0, 7)}-01` }
function addMonths(first: string, n: number): string {
  const [y, m] = first.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}

/** The buckets ending with the one today falls in, each with the sum of the
 *  values on its days. Values after today, or before the first bucket, are
 *  left out. */
export function chartBuckets(points: { day: string; value: number }[], period: ChartPeriod, today: string,
  count = CHART_SPAN[period], combine: 'sum' | 'mean' = 'sum'): ChartBucket[] {
  const out: ChartBucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    let start: string; let end: string; let label: string; let name: string
    if (period === 'day') {
      start = end = addDays(today, -i)
      label = String(Number(start.slice(8)))
      name = shortDay(start)
    } else if (period === 'week') {
      start = addDays(weekStart(today), -7 * i)
      end = addDays(start, 6)
      label = `${Number(start.slice(8))} ${MONTHS[Number(start.slice(5, 7)) - 1].slice(0, 3)}`
      name = `Week of ${label}`
    } else {
      start = addMonths(monthStart(today), -i)
      end = addDays(addMonths(start, 1), -1)
      label = MONTHS[Number(start.slice(5, 7)) - 1].slice(0, 3)
      name = `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`
    }
    out.push({ key: start, label, name, start, end, value: null })
  }
  // Stars and shares (MOD-12) are averaged over a day, week or month, never added up.
  const sums = new Map<string, { sum: number; n: number }>()
  for (const p of points) {
    if (p.day > today) continue
    const b = out.find((x) => p.day >= x.start && p.day <= x.end)
    if (!b) continue
    const s = sums.get(b.key) ?? { sum: 0, n: 0 }
    s.sum += p.value; s.n++
    sums.set(b.key, s)
  }
  for (const b of out) {
    const s = sums.get(b.key)
    if (s) b.value = Math.round((combine === 'mean' ? s.sum / s.n : s.sum) * 100) / 100
  }
  return out
}

/** The records as (day, number) points, calculated fields worked out. */
export function chartPoints(fields: FieldDef[], value: FieldDef, date: FieldDef, recs: ViewRec[]): { day: string; value: number }[] {
  const out: { day: string; value: number }[] = []
  for (const r of recs) {
    const day = dayOf(r.values[date.name])
    if (!day) continue
    const raw = value.type === 'formula' ? computeFormulas(fields, r.values)[value.name] : r.values[value.name]
    if (isEmpty(raw)) continue
    // A start and end counts as its minutes (field-kinds.ts).
    const n = value.type === 'timespan' ? fieldMeasure(value)?.value(raw) ?? NaN : num(raw)
    if (Number.isFinite(n)) out.push({ day, value: n })
  }
  return out
}

/** A round top for the axis: 1, 2, 2.5 or 5 times a power of ten, at or
 *  above the largest value. Nought gives 1, so an empty chart has an axis. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v - 1e-9) return m * p
  return 10 * p
}

/** The axis from its lowest to its highest value, both round, with nought
 *  always on it: [0, top] for values that are all positive. */
export function chartDomain(values: (number | null)[]): [number, number] {
  const nums = values.filter((v): v is number => v !== null)
  const hi = Math.max(0, ...nums)
  const lo = Math.min(0, ...nums)
  if (lo === 0) return [0, niceMax(hi)]
  if (hi === 0) return [-niceMax(-lo), 0]
  const step = niceMax(Math.max(hi, -lo))
  return [-step, step]
}

/** A number for an axis or a readout: whole when it is, else two places at most. */
export function shortNumber(v: number): string {
  const r = Math.round(v * 100) / 100
  if (Math.abs(r) >= 10000) return `${Math.round(r / 1000)}k`
  return String(r)
}

/** Which labels to write under the axis so they never crowd: at most `max`,
 *  always including the last (today's). */
export function labelEvery(count: number, max = 7): (i: number) => boolean {
  const step = Math.max(1, Math.ceil(count / max))
  return (i) => (count - 1 - i) % step === 0
}
