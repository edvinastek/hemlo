import type { FieldDef, ModuleDef } from '../modules/types.ts'
import { LIMITS, firstDateField, mainField } from '../modules/def-rules.ts'
import { addDays, weekdayOf } from './series-rules.ts'

/** What can leave the app and come back in: every module's records, tasks,
 *  the calendar, notes and figures for charts, as CSV, Excel, JSON or a
 *  calendar file. Pure: no database, no React, so every rule is checked in
 *  src/test/transfer.check.mjs. The reading and writing is in transfer.ts.
 *
 *  An imported file is someone else's data until proven otherwise: it is
 *  never run, it is capped in size and rows, and every value is checked
 *  against its field before anything is saved. */

export type Format = 'csv' | 'xlsx' | 'json' | 'ics' | 'txt'

export const FORMATS: Record<Format, { label: string; ext: string; mime: string }> = {
  csv: { label: 'CSV (Excel, Google Sheets)', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  xlsx: { label: 'Excel workbook', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  json: { label: 'JSON', ext: 'json', mime: 'application/json' },
  ics: { label: 'Calendar file (.ics)', ext: 'ics', mime: 'text/calendar;charset=utf-8' },
  txt: { label: 'Text (.md)', ext: 'md', mime: 'text/markdown;charset=utf-8' },
}

/** Limits on a file read in. */
export const IMPORT_LIMITS = { bytes: 5 * 1024 * 1024, rows: 20000, columns: 200, cell: 20000 }

/* ---------- the catalogue --------------------------------------------------- */

/** Where a dataset's rows live, which decides how they are read and saved. */
export type Store =
  | 'record' | 'food' | 'recipe' | 'body_log' | 'habit' | 'supplement' | 'meal_plan_slot' | 'stock'
  | 'tasks' | 'notes' | 'calendar' | 'stats' | 'backup'

export interface Dataset {
  key: string
  label: string
  group: 'Planner' | 'Modules' | 'Account'
  store: Store
  moduleKey?: string
  entity?: string
  fields: FieldDef[]
  /** The field its rows are dated by; a dataset with one can be cut to a
   *  day, week or month and written as a calendar file. */
  dateField: string | null
  formats: Format[]
  /** Formats a file of this dataset can be read from; empty when it cannot. */
  imports: Format[]
  /** Fields that say two rows are the same thing (a food's name, a night's
   *  date). Null: two rows are the same when every field is. */
  natural: string[] | null
  /** Other header names a column may have, by field. */
  aliases?: Record<string, string[]>
  /** Numbers the server's columns can hold, by field. */
  bounds?: Record<string, [number, number]>
  /** Module switched off: listed, marked. */
  off?: boolean
}

const TABLE_FORMATS: Format[] = ['csv', 'xlsx', 'json']

/** Tables whose records module pages read and write (records.ts). */
export const RECORD_TABLES = ['calendar_event', 'sleep_log', 'workout_log', 'goal']
const OWN_STORES: Record<string, Store> = {
  food: 'food', recipe: 'recipe', body_log: 'body_log', habit: 'habit', supplement: 'supplement', meal_plan_slot: 'meal_plan_slot',
}
const NATURAL: Record<string, string[]> = {
  food: ['name'], recipe: ['name'], habit: ['name'], supplement: ['name'],
  body_log: ['log_date'], sleep_log: ['log_date'], calendar_event: ['title', 'starts_at'],
}
const BOUNDS: Record<string, Record<string, [number, number]>> = {
  food: { kcal: [0, 99999], protein_g: [0, 99999], carbs_g: [0, 99999], fat_g: [0, 99999], fiber_g: [0, 99999] },
  recipe: { portions_per_batch: [0.01, 999], cook_minutes: [0, 100000] },
  body_log: { weight_kg: [1, 999], waist_cm: [1, 9999] },
  sleep_log: { quality: [0, 10] },
  workout_log: { load_kg: [0, 99999], set_number: [0, 1000], reps_achieved: [0, 100000], seconds: [0, 1000000] },
}

export const TASK_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Task', type: 'text', required: true },
  { name: 'planned_date', label: 'Day', type: 'date' },
  { name: 'planned_time', label: 'Time', type: 'time' },
  { name: 'duration_min', label: 'Length', type: 'duration', unit: 'min' },
  { name: 'status', label: 'Status', type: 'select', options: ['todo', 'done', 'pushed', 'stuck', 'dropped'] },
  { name: 'category', label: 'Category', type: 'text' },
  { name: 'module_key', label: 'Module', type: 'text' },
  { name: 'notes', label: 'Notes', type: 'text' },
  { name: 'due_date', label: 'Due', type: 'date' },
]
const TASK_ALIASES: Record<string, string[]> = {
  title: ['title', 'summary', 'subject', 'name', 'what'],
  planned_date: ['date', 'start date', 'planned'],
  planned_time: ['start time', 'start', 'at'],
  duration_min: ['duration', 'minutes', 'mins'],
  notes: ['note', 'description', 'details'],
}

export const NOTE_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Task', type: 'text', required: true },
  { name: 'planned_date', label: 'Day', type: 'date' },
  { name: 'notes', label: 'Note', type: 'text', required: true },
]

