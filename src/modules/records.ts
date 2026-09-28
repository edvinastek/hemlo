import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../lib/db'
import { edit } from '../lib/write'
import { queueChange } from '../lib/sync'
import { blankTask, deleteTask, saveTask } from '../lib/tasks'
import { supabase } from '../lib/supabase'
import type { ModuleRecord, Task } from '../lib/types'
import type { EntityDef, FieldDef, ModuleDef } from './types'
import {
  RULE_DAY_TASK, cleanValues, computeFormulas, recordDate, taskChange, taskPlan, type LookupKind,
} from './def-rules'
import type { PickItem } from '../ui/SearchPick'

/** Records of a module's entity, wherever they live. Four built-in entities
 *  have tables of their own; everything else — every built module, and the
 *  light built-in ones — keeps its records in module_record, one JSON value
 *  each. Either way a screen sees the same shape: an id, field values and a day. */

type Row = { id: string; profile_id: string; updated_at: string; deleted_at: string | null } & Record<string, unknown>

export interface Rec {
  id: string
  entity: string
  /** Stored values by field name, as the form and the table edit them. */
  values: Record<string, unknown>
  /** The day it belongs to, yyyy-MM-dd, or null. */
  date: string | null
  row: Row
}

export type Result = { ok: true; rec: Rec } | { ok: false; errors: Record<string, string> }

/* ---------- tables of their own ------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0')
/** A timestamp as the local "yyyy-MM-ddTHH:mm" a datetime input shows. */
export function isoToLocal(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToIso(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v.length === 10 ? `${v}T00:00` : v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface TableAdapter {
  /** Columns the form may write; nothing else is ever sent. */
  columns: string[]
  toValues: (row: Row) => Record<string, unknown>
  toColumns: (values: Record<string, unknown>) => Record<string, unknown>
  date: (row: Row) => string | null
  /** One row per profile and day (sleep): an add on a taken day updates it. */
  uniqueDay?: string
}

const same = (v: Record<string, unknown>) => ({ ...v })

const TABLES: Record<string, TableAdapter> = {
  calendar_event: {
    columns: ['title', 'starts_at', 'ends_at', 'all_day', 'location'],
    toValues: (r) => ({ title: r.title, starts_at: isoToLocal(r.starts_at), ends_at: isoToLocal(r.ends_at), all_day: !!r.all_day, location: r.location ?? null }),
    toColumns: (v) => {
      const out: Record<string, unknown> = { ...v }
      if ('starts_at' in v) out.starts_at = localToIso(v.starts_at)
      if ('ends_at' in v) out.ends_at = localToIso(v.ends_at)
      if ('all_day' in v) out.all_day = !!v.all_day
      return out
    },
    date: (r) => isoToLocal(r.starts_at)?.slice(0, 10) ?? null,
  },
  sleep_log: {
    columns: ['log_date', 'went_to_bed', 'woke_at', 'quality', 'hours'],
    toValues: (r) => ({ log_date: r.log_date, went_to_bed: (r.went_to_bed as string | null)?.slice(0, 5) ?? null, woke_at: (r.woke_at as string | null)?.slice(0, 5) ?? null, quality: r.quality ?? null }),
    toColumns: same,
    date: (r) => (r.log_date as string) ?? null,
    uniqueDay: 'log_date',
  },
  workout_log: {
    columns: ['log_date', 'exercise_id', 'set_number', 'reps_achieved', 'load_kg', 'seconds', 'note'],
    toValues: (r) => ({ log_date: r.log_date, exercise_id: r.exercise_id ?? null, set_number: r.set_number ?? null, reps_achieved: r.reps_achieved ?? null, load_kg: r.load_kg == null ? null : Number(r.load_kg), seconds: r.seconds ?? null, note: r.note ?? null }),
    toColumns: same,
    date: (r) => (r.log_date as string) ?? null,
  },
  goal: {
    columns: ['title', 'measure_target', 'measure_unit', 'start_date', 'end_date', 'status'],
    toValues: (r) => ({ ...r }),
    toColumns: same,
    date: (r) => (r.end_date as string) ?? (r.start_date as string) ?? null,
  },
}

type TableName = 'calendar_event' | 'sleep_log' | 'workout_log' | 'goal'
export const hasOwnTable = (e: EntityDef) => !!e.table && e.table in TABLES
const tableOf = (e: EntityDef) => (hasOwnTable(e) ? (e.table as TableName) : null)
const store = (t: string) => (db as unknown as Record<string, { get: (id: string) => Promise<Row | undefined>; put: (r: Row) => Promise<unknown> }>)[t]

function fromTable(e: EntityDef, row: Row): Rec {
  const a = TABLES[e.table!]
  return { id: row.id, entity: e.name, values: a.toValues(row), date: a.date(row), row }
}
function fromRecord(row: ModuleRecord): Rec {
  return { id: row.id, entity: row.entity, values: { ...(row.data ?? {}) }, date: row.record_date, row: row as unknown as Row }
}

/** Only the fields that have a column, and a stored value for calculated
 *  columns the table has (sleep keeps its hours for Stats). */
function columnsFor(e: EntityDef, data: Record<string, unknown>): Record<string, unknown> {
  const a = TABLES[e.table!]
  const out: Record<string, unknown> = {}
  const mapped = a.toColumns(data)
  for (const c of a.columns) if (c in mapped) out[c] = mapped[c]
  if (e.table === 'sleep_log') {
    const hours = computeFormulas(e.fields, data).hours
    if (hours !== undefined) out.hours = hours
  }
  return out
}

/* ---------- reading ------------------------------------------------------- */

export async function listRecords(profileId: string, moduleKey: string, entity: EntityDef): Promise<Rec[]> {
  const table = tableOf(entity)
  let recs: Rec[]
  if (table) {
    const rows = await (db[table] as unknown as { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<Row[]> } } })
      .where('profile_id').equals(profileId).toArray()
    recs = rows.filter((r) => !r.deleted_at).map((r) => fromTable(entity, r))
  } else if (entity.table) {
    recs = []
  } else {
    const rows = await db.module_record.where('[profile_id+module_key]').equals([profileId, moduleKey]).toArray()
    recs = rows.filter((r) => !r.deleted_at && r.entity === entity.name).map(fromRecord)
  }
  // Newest day first; undated ones after, most recently changed first.
  return recs.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || String(b.row.updated_at).localeCompare(String(a.row.updated_at)))
}

