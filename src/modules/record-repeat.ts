import { db } from '../lib/db'
import { edit } from '../lib/write'
import { materializeSeries, stopSeries } from '../lib/series'
import type { ModuleRecord, Series } from '../lib/types'
import type { RepeatValue } from '../lib/repeat-choice-rules'
import type { EntityDef, ModuleDef } from './types'
import { REPEAT_KEY, repeatPlan, sameRepeat } from './repeat-rules'
import { planToday } from '../lib/day-edge'

/** A record that comes round again (MOD-14): watering the plants every three
 *  days, the car's oil every six months. The record keeps its fields; the
 *  repeat is a series of tasks, made by the same engine as any repeating
 *  task, belonging to the module. So each time it is due it is an item on
 *  Today and Plan (as the module's Show switches allow), it can remind, and
 *  ticking it off is a tick like any other. The record holds the series' id
 *  under a name no field can have, so it is never shown as a field. */

export const recordSeriesId = (data: Record<string, unknown> | null | undefined): string | null =>
  typeof data?.[REPEAT_KEY] === 'string' ? (data[REPEAT_KEY] as string) : null

/** The repeat a record has now, as the repeat control shows it. */
export async function recordRepeat(row: Pick<ModuleRecord, 'data'> | undefined): Promise<{ value: RepeatValue; series: Series | null }> {
  const id = recordSeriesId(row?.data)
  const series = id ? (await db.series.get(id)) ?? null : null
  if (!series || series.deleted_at || !series.active || (series.end_date && series.end_date < planToday())) {
    return { value: { rule: null, rule_config: {}, end_date: null }, series: null }
  }
  return { value: { rule: series.rule, rule_config: series.rule_config ?? {}, end_date: series.end_date }, series }
}

/** Give a record the repeat chosen, or take it away. A change of rule, day,
 *  time or name ends the old series today (done days stay, days to come go)
 *  and starts a new one, so nothing of the old rule is left behind. */
export async function setRecordRepeat(profileId: string, def: ModuleDef, entity: EntityDef, row: ModuleRecord, value: RepeatValue): Promise<ModuleRecord> {
  const today = planToday()
  const { series: current } = await recordRepeat(row)
  const want = value.rule ? repeatPlan(def, entity.fields, row.data ?? {}, value, today) : null
  if (current && want && sameRepeat(current, want)) return row

  let todayTaken = false
  if (current) {
    todayTaken = !!(await db.task.where('[profile_id+planned_date]').equals([profileId, today])
      .filter((t) => t.series_id === current.id && !t.deleted_at).first())
    await stopSeries(current)
  }
  if (!want) {
    if (!recordSeriesId(row.data)) return row
    const { [REPEAT_KEY]: _gone, ...rest } = row.data ?? {}
    return edit<ModuleRecord>('module_record', row, { data: rest })
  }
  const now = new Date().toISOString()
  const fresh = { id: crypto.randomUUID(), updated_at: now } as Series
  const series = await edit<Series>('series', fresh, {
    profile_id: profileId, title: want.title, rule: want.rule, rule_config: want.rule_config,
    start_date: want.start_date, end_date: want.end_date, occurrence_count: null, time_of_day: want.time,
    task_template: {}, module_key: def.key, active: true, deleted_at: null,
  })
  // Today already has the old series' task: the new one does not add a second.
  if (todayTaken && want.start_date <= today) {
    await edit('series_exception', { id: crypto.randomUUID(), updated_at: now } as never, {
      series_id: series.id, exception_date: today, action: 'skip', moved_to: null, changes: {}, deleted_at: null,
    } as never)
  }
  const next = await edit<ModuleRecord>('module_record', row, { data: { ...(row.data ?? {}), [REPEAT_KEY]: series.id } })
  await materializeSeries(profileId)
  return next
}

/** A record deleted: its repeat ends today. */
export async function endRecordRepeat(row: Pick<ModuleRecord, 'data'>): Promise<void> {
  const { series } = await recordRepeat(row)
  if (series) await stopSeries(series)
}