/** The calendar as Google Calendar's own CSV names its columns, so the file
 *  imports there as it is. */
export const CALENDAR_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Subject', type: 'text', required: true },
  { name: 'date', label: 'Start Date', type: 'date', required: true },
  { name: 'time', label: 'Start Time', type: 'time' },
  { name: 'end_date', label: 'End Date', type: 'date' },
  { name: 'end_time', label: 'End Time', type: 'time' },
  { name: 'all_day', label: 'All Day Event', type: 'boolean' },
  { name: 'notes', label: 'Description', type: 'text' },
  { name: 'location', label: 'Location', type: 'text' },
]
const CALENDAR_ALIASES: Record<string, string[]> = {
  title: ['title', 'summary', 'event', 'task', 'name'],
  date: ['date', 'day', 'start'],
  time: ['time'],
  end_date: ['last day'],
  end_time: ['end', 'until'],
  all_day: ['all day', 'whole day'],
  notes: ['notes', 'note', 'details'],
  location: ['where', 'place'],
}

export const STATS_FIELDS: FieldDef[] = [
  { name: 'date', label: 'Date', type: 'date' },
  { name: 'module', label: 'Module', type: 'text' },
  { name: 'measure', label: 'Measure', type: 'text' },
  { name: 'value', label: 'Value', type: 'number' },
  { name: 'unit', label: 'Unit', type: 'text' },
]

export const STOCK_FIELDS: FieldDef[] = [
  { name: 'food', label: 'Food', type: 'text' },
  { name: 'grams_on_hand', label: 'In stock', type: 'number', unit: 'g' },
  // Shown as, when it is kept in one of the food's units: 12 (egg).
  { name: 'unit_qty', label: 'How many', type: 'number' },
  { name: 'unit', label: 'Unit', type: 'text' },
  { name: 'note', label: 'Note', type: 'text' },
]

export const PLANNER: Dataset[] = [
  {
    key: 'tasks', label: 'Tasks', group: 'Planner', store: 'tasks', fields: TASK_FIELDS, dateField: 'planned_date',
    formats: [...TABLE_FORMATS, 'ics'], imports: [...TABLE_FORMATS, 'ics'], natural: ['title', 'planned_date', 'planned_time'], aliases: TASK_ALIASES,
    bounds: { duration_min: [0, 10080] },
  },
  {
    key: 'calendar', label: 'Calendar (tasks, repeats and events)', group: 'Planner', store: 'calendar', fields: CALENDAR_FIELDS,
    dateField: 'date', formats: ['ics', ...TABLE_FORMATS], imports: ['ics', ...TABLE_FORMATS], natural: ['title', 'date', 'time'],
    aliases: CALENDAR_ALIASES,
  },
  {
    key: 'notes', label: 'Notes', group: 'Planner', store: 'notes', fields: NOTE_FIELDS, dateField: 'planned_date',
    formats: [...TABLE_FORMATS, 'txt'], imports: TABLE_FORMATS, natural: ['title', 'planned_date', 'notes'], aliases: TASK_ALIASES,
  },
  {
    key: 'stats', label: 'Stats (one figure per row, for charts)', group: 'Planner', store: 'stats', fields: STATS_FIELDS,
    dateField: 'date', formats: TABLE_FORMATS, imports: [], natural: null,
  },
]

