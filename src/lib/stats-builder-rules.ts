import type { EntityDef, FieldDef } from '../modules/types.ts'
import { addDays, fromDayNumber, mondayOf, toDayNumber } from './schedule-rules.ts'
import { SUMMARY_LABEL, type MeasureInfo, type PivotSpec, type Span } from './pivot-rules.ts'
import { MAX_VIEWS, readStatsView, type StatsMeasure, type StatsRange, type StatsView, type Summary } from './stats-view-rules.ts'

/** The stats builder's rules (STA-02, STA-03, STA-10 to STA-15, GEN-41):
 *  every measure each module keeps, the groupings each can be split by, the
 *  ready-made views, the ranges, and editing the list of saved views. Pure:
 *  the database side (stats.ts) turns rows into facts for these measures. */

/* ---------- the measure catalogue ------------------------------------------- */

/** A measure as the builder offers it. */
export interface Measure extends MeasureInfo {
  /** The module's name, for grouping the picker: "Nutrition". */
  group: string
  /** One plain line on what it counts. */
  hint: string
  /** What each grouping is called for this measure: section is "Meal" for
   *  food and "Section" for tasks. */
  dimNames: Record<string, string>
  /** Only there to make a share (habits hit); not offered on its own. */
  part?: boolean
  /** Shown first on the module's card until the person picks others. */
  card?: boolean
}

export interface ModuleInput {
  key: string
  name: string
  /** For modules kept in the shared record store (Learning, Finance,
   *  Projects, Household's old chores, built modules): their entities. */
  entities?: EntityDef[]
}

type Base = Omit<Measure, 'module' | 'group' | 'key'> & { name: string }

const COUNT = (label: string, hint: string, dims: Record<string, string> = {}, card = false): Base =>
  ({ name: '', label, hint, unit: '', decimals: 0, combine: 'sum', known: 'all', dims: Object.keys(dims), dimNames: dims, summary: 'sum', card })

const TASK_DIMS = { section: 'Section', category: 'Module', item: 'Task' }
const HABIT_DIMS = { item: 'Habit' }
const SUPP_DIMS = { item: 'Supplement', section: 'Time of day' }
const FOOD_DIMS = { item: 'Food or recipe', section: 'Meal' }
const GYM_DIMS = { item: 'Exercise', category: 'Muscle group' }
const CHORE_DIMS = { item: 'Chore', person: 'Person', section: 'Room' }
const SHOP_DIMS = { item: 'Item', section: 'Aisle', category: 'Shop' }

export const NUTRIENT_NAMES: Record<string, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbs', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fiber_g: { label: 'Fibre', unit: 'g' },
}

