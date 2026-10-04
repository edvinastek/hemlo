import { format as formatDate } from 'date-fns'
import { db, getMeta } from './db'
import { edit } from './write'
import { blankTask, saveTask } from './tasks'
import { materializeSeries } from './series'
import { plan as planSeries, addDays } from './series-rules'
import { occurrenceId } from './series-rules'
import { addHabit, addSupplement, blankHabit, saveHabit, saveSupplement } from './tracking'
import { saveWeighIn } from './body'
import { exportBundle, importBundle } from './bundle'
import { hasNote } from './notes'
import { cachedMembers } from './household'
import { choreExportRows, choreHistoryRows, memberName } from './chore-rules'
import { moduleDef, moduleDefs } from '../modules/defs'
import { addRecord, isoToLocal, listRecords } from '../modules/records'
import { computeFormulas, mainField } from '../modules/def-rules'
import type { FieldDef } from '../modules/types'
import type { CalendarEvent, Habit, Profile, Series, SeriesException, Supplement, Task } from './types'
import { blankChore, saveChore } from './chores'
import { choreOfRepeat } from './repeat-choice-rules'
import type { RuleKind } from './schedule-rules'
import { parseUnitsText, readUnits, unitsText } from './units-rules'
import {
  buildCalendar, calendarEvent, looseRepeat, minutesBetween, parseIcs, recordEvent, scheduleEvent, seriesEvents, taskEvent, uidFor,
  type GetitKind, type IcsEvent, type ParsedEvent, type ScheduleLike,
} from './ics-rules'
import { windowedSeries } from './calendar-links-rules'
import { choreState, habitSchedule, looseOf, looseState } from './schedule-rules'
import { isModuleOn } from './day'
import { supplementSlots } from './tracking'
import { readPayment } from './finance-rules'
import { savePayment } from './finance'
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

/** The person's own agenda events. Events from a calendar they follow are
 *  that calendar's, fetched again at any time, so they are not exported
 *  (and a calendar made from GetIt never sends Google's events back). */