export function useRecords(profileId: string | null | undefined, moduleKey: string, entity: EntityDef | undefined): Rec[] | undefined {
  return useLiveQuery(async () => (profileId && entity ? listRecords(profileId, moduleKey, entity) : []),
    [profileId, moduleKey, entity?.name, entity?.table])
}

/* ---------- writing ------------------------------------------------------- */

const now = () => new Date().toISOString()

export async function addRecord(profileId: string, def: ModuleDef, entity: EntityDef, values: Record<string, unknown>): Promise<Result> {
  const { data, errors } = cleanValues(entity.fields, values)
  if (Object.keys(errors).length) return { ok: false, errors }
  const table = tableOf(entity)
  if (table) {
    const cols = columnsFor(entity, data)
    const a = TABLES[table]
    if (a.uniqueDay) {
      // One night per day, deleted or not (the server keeps the row): a
      // second add on the same day becomes an edit of that day's row.
      const twin = (await (db[table] as unknown as { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<Row[]> } } })
        .where('profile_id').equals(profileId).toArray()).find((r) => r[a.uniqueDay!] === cols[a.uniqueDay!])
      if (twin) {
        const next = await edit(table, twin as never, { ...cols, deleted_at: null } as never) as unknown as Row
        return { ok: true, rec: fromTable(entity, next) }
      }
    }
    const row: Row = { id: crypto.randomUUID(), profile_id: profileId, ...cols, updated_at: now(), deleted_at: null }
    if (table === 'goal') Object.assign(row, { status: row.status ?? 'active', horizon: 'year' })
    await store(table).put(row)
    await queueChange(table, row, Object.keys(row).filter((k) => k !== 'updated_at' && k !== 'id'))
    return { ok: true, rec: fromTable(entity, row) }
  }
  if (entity.table) return { ok: false, errors: { _: 'Records of this kind are added on their own screen.' } }
  const row: ModuleRecord = {
    id: crypto.randomUUID(), profile_id: profileId, module_key: def.key, entity: entity.name, data,
    record_date: recordDate(entity.fields, data), created_at: now(), updated_at: now(), deleted_at: null,
  }
  await db.module_record.put(row)
  await queueChange('module_record', row, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  await syncRecordTask(profileId, def, entity, row)
  return { ok: true, rec: fromRecord(row) }
}

