import { format as formatDate } from 'date-fns'
import { db, getMeta } from './db'
import { edit } from './write'
import { blankTask, saveTask } from './tasks'
import { materializeSeries } from './series'
import { plan as planSeries, addDays } from './series-rules'
import { occurrenceId } from './series-rules'
import { addHabit, addSupplement } from './tracking'
import { saveWeighIn } from './body'
import { exportBundle, importBundle } from './bundle'
import { hasNote } from './notes'
import { moduleDef, moduleDefs } from '../modules/defs'
import { addRecord, isoToLocal, listRecords } from '../modules/records'
import { computeFormulas, mainField } from '../modules/def-rules'
import type { FieldDef } from '../modules/types'
import type { Profile, Series, SeriesException, Task } from './types'
import {
  buildCalendar, calendarEvent, minutesBetween, parseIcs, recordEvent, seriesEvents, taskEvent, uidFor, type IcsEvent, type ParsedEvent,
} from './ics-rules'
import {
  FORMATS, IMPORT_LIMITS, fileName, formatOfFile, googleDate, googleTime, headersFor, inRange, jsonTable, listDatasetsFrom,
  cellValue, noteText, parseCsv, planImport, rowKey, statsRows, taskStats, toCsv, toJson,
  type Cell, type Dataset, type Format, type ImportPlan, type LookupItem, type Range,
} from './transfer-rules'

export type { Dataset, Format, Range, ImportPlan }

/** Every dataset of the open profile: the planner's, each module's
 *  entities (built-in and built), and the whole-account backup. */
export async function listDatasets(profileId: string): Promise<Dataset[]> {
  const entries = await moduleDefs(profileId)
  return listDatasetsFrom(entries.map((e) => ({ def: e.def, enabled: e.enabled })))
}

export async function findDataset(profileId: string, key: string): Promise<Dataset | null> {
  return (await listDatasets(profileId)).find((d) => d.key === key) ?? null
}

/* ---------- things a lookup field names ------------------------------------ */

const live = <T extends object>(r: T) => !(r as { deleted_at?: string | null }).deleted_at

async function lookupItems(profile: Profile, kind: string): Promise<LookupItem[]> {
  switch (kind) {
    case 'food': return (await db.food.toArray()).filter(live).map((f) => ({ id: f.id, name: f.name }))
    case 'recipe': return (await db.recipe.toArray()).filter(live).map((r) => ({ id: r.id, name: r.name }))
    case 'goal': return (await db.goal.where('profile_id').equals(profile.id).toArray()).filter(live).map((g) => ({ id: g.id, name: g.title }))
    case 'task': return (await db.task.where('profile_id').equals(profile.id).toArray()).filter((t) => live(t) && t.title).map((t) => ({ id: t.id, name: t.title }))
    case 'exercise': return getMeta<LookupItem[]>('catalogue:exercise', [])
    default: return []
  }
}

async function lookupsFor(profile: Profile, fields: FieldDef[]) {
  const kinds = [...new Set(fields.filter((f) => f.type === 'lookup' && f.lookup).map((f) => f.lookup!))]
  const items: Record<string, LookupItem[]> = {}
  const names: Record<string, Map<string, string>> = {}
  for (const k of kinds) {
    items[k] = await lookupItems(profile, k)
    names[k] = new Map(items[k].map((i) => [i.id, i.name]))
  }
  return { items, names }
}

/* ---------- reading a dataset's rows --------------------------------------- */

interface Row { id: string; date: string | null; values: Record<string, unknown>; source?: unknown }

const hhmm = (t: unknown) => (typeof t === 'string' && t ? t.slice(0, 5) : null)

async function profileTasks(profileId: string): Promise<Task[]> {
  return (await db.task.where('profile_id').equals(profileId).toArray()).filter(live)
}

function taskValues(t: Task): Record<string, unknown> {
  return {
    title: t.title, planned_date: t.planned_date, planned_time: hhmm(t.planned_time), duration_min: t.duration_min,
    status: t.status, category: t.category, module_key: t.module_key, notes: t.notes, due_date: t.due_date,
  }
}

