import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { useModuleColours } from '../lib/colours'
import { useView, type ViewOutcome } from '../lib/stats'
import { chartData, describe, formatValue, readable } from '../lib/chart-rules'
import { dailyValues, decimalsFor, heatGrid, pivotRows, unitFor, withWithout } from '../lib/pivot-rules'
import {
  duplicateView, groupingsFor, moveView, newViewId, rangeName, removeView, spanName, summaryName, type Measure,
} from '../lib/stats-builder-rules'
import { MAX_CARDS } from '../lib/stats-builder-rules'
import type { StatsView as View } from '../lib/stats-view-rules'
import { XYChart } from '../ui/charts/XYChart'
import { HeatGrid, NumberTile, Ring } from '../ui/charts/Figures'
import { PivotTable } from '../ui/charts/PivotTable'
import { MoreMenu, type MenuItem } from '../ui/charts/MoreMenu'
import { ExportLink } from '../ui/ExportLink'
import { offerUndo } from '../ui/Undo'
import type { FieldDef } from '../modules/types'
import './stats.css'

/** A saved stats view on the Stats page (STA-12 to STA-14, STA-16, STA-19):
 *  its chart as the person set it up, a table toggle with drill-down, a
 *  sentence saying what it shows, arrows to step back through earlier
 *  ranges, Export, and a ⋮ menu with everything else. */

const TASK_COLOUR = '#6d7198'

/** The page colour now (it changes with the theme), for checking series colours against. */
export function usePaper(): string {
  const read = () => (typeof document === 'undefined' ? '#f8f4ed'
    : getComputedStyle(document.documentElement).getPropertyValue('--e-paper').trim() || '#f8f4ed')
  const [paper, setPaper] = useState(read)
  useEffect(() => {
    const update = () => setPaper(read())
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener?.('change', update)
    return () => { mo.disconnect(); mq.removeEventListener?.('change', update) }
  }, [])
  return /^#[0-9a-f]{6}$/i.test(paper) ? paper : '#f8f4ed'
}

/** A module's colour for a chart; the planner's own tasks are slate. */
export function useSeriesColour(): (moduleKey: string) => string {
  const colours = useModuleColours()
  return (key: string) => (key === 'tasks' ? TASK_COLOUR : colours.of(key))
}

/** What a grouping is called for these measures: "Day", "Habit", "Meal". */
export function groupName(dim: string, measures: Measure[]): string {
  if (dim.startsWith('field:')) {
    for (const m of measures) if (m.dimNames[dim]) return m.dimNames[dim]
    return dim.slice(6)
  }
  return groupingsFor(measures).find((g) => g.key === dim)?.label.replace(/ \(one figure\)$/, '') ?? dim
}

/** Saving the list of views, with Undo for anything that removes or moves. */
export async function saveViews(views: View[], undoLabel?: string, before?: View[]) {
  const profile = useApp.getState().profile
  if (!profile) return
  await saveSettings(profile, { stats_views: views })
  if (undoLabel && before) {
    offerUndo(undoLabel, async () => {
      const p = useApp.getState().profile
      if (p) await saveSettings(p, { stats_views: before })
    })
  }
}

const EXPORT_COLUMNS = (rowsName: string, colsName: string, split: boolean): FieldDef[] => [
  { name: rowsName, label: rowsName, type: 'text' },
  ...(split ? [{ name: colsName, label: colsName, type: 'text' as const }] : []),
  { name: 'measure', label: 'Measure', type: 'text' },
  { name: 'summary', label: 'Summary', type: 'text' },
  { name: 'value', label: 'Value', type: 'number' },
  { name: 'unit', label: 'Unit', type: 'text' },
]

/** A view's chart and table, from a worked-out view. Shared by the Stats
 *  page, the builder's preview and Today's large cards. */