/** Events from a calendar the person follows belong to that calendar: no
 *  view (list, table, board) may change or delete them here. */
const FOLLOWED = 'This event comes from a calendar you follow. Change it in that calendar.'

/** Change some fields of a record; the rest stay as they are. */
export async function updateRecord(profileId: string, def: ModuleDef, entity: EntityDef, rec: Rec, changes: Record<string, unknown>): Promise<Result> {
  if (rec.row.subscription_id) return { ok: false, errors: { _: FOLLOWED } }
  const { data, errors } = cleanValues(entity.fields, changes, true)
  if (Object.keys(errors).length) return { ok: false, errors }
  const table = tableOf(entity)
  if (table) {
    const current = (await store(table).get(rec.id)) ?? rec.row
    const cols = columnsFor(entity, { ...TABLES[table].toValues(current), ...data })
    const changed: Record<string, unknown> = {}
    for (const k of Object.keys(cols)) {
      if (k in data || (k === 'hours' && table === 'sleep_log')) changed[k] = cols[k]
    }
    const a = TABLES[table]
    if (a.uniqueDay && a.uniqueDay in changed && changed[a.uniqueDay] !== current[a.uniqueDay]) {
      const rows = await (db[table] as unknown as { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<Row[]> } } })
        .where('profile_id').equals(profileId).toArray()
      if (rows.some((r) => r.id !== rec.id && r[a.uniqueDay!] === changed[a.uniqueDay!])) {
        return { ok: false, errors: { [a.uniqueDay]: 'There is already one on that day. Edit that one instead.' } }
      }
    }
    const next = await edit(table, current as never, changed as never) as unknown as Row
    return { ok: true, rec: fromTable(entity, next) }
  }
  const current = (await db.module_record.get(rec.id)) ?? (rec.row as unknown as ModuleRecord)
  const merged: Record<string, unknown> = { ...(current.data ?? {}), ...data }
  // Calculated values are never kept, even if an older copy had one.
  for (const f of entity.fields) if (f.type === 'formula') delete merged[f.name]
  const next = await edit<ModuleRecord>('module_record', current, { data: merged, record_date: recordDate(entity.fields, merged) })
  await syncRecordTask(profileId, def, entity, next)
  return { ok: true, rec: fromRecord(next) }
}

/** Deleting keeps the row with a date on it, so the deletion reaches every device. */
export async function deleteRecord(profileId: string, def: ModuleDef, entity: EntityDef, rec: Rec): Promise<void> {
  if (rec.row.subscription_id) return
  const table = tableOf(entity)
  if (table) {
    const current = (await store(table).get(rec.id)) ?? rec.row
    await edit(table, current as never, { deleted_at: now() } as never)
    return
  }
  const current = (await db.module_record.get(rec.id)) ?? (rec.row as unknown as ModuleRecord)
  const next = await edit<ModuleRecord>('module_record', current, { deleted_at: now() })
  await syncRecordTask(profileId, def, entity, next)
}

/* ---------- rule: records with a date become tasks ----------------------- */

async function recordTask(profileId: string, recordId: string): Promise<Task | undefined> {
  return db.task.where('profile_id').equals(profileId).filter((t) => t.source === 'module' && t.source_ref === recordId).first()
}

/** Bring the record's task in line with the module's rules: made, moved,
 *  renamed or removed. Found again by its source, so running it twice
 *  changes nothing. */