export const BACKUP: Dataset = {
  key: 'backup', label: 'Whole account (backup file)', group: 'Account', store: 'backup', fields: [], dateField: null,
  formats: ['json'], imports: ['json'], natural: null,
}

/** Every dataset this profile has: the planner's, then each module's
 *  entities (built-in and built), then the whole-account backup. */
export function listDatasetsFrom(modules: { def: ModuleDef; enabled: boolean }[]): Dataset[] {
  const out: Dataset[] = [...PLANNER]
  for (const { def, enabled } of modules) {
    for (const e of def.entities) {
      const table = e.table
      const store: Store | undefined = !table || RECORD_TABLES.includes(table) ? 'record' : OWN_STORES[table]
      if (!store) continue
      let fields = e.fields.filter((f) => !!f.name)
      if (store === 'meal_plan_slot') fields = [{ name: 'slot_date', label: 'Day', type: 'date' }, ...fields]
      // A weigh-in is its weight: the page saves none without one.
      if (store === 'body_log') fields = fields.map((f) => (f.name === 'weight_kg' ? { ...f, required: true } : f))
      if (!fields.length) continue
      const dateField = firstDateField(fields)?.name ?? null
      const main = mainField(fields)
      // A calendar file carries a name and a day, so it can fill a record
      // that has a text field and a date field.
      const icsIn = store === 'record' && !!dateField && main?.type === 'text'
      out.push({
        key: `m:${def.key}:${e.name}`,
        label: def.entities.length > 1 ? `${def.name} · ${e.label}` : def.name,
        group: 'Modules',
        store,
        moduleKey: def.key,
        entity: e.name,
        fields,
        dateField,
        formats: dateField ? [...TABLE_FORMATS, 'ics'] : TABLE_FORMATS,
        imports: store === 'meal_plan_slot' ? [] : icsIn ? [...TABLE_FORMATS, 'ics'] : TABLE_FORMATS,
        natural: NATURAL[table ?? ''] ?? null,
        bounds: BOUNDS[table ?? ''],
        off: !enabled,
      })
    }
    if (def.key === 'shopping') {
      out.push({
        key: 'stock', label: 'Shopping · Stock', group: 'Modules', store: 'stock', moduleKey: 'shopping', fields: STOCK_FIELDS,
        dateField: null, formats: TABLE_FORMATS, imports: [], natural: null, off: !enabled,
      })
    }
  }
  out.push(BACKUP)
  return out
}

/* ---------- ranges ---------------------------------------------------------- */

