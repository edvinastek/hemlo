import type { FieldDef } from './types.ts'
import { computeFormulas, firstDateField, isDateLike, isEmpty, mainField } from './def-rules.ts'
import { fold } from '../lib/search-rules.ts'
import { REPEAT_KEY } from './repeat-rules.ts'

/** A module's records as a list a person arranges (competitor review 4.2,
 *  GEN-52, CALM-08): sorted and filtered by any field, copied, and a
 *  record's form split into what is needed and "More options". Pure: no
 *  database and no React, so every rule is checked in
 *  src/test/modulelists.check.mjs. */

export interface ListRec { id: string; values: Record<string, unknown> }

/* ---------- sort and filter ---------------------------------------------- */

export type SortDir = 'asc' | 'desc'
export type FilterOp = 'is' | 'not' | 'has' | 'filled' | 'empty' | 'gt' | 'lt' | 'yes' | 'no'

export interface ListOrder {
  sort?: { field: string; dir: SortDir } | null
  filter?: { field: string; op: FilterOp; value?: string | null } | null
}

/** Kinds that cannot be put in order or compared (a checklist, a note). */
const UNSORTABLE = new Set(['checklist', 'note', 'photo'])
const NUMBERS = new Set(['number', 'integer', 'duration', 'formula', 'rating', 'percent', 'money'])
const OPS = new Set<FilterOp>(['is', 'not', 'has', 'filled', 'empty', 'gt', 'lt', 'yes', 'no'])

/** The fields a list can be sorted by. */
export const sortableFields = (fields: FieldDef[]) => fields.filter((f) => !f.hidden && !UNSORTABLE.has(f.type))
/** The fields a list can be filtered by (every shown one). */
export const filterableFields = (fields: FieldDef[]) => fields.filter((f) => !f.hidden)

/** The two directions, in words that fit the field: "Lowest first",
 *  "Oldest first", "A to Z", "No first". */
export function sortDirs(f: Pick<FieldDef, 'type'>): { dir: SortDir; label: string }[] {
  if (NUMBERS.has(f.type)) return [{ dir: 'desc', label: 'Highest first' }, { dir: 'asc', label: 'Lowest first' }]
  if (isDateLike(f) || f.type === 'time' || f.type === 'timespan') return [{ dir: 'desc', label: 'Newest first' }, { dir: 'asc', label: 'Oldest first' }]
  if (f.type === 'boolean') return [{ dir: 'desc', label: 'Yes first' }, { dir: 'asc', label: 'No first' }]
  return [{ dir: 'asc', label: 'A to Z' }, { dir: 'desc', label: 'Z to A' }]
}

/** The tests a field can be filtered with, the likeliest first. */
export function filterOps(f: Pick<FieldDef, 'type' | 'options'>): { op: FilterOp; label: string; needsValue: boolean }[] {
  const filled = [{ op: 'filled' as const, label: 'is filled in', needsValue: false }, { op: 'empty' as const, label: 'is empty', needsValue: false }]
  if (f.type === 'boolean') return [{ op: 'yes', label: 'is yes', needsValue: false }, { op: 'no', label: 'is no', needsValue: false }]
  if (f.type === 'photo') return [{ op: 'filled', label: 'is there', needsValue: false }, { op: 'empty', label: 'is missing', needsValue: false }]
  if (NUMBERS.has(f.type)) return [{ op: 'gt', label: 'is more than', needsValue: true }, { op: 'lt', label: 'is less than', needsValue: true }, { op: 'is', label: 'is', needsValue: true }, ...filled]
  if (isDateLike(f)) return [{ op: 'gt', label: 'is after', needsValue: true }, { op: 'lt', label: 'is before', needsValue: true }, { op: 'is', label: 'is on', needsValue: true }, ...filled]
  if (f.type === 'select') return [{ op: 'is', label: 'is', needsValue: true }, { op: 'not', label: 'is not', needsValue: true }, ...filled]
  if (f.type === 'multi') return [{ op: 'has', label: 'includes', needsValue: true }, { op: 'not', label: 'does not include', needsValue: true }, ...filled]
  return [{ op: 'has', label: 'contains', needsValue: true }, { op: 'is', label: 'is', needsValue: true }, { op: 'not', label: 'is not', needsValue: true }, ...filled]
}

/** The arrangement kept for a view, checked: a field that has gone, or a
 *  test the field cannot take, is dropped rather than trusted. */
