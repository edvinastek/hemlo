import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from './db'
import { recipeMacros } from './calc'
import { quickMacros } from './quick-food'
import { NUTRIENTS, type Nutrient } from './settings'
import { addDays, doneDays } from './tracking-rules'
import { moduleLabel } from './colours-rules'
import { moduleDefs, type ModuleEntry } from '../modules/defs'
import { computeFormulas, firstDateField } from '../modules/def-rules'
import type { EntityDef } from '../modules/types'
import type { Food, RecipeLine } from './types'
import {
  add, fieldSeries, habitSeries, latest, meanMetric, periodRange, periodTitle, plural, previousRange,
  ratioBuckets, ratioMetric, sleepHours, statsRows, sumMetric, summarise, supplementSeries,
  type Bucket, type Metric, type ModuleStats, type Period, type Range, type Series, type StatsRow, type SummariseOptions,
} from './stats-rules'

/** The Stats page's figures, read from the local copy for one profile. Every
 *  read is this profile's rows only, and a deleted row never counts. The
 *  arithmetic itself is in stats-rules.ts. */

export interface StatsResult {
  period: Period
  anchor: string
  range: Range
  previous: Range
  title: string
  /** One card per module shown, the planner's own tasks first. */
  modules: ModuleStats[]
  /** Modules switched off and left out (none when they are shown). */
  hiddenOff: number
}

export interface StatsOptions {
  showDisabled: boolean
  /** The nutrients the person tracks (settings.nutrients). */
  nutrients: Nutrient[]
}

/** Modules with no figures of their own: Stats itself, the old placeholder
 *  for built modules, and Shopping, whose trips are kept on the server. */
const NO_STATS = new Set(['stats', 'custom', 'shopping', 'core'])

/** Everything one module's card needs: its range, the one before, today. */
interface Ctx {
  profileId: string
  period: Period
  cur: Range
  prev: Range
  /** From the start of the period before to the end of this one. */
  span: Range
  today: string
}

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)
const inSpan = (d: string | null | undefined, r: Range): d is string => !!d && d >= r.start && d <= r.end

/** The two summaries of a series: this period and the one before. */
function both(c: Ctx, series: Series, opts?: SummariseOptions) {
  return {
    cur: summarise(series, c.cur, c.period, c.today, opts),
    prev: summarise(series, c.prev, c.period, c.today, opts),
  }
}

const chartOf = (label: string, unit: string, buckets: Bucket[], decimals = 0): ModuleStats['chart'] =>
  ({ label, unit, decimals, buckets })

/* ---------- the planner's tasks -------------------------------------------- */

async function taskStats(c: Ctx): Promise<ModuleStats> {
  const rows = live(await db.task.where('[profile_id+planned_date]')
    .between([c.profileId, c.span.start], [c.profileId, c.span.end], true, true).toArray())
    // The same tasks a day counts elsewhere (widget-rules.ts): day tasks not dropped.
    .filter((t) => t.status !== 'dropped' && (t.horizon ?? 'day') === 'day')
  const planned: Series = {}; const done: Series = {}; const minutes: Series = {}
  for (const t of rows) {
    const d = t.planned_date!
    add(planned, d, 1)
    if (t.status === 'done') {
      add(done, d, 1)
      if (t.duration_min != null) add(minutes, d, Number(t.duration_min))
    }
  }
  const p = both(c, planned); const dn = both(c, done); const m = both(c, minutes)
  return {
    key: 'tasks', label: 'Tasks', off: false,
    metrics: [
      sumMetric('done', 'Done', '', dn.cur, dn.prev, 0),
      sumMetric('planned', 'Planned', '', p.cur, p.prev, 0),
      ratioMetric('completion', 'Completed', dn.cur, p.cur, dn.prev, p.prev),
      sumMetric('minutes', 'Minutes done', 'min', m.cur, m.prev, 0),
    ],
    chart: chartOf('Tasks done', '', dn.cur.buckets),
    empty: p.cur.total === 0 ? 'No tasks planned in this period. Plan one on Today or in Plan and it counts here.' : null,
  }
}

/* ---------- built-in modules with tables of their own ----------------------- */