/** The calendar's flat rows: tasks with a day, and agenda events. */
async function calendarRows(profile: Profile): Promise<Row[]> {
  const out: Row[] = []
  for (const t of await profileTasks(profile.id)) {
    if (!t.planned_date || t.status === 'dropped') continue
    const time = hhmm(t.planned_time)
    const end = time && t.duration_min ? endOf(t.planned_date, time, t.duration_min) : null
    out.push({ id: t.id, date: t.planned_date, values: {
      title: t.title, date: t.planned_date, time, end_date: end?.date ?? null, end_time: end?.time ?? null, all_day: !time,
      notes: t.notes, location: null,
    } })
  }
  for (const e of (await db.calendar_event.where('profile_id').equals(profile.id).toArray()).filter(live)) {
    const start = isoToLocal(e.starts_at)
    const end = isoToLocal(e.ends_at)
    if (!start) continue
    out.push({ id: e.id, date: start.slice(0, 10), values: {
      title: e.title, date: start.slice(0, 10), time: e.all_day ? null : start.slice(11, 16),
      end_date: end?.slice(0, 10) ?? null, end_time: e.all_day ? null : end?.slice(11, 16) ?? null, all_day: e.all_day,
      notes: null, location: e.location,
    } })
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.values.time ?? '').localeCompare(String(b.values.time ?? '')))
}