export function readOrder(raw: unknown, fields: FieldDef[]): ListOrder {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ListOrder = {}
  const s = r.sort as Record<string, unknown> | null | undefined
  const sf = s && typeof s.field === 'string' ? sortableFields(fields).find((f) => f.name === s.field) : undefined
  if (sf) out.sort = { field: sf.name, dir: s!.dir === 'desc' ? 'desc' : 'asc' }
  const fl = r.filter as Record<string, unknown> | null | undefined
  const ff = fl && typeof fl.field === 'string' ? filterableFields(fields).find((f) => f.name === fl.field) : undefined
  const op = fl?.op as FilterOp
  if (ff && OPS.has(op) && filterOps(ff).some((o) => o.op === op)) {
    const needs = filterOps(ff).find((o) => o.op === op)!.needsValue
    const value = typeof fl!.value === 'string' || typeof fl!.value === 'number' ? String(fl!.value).trim().slice(0, 80) : ''
    if (!needs || value) out.filter = { field: ff.name, op, value: needs ? value : null }
  }
  return out
}

/** Every view's arrangement, as kept in the module's settings, checked. */
export function readOrders(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) if (/^[a-z0-9_:-]{1,90}$/i.test(k) && v && typeof v === 'object') out[k] = v
  return out
}

const valueOf = (f: FieldDef, rec: ListRec, fields: FieldDef[]) => (f.type === 'formula' ? computeFormulas(fields, rec.values)[f.name] ?? null : rec.values[f.name])
const toNum = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN; return Number.isFinite(n) ? n : null }

/** A value as something to compare: a number for numbers, the text a
 *  person reads for the rest (`text` gives a link's name). */
function sortKey(f: FieldDef, v: unknown, text: (f: FieldDef, v: unknown) => string): number | string | null {
  if (isEmpty(v) || (Array.isArray(v) && !v.length)) return null
  if (NUMBERS.has(f.type)) return toNum(v)
  if (f.type === 'boolean') return v ? 1 : 0
  if (isDateLike(f) || f.type === 'time' || f.type === 'timespan') return String(v)
  return fold(text(f, v))
}

/** The records in the order asked for. Empty values go last whichever way
 *  round, and records that tie keep the order they came in. */
export function sortRecs<T extends ListRec>(recs: T[], fields: FieldDef[], sort: ListOrder['sort'], text: (f: FieldDef, v: unknown) => string = (_f, v) => String(v)): T[] {
  const f = sort ? fields.find((x) => x.name === sort.field) : undefined
  if (!sort || !f) return recs
  const keyed = recs.map((r, i) => ({ r, i, k: sortKey(f, valueOf(f, r, fields), text) }))
  const sign = sort.dir === 'desc' ? -1 : 1
  keyed.sort((a, b) => {
    if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1
    const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'en-GB')
    return c !== 0 ? c * sign : a.i - b.i
  })
  return keyed.map((x) => x.r)
}

/** Whether a record passes the filter. Words compare the way the one
 *  search does (case and accents ignored); numbers and days as such. */
export function passesFilter(rec: ListRec, fields: FieldDef[], filter: ListOrder['filter'], text: (f: FieldDef, v: unknown) => string = (_f, v) => String(v)): boolean {
  const f = filter ? fields.find((x) => x.name === filter.field) : undefined
  if (!filter || !f) return true
  const v = valueOf(f, rec, fields)
  const empty = isEmpty(v) || (Array.isArray(v) && !v.length) || (f.type === 'boolean' && !v)
  const want = String(filter.value ?? '')
  switch (filter.op) {
    case 'filled': return !empty
    case 'empty': return empty
    case 'yes': return v === true
    case 'no': return v !== true
    case 'gt': case 'lt': {
      if (empty) return false
      if (NUMBERS.has(f.type)) {
        const a = toNum(v); const b = toNum(want)
        return a !== null && b !== null && (filter.op === 'gt' ? a > b : a < b)
      }
      const a = String(v).slice(0, 10)
      return filter.op === 'gt' ? a > want.slice(0, 10) : a < want.slice(0, 10)
    }
    case 'is': case 'not': case 'has': {
      let hit: boolean
      if (empty) hit = false
      else if (Array.isArray(v)) hit = v.some((x) => fold(String(x)) === fold(want))
      else if (NUMBERS.has(f.type)) hit = toNum(v) !== null && toNum(v) === toNum(want)
      else if (isDateLike(f)) hit = String(v).slice(0, 10) === want.slice(0, 10)
      else if (filter.op === 'has') hit = fold(text(f, v)).includes(fold(want))
      else hit = fold(text(f, v)) === fold(want)
      if (filter.op === 'has' && Array.isArray(v)) return hit
      return filter.op === 'not' ? !hit : hit
    }
  }
  return true
}