async function habitStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  // A deleted habit is gone, ticks and all; one put away keeps its ticks.
  const habits = (await db.habit.where('profile_id').equals(c.profileId).toArray()).filter((h) => !h.deleted_at)
  const ids = new Set(habits.map((h) => h.id))
  const logs = await db.habit_log.where('log_date').between(c.span.start, c.span.end, true, true)
    .filter((l) => ids.has(l.habit_id)).toArray()
  const byHabit: Record<string, typeof logs> = {}
  for (const l of logs) (byHabit[l.habit_id] ??= []).push(l)
  const done: Record<string, string[]> = {}
  for (const [id, rows] of Object.entries(byHabit)) done[id] = doneDays(rows)
  const s = habitSeries(habits, done, c.span)
  const ticks = both(c, s.ticks); const hits = both(c, s.hits); const due = both(c, s.due)
  const inUse = habits.some((h) => h.active && !h.deleted_at)
  return {
    metrics: [
      sumMetric('ticks', 'Ticks', '', ticks.cur, ticks.prev, 0),
      ratioMetric('completion', 'Kept', hits.cur, due.cur, hits.prev, due.prev),
    ],
    chart: chartOf('Habits kept', '%', ratioBuckets(s.hits, s.due, c.cur, c.period, c.today)),
    empty: !inUse && ticks.cur.total === 0 ? 'No habits yet. Add one on the Habits page and tick it off each day.' : null,
  }
}

async function supplementStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const all = (await db.supplement.where('profile_id').equals(c.profileId).toArray()).filter((x) => !x.deleted_at)
  const ids = new Set(all.map((x) => x.id))
  const logs = await db.supplement_log.where('log_date').between(c.span.start, c.span.end, true, true)
    .filter((l) => ids.has(l.supplement_id)).toArray()
  const byItem: Record<string, typeof logs> = {}
  for (const l of logs) (byItem[l.supplement_id] ??= []).push(l)
  const taken = Object.values(byItem).flatMap((rows) => doneDays(rows))
  const active = all.filter((x) => x.active && !x.deleted_at).length
  const s = supplementSeries(active, taken, c.span)
  const t = both(c, s.taken); const due = both(c, s.due)
  return {
    metrics: [
      ratioMetric('taken_pct', 'Taken', t.cur, due.cur, t.prev, due.prev),
      sumMetric('taken', 'Doses ticked', '', t.cur, t.prev, 0),
    ],
    chart: chartOf('Supplements taken', '%', ratioBuckets(s.taken, s.due, c.cur, c.period, c.today)),
    empty: active === 0 && t.cur.total === 0 ? 'No supplements yet. Add them on the Supplements page and tick them off as you take them.' : null,
  }
}