export function ViewBody({ view, outcome, compact = false, showTable }: { view: View; outcome: ViewOutcome; compact?: boolean; showTable?: boolean }) {
  const paper = usePaper()
  const colourOf = useSeriesColour()
  const { result, catalogue, shade, span } = outcome
  const measures = view.measures.map((m) => catalogue.find((c) => c.key === m.source)).filter((m): m is Measure => !!m)
  const data = useMemo(() => chartData(result, view, colourOf, paper, shade), [result, view, paper, shade]) // eslint-disable-line react-hooks/exhaustive-deps
  const rangeText = view.range.kind === 'custom' ? spanName(span) : rangeName(view.range)
  const summary = describe(result, rangeText)
  const rowsName = groupName(view.rows, measures)
  const colsName = groupName(view.columns, measures)
  const [table, setTable] = useState(showTable ?? view.chart.table === true)
  const v0 = result.values[0]

  if (!v0) {
    return <p className="st-note">{outcome.modulesOff.length
      ? 'This view counts something from a module that is switched off or not counted in Stats. Switch it back on under More, Modules, and the view comes back as it was.'
      : 'Nothing to show: what this view measures is no longer kept by any module.'}</p>
  }
  const unit = unitFor(v0.info, v0.spec.summary)
  const dec = decimalsFor(v0.info, v0.spec.summary)
  const first = data.series.find((s) => !s.hidden) ?? data.series[0]
  const colour = first?.colour ?? readable(colourOf(v0.info.module), paper)
  const type = view.chart.type
  const target = data.target

  let chart: JSX.Element | null = null
  if (type === 'number') {
    chart = <NumberTile label={view.name} value={result.grand[0]} unit={unit} decimals={dec}
      sub={`${v0.spec.label ?? v0.info.label}, ${summaryName(v0.spec.summary, v0.info).toLowerCase()}${target != null ? ` · target ${formatValue(target, unit, dec)}` : ''}`}
      before={result.values.length > 1 ? { text: result.values.slice(1).map((x, k) => `${x.spec.label ?? x.info.label}: ${formatValue(result.grand[k + 1], unitFor(x.info, x.spec.summary), decimalsFor(x.info, x.spec.summary))}`).join(' · ') } : null} />
  } else if (type === 'ring') {
    const g = result.grand[0]
    const progress = g == null ? null : unit === '%' ? g / 100 : target ? g / target : null
    chart = <Ring label={view.name} colour={colour} progress={progress} text={formatValue(g, unit, dec)}
      sub={progress == null && unit !== '%' ? 'Set a target to fill the ring' : target != null && unit !== '%' ? `of ${formatValue(target, unit, dec)}` : summaryName(v0.spec.summary, v0.info).toLowerCase()} />
  } else if (type === 'heat') {
    const series = dailyValues(v0.info, result.facts, result.days, outcome.today)
    chart = <HeatGrid grid={heatGrid(series, span, outcome.today)} colour={colour} unit={v0.info.unit} decimals={v0.info.decimals} label={`${view.name}: ${summary}`} />
  } else if (type !== 'table') {
    chart = <XYChart data={data} type={type} yMin={view.chart.y_min} yMax={view.chart.y_max} labels={view.chart.labels !== false}
      summary={summary} height={compact ? 110 : 150} hint={!compact} shadeName={view.compare?.shade ? (view.compare.label ?? catalogue.find((c) => c.key === view.compare!.source)?.label) : null} />
  }

  // Days when something happened, against days it did not (STA-11, STA-30).
  let compareLine: string | null = null
  if (view.compare?.shade && shade) {
    const known = dailyValues(v0.info, result.facts, result.days, outcome.today)
    const ww = withWithout(known, shade)
    const what = (view.compare.label ?? catalogue.find((c) => c.key === view.compare!.source)?.label ?? 'it').toLowerCase()
    compareLine = ww.enough
      ? `On days with ${what}: ${formatValue(ww.with.mean, v0.info.unit, Math.max(1, v0.info.decimals))} (${ww.with.days} days); without: ${formatValue(ww.without.mean, v0.info.unit, Math.max(1, v0.info.decimals))} (${ww.without.days} days). A pattern, not proof of a cause.`
      : `Too few days to compare: ${ww.with.days} with ${what} and ${ww.without.days} without, out of the at least 3 of each it takes.`
  }

  return (
    <div className="sv-body">
      {chart}
      {!compact && <p className="sv-summary">{summary}</p>}
      {compareLine && <p className="sv-summary">{compareLine}</p>}
      {outcome.modulesOff.length > 0 && <p className="st-note">Part of this view comes from a module that is switched off, so it shows as missing.</p>}
      {!compact && (table || type === 'table') && (
        <PivotTable result={result} rows={view.rows} columns={view.columns} rowsName={rowsName} colsName={colsName} caption={view.name}
          measures={new Map(catalogue.map((m) => [m.key, { label: m.label, unit: m.unit, decimals: m.decimals }]))} />
      )}
      {!compact && (
        <div className="sv-foot">
          {type !== 'table' && (
            <button type="button" className="sv-toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>
              {table ? 'Hide the table' : 'Show as a table'}
            </button>
          )}
          <ExportLink source={{
            rows: pivotRows(result, rowsName, colsName),
            fields: EXPORT_COLUMNS(rowsName, colsName, view.columns !== 'none'),
            label: `${view.name}, ${spanName(span)}`,
          }} />
        </div>
      )}
    </div>
  )
}