/** The measures of a built-in module with tables of its own. */
function builtIn(key: string, nutrients: string[]): Base[] {
  const named = (name: string, b: Base): Base => ({ ...b, name })
  switch (key) {
    case 'tasks': return [
      named('done', COUNT('Tasks done', 'Tasks ticked off, on the day they were planned for.', TASK_DIMS, true)),
      named('planned', COUNT('Tasks planned', 'Tasks planned for the day, done or not (dropped ones left out).', TASK_DIMS, true)),
      named('completion', { ...COUNT('Tasks completed', 'Tasks done out of tasks planned, as a percentage.', TASK_DIMS, true), unit: '%', ratio: { part: 'tasks:done', whole: 'tasks:planned' }, summary: 'avg' }),
      named('minutes_done', { ...COUNT('Minutes done', 'The planned length of the tasks done.', TASK_DIMS, true), unit: 'min' }),
      named('minutes_planned', { ...COUNT('Minutes planned', 'The planned length of every task planned.', TASK_DIMS), unit: 'min' }),
      named('pushed', COUNT('Times pushed', 'How often tasks planned for the day had been pushed to a later time or day.', TASK_DIMS)),
    ]
    case 'habits': return [
      named('ticks', COUNT('Habit ticks', 'Every tick of every habit.', HABIT_DIMS, true)),
      named('kept', { ...COUNT('Habits kept', 'Ticks out of the times a habit was due, as a percentage. Days a habit was not due do not count.', HABIT_DIMS, true), unit: '%', ratio: { part: 'habits:hit', whole: 'habits:due' }, summary: 'avg' }),
      named('due', COUNT('Habits due', 'The times habits were due, by their schedules.', HABIT_DIMS)),
      named('hit', { ...COUNT('Habits done when due', 'Ticks that answered a day the habit was due.', HABIT_DIMS), part: true }),
      named('amount', { ...COUNT('Habit amounts', 'What was counted on habits with a count to reach (8 glasses).', HABIT_DIMS), known: 'logged', decimals: 1, summary: 'avg' }),
    ]
    case 'supplements': return [
      named('taken_pct', { ...COUNT('Supplements taken', 'Doses ticked out of doses to take, as a percentage.', SUPP_DIMS, true), unit: '%', ratio: { part: 'supplements:taken', whole: 'supplements:due' }, summary: 'avg' }),
      named('taken', COUNT('Doses ticked', 'Every supplement ticked as taken.', SUPP_DIMS, true)),
      named('due', COUNT('Doses to take', 'One a day for each supplement in use.', SUPP_DIMS)),
    ]
    case 'nutrition': {
      const shown = nutrients.length ? nutrients : ['kcal']
      const all = Object.keys(NUTRIENT_NAMES)
      const eaten = all.map((n) => named(n, {
        ...COUNT(`${NUTRIENT_NAMES[n].label} eaten`, `${NUTRIENT_NAMES[n].label} in everything logged as eaten. A day with nothing logged is unknown, not a day of eating nothing.`, FOOD_DIMS, shown.includes(n)),
        unit: NUTRIENT_NAMES[n].unit, known: 'logged', summary: 'avg',
      }))
      const planned = all.map((n) => named(`planned_${n}`, {
        ...COUNT(`${NUTRIENT_NAMES[n].label} planned`, `${NUTRIENT_NAMES[n].label} in the meals planned for the day.`, FOOD_DIMS),
        unit: NUTRIENT_NAMES[n].unit, known: 'logged', summary: 'avg',
      }))
      return [
        ...eaten, ...planned,
        named('days', COUNT('Days logged', 'Days with anything logged as eaten.', {}, true)),
        named('entries', COUNT('Foods logged', 'Every food, recipe or quick entry logged as eaten.', FOOD_DIMS)),
      ]
    }
    case 'health': return [
      named('weight', { ...COUNT('Weight', 'The weigh-ins: the latest, the change, the lowest or the average.', {}, true), unit: 'kg', decimals: 1, combine: 'last', known: 'logged', summary: 'latest' }),
      named('waist', { ...COUNT('Waist', 'Waist measurements.', {}), unit: 'cm', decimals: 1, combine: 'last', known: 'logged', summary: 'latest' }),
      named('weigh_ins', COUNT('Weigh-ins', 'Days with a weight logged.', {}, true)),
    ]
    case 'sleep': return [
      named('hours', { ...COUNT('Hours slept', 'From going to bed to waking, or the hours typed in.', {}, true), unit: 'h', decimals: 1, combine: 'mean', known: 'logged', summary: 'avg' }),
      named('quality', { ...COUNT('Sleep quality', 'The quality given to each night.', {}, true), decimals: 1, combine: 'mean', known: 'logged', summary: 'avg' }),
      named('bed', { ...COUNT('Bedtime', 'When you went to bed.', {}), unit: 'time', decimals: 0, combine: 'mean', known: 'logged', summary: 'avg' }),
      named('wake', { ...COUNT('Wake time', 'When you woke.', {}), unit: 'time', decimals: 0, combine: 'mean', known: 'logged', summary: 'avg' }),
      named('nights', COUNT('Nights logged', 'Nights with a time or hours logged.', {}, true)),
    ]
    case 'training': return [
      named('sessions', COUNT('Sessions', 'Days with at least one set logged.', {}, true)),
      named('sets', COUNT('Sets', 'Every set logged.', GYM_DIMS, true)),
      named('reps', COUNT('Reps', 'Repetitions in every set.', GYM_DIMS)),
      named('volume', { ...COUNT('Volume', 'Reps times load, added up.', GYM_DIMS, true), unit: 'kg' }),
      named('top_load', { ...COUNT('Heaviest set', 'The heaviest load lifted.', GYM_DIMS), unit: 'kg', decimals: 1, combine: 'max', known: 'logged', summary: 'max' }),
    ]
    case 'agenda': return [
      named('events', COUNT('Events', 'Your own events (not those of calendars you follow).', { item: 'Event' }, true)),
      named('hours', { ...COUNT('Hours in events', 'How long your own timed events last.', { item: 'Event' }, true), unit: 'h', decimals: 1 }),
    ]
    case 'household': return [
      named('chores_done', COUNT('Chores done', 'Every chore ticked off, by whoever did it.', CHORE_DIMS, true)),
      named('chores_overdue', { ...COUNT('Chores overdue', 'Chores still not done after the day they were due, counted at the end of each day.', { item: 'Chore', section: 'Room' }, true), known: 'all' }),
      named('chore_minutes', { ...COUNT('Minutes of chores', 'The length set on each chore done.', CHORE_DIMS), unit: 'min' }),
    ]
    case 'shopping': return [
      named('bought', COUNT('Items ticked off', 'Items ticked off the shopping list, on the day they were ticked.', SHOP_DIMS, true)),
      named('trips', COUNT('Shopping trips', 'Days with anything ticked off the list.', {}, true)),
      named('added', COUNT('Items added', 'Items put on the list by hand, on the day they were added.', SHOP_DIMS)),
    ]
    case 'projects': return [
      named('tasks_done', COUNT('Project tasks done', 'Tasks that belong to a project, ticked off.', { item: 'Project' }, true)),
      named('tasks_open', COUNT('Project tasks not done', 'Tasks of a project planned for the day and not done.', { item: 'Project' })),
    ]
  }
  return []
}