async function nutritionStats(c: Ctx, nutrients: Nutrient[]): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const logs = live(await db.food_log.where('profile_id').equals(c.profileId).toArray()).filter((l) => inSpan(l.log_date, c.span))
  const foods = new Map<string, Food>((await db.food.toArray()).map((f) => [f.id, f]))
  const recipeIds = [...new Set(logs.map((l) => l.recipe_id).filter((x): x is string => !!x))]
  const lines = recipeIds.length ? await db.recipe_line.where('recipe_id').anyOf(recipeIds).toArray() : []
  const linesBy = new Map<string, RecipeLine[]>()
  for (const l of lines) linesBy.set(l.recipe_id, [...(linesBy.get(l.recipe_id) ?? []), l])

  const shown = nutrients.length ? nutrients : (['kcal'] as Nutrient[])
  const series: Record<Nutrient, Series> = { kcal: {}, protein_g: {}, carbs_g: {}, fat_g: {}, fiber_g: {} }
  const loggedDays: Series = {}
  // The same sums as a day's totals on the Food page (nutrition.ts).
  for (const log of logs) {
    let m: Record<Nutrient, number> | null = null
    if (log.kcal != null) m = quickMacros(log)
    else if (log.food_id) {
      const f = foods.get(log.food_id)
      const k = (log.grams ?? 0) / 100
      if (f) m = { kcal: (f.kcal ?? 0) * k, protein_g: (f.protein_g ?? 0) * k, carbs_g: (f.carbs_g ?? 0) * k, fat_g: (f.fat_g ?? 0) * k, fiber_g: (f.fiber_g ?? 0) * k }
    } else if (log.recipe_id) {
      const per = recipeMacros(linesBy.get(log.recipe_id) ?? [], foods)
      const n = log.portions ?? 1
      m = { kcal: per.kcal * n, protein_g: per.protein_g * n, carbs_g: per.carbs_g * n, fat_g: per.fat_g * n, fiber_g: per.fiber_g * n }
    }
    if (!m) continue
    loggedDays[log.log_date] = 1
    for (const k of shown) add(series[k], log.log_date, m[k])
  }
  const days = both(c, loggedDays)
  const metrics: Metric[] = shown.map((k) => {
    const n = NUTRIENTS.find((x) => x.key === k)!
    // A day with nothing logged is unknown, not a day of eating nothing.
    const s = both(c, series[k], { per: 'logged' })
    return sumMetric(k, n.label, n.unit, s.cur, s.prev, 0, 'a day logged')
  })
  metrics.push({ ...sumMetric('days', 'Days logged', '', days.cur, days.prev, 0), perDay: null, delta: days.cur.total - days.prev.total })
  const first = shown[0]
  const chart = summarise(series[first], c.cur, c.period, c.today, { how: 'mean', counts: loggedDays })
  const unit = NUTRIENTS.find((x) => x.key === first)!.unit
  return {
    metrics,
    chart: chartOf(`${NUTRIENTS.find((x) => x.key === first)!.label}${c.period === 'year' ? ', a day logged' : ''}`, unit, chart.buckets),
    empty: days.cur.total === 0 ? 'Nothing eaten logged in this period. Tick a meal as eaten or add one on the Food page.' : null,
  }
}

async function healthStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const rows = live(await db.body_log.where('profile_id').equals(c.profileId).toArray())
  // One reading a day: the latest edit wins, as it does on the Health page.
  const byDay = new Map<string, typeof rows[number]>()
  for (const r of rows) {
    const seen = byDay.get(r.log_date)
    if (!seen || (r.updated_at ?? '') > (seen.updated_at ?? '')) byDay.set(r.log_date, r)
  }
  const weight: Series = {}; const waist: Series = {}
  for (const [d, r] of byDay) {
    if (r.weight_kg != null) weight[d] = Number(r.weight_kg)
    if (r.waist_cm != null) waist[d] = Number(r.waist_cm)
  }
  const figure = (key: string, label: string, s: Series): Metric => {
    // Where it stands at the end of the period (or today, if sooner)…
    const now = latest(s, c.cur.end < c.today ? c.cur.end : c.today, c.cur.start)
    // …against the last reading before the period began, or failing that
    // the first one in it.
    const first = Object.keys(s).filter((d) => inSpan(d, c.cur)).sort()[0]
    const was = latest(s, addDays(c.cur.start, -1)) ?? (first ? { day: first, value: s[first] } : null)
    return { key, label, unit: key === 'waist' ? 'cm' : 'kg', value: now?.value ?? null, perDay: null,
      delta: now && was && was.day < now.day ? now.value - was.value : null, deltaWithin: true, decimals: 1 }
  }
  const count: Series = {}
  for (const d of Object.keys(weight)) count[d] = 1
  const n = both(c, count)
  const metrics: Metric[] = [figure('weight', 'Weight', weight)]
  if (Object.keys(waist).some((d) => inSpan(d, c.cur))) metrics.push(figure('waist', 'Waist', waist))
  metrics.push({ ...sumMetric('weigh_ins', 'Weigh-ins', '', n.cur, n.prev, 0), perDay: null, delta: null })
  return {
    metrics,
    chart: chartOf('Weight', 'kg', summarise(weight, c.cur, c.period, c.today, { how: 'mean' }).buckets, 1),
    empty: n.cur.total === 0 ? 'No weigh-ins in this period. Log your weight on the Health page.' : null,
  }
}