/** One saved view as a card on the Stats page. */
export function ViewCard({ view, index, count, profileId, today, onEdit, startOpen = false }: {
  view: View; index: number; count: number; profileId: string; today: string; onEdit: (v: View) => void; startOpen?: boolean
}) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const [offset, setOffset] = useState(0)
  const outcome = useView(profileId, view, today, offset)
  const colourOf = useSeriesColour()
  const views = settings.stats_views
  const onToday = settings.today_cards.some((c) => c.kind === 'stats' && c.key === view.id)
  const [ref, setRef] = useState<HTMLElement | null>(null)
  useEffect(() => { if (startOpen && ref) ref.scrollIntoView({ block: 'start' }) }, [startOpen, ref])

  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => onEdit(view) },
    { label: 'Duplicate', disabled: views.length >= 50, onSelect: () => void saveViews(duplicateView(views, view.id, newViewId(views.map((v) => v.id))), 'View duplicated', views) },
    {
      label: onToday ? 'Take off Today' : 'Pin to Today',
      disabled: !onToday && settings.today_cards.length >= MAX_CARDS,
      onSelect: () => {
        if (!profile) return
        const before = settings.today_cards
        const after = onToday ? before.filter((c) => !(c.kind === 'stats' && c.key === view.id)) : [...before, { kind: 'stats' as const, key: view.id, size: 'large' as const, show: 'always' as const }]
        void saveSettings(profile, { today_cards: after, stats_views: views.map((v) => (v.id === view.id ? { ...v, pinned: { ...v.pinned, today: !onToday } } : v)) })
        if (onToday) offerUndo('Taken off Today', async () => { const p = useApp.getState().profile; if (p) await saveSettings(p, { today_cards: before, stats_views: views }) })
      },
    },
    { label: view.pinned?.stats === false ? 'Show on the Stats page' : 'Keep in the list only', onSelect: () => void saveViews(views.map((v) => (v.id === view.id ? { ...v, pinned: { ...v.pinned, stats: v.pinned?.stats === false } } : v)), view.pinned?.stats === false ? undefined : 'View kept in the list only', views) },
    { label: 'Move up', disabled: index === 0, onSelect: () => void saveViews(moveView(views, view.id, -1), 'View moved', views) },
    { label: 'Move down', disabled: index >= count - 1, onSelect: () => void saveViews(moveView(views, view.id, 1), 'View moved', views) },
    {
      label: 'Delete', danger: true,
      onSelect: () => {
        if (!profile) return
        const beforeCards = settings.today_cards
        void saveSettings(profile, { stats_views: removeView(views, view.id), today_cards: beforeCards.filter((c) => !(c.kind === 'stats' && c.key === view.id)) })
        offerUndo(`"${view.name}" deleted`, async () => { const p = useApp.getState().profile; if (p) await saveSettings(p, { stats_views: views, today_cards: beforeCards }) })
      },
    },
  ]
  const accent = outcome?.result.values[0] ? colourOf(outcome.result.values[0].info.module) : 'var(--e-accent)'
  const step = view.range.kind === 'this' ? (view.range.unit === 'days' ? 'day' : (view.range.unit ?? 'days').slice(0, -1)) : 'range'

  return (
    <article ref={setRef} className="st-card sv" style={{ '--st-accent': accent } as CSSProperties} aria-label={view.name} id={`view-${view.id}`}>
      <header className="st-card-head">
        <h3>{view.name}</h3>
        {onToday && <span className="chip">on Today</span>}
        <MoreMenu label={`More for ${view.name}`} items={items} />
      </header>
      <div className="sv-range">
        <button type="button" className="btn sv-step" aria-label={`Previous ${step}`} disabled={offset <= -120} onClick={() => setOffset((o) => o - 1)}>‹</button>
        <span className="sv-range-text">
          {outcome ? spanName(outcome.span) : ''}
          <span className="st-sub">{offset === 0 ? rangeName(view.range) : offset < 0 ? `${-offset} back` : `${offset} ahead`}</span>
        </span>
        {offset !== 0 && <button type="button" className="btn" onClick={() => setOffset(0)}>Now</button>}
        <button type="button" className="btn sv-step" aria-label={`Next ${step}`} disabled={offset >= 12} onClick={() => setOffset((o) => o + 1)}>›</button>
      </div>
      {outcome === undefined ? <p className="st-note">Working it out…</p> : <ViewBody view={view} outcome={outcome} />}
    </article>
  )
}