const NUMERIC = new Set(['number', 'integer', 'duration', 'formula', 'rating', 'money', 'currency', 'decimal'])
const CHOICE = new Set(['select', 'text', 'multiselect', 'multi', 'tags', 'multi_select', 'choice'])
const isDated = (e: EntityDef) => e.fields.some((f) => f.type === 'date' || f.type === 'datetime')
const fieldDims = (e: EntityDef): Record<string, string> => {
  const out: Record<string, string> = { item: 'Name' }
  for (const f of e.fields) if (CHOICE.has(f.type) && !f.hidden) out[`field:${f.name}`] = f.label
  return out
}

/** "Entry" to "Entries", "Block" to "Blocks". */
export function plural(word: string): string {
  const w = word.trim()
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`
  return `${w}s`
}

/** The measures of a module kept in the record store (GEN-41): records per
 *  day for a dated entity (records added per day for one without a date),
 *  every number field (added up, or averaged when marked so), every yes/no
 *  field (times it was yes), and its choice and text fields as groupings. */
export function recordMeasures(entities: EntityDef[]): Base[] {
  const out: Base[] = []
  const many = entities.length > 1
  for (const e of entities) {
    if (e.table) continue
    const dims = fieldDims(e)
    const kind = many ? plural(e.label) : 'Records'
    if (!isDated(e)) {
      out.push({ ...COUNT(`${plural(e.label)} added`, `${plural(e.label)} added, on the day they were added (they have no date field).`, dims, true), name: `${e.name}:added` })
      continue
    }
    out.push({ ...COUNT(many ? kind : plural(e.label), `${plural(e.label)} on each day, by their date.`, dims, true), name: `${e.name}:count` })
    for (const f of e.fields as FieldDef[]) {
      if (f.hidden) continue
      if (NUMERIC.has(f.type)) {
        const mean = f.stats === 'average'
        out.push({
          ...COUNT(f.label, mean ? `${f.label}, averaged over the records that have it.` : `${f.label}, added up over the records.`, dims, !!f.stats),
          name: `${e.name}:${f.name}`, unit: f.unit ?? '', decimals: f.type === 'integer' ? 0 : 1,
          combine: mean ? 'mean' : 'sum', known: mean ? 'logged' : 'all', summary: mean ? 'avg' : 'sum',
        })
      } else if (f.type === 'boolean') {
        out.push({ ...COUNT(`${f.label}: yes`, `Records with ${f.label} ticked.`, dims), name: `${e.name}:${f.name}` })
      }
    }
  }
  return out
}

/** Every measure the modules given keep, tasks first. A module with no
 *  measures (Stats itself) adds none. */
export function measureCatalogue(modules: ModuleInput[], nutrients: string[]): Measure[] {
  const out: Measure[] = []
  const add = (key: string, name: string, list: Base[]) => {
    for (const b of list) {
      const { name: m, ...rest } = b
      out.push({ ...rest, key: `${key}:${m}`, module: key, group: name })
    }
  }
  add('tasks', 'Tasks', builtIn('tasks', nutrients))
  for (const m of modules) {
    if (m.key === 'tasks' || m.key === 'stats' || m.key === 'core' || m.key === 'custom') continue
    const own = builtIn(m.key, nutrients)
    add(m.key, m.name, [...own, ...recordMeasures(m.entities ?? [])])
  }
  // Two records modules can name a measure alike; the second one is told apart.
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
}

/** The measures a module's card lists when it is expanded, and which it
 *  shows before the person picks (STA-02). */
export function cardMeasures(catalogue: Measure[], moduleKey: string, picked?: string[] | null): { all: Measure[]; shown: Measure[] } {
  const all = catalogue.filter((m) => m.module === moduleKey && !m.part)
  const chosen = picked?.length ? picked.map((k) => all.find((m) => m.key === k)).filter((m): m is Measure => !!m) : []
  return { all, shown: chosen.length ? chosen : all.filter((m) => m.card).slice(0, 6) }
}

/** The groupings offered for a set of measures: time always, the rest only
 *  where every measure has them, so a split never leaves one blank. */
export function groupingsFor(measures: Measure[]): { key: string; label: string }[] {
  const time = [
    { key: 'none', label: 'Nothing (one figure)' }, { key: 'day', label: 'Day' }, { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }, { key: 'weekday', label: 'Day of the week' },
  ]
  if (!measures.length) return time
  const modules = new Set(measures.map((m) => m.module))
  // Shared only where it means the same thing: a task's section and a
  // food's meal are both "section", but not the same grouping.
  const common = Object.keys(measures[0].dimNames).filter((d) => measures.every((m) => m.dimNames[d] === measures[0].dimNames[d]))
  const out = [...time]
  if (modules.size > 1) out.push({ key: 'module', label: 'Module' })
  for (const d of common) out.push({ key: d, label: measures[0].dimNames[d] })
  return out
}

/* ---------- summaries ------------------------------------------------------ */

/** The summaries that make sense for a measure, the natural one first. */
export function summariesFor(m: Pick<Measure, 'summary' | 'ratio' | 'combine' | 'known' | 'unit'>): { key: Summary; label: string }[] {
  const list: Summary[] = m.ratio
    ? ['avg', 'min', 'max', 'latest', 'streak', 'best_streak', 'pct_target', 'count']
    : m.combine === 'sum' && m.known === 'all'
      ? ['sum', 'avg', 'min', 'max', 'latest', 'count', 'streak', 'best_streak', 'pct_target', 'change']
      : ['avg', 'latest', 'min', 'max', 'change', 'count', 'pct_target', 'streak', 'best_streak', 'sum']
  const order = [m.summary, ...list.filter((s) => s !== m.summary)]
  return order.map((key) => ({ key, label: summaryName(key, m) }))
}

/** What a summary is called for a measure: "Average a day" for a count,
 *  "Average" for a weight, "Kept % over the period" for a share. */
export function summaryName(s: Summary, m: Pick<Measure, 'ratio' | 'combine' | 'known'>): string {
  if (s === 'avg' && m.ratio) return 'Over the period'
  if (s === 'avg' && m.combine === 'sum' && m.known === 'all') return 'Average a day'
  if (s === 'avg' && m.combine === 'sum') return 'Average a day logged'
  if (s === 'min') return 'Lowest day'
  if (s === 'max') return 'Highest day'
  if (s === 'latest') return 'Latest day'
  return SUMMARY_LABEL[s]
}

/* ---------- ranges ---------------------------------------------------------- */

const monthStart = (day: string, back = 0) => {
  const [y, m] = day.split('-').map(Number)
  const t = y * 12 + (m - 1) - back
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}
const monthEnd = (day: string) => addDays(monthStart(day, -1), -1)

/** The days a view covers, moved back (or on) by whole ranges with offset:
 *  "last 30 days" one back is the 30 days before. Last weeks, months and
 *  years are whole ones ending with the current one, so bars are whole. */
export function viewSpan(range: StatsRange, today: string, offset = 0): Span {
  const n = Math.max(1, Math.floor(range.n ?? 30))
  if (range.kind === 'custom' && range.from && range.to) {
    const len = toDayNumber(range.to) - toDayNumber(range.from) + 1
    return { start: addDays(range.from, len * offset), end: addDays(range.to, len * offset) }
  }
  const unit = range.unit ?? 'days'
  const count = range.kind === 'this' ? 1 : n
  if (unit === 'days') {
    const end = addDays(today, count * offset)
    return { start: addDays(end, -(count - 1)), end }
  }
  if (unit === 'weeks') {
    const mon = fromDayNumber(mondayOf(toDayNumber(today)) + 7 * count * offset)
    return { start: addDays(mon, -7 * (count - 1)), end: addDays(mon, 6) }
  }
  if (unit === 'months') {
    const last = monthStart(today, -count * offset)
    return { start: monthStart(last, count - 1), end: monthEnd(last) }
  }
  const y = Number(today.slice(0, 4)) + count * offset
  return { start: `${y - count + 1}-01-01`, end: `${y}-12-31` }
}

const UNIT_ONE: Record<string, string> = { days: 'day', weeks: 'week', months: 'month', years: 'year' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Last 30 days", "This month", "Last 12 weeks". */
export function rangeName(range: StatsRange): string {
  const unit = range.unit ?? 'days'
  if (range.kind === 'custom') return 'Chosen days'
  if (range.kind === 'this') return unit === 'days' ? 'Today' : `This ${UNIT_ONE[unit]}`
  const n = range.n ?? 30
  return n === 1 ? (unit === 'days' ? 'Today' : `This ${UNIT_ONE[unit]}`) : `Last ${n} ${unit}`
}

/** A span written out: "21 – 27 Sep 2026", "1 Sep – 30 Nov 2026". */
export function spanName(s: Span): string {
  const [ay, am, ad] = s.start.split('-').map(Number)
  const [by, bm, bd] = s.end.split('-').map(Number)
  if (s.start === s.end) return `${ad} ${MONTHS[am - 1]} ${ay}`
  if (ay !== by) return `${ad} ${MONTHS[am - 1]} ${ay} – ${bd} ${MONTHS[bm - 1]} ${by}`
  if (am !== bm) return `${ad} ${MONTHS[am - 1]} – ${bd} ${MONTHS[bm - 1]} ${by}`
  return `${ad} – ${bd} ${MONTHS[bm - 1]} ${by}`
}

/** The ranges the builder offers in one tap. */
export const RANGE_CHOICES: { key: string; label: string; range: StatsRange }[] = [
  { key: 'today', label: 'Today', range: { kind: 'this', unit: 'days' } },
  { key: 'week', label: 'This week', range: { kind: 'this', unit: 'weeks' } },
  { key: 'l7', label: 'Last 7 days', range: { kind: 'last', n: 7, unit: 'days' } },
  { key: 'l30', label: 'Last 30 days', range: { kind: 'last', n: 30, unit: 'days' } },
  { key: 'l90', label: 'Last 90 days', range: { kind: 'last', n: 90, unit: 'days' } },
  { key: 'month', label: 'This month', range: { kind: 'this', unit: 'months' } },
  { key: 'w12', label: 'Last 12 weeks', range: { kind: 'last', n: 12, unit: 'weeks' } },
  { key: 'm12', label: 'Last 12 months', range: { kind: 'last', n: 12, unit: 'months' } },
  { key: 'year', label: 'This year', range: { kind: 'this', unit: 'years' } },
]

export function rangeChoice(range: StatsRange): string {
  const hit = RANGE_CHOICES.find((c) => c.range.kind === range.kind && (c.range.unit ?? 'days') === (range.unit ?? 'days')
    && (range.kind === 'this' || (c.range.n ?? 30) === (range.n ?? 30)))
  return hit?.key ?? (range.kind === 'custom' ? 'custom' : 'other')
}

/* ---------- views ------------------------------------------------------------ */

/** A new view's id: short, random, and not already taken. */
export function newViewId(taken: string[], random: () => number = Math.random): string {
  for (;;) {
    const id = `v${Math.floor(random() * 36 ** 8).toString(36).padStart(8, '0')}`
    if (!taken.includes(id)) return id
  }
}

/** What a view becomes when nothing else is chosen: a chart picked from the
 *  grouping (a line over many days, bars otherwise, one figure for none). */
export function autoChart(rows: string, measures: Pick<Measure, 'unit' | 'ratio'>[], summaries: Summary[], points: number): StatsView['chart']['type'] {
  if (rows === 'none') {
    const share = measures.length === 1 && (measures[0].ratio || measures[0].unit === '%' || summaries[0] === 'pct_target')
    return share ? 'ring' : measures.length > 1 ? 'table' : 'number'
  }
  if (['day', 'week', 'month', 'year'].includes(rows) && points > 16) return 'line'
  return 'bar'
}

/** A fresh view for a measure: its natural summary, by day over the last
 *  30 days, drawn the way that reads best. */
export function blankView(id: string, m: Measure | null): StatsView {
  const measures: StatsMeasure[] = m ? [{ source: m.key, summary: m.summary }] : []
  const rows = 'day'
  return {
    id, name: m ? m.label : 'New view', measures, rows, columns: 'none', filters: [],
    range: { kind: 'last', n: 30, unit: 'days' },
    chart: { type: m ? autoChart(rows, [m], [m.summary], 30) : 'bar', sort: 'label', y_min: null, y_max: null, labels: true, target_line: null },
    compare: null, pinned: { today: false, stats: true },
  }
}

/** A view as the pivot reads it: its values (and the comparison, when it is
 *  drawn rather than shaded), groupings, filters and days. */
export function viewSpec(view: StatsView, today: string, offset = 0): PivotSpec {
  const values = view.measures.map((m) => ({ measure: m.source, summary: m.summary, target: m.target ?? null, target_mode: m.target_mode, label: m.label }))
  if (view.compare && !view.compare.shade) values.push({ measure: view.compare.source, summary: view.compare.summary, target: null, target_mode: undefined, label: view.compare.label })
  return { rows: view.rows, columns: view.columns, values, filters: view.filters, range: viewSpan(view.range, today, offset), sort: view.chart.sort }
}

/** The modules a view reads from, so only those are loaded. */
export function viewModules(view: Pick<StatsView, 'measures' | 'compare'>): string[] {
  const keys = [...view.measures.map((m) => m.source), ...(view.compare ? [view.compare.source] : [])]
  return [...new Set(keys.map((k) => k.split(/[:.]/)[0]))]
}

/** Views saved before measure keys used a colon ('tasks.done') read with one. */
export function migrateSource(source: string): string {
  return source.includes(':') ? source : source.replace('.', ':')
}

/** The list with a view put in (a new one at the end, an edited one in its
 *  place), checked the way it will be read back. */
export function putView(views: StatsView[], view: StatsView): StatsView[] {
  const clean = readStatsView(view)
  if (!clean) return views
  const at = views.findIndex((v) => v.id === clean.id)
  if (at >= 0) return views.map((v, i) => (i === at ? clean : v))
  return views.length >= MAX_VIEWS ? views : [...views, clean]
}

/** A copy of a view right after it, named "… (copy)". */
export function duplicateView(views: StatsView[], id: string, newId: string): StatsView[] {
  const at = views.findIndex((v) => v.id === id)
  if (at < 0 || views.length >= MAX_VIEWS) return views
  const copy = { ...structuredClone(views[at]), id: newId, name: `${views[at].name} (copy)`.slice(0, 60), pinned: { ...views[at].pinned, today: false } }
  return [...views.slice(0, at + 1), copy, ...views.slice(at + 1)]
}

/** A view moved up (-1) or down (1) in the list. */
export function moveView(views: StatsView[], id: string, dir: -1 | 1): StatsView[] {
  const at = views.findIndex((v) => v.id === id)
  const to = at + dir
  if (at < 0 || to < 0 || to >= views.length) return views
  const out = [...views]
  ;[out[at], out[to]] = [out[to], out[at]]
  return out
}

export const removeView = (views: StatsView[], id: string) => views.filter((v) => v.id !== id)

/* ---------- ready-made views (STA-15) ----------------------------------------- */

export interface Template {
  key: string
  name: string
  hint: string
  /** Modules that must be on for it to mean anything. */
  needs: string[]
  view: Omit<StatsView, 'id'>
}

const chart = (type: StatsView['chart']['type'], extra: Partial<StatsView['chart']> = {}): StatsView['chart'] =>
  ({ type, sort: 'label', y_min: null, y_max: null, labels: true, target_line: null, ...extra })
const tpl = (key: string, name: string, hint: string, needs: string[], v: Partial<Omit<StatsView, 'id' | 'name'>>): Template => ({
  key, name, hint, needs,
  view: { name, measures: [], rows: 'day', columns: 'none', filters: [], range: { kind: 'last', n: 30, unit: 'days' }, chart: chart('bar'), compare: null, pinned: { today: false, stats: true }, ...v },
})

export const TEMPLATES: Template[] = [
  tpl('protein_target', 'Protein vs target (week)', 'Protein eaten each day this week against your protein target.', ['nutrition'], {
    measures: [{ source: 'nutrition:protein_g', summary: 'sum' }], range: { kind: 'this', unit: 'weeks' }, chart: chart('bar'),
  }),
  tpl('kcal_eaten_planned', 'Calories eaten vs planned', 'Each day of the last two weeks: what was eaten beside what was planned.', ['nutrition'], {
    measures: [{ source: 'nutrition:kcal', summary: 'sum' }, { source: 'nutrition:planned_kcal', summary: 'sum' }], range: { kind: 'last', n: 14, unit: 'days' }, chart: chart('bar'),
  }),
  tpl('volume_muscle', 'Training volume by muscle group', 'Reps times load over the last 30 days, by muscle group.', ['training'], {
    measures: [{ source: 'training:volume', summary: 'sum' }], rows: 'category', chart: chart('bar', { sort: 'value_desc' }),
  }),
  tpl('study_subject', 'Study minutes by subject', 'Minutes studied over the last 30 days, by subject.', ['learning'], {
    measures: [{ source: 'learning:study:minutes', summary: 'sum' }], rows: 'field:subject', chart: chart('bar', { sort: 'value_desc' }),
  }),
  tpl('spending_category', 'Spending by category (month)', 'This month\'s amounts, by category.', ['finance'], {
    measures: [{ source: 'finance:entry:amount', summary: 'sum' }], rows: 'field:category', range: { kind: 'this', unit: 'months' }, chart: chart('bar', { sort: 'value_desc' }),
  }),
  tpl('chores_person', 'Chores per person', 'Chores done over the last 30 days, by who did them.', ['household'], {
    measures: [{ source: 'household:chores_done', summary: 'sum' }], rows: 'person', chart: chart('bar', { sort: 'value_desc' }),
  }),
  tpl('sleep_training', 'Sleep vs training days', 'Hours slept each night, with the days you trained shaded behind.', ['sleep', 'training'], {
    measures: [{ source: 'sleep:hours', summary: 'avg' }], compare: { source: 'training:sessions', summary: 'sum', shade: true, label: 'Training days' }, chart: chart('line'),
  }),
  tpl('habit_kept', 'Habit kept % by habit', 'How often each habit was done when it was due, over the last 30 days.', ['habits'], {
    measures: [{ source: 'habits:kept', summary: 'avg' }], rows: 'item', chart: chart('bar', { sort: 'value_desc', y_min: 0, y_max: 100 }),
  }),
  tpl('tasks_weeks', 'Tasks done by week', 'Tasks done and planned in each of the last 12 weeks.', [], {
    measures: [{ source: 'tasks:done', summary: 'sum' }, { source: 'tasks:planned', summary: 'sum' }], rows: 'week', range: { kind: 'last', n: 12, unit: 'weeks' }, chart: chart('bar'),
  }),
  tpl('tasks_sections', 'Tasks by section and week', 'A table: sections down the side, weeks across, tasks done in each.', [], {
    measures: [{ source: 'tasks:done', summary: 'sum' }], rows: 'section', columns: 'week', range: { kind: 'last', n: 4, unit: 'weeks' }, chart: chart('table'),
  }),
  tpl('weight_trend', 'Weight over 90 days', 'Every weigh-in of the last 90 days as a line.', ['health'], {
    measures: [{ source: 'health:weight', summary: 'latest' }], range: { kind: 'last', n: 90, unit: 'days' }, chart: chart('line'),
  }),
  tpl('habits_year', 'Habit ticks this year', 'A square per day of the year, darker on days with more ticks.', ['habits'], {
    measures: [{ source: 'habits:ticks', summary: 'sum' }], range: { kind: 'this', unit: 'years' }, chart: chart('heat'),
  }),
]

/** The ready-made views that fit the modules that are on. */
export function templatesFor(on: string[]): Template[] {
  return TEMPLATES.filter((t) => t.needs.every((k) => on.includes(k)))
}

/** A ready-made view as a saved one of the person's own. */
export function fromTemplate(t: Template, id: string): StatsView {
  return { ...structuredClone(t.view), id }
}

/* ---------- Today's cards (TOD-20) -------------------------------------------- */

export interface CardLike { kind: 'module' | 'stats'; key: string; size: 'small' | 'large'; show: 'always' | 'weekdays' | 'weekends' }
export const MAX_CARDS = 6

/** The cards that show on a day: weekday ones Monday to Friday, weekend
 *  ones on Saturday and Sunday. Cards of a module that is off, or of a
 *  view that is gone, never show (and stay stored, in case they come back). */
export function cardsFor<T extends CardLike>(cards: T[], day: string, alive: (c: T) => boolean): T[] {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
  const weekend = wd === 0 || wd === 6
  return cards.filter((c) => (c.show === 'always' || (c.show === 'weekends') === weekend) && alive(c))
}

export function addCard<T extends CardLike>(cards: T[], card: T): T[] {
  if (cards.length >= MAX_CARDS || cards.some((c) => c.kind === card.kind && c.key === card.key)) return cards
  return [...cards, card]
}

export function moveCard<T extends CardLike>(cards: T[], at: number, dir: -1 | 1): T[] {
  const to = at + dir
  if (at < 0 || at >= cards.length || to < 0 || to >= cards.length) return cards
  const out = [...cards]
  ;[out[at], out[to]] = [out[to], out[at]]
  return out
}

export function changeCard<T extends CardLike>(cards: T[], at: number, change: Partial<Pick<T, 'size' | 'show'>>): T[] {
  return cards.map((c, i) => (i === at ? { ...c, ...change } : c))
}

/** A measure as a card key: card keys allow letters, digits, _, : and -. */
export const CARD_KEY = /^[a-z0-9_:-]{1,60}$/i