async function sleepStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const rows = live(await db.sleep_log.where('[profile_id+log_date]')
    .between([c.profileId, c.span.start], [c.profileId, c.span.end], true, true).toArray())
  const hours: Series = {}; const quality: Series = {}; const nights: Series = {}
  for (const r of rows) {
    const h = r.hours != null ? Number(r.hours) : sleepHours(r.went_to_bed, r.woke_at)
    if (h != null) { hours[r.log_date] = h; nights[r.log_date] = 1 }
    if (r.quality != null) quality[r.log_date] = Number(r.quality)
  }
  const h = both(c, hours, { how: 'mean' }); const q = both(c, quality, { how: 'mean' }); const n = both(c, nights)
  const metrics: Metric[] = [meanMetric('hours', 'Hours a night', 'h', h.cur, h.prev, 1)]
  if (q.cur.logged > 0) metrics.push(meanMetric('quality', 'Quality', '', q.cur, q.prev, 1))
  metrics.push({ ...sumMetric('nights', 'Nights logged', '', n.cur, n.prev, 0), perDay: null, delta: null })
  return {
    metrics,
    chart: chartOf('Hours slept', 'h', h.cur.buckets, 1),
    empty: n.cur.total === 0 ? 'No nights logged in this period. Add when you went to bed and woke on the Sleep page.' : null,
  }
}

async function trainingStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const rows = live(await db.workout_log.where('log_date').between(c.span.start, c.span.end, true, true)
    .filter((r) => r.profile_id === c.profileId).toArray())
  const sets: Series = {}; const volume: Series = {}; const sessions: Series = {}
  for (const r of rows) {
    add(sets, r.log_date, 1)
    sessions[r.log_date] = 1
    if (r.reps_achieved != null && r.load_kg != null) add(volume, r.log_date, Number(r.reps_achieved) * Number(r.load_kg))
  }
  const se = both(c, sessions); const st = both(c, sets); const v = both(c, volume)
  return {
    metrics: [
      { ...sumMetric('sessions', 'Sessions', '', se.cur, se.prev, 0), perDay: null, delta: se.cur.total - se.prev.total },
      sumMetric('sets', 'Sets', '', st.cur, st.prev, 0),
      sumMetric('volume', 'Volume', 'kg', v.cur, v.prev, 0),
    ],
    chart: chartOf('Sets', '', st.cur.buckets),
    empty: st.cur.total === 0 ? 'No sets logged in this period. Log a set on the Training page.' : null,
  }
}

async function agendaStats(c: Ctx): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const rows = live(await db.calendar_event.where('profile_id').equals(c.profileId).toArray())
  const events: Series = {}
  for (const r of rows) {
    const t = new Date(r.starts_at)
    if (Number.isNaN(t.getTime())) continue
    const d = format(t, 'yyyy-MM-dd')
    if (inSpan(d, c.span)) add(events, d, 1)
  }
  const e = both(c, events)
  return {
    metrics: [sumMetric('events', 'Events', '', e.cur, e.prev, 0)],
    chart: chartOf('Events', '', e.cur.buckets),
    empty: e.cur.total === 0 ? 'No events in this period. Add one on the Agenda page.' : null,
  }
}

/* ---------- modules kept in the shared record store ------------------------- */

/** Any module whose records sit in module_record: the light built-in ones
 *  and every module someone built. It counts the records by their day, and
 *  adds up or averages each field marked "In Stats". */