/** The records a view shows: filtered, then sorted. */
export function arrange<T extends ListRec>(recs: T[], fields: FieldDef[], order: ListOrder, text?: (f: FieldDef, v: unknown) => string): T[] {
  const kept = order.filter ? recs.filter((r) => passesFilter(r, fields, order.filter, text)) : recs
  return sortRecs(kept, fields, order.sort, text)
}

/** The quiet line over a list that is arranged: "Amount, highest first ·
 *  Category is Food". Null when it is in its own order with everything shown. */
export function orderSummary(order: ListOrder, fields: FieldDef[]): string | null {
  const parts: string[] = []
  const sf = order.sort ? fields.find((f) => f.name === order.sort!.field) : undefined
  if (sf) parts.push(`${sf.label}, ${sortDirs(sf).find((d) => d.dir === order.sort!.dir)!.label.toLowerCase()}`)
  const ff = order.filter ? fields.find((f) => f.name === order.filter!.field) : undefined
  if (ff) {
    const op = filterOps(ff).find((o) => o.op === order.filter!.op)
    if (op) parts.push(`${ff.label} ${op.label}${op.needsValue ? ` ${order.filter!.value}` : ''}`)
  }
  return parts.length ? parts.join(' · ') : null
}

/* ---------- copies --------------------------------------------------------- */

/** A record's values for a copy: calculated values and its repeat are
 *  left behind (a copy repeats only when asked); with `day`, the first date
 *  field moves to that day, keeping its time of day. */
export function copyValues(fields: FieldDef[], values: Record<string, unknown>, day?: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'formula') continue
    const v = values[f.name]
    out[f.name] = Array.isArray(v) ? [...v] : v === undefined ? null : v
  }
  delete out[REPEAT_KEY]
  const dateF = firstDateField(fields)
  if (day && dateF) {
    const was = typeof values[dateF.name] === 'string' ? String(values[dateF.name]) : ''
    out[dateF.name] = dateF.type === 'date' ? day : `${day}T${/T\d{2}:\d{2}/.test(was) ? was.slice(11, 16) : '09:00'}`
    // Other dates move by as many days (an event's end with its start).
    const shift = /^\d{4}-\d{2}-\d{2}/.test(was) ? dayNum(day) - dayNum(was.slice(0, 10)) : 0
    for (const f of fields) {
      const v = values[f.name]
      if (f === dateF || !isDateLike(f) || typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) continue
      out[f.name] = `${fromDayNum(dayNum(v.slice(0, 10)) + shift)}${v.slice(10)}`
    }
  }
  return out
}

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000)
const fromDayNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10)

/* ---------- a record's form, staged (CALM-08) --------------------------------- */

/** How many fields a form shows before "More options" is worth having. */
export const STAGE_FROM = 5

/** The fields a record's form shows at once, and the ones that wait in
 *  "More options": what makes the record (its name, its day, anything
 *  required) up front, and enough others to make three; the rest behind.
 *  A short form is shown whole. */
export function stageFields(fields: FieldDef[]): { main: FieldDef[]; more: FieldDef[] } {
  const shown = fields.filter((f) => !f.hidden)
  if (shown.length < STAGE_FROM) return { main: shown, more: [] }
  const name = mainField(shown)
  const day = firstDateField(shown)
  const keep = new Set<FieldDef>(shown.filter((f) => f.required || f === name || f === day))
  for (const f of shown) { if (keep.size >= 3) break; if (f.type !== 'formula') keep.add(f) }
  return { main: shown.filter((f) => keep.has(f)), more: shown.filter((f) => !keep.has(f)) }
}

/** What "More options" says while closed: the labels of what is filled in
 *  inside it, at most three ("Rating · Note +2"). */
export function stagedSummary(more: FieldDef[], values: Record<string, unknown>, extra: (string | null)[] = []): string | null {
  const set = more.filter((f) => f.type !== 'formula' && !isEmpty(values[f.name]) && !(Array.isArray(values[f.name]) && !(values[f.name] as unknown[]).length) && values[f.name] !== false).map((f) => f.label)
  const all = [...set, ...extra.filter((x): x is string => !!x)]
  if (!all.length) return null
  return all.length > 3 ? `${all.slice(0, 3).join(' · ')} +${all.length - 3}` : all.join(' · ')
}