function endOf(date: string, time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return { date: addDays(date, Math.floor(total / 1440)), time: `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
}

/** Rows of a dataset, values keyed by field name, newest last. */
async function readRows(profile: Profile, d: Dataset, userId: string | null): Promise<Row[]> {
  switch (d.store) {
    case 'tasks':
      return (await profileTasks(profile.id)).map((t) => ({ id: t.id, date: t.planned_date, values: taskValues(t), source: t }))
        .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    case 'notes':
      return (await profileTasks(profile.id)).filter((t) => hasNote(t.notes))
        .map((t) => ({ id: t.id, date: t.planned_date, values: { title: t.title, planned_date: t.planned_date, notes: t.notes } }))
    case 'calendar':
      return calendarRows(profile)
    case 'stats': {
      const recs: Parameters<typeof statsRows>[0] = []
      for (const other of await listDatasets(profile.id)) {
        if (other.group !== 'Modules' || !other.dateField || ['meal_plan_slot', 'stock'].includes(other.store)) continue
        const name = other.label
        for (const r of await readRows(profile, other, userId)) recs.push({ module: name, date: r.date, fields: other.fields, values: r.values })
      }
      const rows = [...statsRows(recs), ...taskStats(await profileTasks(profile.id))]
      return rows.map((r, i) => ({ id: String(i), date: r.date, values: r }))
    }
    case 'record': {
      const def = await moduleDef(d.moduleKey!, profile.id)
      const entity = def?.entities.find((e) => e.name === d.entity)
      if (!def || !entity) return []
      const recs = await listRecords(profile.id, def.key, entity)
      return recs.reverse().map((r) => ({ id: r.id, date: r.date, values: { ...r.values, ...computeFormulas(entity.fields, r.values) }, source: r.row }))
    }
    case 'food':
      return (await db.food.toArray()).filter((f) => live(f) && (!f.owner_id || f.owner_id === userId))
        .map((f) => ({ id: f.id, date: null, values: { ...f } }))
    case 'recipe':
      return (await db.recipe.toArray()).filter((r) => live(r) && (!r.owner_id || r.owner_id === userId))
        .map((r) => ({ id: r.id, date: null, values: { ...r } }))
    case 'body_log':
      return (await db.body_log.where('profile_id').equals(profile.id).sortBy('log_date')).filter(live)
        .map((r) => ({ id: r.id, date: r.log_date, values: { ...r } }))
    case 'habit':
      return (await db.habit.where('profile_id').equals(profile.id).sortBy('sort_order')).filter(live)
        .map((r) => ({ id: r.id, date: null, values: { ...r } }))
    case 'supplement':
      return (await db.supplement.where('profile_id').equals(profile.id).sortBy('sort_order')).filter(live)
        .map((r) => ({ id: r.id, date: null, values: { ...r } }))
    case 'meal_plan_slot':
      return (await db.meal_plan_slot.where('profile_id').equals(profile.id).sortBy('slot_date')).filter(live)
        .map((r) => ({ id: r.id, date: r.slot_date, values: { ...r } }))
    case 'stock': {
      const foods = new Map((await db.food.toArray()).map((f) => [f.id, f.name]))
      return (await db.stock.where('household_id').equals(profile.household_id).toArray()).filter(live)
        .map((r) => ({ id: r.id, date: null, values: { food: foods.get(r.food_id) ?? r.food_id, grams_on_hand: r.grams_on_hand, note: r.note } }))
    }
    case 'backup': return []
  }
}

/* ---------- exporting ------------------------------------------------------ */

export interface ExportRequest {
  dataset: Dataset
  /** Field names, in the order chosen; all of them when left out. */
  fields?: string[]
  format: Format
  range?: Range | null
}

export interface ExportResult { blob: Blob; name: string; count: number }

const today = () => formatDate(new Date(), 'yyyy-MM-dd')

/** A dataset as a file, cut to the range when it has dates. */
export async function exportDataset(profile: Profile, userId: string | null, req: ExportRequest): Promise<ExportResult> {
  const d = req.dataset
  const range = d.dateField ? req.range ?? null : null
  if (d.store === 'backup') {
    return { blob: await exportBundle(profile.id), name: `getit-${today()}.getit.json`, count: 1 }
  }
  if (!d.formats.includes(req.format)) throw new Error(`${d.label} cannot be saved as ${FORMATS[req.format].label}.`)
  const name = fileName(d.label, range, req.format)
  if (req.format === 'ics') {
    const events = await icsEvents(profile, userId, d, range, req.fields)
    const text = buildCalendar(events, { stamp: new Date().toISOString(), name: `GetIt · ${d.label}${range ? ` · ${range.label}` : ''}`, timezone: profile.timezone || null })
    return { blob: new Blob([text], { type: FORMATS.ics.mime }), name, count: events.length }
  }
  const rows = (await readRows(profile, d, userId)).filter((r) => inRange(r.date, range))
  const fields = pickFields(d.fields, req.fields)
  if (req.format === 'txt') {
    const text = rows.map((r) => noteText(String(r.values.title ?? ''), (r.values.planned_date as string) ?? null, (r.values.notes as string) ?? null)).join('\n---\n\n')
    return { blob: new Blob([text], { type: FORMATS.txt.mime }), name, count: rows.length }
  }
  const { names } = await lookupsFor(profile, fields)
  const google = d.store === 'calendar' && req.format === 'csv'
  const table = rows.map((r) => fields.map((f) => {
    const v = cellValue(f, r.values[f.name], names)
    if (google && f.type === 'date') return googleDate(v as string | null)
    if (google && f.type === 'time') return googleTime(v as string | null)
    return v
  }))
  return { ...(await tableFile(d.label, fields, table, req.format, d, range)), name, count: rows.length }
}

function pickFields(all: FieldDef[], chosen?: string[]): FieldDef[] {
  if (!chosen) return all
  const picked = chosen.map((n) => all.find((f) => f.name === n)).filter((f): f is FieldDef => !!f)
  return picked.length ? picked : all
}

/** Rows already worked out by a page (the shopping trip), as a file. */
export async function exportRows(label: string, fields: FieldDef[], rows: Record<string, unknown>[], format: Format): Promise<ExportResult> {
  const table = rows.map((r) => fields.map((f) => cellValue(f, r[f.name])))
  const file = await tableFile(label, fields, table, format, { key: 'page', label }, null)
  return { ...file, name: fileName(label, null, format), count: rows.length }
}

/** A note on its own, as text. */
export function exportText(label: string, text: string): ExportResult {
  return { blob: new Blob([text], { type: FORMATS.txt.mime }), name: fileName(label, null, 'txt'), count: 1 }
}

async function tableFile(label: string, fields: FieldDef[], table: unknown[][], format: Format,
  d: Pick<Dataset, 'key' | 'label'>, range: Range | null): Promise<{ blob: Blob }> {
  const headers = headersFor(fields)
  if (format === 'csv') return { blob: new Blob([toCsv(headers, table)], { type: FORMATS.csv.mime }) }
  if (format === 'json') {
    const rows = table.map((r) => Object.fromEntries(fields.map((f, i) => [f.name, r[i] ?? null])))
    return { blob: new Blob([toJson(d, fields, rows, range, new Date().toISOString())], { type: FORMATS.json.mime }) }
  }
  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    // Text stays text: SheetJS writes a string cell, never a formula, so a
    // value like "=1+1" cannot run when the workbook is opened.
    const ws = XLSX.utils.aoa_to_sheet([headers, ...table])
    ws['!cols'] = fields.map((f) => ({ wch: Math.max(8, Math.min(40, Math.round((f.width ?? 100) / 7))) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, label.replace(/[\][:*?/\\]/g, ' ').slice(0, 31) || 'GetIt')
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    return { blob: new Blob([data], { type: FORMATS.xlsx.mime }) }
  }
  throw new Error(`${label} cannot be saved as ${FORMATS[format].label}.`)
}

/** Tasks for a calendar file. Without a range, a repeating task goes as one
 *  repeating event (RRULE); with one, every day in the range goes as it is,
 *  including repeats not laid out as tasks yet. */
async function taskEvents(profile: Profile, range: Range | null): Promise<IcsEvent[]> {
  const tasks = (await profileTasks(profile.id)).filter((t) => inRange(t.planned_date, range))
  const series = (await db.series.where('profile_id').equals(profile.id).toArray()).filter((s) => live(s) && s.active)
  const exceptions = new Map<string, SeriesException[]>()
  for (const s of series) exceptions.set(s.id, (await db.series_exception.where('series_id').equals(s.id).toArray()).filter(live))
  const out: IcsEvent[] = []
  if (!range) {
    const repeating = new Set<string>()
    for (const s of series) {
      const evs = seriesEvents(s, exceptions.get(s.id))
      if (evs.length) { out.push(...evs); repeating.add(s.id) }
    }
    for (const t of tasks) {
      if (t.series_id && repeating.has(t.series_id)) continue
      const e = taskEvent(t)
      if (e) out.push(e)
    }
    return out
  }
  for (const t of tasks) { const e = taskEvent(t); if (e) out.push(e) }
  // Repeats in the range that have no task yet (the fill runs eight weeks ahead).
  const have = new Set(tasks.filter((t) => t.series_id).map((t) => `${t.series_id}|${t.planned_date}`))
  for (const s of series) {
    for (const o of planSeries(s, range.from, range.to, exceptions.get(s.id))) {
      if (have.has(`${s.id}|${o.date}`)) continue
      const id = await occurrenceId(s.id, o.base)
      const e = taskEvent({ id, title: s.title, planned_date: o.date, planned_time: s.time_of_day, duration_min: s.task_template?.duration_min ?? null,
        notes: s.task_template?.notes ?? null, category: s.task_template?.category ?? null })
      if (e) out.push(e)
    }
  }
  return out
}

async function icsEvents(profile: Profile, userId: string | null, d: Dataset, range: Range | null, chosen?: string[]): Promise<IcsEvent[]> {
  if (d.store === 'tasks') return taskEvents(profile, range)
  if (d.store === 'calendar') {
    const events = await taskEvents(profile, range)
    for (const e of (await db.calendar_event.where('profile_id').equals(profile.id).toArray()).filter(live)) {
      const start = isoToLocal(e.starts_at)
      if (!start || !inRange(start.slice(0, 10), range)) continue
      const ev = calendarEvent({ ...e, start_day: start.slice(0, 10), end_day: isoToLocal(e.ends_at)?.slice(0, 10) ?? null })
      if (ev) events.push(ev)
    }
    return events
  }
  // Any dated record: named by its main field, its other fields written out.
  const rows = (await readRows(profile, d, userId)).filter((r) => r.date && inRange(r.date, range))
  const fields = pickFields(d.fields, chosen)
  const { names } = await lookupsFor(profile, d.fields)
  const main = mainField(d.fields)
  const dateField = d.fields.find((f) => f.name === d.dateField)
  const timeField = d.fields.find((f) => f.type === 'time')
  const out: IcsEvent[] = []
  for (const r of rows) {
    if (d.entity === 'calendar_event' && r.source) {
      const e = r.source as { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; location: string | null }
      const ev = calendarEvent({ ...e, start_day: r.date!, end_day: isoToLocal(e.ends_at)?.slice(0, 10) ?? null })
      if (ev) out.push(ev)
      continue
    }
    const title = main && typeof r.values[main.name] === 'string' && r.values[main.name] ? String(r.values[main.name]) : d.label
    const dt = dateField?.type === 'datetime' ? hhmm(String(r.values[dateField.name] ?? '').slice(11)) : null
    const time = dt ?? (timeField ? hhmm(r.values[timeField.name]) : null)
    const lines = fields.filter((f) => f !== main && f.name !== d.dateField)
      .map((f) => [f.label, cellValue(f, r.values[f.name], names)] as const).filter(([, v]) => v !== null && v !== '')
      .map(([l, v]) => `${l}: ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : v}`)
    const e = recordEvent(r.id, title, r.date!, time, lines.join('\n') || null)
    if (e) out.push(e)
  }
  return out
}

/* ---------- importing ------------------------------------------------------ */

interface SeriesPlan { rule: NonNullable<ParsedEvent['series']>; exdates: string[] }

export interface ImportPreview {
  dataset: Dataset
  format: Format
  file: File
  plan: ImportPlan
  /** Repeating events that will be kept as series, by the row's line. */
  series: Map<number, SeriesPlan>
  /** Things about the whole file: repeats cut short, rows past the limit. */
  notes: string[]
  /** For a backup file: how many records it holds. */
  backupRecords?: number
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Reads a file and checks every row against the dataset, saving nothing. */
export async function readImport(profile: Profile, userId: string | null, d: Dataset, file: File): Promise<ImportPreview> {
  if (file.size > IMPORT_LIMITS.bytes) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB. Files up to 5 MB can be read.`)
  const format = formatOfFile(file.name)
  if (!format) throw new Error('That kind of file cannot be read. Use CSV, Excel (.xlsx), JSON or a calendar file (.ics).')
  const empty: ImportPlan = { columns: [], missing: [], rows: [], valid: 0, duplicates: 0, withProblems: 0, truncated: false }
  if (d.store === 'backup') {
    let parsed: { format?: string; records?: Record<string, unknown[]> }
    try { parsed = JSON.parse(await file.text()) } catch { throw new Error('That file is not a GetIt backup.') }
    if (parsed?.format !== 'getit.bundle' || !parsed.records) throw new Error('That file is not a GetIt backup.')
    const count = Object.values(parsed.records).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0)
    return { dataset: d, format, file, plan: empty, series: new Map(), notes: [], backupRecords: count }
  }
  if (!d.imports.includes(format)) {
    throw new Error(`${d.label} can be read from ${d.imports.map((f) => FORMATS[f].label).join(', ') || 'no file'}; this is ${FORMATS[format].label}.`)
  }
  const notes: string[] = []
  const series = new Map<number, SeriesPlan>()
  let table: Cell[][]
  if (format === 'csv') {
    const read = parseCsv(await file.text())
    table = read.rows
    if (read.truncated) notes.push(`Only the first ${IMPORT_LIMITS.rows} rows were read.`)
  } else if (format === 'json') {
    const read = jsonTable(await file.text())
    if ('error' in read) throw new Error(read.error)
    table = read.table as Cell[][]
  } else if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, sheetRows: IMPORT_LIMITS.rows + 2 })
    // The sheet named after the dataset if there is one, else the first.
    const sheet = wb.SheetNames.find((n) => n.toLowerCase() === d.label.slice(0, 31).toLowerCase()) ?? wb.SheetNames[0]
    table = sheet ? XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false }) as Cell[][] : []
  } else {
    const keepSeries = d.store === 'tasks' || d.store === 'calendar'
    const read = parseIcs(await file.text(), { zone: zone(), today: today(), mapSeries: keepSeries, maxEvents: IMPORT_LIMITS.rows })
    notes.push(...read.problems)
    table = icsTable(d, read.events, series)
  }
  const existing = new Set((await readRows(profile, d, userId)).map((r) => rowKey(d.fields, d.natural, normalised(d, r.values))))
  const { items } = await lookupsFor(profile, d.fields)
  const planned = planImport(table, d, existing, { lookups: items })
  if (planned.truncated) notes.push(`Only the first ${IMPORT_LIMITS.rows} rows were read.`)
  return { dataset: d, format, file, plan: planned, series, notes }
}