async function recordStats(c: Ctx, e: ModuleEntry): Promise<Omit<ModuleStats, 'key' | 'label' | 'off'>> {
  const entities = e.def.entities.filter((x) => !x.table)
  const name = e.def.name
  if (!entities.length) {
    return { metrics: [], chart: null, empty: `${name} keeps nothing to count yet. Add a field under Edit module on its page.` }
  }
  const dated = entities.filter((x) => firstDateField(x.fields))
  if (!dated.length) {
    return { metrics: [], chart: null, empty: `${name} records have no date, so there is no day to count them on. Add a date field under Edit module.` }
  }
  const rows = live(await db.module_record.where('[profile_id+module_key]').equals([c.profileId, e.def.key]).toArray())
    .filter((r) => inSpan(r.record_date, c.span))

  const metrics: Metric[] = []
  let chart: ModuleStats['chart'] = null
  let count = 0
  for (const ent of dated) {
    const recs = rows.filter((r) => r.entity === ent.name)
      .map((r) => ({ date: r.record_date, values: { ...(r.data ?? {}), ...computeFormulas(ent.fields, r.data ?? {}) } }))
    const n: Series = {}
    for (const r of recs) add(n, r.date!, 1)
    const nn = both(c, n)
    count += nn.cur.total
    const label = dated.length > 1 ? plural(ent.label) : 'Records'
    metrics.push(sumMetric(`${ent.name}.count`, label, '', nn.cur, nn.prev, 0))
    for (const f of flagged(ent)) {
      const s = fieldSeries(recs, f.name, f.stats!)
      const unit = f.unit ?? ''
      if (f.stats === 'average') {
        const a = both(c, s.values, { how: 'mean', counts: s.counts })
        metrics.push(meanMetric(`${ent.name}.${f.name}`, `${f.label}, average`, unit, a.cur, a.prev, 1))
        chart ??= chartOf(`${f.label}, average`, unit, a.cur.buckets, 1)
      } else {
        const t = both(c, s.values)
        const decimals = f.type === 'integer' || f.stats === 'count' ? 0 : 1
        metrics.push(sumMetric(`${ent.name}.${f.name}`, f.stats === 'count' ? `${f.label}, count` : f.label, unit, t.cur, t.prev, decimals))
        chart ??= chartOf(f.label, unit, t.cur.buckets, decimals)
      }
    }
    chart ??= chartOf(label, '', nn.cur.buckets)
  }
  return {
    metrics,
    chart,
    empty: count === 0 ? `Nothing in ${name} for this period. Add a record with a date on its page and it counts here.` : null,
  }
}

const flagged = (e: EntityDef) => e.fields.filter((f) => f.stats && !f.hidden)

/* ---------- the whole page ------------------------------------------------- */

export async function loadStats(profileId: string, period: Period, anchor: string, today: string, opts: StatsOptions): Promise<StatsResult> {
  const cur = periodRange(period, anchor)
  const prev = previousRange(period, anchor)
  const c: Ctx = { profileId, period, cur, prev, span: { start: prev.start, end: cur.end }, today }

  const entries = (await moduleDefs(profileId)).filter((e) => !NO_STATS.has(e.def.key))
  const shown = entries.filter((e) => e.enabled || opts.showDisabled)
  const cards: ModuleStats[] = [await taskStats(c)]
  for (const e of shown) {
    const key = e.def.key
    const label = e.def.built ? e.def.name : moduleLabel(key)
    const body = key === 'habits' ? await habitStats(c)
      : key === 'supplements' ? await supplementStats(c)
      : key === 'nutrition' ? await nutritionStats(c, opts.nutrients)
      : key === 'health' ? await healthStats(c)
      : key === 'sleep' ? await sleepStats(c)
      : key === 'training' ? await trainingStats(c)
      : key === 'agenda' ? await agendaStats(c)
      : await recordStats(c, e)
    cards.push({ key, label, off: !e.enabled, ...body })
  }
  return {
    period, anchor, range: cur, previous: prev, title: periodTitle(period, anchor),
    modules: cards,
    hiddenOff: entries.length - shown.length,
  }
}

/** The figures for a period, live: a tick or a meal logged elsewhere shows
 *  at once. Undefined while loading. */
export function useStats(profileId: string, period: Period, anchor: string, today: string, opts: StatsOptions): StatsResult | undefined {
  return useLiveQuery(() => loadStats(profileId, period, anchor, today, opts),
    [profileId, period, anchor, today, opts.showDisabled, opts.nutrients.join(',')])
}

/** The figures for a period as rows (period, module, metric, value, unit),
 *  for an export. Only the modules that are on, unless asked otherwise. */
export async function statsExportRows(profileId: string, period: Period, anchor: string,
  opts: Partial<StatsOptions> & { today?: string } = {}): Promise<StatsRow[]> {
  const today = opts.today ?? format(new Date(), 'yyyy-MM-dd')
  const result = await loadStats(profileId, period, anchor, today, {
    showDisabled: opts.showDisabled ?? false,
    nutrients: opts.nutrients ?? ['kcal'],
  })
  return statsRows(period, result.range, result.modules)
}