export async function syncRecordTask(profileId: string, def: ModuleDef, entity: EntityDef, row: ModuleRecord): Promise<void> {
  if (!def.rules.some((r) => r.name === RULE_DAY_TASK)) return
  const task = await recordTask(profileId, row.id)
  const plan = taskPlan(def, entity.fields, row)
  const change = taskChange(plan, task ?? null)
  if (change === 'none') return
  if (change === 'delete') { await deleteTask(task!); return }
  if (change === 'create') {
    await saveTask(blankTask(profileId, plan!.planned_date, {
      title: plan!.title, planned_time: plan!.planned_time, module_key: def.key, source: 'module', source_ref: row.id,
    }))
    return
  }
  await saveTask({ ...task!, title: plan!.title, planned_date: plan!.planned_date, planned_time: plan!.planned_time, deleted_at: null },
    ['title', 'planned_date', 'planned_time', 'deleted_at'])
}

/** Every record of a module through the rule, after its rules changed. */
export async function syncModuleTasks(profileId: string, def: ModuleDef): Promise<void> {
  const rows = (await db.module_record.where('[profile_id+module_key]').equals([profileId, def.key]).toArray())
  for (const row of rows) {
    const entity = def.entities.find((e) => e.name === row.entity)
    if (entity && !entity.table) await syncRecordTask(profileId, def, entity, row)
  }
}

/* ---------- things a lookup field picks from ------------------------------ */

const EXERCISES = 'catalogue:exercise'
let exerciseFetch: Promise<void> | null = null

/** The exercise catalogue is not part of the local copy; it is read from the
 *  server once a day when there is a connection, and kept for offline use. */
export function refreshExercises(): Promise<void> {
  if (exerciseFetch) return exerciseFetch
  exerciseFetch = (async () => {
    const at = await getMeta<string | null>(`${EXERCISES}:at`, null)
    if (at && Date.now() - Date.parse(at) < 86400000) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const { data, error } = await supabase.from('exercise').select('id,name').order('name').limit(3000)
    if (error || !data) return
    await setMeta(EXERCISES, (data as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })))
    await setMeta(`${EXERCISES}:at`, new Date().toISOString())
  })().catch(() => undefined).finally(() => { exerciseFetch = null })
  return exerciseFetch
}

export type Lookups = Partial<Record<LookupKind, PickItem[]>>

async function lookupItems(profileId: string, kind: LookupKind): Promise<PickItem[]> {
  switch (kind) {
    case 'food': return (await db.food.toArray()).filter((f) => !(f as { deleted_at?: string | null }).deleted_at).map((f) => ({ id: f.id, name: f.name }))
    case 'recipe': return (await db.recipe.toArray()).filter((r) => !(r as { deleted_at?: string | null }).deleted_at).map((r) => ({ id: r.id, name: r.name, tag: 'recipe' }))
    case 'goal': return (await db.goal.where('profile_id').equals(profileId).toArray()).filter((g) => !g.deleted_at).map((g) => ({ id: g.id, name: g.title }))
    case 'task': return (await db.task.where('profile_id').equals(profileId).toArray()).filter((t) => !t.deleted_at && t.title)
      .map((t) => ({ id: t.id, name: t.title, meta: t.planned_date ?? undefined }))
    case 'exercise': return getMeta<PickItem[]>(EXERCISES, [])
  }
}

/** Everything the given fields' lookups can pick from, live. */
export function useLookups(profileId: string | null | undefined, fields: FieldDef[]): Lookups {
  const kinds = [...new Set(fields.filter((f) => f.type === 'lookup' && f.lookup).map((f) => f.lookup!))].sort()
  const wantsExercises = kinds.includes('exercise')
  useEffect(() => { if (wantsExercises) void refreshExercises() }, [wantsExercises])
  return useLiveQuery(async () => {
    const out: Lookups = {}
    if (!profileId) return out
    for (const k of kinds) out[k] = await lookupItems(profileId, k)
    return out
  }, [profileId, kinds.join(',')]) ?? {}
}