/** Stored values in the shape a read file's values have, so a row already
 *  here is recognised: times as HH:mm, date-times as yyyy-MM-ddTHH:mm. */
function normalised(d: Dataset, v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...v }
  for (const f of d.fields) {
    const x = v[f.name]
    if (f.type === 'time' && typeof x === 'string') out[f.name] = x.slice(0, 5)
    if (f.type === 'datetime' && typeof x === 'string') out[f.name] = x.slice(0, 16)
    if ((f.type === 'number' || f.type === 'integer' || f.type === 'duration') && x !== null && x !== undefined && x !== '') out[f.name] = Number(x)
  }
  return out
}

/** Calendar events as rows of the dataset's own columns. A repeat kept as a
 *  series is one row, noted in `series` by its line. */
function icsTable(d: Dataset, events: ParsedEvent[], series: Map<number, SeriesPlan>): Cell[][] {
  const rows: Cell[][] = []
  const note = (e: ParsedEvent) => [e.description, e.location ? `Where: ${e.location}` : null].filter(Boolean).join('\n') || null
  const days = (e: ParsedEvent) => (e.series ? [e.date] : e.dates.length ? e.dates : [e.date])
  if (d.store === 'tasks' || d.store === 'calendar') {
    const calendar = d.store === 'calendar'
    const header = calendar
      ? ['title', 'date', 'time', 'end_date', 'end_time', 'all_day', 'notes', 'location']
      : ['title', 'planned_date', 'planned_time', 'duration_min', 'notes']
    for (const e of events) {
      for (const day of days(e)) {
        if (rows.length >= IMPORT_LIMITS.rows) break
        if (e.series) series.set(rows.length + 2, { rule: e.series, exdates: e.exdates })
        const lastDay = e.endDate && e.allDay ? addDays(day, Math.max(0, minutesBetween({ date: e.date, time: '00:00' }, { date: e.endDate, time: '00:00' }) / 1440)) : null
        const end = !e.allDay && e.time && e.minutes !== null ? endOf(day, e.time, e.minutes) : null
        rows.push(calendar
          ? [e.summary, day, e.time, end?.date ?? lastDay, end?.time ?? null, e.allDay, e.description, e.location]
          : [e.summary, day, e.time, e.minutes, note(e)])
      }
    }
    return [header, ...rows]
  }
  // A module's records: its main text field and its date (or date and time).
  const main = mainField(d.fields)
  const date = d.fields.find((f) => f.name === d.dateField)
  if (!main || !date) return []
  const extra = d.fields.filter((f) => f !== main && f !== date)
  const endField = extra.find((f) => f.type === 'datetime' && /end/i.test(f.name))
  const allDay = extra.find((f) => f.type === 'boolean' && /all_?day/i.test(f.name))
  const place = extra.find((f) => f.type === 'text' && /location|place|where/i.test(f.name))
  const text = extra.find((f) => f.type === 'text' && f !== place && /note|description|detail/i.test(f.name))
  const header = [main.name, date.name, ...[endField, allDay, place, text].filter((f): f is FieldDef => !!f).map((f) => f.name)]
  for (const e of events) {
    for (const day of days(e)) {
      if (rows.length >= IMPORT_LIMITS.rows) break
      const at = date.type === 'datetime' ? `${day}T${e.time ?? '00:00'}` : day
      const end = endField ? (e.time && e.minutes !== null ? (() => { const x = endOf(day, e.time!, e.minutes!); return `${x.date}T${x.time}` })() : null) : undefined
      const row: Cell[] = [e.summary, at]
      if (endField) row.push(end ?? null)
      if (allDay) row.push(e.allDay)
      if (place) row.push(e.location)
      if (text) row.push(e.description)
      rows.push(row)
    }
  }
  return [header, ...rows]
}