export type RangeKind = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom'
export interface Range { from: string; to: string; label: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(0, 4)}`

/** The day, its week (Monday to Sunday), its month or its year; or two
 *  days picked. Null for everything, or for a custom range that is not one. */
export function rangeFor(kind: RangeKind, day: string, custom?: { from: string; to: string }): Range | null {
  switch (kind) {
    case 'all': return null
    case 'day': return { from: day, to: day, label: short(day) }
    case 'week': {
      const from = addDays(day, -((weekdayOf(day) + 6) % 7))
      return { from, to: addDays(from, 6), label: `week of ${short(from)}` }
    }
    case 'month': {
      const from = `${day.slice(0, 7)}-01`
      const next = Number(day.slice(5, 7)) === 12 ? `${Number(day.slice(0, 4)) + 1}-01-01` : `${day.slice(0, 5)}${String(Number(day.slice(5, 7)) + 1).padStart(2, '0')}-01`
      return { from, to: addDays(next, -1), label: `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` }
    }
    case 'year': return { from: `${day.slice(0, 4)}-01-01`, to: `${day.slice(0, 4)}-12-31`, label: day.slice(0, 4) }
    case 'custom': {
      if (!custom || !DAY.test(custom.from) || !DAY.test(custom.to) || custom.to < custom.from) return null
      return { from: custom.from, to: custom.to, label: `${short(custom.from)} to ${short(custom.to)}` }
    }
  }
}

export const inRange = (day: string | null | undefined, r: Range | null) =>
  !r || (!!day && day.slice(0, 10) >= r.from && day.slice(0, 10) <= r.to)

/** A file name people can read: getit-finance-entry-september-2026.csv */
export function fileName(label: string, range: Range | null, format: Format): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `getit-${[slug(label) || 'export', range ? slug(range.label) : null].filter(Boolean).join('-')}.${FORMATS[format].ext}`
}

/* ---------- CSV (RFC 4180) --------------------------------------------------- */

/** A cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR at
 *  the start) gets an apostrophe in front, which Excel shows as text. */
export function guardCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** A value as one CSV cell: numbers as they are, yes/no as TRUE/FALSE,
 *  text guarded and quoted when it holds a comma, a quote or a line break. */
export function csvCell(v: unknown, sep = ','): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  const s = guardCell(String(v))
  return s.includes('"') || s.includes(sep) || /[\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A whole CSV file: UTF-8 with the byte-order mark Excel needs to read
 *  letters like ė and ü, lines ending in CRLF. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map((v) => csvCell(v)).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** The separator a CSV file uses: a comma, or a semicolon (Excel in most of
 *  Europe), or a tab. Counted on the first line, outside quotes. */
export function detectSeparator(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of text.slice(0, 5000)) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch]++
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return n > 0 ? best : ','
}

/** Rows of a CSV file: quoted cells with commas, doubled quotes and line
 *  breaks inside them, CRLF or LF, a byte-order mark or none. Stops after
 *  `maxRows` rows. */
export function parseCsv(text: string, maxRows = IMPORT_LIMITS.rows + 1): { rows: string[][]; truncated: boolean } {
  const src = text.replace(/^﻿/, '')
  const sep = detectSeparator(src)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const endRow = () => { row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [] }
  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue }
        quoted = false; i++; continue
      }
      cell += ch; i++; continue
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue }
    if (ch === sep) { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      endRow()
      if (rows.length >= maxRows) return { rows, truncated: i + 1 < src.length && src.slice(i).trim() !== '' }
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += ch; i++
  }
  if (cell !== '' || row.length) endRow()
  return { rows, truncated: false }
}

/* ---------- JSON ------------------------------------------------------------- */

export interface DatasetFile {
  format: 'getit.dataset'
  version: 1
  dataset: string
  label: string
  exported_at: string
  range: Range | null
  fields: { name: string; label: string; type: string; unit?: string }[]
  rows: Record<string, unknown>[]
}

export function toJson(d: Pick<Dataset, 'key' | 'label'>, fields: FieldDef[], rows: Record<string, unknown>[], range: Range | null, at: string): string {
  const file: DatasetFile = {
    format: 'getit.dataset', version: 1, dataset: d.key, label: d.label, exported_at: at, range,
    fields: fields.map((f) => ({ name: f.name, label: f.label, type: f.type, ...(f.unit ? { unit: f.unit } : {}) })),
    rows,
  }
  return JSON.stringify(file, null, 1)
}

/** A JSON file as a table: this app's dataset file, or any list of objects
 *  (or { rows: [...] }). Only plain values are kept. */
export function jsonTable(text: string): { table: unknown[][]; dataset: string | null } | { error: string } {
  let parsed: unknown
  try { parsed = JSON.parse(text.replace(/^﻿/, '')) } catch { return { error: 'That file is not valid JSON.' } }
  const obj = parsed as Record<string, unknown>
  if (obj && typeof obj === 'object' && (obj as { format?: unknown }).format === 'getit.bundle') {
    return { error: 'That is a whole-account backup. Choose "Whole account (backup file)" to restore it.' }
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(obj?.rows) ? obj.rows as unknown[] : null
  if (!list) return { error: 'That JSON file has no list of rows in it.' }
  const rows = list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
  const headers: string[] = []
  for (const r of rows.slice(0, 1000)) {
    for (const k of Object.keys(r)) if (!headers.includes(k) && headers.length < IMPORT_LIMITS.columns) headers.push(k)
  }
  const plain = (v: unknown) => (v === null || ['string', 'number', 'boolean'].includes(typeof v) ? v : JSON.stringify(v))
  return {
    table: [headers, ...rows.map((r) => headers.map((h) => plain(r[h])))],
    dataset: typeof obj?.dataset === 'string' ? obj.dataset : null,
  }
}

/* ---------- reading columns -------------------------------------------------- */

/** A header as compared: lower case, no spaces, dashes, underscores or unit
 *  in brackets, so "Start date", "start_date" and "Protein (g)" all match. */
export function normHeader(s: string): string {
  return String(s).toLowerCase().replace(/\([^)]*\)\s*$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Which field each column fills: by field name, then label, then the
 *  dataset's other names. A field is filled by one column at most. */
export function matchHeaders(headers: string[], fields: FieldDef[], aliases: Record<string, string[]> = {}): (string | null)[] {
  const used = new Set<string>()
  const tiers: ((f: FieldDef) => string[])[] = [
    (f) => [f.name],
    (f) => [f.label, f.unit ? `${f.label} ${f.unit}` : ''],
    (f) => aliases[f.name] ?? [],
  ]
  const out: (string | null)[] = headers.map(() => null)
  for (const tier of tiers) {
    headers.forEach((h, i) => {
      if (out[i]) return
      const n = normHeader(h)
      if (!n) return
      const f = fields.find((x) => x.type !== 'formula' && !used.has(x.name) && tier(x).some((c) => c && normHeader(c) === n))
      if (f) { out[i] = f.name; used.add(f.name) }
    })
  }
  return out
}

/* ---------- reading values --------------------------------------------------- */

export interface LookupItem { id: string; name: string }
export interface ReadContext {
  /** Things a lookup field can name, by kind. */
  lookups?: Partial<Record<string, LookupItem[]>>
  /** How a date like 03/04/2026 is meant: day first (most of the world) or month first (the US, Google's CSV). */
  dateOrder?: 'dmy' | 'mdy'
}

export type Cell = string | number | boolean | Date | null | undefined
export type Read = { ok: true; value: unknown } | { ok: false; problem: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const pad = (n: number) => String(n).padStart(2, '0')
const realDay = (y: number, m: number, d: number) => {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return null
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= last ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** A spreadsheet's day number (Excel counts from 30 December 1899). */
function serialDay(n: number): string | null {
  if (!(n >= 1 && n < 120000)) return null
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000
  const d = new Date(ms)
  return realDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}
function serialTime(frac: number): string | null {
  const mins = Math.round((frac - Math.floor(frac)) * 1440)
  if (mins >= 1440) return '23:59'
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

export function readDay(raw: Cell, order: 'dmy' | 'mdy' = 'dmy'): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : realDay(raw.getFullYear(), raw.getMonth() + 1, raw.getDate())
  if (typeof raw === 'number') return serialDay(raw)
  const s = String(raw ?? '').trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return realDay(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) {
    const a = +m[1], b = +m[2]
    // A part over 12 can only be the day, whatever the file's habit.
    const monthFirst = a > 12 ? false : b > 12 ? true : order === 'mdy'
    return monthFirst ? realDay(+m[3], a, b) : realDay(+m[3], b, a)
  }
  if (/^\d{8}$/.test(s)) return realDay(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8))
  return null
}

export function readTime(raw: Cell): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : `${pad(raw.getHours())}:${pad(raw.getMinutes())}`
  if (typeof raw === 'number') return raw >= 0 && raw < 1 ? serialTime(raw) : null
  const s = String(raw ?? '').trim().toLowerCase()
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s)
  if (!m || (m[2] === undefined && !m[3])) return null
  let h = +m[1]
  const min = +(m[2] ?? 0)
  if (m[3]) {
    if (h < 1 || h > 12) return null
    if (m[3].startsWith('p') && h < 12) h += 12
    if (m[3].startsWith('a') && h === 12) h = 0
  }
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/** A number as people type it: "1,5", "1.234,5", "1,234.5", " 80 ". */
export function readNumber(raw: Cell): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'boolean' || raw instanceof Date) return null
  let s = String(raw ?? '').trim().replace(/[\s  ]/g, '')
  if (!/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // One comma is a decimal comma; several are thousands.
    s = (s.match(/,/g)!.length > 1) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const YES = ['true', 'yes', 'y', '1', 'x', 'ja', 'j', 'taip', 'done', '✓', '✔']
const NO = ['false', 'no', 'n', '0', 'nee', 'ne', '-']
const normOption = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '')

/** A text cell back as typed: the apostrophe a spreadsheet export put in
 *  front of a formula-like value comes off again. */
export const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s)

/** One cell read as its field keeps it, or a problem in words. */
export function readCell(f: FieldDef, raw: Cell, ctx: ReadContext = {}, bounds?: [number, number]): Read {
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')
  if (empty) return { ok: true, value: f.type === 'boolean' ? false : null }
  const shown = raw instanceof Date ? raw.toISOString().slice(0, 16) : String(raw).slice(0, 40)
  const bad = (what: string): Read => ({ ok: false, problem: `${f.label}: "${shown}" is not ${what}.` })
  switch (f.type) {
    case 'text': {
      const s = unguard((raw instanceof Date ? (readDay(raw) ?? '') : String(raw)).trim()).replace(/\r\n?/g, '\n').trim()
      const max = f.name === 'notes' ? IMPORT_LIMITS.cell : LIMITS.text
      return s.length > max ? { ok: false, problem: `${f.label} is longer than ${max} characters.` } : { ok: true, value: s }
    }
    case 'number': case 'integer': case 'duration': {
      const n = readNumber(typeof raw === 'string' ? unguard(raw) : raw)
      if (n === null || Math.abs(n) > 1e12) return bad(f.type === 'integer' ? 'a whole number' : 'a number')
      if (f.type === 'duration' && n < 0) return bad('a length in minutes')
      const v = f.type === 'number' ? n : Math.round(n)
      if (bounds && (v < bounds[0] || v > bounds[1])) return { ok: false, problem: `${f.label}: ${v} is outside ${bounds[0]} to ${bounds[1]}.` }
      return { ok: true, value: v }
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw }
      const s = String(raw).trim().toLowerCase()
      if (YES.includes(s)) return { ok: true, value: true }
      if (NO.includes(s)) return { ok: true, value: false }
      return bad('yes or no')
    }
    case 'date': {
      const d = readDay(raw, ctx.dateOrder)
      return d ? { ok: true, value: d } : bad('a date')
    }
    case 'time': {
      const t = readTime(raw)
      return t ? { ok: true, value: t } : bad('a time')
    }
    case 'datetime': {
      if (raw instanceof Date) {
        const d = readDay(raw)
        return d ? { ok: true, value: `${d}T${readTime(raw)}` } : bad('a date and time')
      }
      if (typeof raw === 'number') {
        const d = serialDay(raw)
        return d ? { ok: true, value: `${d}T${serialTime(raw)}` } : bad('a date and time')
      }
      const s = String(raw).trim()
      const m = /^(.+?)[T\s]+(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)$/i.exec(s)
      const d = readDay(m ? m[1] : s, ctx.dateOrder)
      const t = m ? readTime(m[2]) : '00:00'
      return d && t ? { ok: true, value: `${d}T${t}` } : bad('a date and time')
    }
    case 'select': {
      const s = normOption(String(raw))
      const hit = (f.options ?? []).find((o) => normOption(o) === s)
      return hit ? { ok: true, value: hit } : { ok: false, problem: `${f.label}: "${shown}" is not one of ${(f.options ?? []).join(', ')}.` }
    }
    case 'lookup': {
      const items = (f.lookup && ctx.lookups?.[f.lookup]) || []
      const s = String(raw).trim()
      const hit = items.find((i) => i.id === s) ?? items.find((i) => i.name.toLowerCase() === s.toLowerCase())
      return hit ? { ok: true, value: hit.id } : { ok: false, problem: `${f.label}: "${shown}" was not found.` }
    }
    case 'formula': return { ok: true, value: undefined }
  }
  return bad('a value')
}

/** Month first or day first, from the file's own dates: a first part over
 *  12 settles it one way, a second part over 12 the other. */
export function guessDateOrder(cells: Cell[], fallback: 'dmy' | 'mdy' = 'dmy'): 'dmy' | 'mdy' {
  for (const c of cells) {
    const m = typeof c === 'string' ? /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/.exec(c.trim()) : null
    if (!m) continue
    if (+m[1] > 12) return 'dmy'
    if (+m[2] > 12) return 'mdy'
  }
  return fallback
}

/* ---------- a whole file, planned --------------------------------------------- */

export interface PlannedRow {
  /** The row's line in the file, counting the header as line 1. */
  line: number
  values: Record<string, unknown>
  problems: string[]
  duplicate: boolean
}

export interface ImportPlan {
  columns: { header: string; field: string | null }[]
  /** Required fields no column fills, by label. */
  missing: string[]
  rows: PlannedRow[]
  valid: number
  duplicates: number
  withProblems: number
  truncated: boolean
}

const keyPart = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v.trim().toLowerCase() : String(v))

/** What says two rows are the same thing, as one string. */
export function rowKey(fields: FieldDef[], natural: string[] | null, values: Record<string, unknown>): string {
  const names = natural ?? fields.filter((f) => f.type !== 'formula').map((f) => f.name)
  return names.map((n) => keyPart(values[n])).join('␟')
}

/** A file's rows checked against the dataset's fields, before anything is
 *  saved: which column fills which field, each row's values, its problems,
 *  and whether it is already here (or earlier in the same file). */
export function planImport(table: Cell[][], d: Pick<Dataset, 'fields' | 'natural' | 'aliases' | 'bounds' | 'store'>,
  existing: Set<string>, ctx: ReadContext = {}, maxRows = IMPORT_LIMITS.rows): ImportPlan {
  const start = table.findIndex((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  const headers = start < 0 ? [] : table[start].slice(0, IMPORT_LIMITS.columns).map((c) => String(c ?? '').trim())
  const map = matchHeaders(headers, d.fields, d.aliases)
  const filled = new Set(map.filter(Boolean) as string[])
  const missing = d.fields.filter((f) => f.required && !filled.has(f.name)).map((f) => f.label)
  const body = start < 0 ? [] : table.slice(start + 1)
  const dateCols = map.map((f, i) => (f && ['date', 'datetime'].includes(d.fields.find((x) => x.name === f)!.type) ? i : -1)).filter((i) => i >= 0)
  const order = ctx.dateOrder ?? guessDateOrder(body.slice(0, 2000).flatMap((r) => dateCols.map((i) => r[i])), d.store === 'calendar' ? 'mdy' : 'dmy')
  const context = { ...ctx, dateOrder: order }
  const seen = new Set(existing)
  const rows: PlannedRow[] = []
  let truncated = false
  for (let r = 0; r < body.length; r++) {
    const cells = body[r]
    if (!cells || cells.every((c) => c === null || c === undefined || String(c).trim() === '')) continue
    if (rows.length >= maxRows) { truncated = true; break }
    const values: Record<string, unknown> = {}
    const problems: string[] = []
    map.forEach((name, i) => {
      if (!name) return
      const f = d.fields.find((x) => x.name === name)!
      if (f.type === 'formula') return
      const raw = cells[i]
      if (typeof raw === 'string' && raw.length > IMPORT_LIMITS.cell) { problems.push(`${f.label} is too long.`); return }
      const res = readCell(f, raw, context, d.bounds?.[name])
      if (res.ok) values[name] = res.value
      else problems.push(res.problem)
    })
    for (const f of d.fields) {
      if (f.required && filled.has(f.name) && (values[f.name] === null || values[f.name] === undefined || values[f.name] === '')
        && !problems.some((p) => p.startsWith(`${f.label}:`))) problems.push(`${f.label} is needed.`)
    }
    const key = rowKey(d.fields, d.natural, values)
    const duplicate = !problems.length && seen.has(key)
    if (!problems.length) seen.add(key)
    rows.push({ line: start + r + 2, values, problems, duplicate })
  }
  return {
    columns: headers.map((h, i) => ({ header: h, field: map[i] })),
    missing,
    rows,
    valid: missing.length ? 0 : rows.filter((r) => !r.problems.length && !r.duplicate).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    withProblems: rows.filter((r) => r.problems.length).length,
    truncated,
  }
}

/* ---------- writing values ----------------------------------------------------- */

/** A stored value as a file shows it: a linked thing by its name, a
 *  date-time with a space ("2026-09-28 09:30", which Excel reads as one). */
export function cellValue(f: FieldDef, v: unknown, names: Partial<Record<string, Map<string, string>>> = {}): string | number | boolean | null {
  if (v === null || v === undefined || v === '') return null
  switch (f.type) {
    case 'boolean': return !!v
    case 'number': case 'integer': case 'duration': case 'formula': {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null
    }
    case 'datetime': return String(v).slice(0, 16).replace('T', ' ')
    case 'lookup': return (f.lookup && names[f.lookup]?.get(String(v))) ?? String(v)
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
}

/** Google Calendar's CSV wants 09/28/2026 and 9:30 AM. */
export function googleDate(day: string | null): string | null {
  return day && DAY.test(day) ? `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}` : null
}
export function googleTime(t: string | null): string | null {
  if (!t || !/^\d{2}:\d{2}/.test(t)) return null
  const h = +t.slice(0, 2)
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`
}