async function ownEvents(profileId: string) {
  return (await db.calendar_event.where('profile_id').equals(profileId).toArray()).filter((e) => live(e) && !e.subscription_id)
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
  for (const e of (await ownEvents(profile.id))) {
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
        if (other.group !== 'Modules' || !other.dateField || ['meal_plan_slot', 'stock', 'chore', 'chore_log'].includes(other.store)) continue
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
      const recs = (await listRecords(profile.id, def.key, entity)).filter((r) => !r.row.subscription_id)
      return recs.reverse().map((r) => ({ id: r.id, date: r.date, values: { ...r.values, ...computeFormulas(entity.fields, r.values) }, source: r.row }))
    }
    case 'food':
      // Units as one cell: "egg/eggs = 50 g; slice = 35 g".
      return (await db.food.toArray()).filter((f) => live(f) && (!f.owner_id || f.owner_id === userId))
        .map((f) => ({ id: f.id, date: null, values: { ...f, units: unitsText(readUnits(f.units)) } }))
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
        .map((r) => ({ id: r.id, date: null, values: {
          food: foods.get(r.food_id) ?? r.food_id, grams_on_hand: r.grams_on_hand,
          unit: r.unit ?? null, unit_qty: r.unit_qty ?? null, note: r.note,
        } }))
    }
    case 'chore':
    case 'chore_log': {
      // The household's, shared: names of members as the household sees them.
      const chores = await db.chore.where('household_id').equals(profile.household_id).toArray()
      const logs = chores.length ? await db.chore_log.where('chore_id').anyOf(chores.map((c) => c.id)).toArray() : []
      const members = await cachedMembers(profile.household_id)
      const nameOf = (id: string) => memberName(members, id, userId)
      const rows = d.store === 'chore' ? choreExportRows(chores, logs, nameOf, today()) : choreHistoryRows(chores, logs, nameOf)
      return rows.map((values, i) => ({ id: String(i), date: d.store === 'chore_log' ? String(values.done_on) : null, values }))
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
  // "After" and flexible series (GEN-22) go as their tasks; the one still
  // open carries the rule in GetIt's own line, so reading it back gives the
  // same series (GEN-26).
  const loose = new Map(series.map((s) => [s.id, looseRepeat(s)] as const).filter(([, r]) => !!r))
  const withRule = (t: Task, e: IcsEvent | null): IcsEvent | null =>
    e && t.series_id && loose.has(t.series_id) && t.status !== 'done' && t.status !== 'dropped' ? { ...e, getit: { repeat: loose.get(t.series_id) } } : e
  if (!range) {
    const repeating = new Set<string>()
    for (const s of series) {
      const evs = seriesEvents(s, exceptions.get(s.id))
      if (evs.length) { out.push(...evs); repeating.add(s.id) }
    }
    for (const t of tasks) {
      if (t.series_id && repeating.has(t.series_id)) continue
      const e = withRule(t, taskEvent(t))
      if (e) out.push(e)
    }
    return out
  }
  for (const t of tasks) { const e = withRule(t, taskEvent(t)); if (e) out.push(e) }
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

/** Whether an event belongs in a file cut to a range: a one-off by its first
 *  day; a repeating one while any of its days can fall in the range. */
function eventInRange(e: Pick<CalendarEvent, 'rule' | 'end_date'>, startDay: string, range: Range | null): boolean {
  if (!e.rule) return inRange(startDay, range)
  return !range || (startDay <= range.to && (!e.end_date || e.end_date >= range.from))
}

/* ---------- habits, chores, supplements and payments (GEN-26) -------------- */

/** Everything of a module that comes round, as the calendar file needs it,
 *  for the modules that are on: habits, the household's chores, supplements
 *  and Finance's planned payments. */
async function moduleSchedules(profile: Profile, kinds: GetitKind[] = ['habit', 'chore', 'supplement', 'payment']): Promise<ScheduleLike[]> {
  const out: ScheduleLike[] = []
  const now = today()
  const want = async (k: GetitKind, key: string) => kinds.includes(k) && await isModuleOn(profile.id, key)
  if (await want('habit', 'habits')) {
    const habits = (await db.habit.where('profile_id').equals(profile.id).toArray()).filter((h) => live(h) && h.active)
    const logs = habits.length ? await db.habit_log.where('habit_id').anyOf(habits.map((h) => h.id)).filter((l) => l.done).toArray() : []
    for (const h of habits) {
      const sc = habitSchedule(h)
      const l = looseOf(sc)
      const start = h.start_date ?? now
      out.push({
        id: h.id, kind: 'habit', title: h.name, rule: sc.rule, rule_config: sc.rule_config, start_date: start, end_date: sc.end_date ?? null,
        time: h.time_of_day ?? null, notes: h.note ?? null,
        next: l ? looseState(l, h.start_date ?? null, sc.end_date ?? null, now, logs.filter((x) => x.habit_id === h.id).map((x) => x.log_date)).next : null,
      })
    }
  }
  if (await want('chore', 'household')) {
    const chores = (await db.chore.where('household_id').equals(profile.household_id).toArray()).filter((c) => live(c) && !c.paused)
    const logs = chores.length ? await db.chore_log.where('chore_id').anyOf(chores.map((c) => c.id)).toArray() : []
    for (const c of chores) {
      const loose = c.mode !== 'fixed'
      out.push({
        id: c.id, kind: 'chore', title: c.name, rule: loose ? 'daily' : c.rule, start_date: c.start_date ?? now, end_date: c.end_date,
        rule_config: loose ? { n: c.every_days ?? 7, mode: c.mode } : c.rule_config ?? {},
        time: c.time_of_day ?? null, minutes: c.minutes, notes: c.note ?? null,
        next: loose ? choreState(c, now, logs.filter((x) => x.chore_id === c.id)).next : null,
      })
    }
  }
  if (await want('supplement', 'supplements')) {
    const slots = await supplementSlots(profile.id)
    for (const x of (await db.supplement.where('profile_id').equals(profile.id).toArray()).filter((v) => live(v) && v.active)) {
      out.push({
        id: x.id, kind: 'supplement', title: x.name, notes: x.dose_text ?? null, rule: x.rule ?? 'daily', rule_config: x.rule_config ?? {},
        start_date: x.start_date ?? now, end_date: x.end_date ?? null, time: slots.find((v) => v.key === x.time_slot)?.time ?? null, minutes: 5,
      })
    }
  }
  if (await want('payment', 'finance')) {
    const rows = await db.module_record.where('[profile_id+module_key]').equals([profile.id, 'finance']).toArray()
    for (const p of rows.filter((r) => r.entity === 'payment' && live(r)).map(readPayment)) {
      if (!p.active || !p.start_date) continue
      out.push({ id: p.id, kind: 'payment', title: `${p.name} ${p.kind === 'income' ? 'expected' : 'due'}`, rule: p.rule, rule_config: p.rule_config,
        start_date: p.start_date, end_date: p.end_date, time: p.time, notes: p.note })
    }
  }
  return out
}

/** One of them cut to the days asked for: a repeat from its first day there
 *  to its last (as a feed does), the next day of an "after" or flexible one
 *  only if it falls inside, a one-off by its day. */
function scheduleInRange(x: ScheduleLike, range: Range | null): ScheduleLike | null {
  if (!range) return x
  if (!x.rule) return inRange(x.start_date, range) ? x : null
  if (looseRepeat({ rule: x.rule, rule_config: x.rule_config ?? {} }) && x.rule !== 'times_per_week') return x.next && inRange(x.next, range) ? x : null
  if (x.rule === 'times_per_week') {
    if (x.start_date > range.to || (x.end_date && x.end_date < range.from)) return null
    return { ...x, start_date: x.start_date > range.from ? x.start_date : range.from, end_date: x.end_date && x.end_date < range.to ? x.end_date : range.to }
  }
  const cut = windowedSeries({ id: x.id, title: x.title, rule: x.rule, rule_config: x.rule_config ?? {}, start_date: x.start_date,
    end_date: x.end_date, occurrence_count: null, time_of_day: null }, range.from, range.to)
  return cut ? { ...x, start_date: cut.start_date, end_date: cut.end_date, rule_config: cut.rule_config } : null
}

async function scheduleEvents(profile: Profile, range: Range | null, kinds?: GetitKind[]): Promise<IcsEvent[]> {
  return (await moduleSchedules(profile, kinds)).map((x) => scheduleInRange(x, range)).flatMap((x) => {
    const e = x ? scheduleEvent(x) : null
    return e ? [e] : []
  })
}

const STORE_KIND: Partial<Record<Dataset['store'], GetitKind>> = { habit: 'habit', supplement: 'supplement', chore: 'chore' }

async function icsEvents(profile: Profile, userId: string | null, d: Dataset, range: Range | null, chosen?: string[]): Promise<IcsEvent[]> {
  if (d.store === 'tasks') return taskEvents(profile, range)
  const kind = STORE_KIND[d.store] ?? (d.moduleKey === 'finance' && d.entity === 'payment' ? 'payment' : undefined)
  if (kind) return scheduleEvents(profile, range, [kind])
  if (d.store === 'calendar') {
    // The whole calendar: tasks, repeats, own events, and what the modules
    // that are on bring round (habits, chores, supplements, payments).
    const events = [...await taskEvents(profile, range), ...await scheduleEvents(profile, range)]
    for (const e of (await ownEvents(profile.id))) {
      const start = isoToLocal(e.starts_at)
      if (!start || !eventInRange(e, start.slice(0, 10), range)) continue
      const ev = calendarEvent({ ...e, start_day: start.slice(0, 10), start_time: start.slice(11, 16), end_day: isoToLocal(e.ends_at)?.slice(0, 10) ?? null })
      if (ev) events.push(ev)
    }
    return events
  }
  // Any dated record: named by its main field, its other fields written out.
  // A repeating event counts from its first day on.
  const rows = (await readRows(profile, d, userId)).filter((r) => r.date && (d.entity === 'calendar_event' && r.source
    ? eventInRange(r.source as CalendarEvent, r.date, range) : inRange(r.date, range)))
  const fields = pickFields(d.fields, chosen)
  const { names } = await lookupsFor(profile, d.fields)
  const main = mainField(d.fields)
  const dateField = d.fields.find((f) => f.name === d.dateField)
  const timeField = d.fields.find((f) => f.type === 'time')
  const out: IcsEvent[] = []
  for (const r of rows) {
    if (d.entity === 'calendar_event' && r.source) {
      const e = r.source as CalendarEvent
      const ev = calendarEvent({ ...e, start_day: r.date!, start_time: isoToLocal(e.starts_at)?.slice(11, 16) ?? null, end_day: isoToLocal(e.ends_at)?.slice(0, 10) ?? null })
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

interface SeriesPlan {
  rule: NonNullable<ParsedEvent['series']>
  exdates: string[]
  /** What it was in GetIt (GEN-26): it goes back there, not into a task. */
  kind?: GetitKind | null
}

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
    const keepSeries = d.store === 'tasks' || d.store === 'calendar' || d.store === 'habit' || d.store === 'supplement' || d.store === 'chore'
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
        // A habit, chore, supplement or payment from a GetIt file (GEN-26):
        // one row, its repeat kept, saved back into its own module.
        if (e.kind) {
          const rule = e.repeat ?? e.series ?? { rule: 'dates', rule_config: { dates: [day] } }
          series.set(rows.length + 2, { rule: { ...rule, start_date: e.series?.start_date ?? day, end_date: e.series?.end_date ?? null, occurrence_count: null } as SeriesPlan['rule'], exdates: [], kind: e.kind })
          rows.push(calendar ? [e.summary, day, e.time, null, null, e.allDay, e.description, e.location] : [e.summary, day, e.time, e.minutes, note(e)])
          break
        }
        if (e.series) series.set(rows.length + 2, { rule: e.series, exdates: e.exdates })
        // "After" or flexible (GEN-22), from GetIt's own line (GEN-26).
        else if (e.repeat?.rule === 'daily') series.set(rows.length + 2, { rule: { rule: 'daily', rule_config: e.repeat.rule_config, start_date: day, end_date: null, occurrence_count: null }, exdates: [] })
        const lastDay = e.endDate && e.allDay ? addDays(day, Math.max(0, minutesBetween({ date: e.date, time: '00:00' }, { date: e.endDate, time: '00:00' }) / 1440)) : null
        const end = !e.allDay && e.time && e.minutes !== null ? endOf(day, e.time, e.minutes) : null
        rows.push(calendar
          ? [e.summary, day, e.time, end?.date ?? lastDay, end?.time ?? null, e.allDay, e.description, e.location]
          : [e.summary, day, e.time, e.minutes, note(e)])
      }
    }
    return [header, ...rows]
  }
  // Habits, supplements and chores (GEN-26): each event is one, with its
  // repeat, from an RRULE or GetIt's own line ("3 times a week", "after",
  // flexible); an event that does not repeat is one on its own day.
  if (d.store === 'habit' || d.store === 'supplement' || d.store === 'chore') {
    // A file GetIt wrote says what each event was: only this module's are
    // taken from it. Any other calendar's events are all taken.
    const fromGetit = events.some((e) => !!e.kind)
    for (const e of events) {
      if (fromGetit && e.kind !== d.store) continue
      if (rows.length >= IMPORT_LIMITS.rows) break
      const rule = e.repeat ?? e.series ?? { rule: 'dates', rule_config: { dates: [e.date] } }
      if (rule) series.set(rows.length + 2, { rule: { ...rule, start_date: e.series?.start_date ?? e.date, end_date: e.series?.end_date ?? null, occurrence_count: null } as SeriesPlan['rule'], exdates: [] })
      rows.push([e.summary])
    }
    return [['name'], ...rows]
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
  // Rows of a module already there by name (habits, supplements, chores, payments).
  let already = 0
  const def = d.store === 'record' ? await moduleDef(d.moduleKey!, profile.id) : null
  const entity = def?.entities.find((e) => e.name === d.entity)
  const needsSeries = p.series.size > 0
  for (let i = 0; i < ready.length; i++) {
    const row = ready[i]
    const v = row.values
    try {
      const repeat = p.series.get(row.line)
      const own = repeat?.kind ?? (d.store === 'habit' || d.store === 'supplement' || d.store === 'chore' ? d.store : null)
      if (repeat && own) {
        if (await saveScheduled(profile, own, str(v.name) ?? str(v.title) ?? '', repeat.rule, i, str(v.notes))) { made++; added++ } else already++
      } else if (repeat && (d.store === 'tasks' || d.store === 'calendar')) {
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
  return { added, failed, skipped: p.plan.rows.length - ready.length + already, series: made }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A habit, supplement, chore or planned payment read from a calendar file
 *  (GEN-26), saved into its own module with its repeat. "3 times a week" is
 *  a habit's own: a chore takes it as weekly, a supplement or a payment as
 *  every day. */
async function saveScheduled(profile: Profile, kind: GetitKind, name: string, rule: SeriesPlan['rule'], order: number, notes: string | null): Promise<boolean> {
  const now = new Date().toISOString()
  // One already there by that name is left as it is (a file read twice adds nothing).
  const same = (n: string | null | undefined) => (n ?? '').trim().toLowerCase() === name.replace(/ (due|expected)$/i, '').trim().toLowerCase()
  const have = kind === 'habit' ? (await db.habit.where('profile_id').equals(profile.id).toArray()).some((x) => live(x) && same(x.name))
    : kind === 'supplement' ? (await db.supplement.where('profile_id').equals(profile.id).toArray()).some((x) => live(x) && same(x.name))
      : kind === 'chore' ? (await db.chore.where('household_id').equals(profile.household_id).toArray()).some((x) => live(x) && same(x.name))
        : (await db.module_record.where('[profile_id+module_key]').equals([profile.id, 'finance']).toArray()).some((r) => live(r) && r.entity === 'payment' && same(String(r.data?.name ?? '')))
  if (have) return false
  const tpw = (rule.rule as string) === 'times_per_week'
  const kindOf = rule.rule as RuleKind
  if (kind === 'habit') {
    await saveHabit({ ...blankHabit(profile.id, rule.start_date, order), name: name || 'Habit', rule: kindOf as Habit['rule'],
      rule_config: rule.rule_config, start_date: rule.start_date, end_date: rule.end_date })
  } else if (kind === 'supplement') {
    await saveSupplement({ id: crypto.randomUUID(), profile_id: profile.id, name: name || 'Supplement', dose_text: notes?.split('\n')[0].slice(0, 80) || null, time_slot: 'morning',
      rule: tpw ? null : kindOf as Supplement['rule'], rule_config: tpw ? {} : rule.rule_config,
      start_date: rule.start_date, end_date: rule.end_date, active: true, sort_order: order, updated_at: now, deleted_at: null })
  } else if (kind === 'chore') {
    // Chores keep "after" and flexible in their own columns.
    const cols = choreOfRepeat({ rule: tpw ? 'weekly' : kindOf, rule_config: tpw ? {} : rule.rule_config, end_date: rule.end_date })
    await saveChore(blankChore(profile.household_id, { ...cols, name: name || 'Chore', start_date: rule.start_date, sort_order: order }))
  } else {
    // "Rent due", "Salary expected": the words the export added say which.
    const income = / expected$/i.test(name)
    await savePayment(profile.id, {
      name: name.replace(/ (due|expected)$/i, '') || 'Payment', amount: null, kind: income ? 'income' : 'expense', category: null,
      rule: tpw ? 'daily' : kindOf === 'dates' && (rule.rule_config.dates ?? []).length <= 1 ? null : kindOf, rule_config: tpw ? {} : rule.rule_config,
      start_date: rule.start_date, end_date: rule.end_date, time: null, note: null, active: true,
    })
  }
  return true
}
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
      // A units cell that cannot be read fails the row rather than dropping them.
      const units = parseUnitsText(v.units)
      if (units.error !== undefined) return false
      await edit('food', { id: crypto.randomUUID() } as never, {
        ...(units.units.length ? { units: units.units } : {}),
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