export interface ImportDone { added: number; failed: number; skipped: number; series: number }

/** Saves the rows the preview found ready, into the open profile: every row
 *  gets a new id, nothing already here is changed, rows already here are
 *  skipped. Goes through the same edit path as the screens, so it reaches
 *  the server with the next sync. */
export async function saveImport(profile: Profile, userId: string | null, p: ImportPreview,
  onProgress?: (done: number, total: number) => void): Promise<ImportDone> {
  const d = p.dataset
  if (d.store === 'backup') {
    if (!userId) throw new Error('Sign in first. A backup is read into your account.')
    const r = await importBundle(p.file, profile.id, userId)
    return { added: r.imported, failed: 0, skipped: 0, series: 0 }
  }
  if (p.plan.missing.length) return { added: 0, failed: 0, skipped: p.plan.rows.length, series: 0 }
  const ready = p.plan.rows.filter((r) => !r.problems.length && !r.duplicate)
  let added = 0
  let failed = 0
  let made = 0
  const def = d.store === 'record' ? await moduleDef(d.moduleKey!, profile.id) : null
  const entity = def?.entities.find((e) => e.name === d.entity)
  const needsSeries = p.series.size > 0
  for (let i = 0; i < ready.length; i++) {
    const row = ready[i]
    const v = row.values
    try {
      const repeat = p.series.get(row.line)
      if (repeat && (d.store === 'tasks' || d.store === 'calendar')) {
        await saveSeries(profile.id, d, v, repeat)
        made++
        added++
      } else if (await saveRow(profile, userId, d, v, def && entity ? { def, entity } : null)) added++
      else failed++
    } catch {
      failed++
    }
    if (onProgress && (i % 25 === 0 || i === ready.length - 1)) onProgress(i + 1, ready.length)
  }
  if (needsSeries) await materializeSeries(profile.id)
  return { added, failed, skipped: p.plan.rows.length - ready.length, series: made }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

async function saveRow(profile: Profile, userId: string | null, d: Dataset, v: Record<string, unknown>,
  mod: { def: NonNullable<Awaited<ReturnType<typeof moduleDef>>>; entity: import('../modules/types').EntityDef } | null): Promise<boolean> {
  switch (d.store) {
    case 'record': {
      if (!mod) return false
      const res = await addRecord(profile.id, mod.def, mod.entity, v)
      return res.ok
    }
    case 'tasks': case 'notes': {
      const status = (str(v.status) ?? 'todo') as Task['status']
      await saveTask(blankTask(profile.id, str(v.planned_date) as string, {
        title: str(v.title) ?? 'Untitled', planned_time: str(v.planned_time), duration_min: num(v.duration_min),
        status, completed_at: status === 'done' ? new Date().toISOString() : null,
        category: str(v.category), module_key: str(v.module_key), notes: str(v.notes), due_date: str(v.due_date),
      }))
      return true
    }
    case 'calendar': {
      const date = str(v.date)!
      const time = v.all_day ? null : str(v.time)
      const endDate = str(v.end_date)
      const endTime = str(v.end_time)
      const minutes = time && endTime ? minutesBetween({ date, time }, { date: endDate ?? date, time: endTime }) : null
      const where = str(v.location)
      await saveTask(blankTask(profile.id, date, {
        title: str(v.title) ?? 'Untitled', planned_time: time, duration_min: minutes && minutes > 0 ? minutes : null,
        notes: [str(v.notes), where ? `Where: ${where}` : null].filter(Boolean).join('\n') || null,
        // A whole-day event over several days keeps its last day as the due day.
        start_date: !time && endDate && endDate > date ? date : null,
        due_date: !time && endDate && endDate > date ? endDate : null,
      }))
      return true
    }
    case 'food': {
      if (!userId) return false
      await edit('food', { id: crypto.randomUUID() } as never, {
        owner_id: userId, name: str(v.name), kcal: num(v.kcal), protein_g: num(v.protein_g), carbs_g: num(v.carbs_g),
        fat_g: num(v.fat_g), fiber_g: num(v.fiber_g), state: str(v.state) ?? 'raw', cook_yield: null, pack_size_g: null,
        store_section: null, source: 'import', deleted_at: null,
      } as never)
      return true
    }
    case 'recipe': {
      if (!userId) return false
      await edit('recipe', { id: crypto.randomUUID() } as never, {
        owner_id: userId, name: str(v.name), role: str(v.role), portions_per_batch: num(v.portions_per_batch) ?? 1,
        cook_minutes: num(v.cook_minutes), steps: null, deleted_at: null,
      } as never)
      return true
    }
    case 'body_log': {
      const w = num(v.weight_kg)
      if (w === null || !str(v.log_date)) return false
      await saveWeighIn(profile.id, str(v.log_date)!, w, num(v.waist_cm))
      return true
    }
    case 'habit':
      return !!(await addHabit(profile.id, str(v.name) ?? '', (str(v.schedule) ?? 'daily') as 'daily'))
    case 'supplement':
      return !!(await addSupplement(profile.id, str(v.name) ?? '', str(v.dose_text) ?? '', (str(v.time_slot) ?? 'morning') as 'morning'))
    default:
      return false
  }
}

/** A repeating calendar event as one of the app's series, with its removed
 *  days as skips. The fill lays out its tasks afterwards. */
async function saveSeries(profileId: string, d: Dataset, v: Record<string, unknown>, repeat: SeriesPlan) {
  const calendar = d.store === 'calendar'
  const time = calendar ? (v.all_day ? null : str(v.time)) : str(v.planned_time)
  const start = (calendar ? str(v.date) : str(v.planned_date)) ?? repeat.rule.start_date
  let minutes = calendar ? null : num(v.duration_min)
  if (calendar && time && str(v.end_time)) {
    const m = minutesBetween({ date: start, time }, { date: str(v.end_date) ?? start, time: str(v.end_time)! })
    minutes = m > 0 ? m : null
  }
  const notes = calendar ? [str(v.notes), str(v.location) ? `Where: ${str(v.location)}` : null].filter(Boolean).join('\n') || null : str(v.notes)
  const series = await edit<Series>('series', { id: crypto.randomUUID() } as Series, {
    profile_id: profileId, title: str(v.title) ?? 'Untitled', rule: repeat.rule.rule, rule_config: repeat.rule.rule_config,
    start_date: start, end_date: repeat.rule.end_date, occurrence_count: repeat.rule.occurrence_count, time_of_day: time,
    task_template: { category: null, duration_min: minutes, locked: false, notes }, module_key: null, active: true, deleted_at: null,
  })
  for (const day of repeat.exdates) {
    await edit<SeriesException>('series_exception', { id: crypto.randomUUID() } as SeriesException, {
      series_id: series.id, exception_date: day, action: 'skip', moved_to: null, changes: {}, deleted_at: null,
    })
  }
}

/** For the check in a browser: the uid a row has in a calendar file. */
export const calendarUid = uidFor
