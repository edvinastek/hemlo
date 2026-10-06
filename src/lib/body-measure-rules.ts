/** Health's extras, worked out with no database and no React (checked in
 *  src/test/bodymeasures.check.mjs):
 *
 *  - More body measures (HLT-04): Health keeps a "Measure" record (in the
 *    record store, so the person can add any field to it in Edit module),
 *    with a ready-made set offered there: hips, chest, arm, thigh and body
 *    fat. Each number field is a measure with its own line on the page and
 *    in Stats (averaged, as recordMeasures does for fields marked so).
 *  - The weigh-in day (HLT-05): one day of the week, or any day (the
 *    default). The server's `weigh_in_day` name is kept, in Health's own
 *    settings (module_instance.settings), with 0 as Sunday as in series
 *    rules. On that day Today offers the weigh-in and, at the chosen time,
 *    a reminder asks for it. Days are 'yyyy-MM-dd'. */
import type { EntityDef, FieldDef } from '../modules/types'

/* ---------- more body measures (HLT-04) ------------------------------------------- */

/** The entity in Health that holds the measures, and its date field. */
export const MEASURE_ENTITY = 'measure'
export const MEASURE_DATE = 'measure_date'

/** The ready-made set Edit module offers, all averaged in Stats. */
export const BODY_MEASURE_SET: FieldDef[] = [
  { name: 'hips_cm', label: 'Hips', type: 'number', unit: 'cm', width: 90, stats: 'average' },
  { name: 'chest_cm', label: 'Chest', type: 'number', unit: 'cm', width: 90, stats: 'average' },
  { name: 'arm_cm', label: 'Arm', type: 'number', unit: 'cm', width: 90, stats: 'average' },
  { name: 'thigh_cm', label: 'Thigh', type: 'number', unit: 'cm', width: 90, stats: 'average' },
  { name: 'body_fat_pct', label: 'Body fat', type: 'number', unit: '%', width: 90, stats: 'average' },
]

/** The fields of the set the entity does not have yet (by name or by label). */
export function missingFromSet(fields: FieldDef[]): FieldDef[] {
  const names = new Set(fields.map((f) => f.name))
  const labels = new Set(fields.map((f) => f.label.trim().toLowerCase()))
  return BODY_MEASURE_SET.filter((f) => !names.has(f.name) && !labels.has(f.label.toLowerCase())).map((f) => ({ ...f }))
}

const NUMERIC = new Set(['number', 'integer', 'decimal', 'duration', 'formula', 'rating'])

/** The measures shown on the Health page: the entity's number fields that
 *  are not hidden. None: the page shows nothing new (calm by default). */
export function measureFields(entity: EntityDef | undefined): FieldDef[] {
  return (entity?.fields ?? []).filter((f) => !f.hidden && NUMERIC.has(f.type) && f.type !== 'formula')
}

export interface MeasureRec { id: string; data: Record<string, unknown>; record_date: string | null; deleted_at?: string | null; updated_at?: string }
export interface MeasurePoint { day: string; value: number }

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** A measure record's day: its own date field, else the record's day. */
export function measureDay(r: MeasureRec): string | null {
  const d = typeof r.data?.[MEASURE_DATE] === 'string' ? r.data[MEASURE_DATE] as string : r.record_date
  return d && DAY.test(d) ? d : null
}

const value = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** One measure over time, oldest first, one point a day (the record changed
 *  last wins when a day has two). */
export function measureSeries(recs: MeasureRec[], field: string): MeasurePoint[] {
  const byDay = new Map<string, { value: number; at: string }>()
  for (const r of recs) {
    if (r.deleted_at) continue
    const d = measureDay(r)
    const v = value(r.data?.[field])
    if (!d || v == null) continue
    const at = r.updated_at ?? ''
    const was = byDay.get(d)
    if (!was || at >= was.at) byDay.set(d, { value: v, at })
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, x]) => ({ day, value: x.value }))
}

/** The latest of a measure and how it moved since the one before. */
export function latestMeasure(series: MeasurePoint[]): { day: string; value: number; change: number | null } | null {
  const last = series.at(-1)
  if (!last) return null
  const prev = series.at(-2)
  return { day: last.day, value: last.value, change: prev ? Math.round((last.value - prev.value) * 10) / 10 : null }
}

/** "98.5 cm", "21.3%". */
export function describeMeasure(v: number, unit: string | undefined): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1)
  if (!unit) return n
  return unit === '%' ? `${n}%` : `${n} ${unit}`
}

/** "+0.5", "−1.2", "no change". */
export function describeMeasureChange(c: number | null, unit: string | undefined): string | null {
  if (c == null) return null
  if (c === 0) return 'no change'
  const n = Math.abs(c).toFixed(1)
  return `${c > 0 ? '+' : '−'}${unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n}`
}

/** The record of a day to change, if there is one, so a day keeps one record. */
export function recordOfDay<T extends MeasureRec>(recs: T[], day: string): T | null {
  return recs.filter((r) => !r.deleted_at && measureDay(r) === day)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0] ?? null
}

/* ---------- the weigh-in day (HLT-05) ---------------------------------------------- */

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** The order the choice lists them in: Monday first. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface WeighInPlan {
  /** 0 (Sunday) to 6; null: any day. */
  day: number | null
  /** The reminder's time; null: no reminder. */
  time: string | null
}

/** Health's settings, read safely: any day and no reminder unless chosen. */
export function readWeighInPlan(settings: unknown): WeighInPlan {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const d = s.weigh_in_day
  const t = typeof s.weigh_in_time === 'string' ? s.weigh_in_time.slice(0, 5) : null
  return { day: Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6 ? d as number : null, time: t && TIME.test(t) ? t : null }
}

const weekdayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Is the day a weigh-in day? Every day is, when none is chosen. */
export const isWeighInDay = (plan: Pick<WeighInPlan, 'day'>, day: string) => plan.day == null || weekdayOf(day) === plan.day

/** Today's Body tab offers the weigh-in: on a weigh-in day, or whenever one
 *  is logged for the day (so a weigh-in on another day is never hidden). */
export const offerWeighIn = (plan: Pick<WeighInPlan, 'day'>, day: string, today: string, logged: boolean) =>
  logged || (day === today && isWeighInDay(plan, day))

/** The days among `days` that get a weigh-in reminder: weigh-in days with a
 *  time set, not yet weighed. */
export function weighInReminderDays(plan: WeighInPlan, days: string[], weighed: Set<string>): string[] {
  if (!plan.time) return []
  return days.filter((d) => isWeighInDay(plan, d) && !weighed.has(d))
}

/** "Mondays at 07:30", "Any day", "Sundays". */
export function describeWeighInPlan(plan: WeighInPlan): string {
  const when = plan.day == null ? (plan.time ? 'Every day' : 'Any day') : `${WEEKDAY_NAMES[plan.day]}s`
  return plan.time ? `${when} at ${plan.time}` : when
}

/** The reminder's words. */
export const weighInReminderText = (persona: string | null) => ({ title: persona || 'Hemlo', body: 'Time to weigh in.' })