/** Figures for a chart, one per row: every number of every dated record. */
export function statsRows(recs: { module: string; date: string | null; fields: FieldDef[]; values: Record<string, unknown> }[]):
  { date: string; module: string; measure: string; value: number; unit: string | null }[] {
  const out: { date: string; module: string; measure: string; value: number; unit: string | null }[] = []
  for (const r of recs) {
    if (!r.date) continue
    for (const f of r.fields) {
      if (!['number', 'integer', 'duration', 'formula'].includes(f.type)) continue
      const v = r.values[f.name]
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
      if (!Number.isFinite(n)) continue
      out.push({ date: r.date.slice(0, 10), module: r.module, measure: f.label, value: Math.round(n * 1000) / 1000, unit: f.unit ?? (f.type === 'duration' ? 'min' : null) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.module.localeCompare(b.module) || a.measure.localeCompare(b.measure))
}

/** Per day: tasks planned, tasks done, minutes done. */
export function taskStats(tasks: { planned_date: string | null; status: string; duration_min: number | null; deleted_at?: string | null }[]):
  { date: string; module: string; measure: string; value: number; unit: string | null }[] {
  const byDay = new Map<string, { planned: number; done: number; minutes: number }>()
  for (const t of tasks) {
    if (t.deleted_at || !t.planned_date || t.status === 'dropped') continue
    const d = byDay.get(t.planned_date) ?? { planned: 0, done: 0, minutes: 0 }
    d.planned++
    if (t.status === 'done') { d.done++; d.minutes += t.duration_min ?? 0 }
    byDay.set(t.planned_date, d)
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).flatMap(([date, d]) => [
    { date, module: 'Tasks', measure: 'Planned', value: d.planned, unit: null },
    { date, module: 'Tasks', measure: 'Done', value: d.done, unit: null },
    { date, module: 'Tasks', measure: 'Minutes done', value: d.minutes, unit: 'min' },
  ])
}

/** A note as a text file: the task's name as a heading, its day, the note. */
export function noteText(title: string, day: string | null, notes: string | null): string {
  return `# ${title.trim() || 'Untitled task'}\n\n${day ? `${short(day)}\n\n` : ''}${(notes ?? '').trim()}\n`
}

/** Column headers: each field's label, or its name where two labels match. */
export function headersFor(fields: FieldDef[]): string[] {
  return fields.map((f) => (fields.filter((x) => x.label.toLowerCase() === f.label.toLowerCase()).length > 1 ? f.name : f.label))
}

/** The format a file is in, from its name. */
export function formatOfFile(name: string): Format | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv'
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods') return 'xlsx'
  if (ext === 'json') return 'json'
  if (ext === 'ics' || ext === 'ical' || ext === 'ifb' || ext === 'icalendar') return 'ics'
  return null
}
