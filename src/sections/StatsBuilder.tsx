import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { useCatalogue, useView } from '../lib/stats'
import { search } from '../lib/search-rules'
import { SWATCHES } from '../lib/colours-rules'
import { readable, SPLIT_COLOURS } from '../lib/chart-rules'
import { keysOf, isTimeDim } from '../lib/pivot-rules'
import {
  autoChart, blankView, groupingsFor, MAX_CARDS, newViewId, putView, RANGE_CHOICES, rangeChoice, summariesFor, type Measure,
} from '../lib/stats-builder-rules'
import { CHARTS, MAX_FILTERS, MAX_MEASURES, type ChartType, type StatsFilter, type StatsMeasure, type StatsView as View, type Summary } from '../lib/stats-view-rules'
import { Dropdown } from '../ui/Dropdown'
import { isIos } from '../lib/native'
import { ViewBody, groupName, usePaper, useSeriesColour } from './StatsView'
import './stats.css'

/** The stats builder (STA-10, STA-11, STA-18, STA-19), on one screen:
 *  measures (any number, each with its own summary and target), what goes
 *  down the side and across, the days, filters, a comparison, and how the
 *  chart looks, with the result drawn live at the top. Then save it as a
 *  view, as many as wanted, on the Stats page, on Today or on a widget. */

export const CHART_NAMES: Record<ChartType, string> = {
  bar: 'Bars', stacked: 'Stacked bars', line: 'Line', area: 'Area', dots: 'Dots',
  number: 'One figure', ring: 'Ring', table: 'Table', heat: 'Heat grid',
}
const SORTS = [
  { value: 'label', label: 'In order' },
  { value: 'value_desc', label: 'Highest first' },
  { value: 'value_asc', label: 'Lowest first' },
]
const UNITS = [{ value: 'days', label: 'days' }, { value: 'weeks', label: 'weeks' }, { value: 'months', label: 'months' }, { value: 'years', label: 'years' }]
const OPS: Record<string, { value: StatsFilter['op']; label: string }[]> = {
  text: [{ value: 'is', label: 'is' }, { value: 'not', label: 'is not' }],
  number: [{ value: 'gt', label: 'above' }, { value: 'lt', label: 'below' }, { value: 'is', label: 'exactly' }],
}

export function StatsBuilder({ profileId, today, start, onClose }: {
  profileId: string; today: string; start: View | null; onClose: (saved?: View) => void
}) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const cat = useCatalogue(profileId, settings.stats.show_disabled)
  const catalogue = cat?.catalogue ?? []
  const byKey = useMemo(() => new Map(catalogue.map((m) => [m.key, m])), [catalogue])
  const isNew = !start || !settings.stats_views.some((v) => v.id === start.id)
  const [draft, setDraft] = useState<View>(() => start ?? blankView(newViewId(settings.stats_views.map((v) => v.id)), null))
  const [onToday, setOnToday] = useState(() => !!start && settings.today_cards.some((c) => c.kind === 'stats' && c.key === start.id))
  const [picking, setPicking] = useState(!start || start.measures.length === 0)
  const [named, setNamed] = useState(!isNew)
  const [problem, setProblem] = useState<string | null>(null)
  const preview = useView(draft.measures.length ? profileId : undefined, draft.measures.length ? draft : null, today)
  const paper = usePaper()
  const colourOf = useSeriesColour()
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  useEffect(() => { top.current?.focus() }, [])

  const measures = draft.measures.map((m) => byKey.get(m.source)).filter((m): m is Measure => !!m)
  const groupings = groupingsFor(measures)
  const set = (change: Partial<View>) => setDraft((d) => ({ ...d, ...change }))
  const setChart = (change: Partial<View['chart']>) => setDraft((d) => ({ ...d, chart: { ...d.chart, ...change } }))
  const setMeasure = (i: number, change: Partial<StatsMeasure>) => setDraft((d) => ({ ...d, measures: d.measures.map((m, j) => (j === i ? { ...m, ...change } : m)) }))

  /** A grouping that no longer fits the measures falls back to days. */
  const fit = (d: View, list: Measure[]): View => {
    const ok = new Set(groupingsFor(list).map((g) => g.key))
    return { ...d, rows: ok.has(d.rows) ? d.rows : 'day', columns: ok.has(d.columns) ? d.columns : 'none' }
  }

  function addMeasure(m: Measure) {
    setDraft((d) => {
      const list = [...d.measures, { source: m.key, summary: m.summary } as StatsMeasure].slice(0, MAX_MEASURES)
      let next = fit({ ...d, measures: list }, list.map((x) => byKey.get(x.source)).filter((x): x is Measure => !!x))
      // The first measure names the view and picks the chart, until the person does.
      if (d.measures.length === 0) {
        next = { ...next, chart: { ...next.chart, type: autoChart(next.rows, [m], [m.summary], 30) } }
        if (!named) next.name = m.label
      }
      return next
    })
    setPicking(false)
  }
  function removeMeasure(i: number) {
    setDraft((d) => {
      const list = d.measures.filter((_, j) => j !== i)
      return fit({ ...d, measures: list, chart: { ...d.chart, hidden: (d.chart.hidden ?? []).filter((k) => k !== `m${i}`) } }, list.map((x) => byKey.get(x.source)).filter((x): x is Measure => !!x))
    })
  }
  function moveMeasure(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const to = i + dir
      if (to < 0 || to >= d.measures.length) return d
      const list = [...d.measures]
      ;[list[i], list[to]] = [list[to], list[i]]
      return { ...d, measures: list }
    })
  }

  async function save() {
    if (!profile) return
    if (!draft.measures.length) { setProblem('Pick at least one measure.'); return }
    const name = draft.name.trim()
    if (!name) { setProblem('Give the view a name.'); return }
    const view: View = { ...draft, name, pinned: { ...draft.pinned, today: onToday } }
    const views = putView(settings.stats_views, view)
    if (views === settings.stats_views || !views.some((v) => v.id === view.id)) { setProblem('This view could not be saved. You may already have 50 views; delete one first.'); return }
    let cards = settings.today_cards.filter((c) => !(c.kind === 'stats' && c.key === view.id))
    const wasOn = settings.today_cards.some((c) => c.kind === 'stats' && c.key === view.id)
    if (onToday) {
      if (wasOn) cards = settings.today_cards
      else if (cards.length < MAX_CARDS) cards = [...cards, { kind: 'stats', key: view.id, size: 'large', show: 'always' }]
    }
    await saveSettings(profile, { stats_views: views, today_cards: cards })
    onClose(view)
  }

  const paletteFor = (key: string, current: string | undefined, onPick: (hex: string | undefined) => void, fallback: string) => {
    const shown = readable(current ?? fallback, paper)
    return (
      <div className="sb-colours" role="radiogroup" aria-label="Colour">
        <button type="button" role="radio" aria-checked={!current} className="sb-swatch is-auto" style={{ background: readable(fallback, paper) }}
          aria-label="The module's own colour" onClick={() => onPick(undefined)} />
        {SWATCHES.map((s) => (
          <button key={s.hex} type="button" role="radio" aria-checked={current === s.hex} className="sb-swatch" style={{ background: readable(s.hex, paper) }}
            aria-label={s.name} onClick={() => onPick(s.hex)} />
        ))}
        {current && shown !== current && <span className="sb-note" key={`${key}n`}>Drawn a little darker or lighter here, so it stands out on this page.</span>}
      </div>
    )
  }

  const filterFields = [
    ...groupings.filter((g) => !isTimeDim(g.key) && g.key !== 'none').map((g) => ({ value: g.key, label: g.label })),
    { value: 'weekday', label: 'Day of the week' },
    { value: 'value', label: 'The value itself' },
  ]
  const suggestions = (field: string): string[] => {
    if (!preview || field === 'value') return []
    if (field === 'weekday') return ['1', '2', '3', '4', '5', '6', '7']
    const seen = new Set<string>()
    for (const f of preview.facts) for (const k of keysOf(f, field)) if (k) seen.add(k)
    return [...seen].sort().slice(0, 50)
  }

  const series = measures.length && draft.columns === 'none'
    ? [...draft.measures.map((m, i) => ({ key: `m${i}`, label: m.label ?? byKey.get(m.source)?.label ?? m.source })),
      ...(draft.compare && !draft.compare.shade ? [{ key: 'cmp', label: byKey.get(draft.compare.source)?.label ?? 'Comparison' }] : [])]
    : (preview?.result.columns ?? []).slice(0, SPLIT_COLOURS.length).map((c) => ({ key: `c:${c.key}`, label: c.label }))
  const hidden = new Set(draft.chart.hidden ?? [])

  return (
    <section className="sb" aria-labelledby="sb-title">
      <header className="sb-head">
        <button type="button" className="btn" onClick={() => onClose()}>Cancel</button>
        <h2 id="sb-title" tabIndex={-1} ref={top}>{isNew ? 'New stats view' : 'Edit view'}</h2>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>Save</button>
      </header>
      <div className="sb-body">
        <section className="sb-preview st-card" aria-label="Preview">
          {draft.measures.length === 0 ? <p className="st-note">Pick what to measure below, and the chart appears here.</p>
            : preview ? <ViewBody view={draft} outcome={preview} compact />
            : <p className="st-note">Working it out…</p>}
        </section>
        {problem && <p className="sb-problem" role="alert">{problem}</p>}

        <label className="sb-field">
          <span>Name</span>
          <input value={draft.name} maxLength={60} onChange={(e) => { setNamed(true); set({ name: e.target.value }) }} />
        </label>

        <fieldset className="sb-group">
          <legend>Measure</legend>
          {draft.measures.map((m, i) => {
            const info = byKey.get(m.source)
            return (
              <div key={`${m.source}${i}`} className="sb-measure">
                <div className="sb-measure-head">
                  <i className="sb-dot" style={{ background: readable(m.colour ?? (info ? colourOf(info.module) : '#78716a'), paper) }} aria-hidden />
                  <span className="sb-measure-name">{info ? `${info.label}` : 'No longer kept'}<span className="st-sub">{info?.group}</span></span>
                  <button type="button" className="btn sb-small" aria-label={`Move ${info?.label ?? 'measure'} up`} disabled={i === 0} onClick={() => moveMeasure(i, -1)}>↑</button>
                  <button type="button" className="btn sb-small" aria-label={`Move ${info?.label ?? 'measure'} down`} disabled={i === draft.measures.length - 1} onClick={() => moveMeasure(i, 1)}>↓</button>
                  <button type="button" className="btn sb-small" aria-label={`Remove ${info?.label ?? 'measure'}`} onClick={() => removeMeasure(i)}>✕</button>
                </div>
                {info && (
                  <div className="sb-row">
                    <label className="sb-field"><span>Summary</span>
                      <Dropdown label={`Summary of ${info.label}`} value={m.summary}
                        options={summariesFor(info).map((s) => ({ value: s.key, label: s.label }))}
                        onChange={(v) => setMeasure(i, { summary: v as Summary })} />
                    </label>
                    <label className="sb-field sb-narrow"><span>Target{info.unit && info.unit !== '%' && info.unit !== 'time' ? ` (${info.unit})` : info.unit === '%' ? ' (%)' : ''}</span>
                      <input inputMode="decimal" value={m.target ?? ''} placeholder={info.targets ? 'yours' : 'none'}
                        onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); setMeasure(i, { target: e.target.value.trim() === '' || !Number.isFinite(n) ? undefined : n }) }} />
                    </label>
                    <label className="sb-field sb-narrow"><span>Target is</span>
                      <Dropdown label="Target is a floor or a ceiling" value={m.target_mode ?? 'at_least'}
                        options={[{ value: 'at_least', label: 'at least' }, { value: 'at_most', label: 'at most' }]}
                        onChange={(v) => setMeasure(i, { target_mode: v === 'at_most' ? 'at_most' : undefined })} />
                    </label>
                  </div>
                )}
                {info && <p className="sb-hint">{info.hint}</p>}
              </div>
            )
          })}
          {picking ? (
            <MeasurePicker catalogue={catalogue} onPick={addMeasure} onCancel={draft.measures.length ? () => setPicking(false) : undefined} loading={!cat} />
          ) : draft.measures.length < MAX_MEASURES && (
            <button type="button" className="btn sb-add" onClick={() => setPicking(true)}>{draft.measures.length ? '+ Add another measure' : '+ Pick a measure'}</button>
          )}
        </fieldset>

        <fieldset className="sb-group">
          <legend>Layout</legend>
          <div className="sb-row">
            <label className="sb-field"><span>Group by</span>
              <Dropdown label="Group by" value={draft.rows} options={groupings.map((g) => ({ value: g.key, label: g.label }))} onChange={(v) => set({ rows: v })} />
            </label>
            <label className="sb-field"><span>Split by</span>
              <Dropdown label="Split by" value={draft.columns}
                options={[{ value: 'none', label: 'No split' }, ...groupings.filter((g) => g.key !== 'none' && g.key !== draft.rows).map((g) => ({ value: g.key, label: g.label }))]}
                onChange={(v) => set({ columns: v })} />
            </label>
          </div>
          {draft.columns !== 'none' && draft.measures.length > 1 && <p className="sb-hint">The chart draws the first measure for each {groupName(draft.columns, measures).toLowerCase()}; the table shows them all.</p>}
        </fieldset>

        <fieldset className="sb-group">
          <legend>Days</legend>
          <div className="sb-row">
            <label className="sb-field"><span>Period</span>
              <Dropdown label="Period" value={rangeChoice(draft.range)}
                options={[...RANGE_CHOICES.map((c) => ({ value: c.key, label: c.label })), { value: 'other', label: 'Last …' }, { value: 'custom', label: 'Chosen days' }]}
                onChange={(v) => {
                  const hit = RANGE_CHOICES.find((c) => c.key === v)
                  if (hit) set({ range: { ...hit.range } })
                  else if (v === 'custom') set({ range: { kind: 'custom', from: draft.range.from ?? today.slice(0, 8) + '01', to: draft.range.to ?? today } })
                  else set({ range: { kind: 'last', n: draft.range.n ?? 14, unit: draft.range.unit ?? 'days' } })
                }} />
            </label>
          </div>
          {rangeChoice(draft.range) === 'other' && (
            <div className="sb-row">
              <label className="sb-field sb-narrow"><span>Last</span>
                <input inputMode="numeric" value={draft.range.n ?? ''} onChange={(e) => { const n = Math.floor(Number(e.target.value)); set({ range: { ...draft.range, kind: 'last', n: Number.isFinite(n) && n > 0 ? Math.min(3650, n) : 1 } }) }} />
              </label>
              <label className="sb-field"><span>Of</span>
                <Dropdown label="Unit" value={draft.range.unit ?? 'days'} options={UNITS} onChange={(v) => set({ range: { ...draft.range, kind: 'last', unit: v as 'days' } })} />
              </label>
            </div>
          )}
          {draft.range.kind === 'custom' && (
            <div className="sb-row">
              <label className="sb-field"><span>From</span><input type="date" value={draft.range.from ?? ''} onChange={(e) => set({ range: { ...draft.range, from: e.target.value } })} /></label>
              <label className="sb-field"><span>To</span><input type="date" value={draft.range.to ?? ''} onChange={(e) => set({ range: { ...draft.range, to: e.target.value } })} /></label>
            </div>
          )}
        </fieldset>

        <fieldset className="sb-group">
          <legend>Filters</legend>
          {draft.filters.map((f, i) => {
            const kind = f.field === 'value' ? 'number' : 'text'
            const list = suggestions(f.field)
            return (
              <div key={i} className="sb-row sb-filter">
                <Dropdown label="Filter on" value={f.field} options={filterFields} onChange={(v) => set({ filters: draft.filters.map((x, j) => (j === i ? { field: v, op: v === 'value' ? 'gt' : 'is', value: '' } : x)) })} />
                <Dropdown label="How" value={f.op} options={OPS[kind]} onChange={(v) => set({ filters: draft.filters.map((x, j) => (j === i ? { ...x, op: v } : x)) })} />
                <input aria-label="Value" list={`sb-f${i}`} value={String(f.value)} inputMode={kind === 'number' ? 'decimal' : 'text'}
                  placeholder={f.field === 'weekday' ? '1 is Monday' : ''}
                  onChange={(e) => set({ filters: draft.filters.map((x, j) => (j === i ? { ...x, value: kind === 'number' && e.target.value !== '' && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value } : x)) })} />
                <datalist id={`sb-f${i}`}>{list.map((s) => <option key={s} value={s} />)}</datalist>
                <button type="button" className="btn sb-small" aria-label="Remove this filter" onClick={() => set({ filters: draft.filters.filter((_, j) => j !== i) })}>✕</button>
              </div>
            )
          })}
          {draft.filters.length < MAX_FILTERS && draft.measures.length > 0 && (
            <button type="button" className="btn sb-add" onClick={() => set({ filters: [...draft.filters, { field: filterFields[0]?.value ?? 'value', op: filterFields[0]?.value === 'value' ? 'gt' : 'is', value: '' }] })}>+ Add a filter</button>
          )}
        </fieldset>

        <fieldset className="sb-group">
          <legend>Compare with</legend>
          <div className="sb-row">
            <label className="sb-field"><span>Another measure</span>
              <Dropdown label="Compare with" value={draft.compare?.source ?? 'none'}
                options={[{ value: 'none', label: 'Nothing' }, ...catalogue.filter((m) => !m.part).map((m) => ({ value: m.key, label: `${m.group}: ${m.label}` }))]}
                onChange={(v) => {
                  if (v === 'none') { set({ compare: null }); return }
                  const m = byKey.get(v)!
                  set({ compare: { source: v, summary: m.summary, shade: draft.compare?.shade ?? (m.combine === 'sum' && m.known === 'all') } })
                }} />
            </label>
            {draft.compare && (
              <label className="sb-field"><span>Shown as</span>
                <Dropdown label="Shown as" value={draft.compare.shade ? 'shade' : 'draw'}
                  options={[{ value: 'draw', label: 'A second series' }, { value: 'shade', label: 'Days it happened, shaded' }]}
                  onChange={(v) => set({ compare: { ...draft.compare!, shade: v === 'shade' } })} />
              </label>
            )}
          </div>
          {draft.compare?.shade && <p className="sb-hint">Days with it are shaded; the view says how the first measure differs on them.</p>}
        </fieldset>

        <fieldset className="sb-group">
          <legend>Chart</legend>
          <div className="sb-chips" role="radiogroup" aria-label="Chart type">
            {CHARTS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={draft.chart.type === t} className="sb-chip" onClick={() => setChart({ type: t })}>{CHART_NAMES[t]}</button>
            ))}
          </div>
          {series.length > 0 && ['bar', 'stacked', 'line', 'area', 'dots'].includes(draft.chart.type) && (
            <div className="sb-series">
              <p className="sb-label">Series</p>
              {series.map((s, i) => {
                const isMeasure = s.key.startsWith('m')
                const isCmp = s.key === 'cmp'
                const mi = isMeasure ? Number(s.key.slice(1)) : -1
                const fallback = isMeasure ? colourOf(byKey.get(draft.measures[mi]?.source ?? '')?.module ?? 'tasks')
                  : isCmp ? colourOf(byKey.get(draft.compare?.source ?? '')?.module ?? 'tasks') : SPLIT_COLOURS[i]
                const current = isMeasure ? draft.measures[mi]?.colour : isCmp ? draft.compare?.colour : draft.chart.colours?.[s.key]
                return (
                  <div key={s.key} className="sb-serie">
                    <label className="sb-check">
                      <input type="checkbox" checked={!hidden.has(s.key)}
                        onChange={(e) => setChart({ hidden: e.target.checked ? [...hidden].filter((k) => k !== s.key) : [...hidden, s.key] })} />
                      <span>{s.label}</span>
                    </label>
                    {paletteFor(s.key, current, (hex) => {
                      if (isMeasure) setMeasure(mi, { colour: hex })
                      else if (isCmp) set({ compare: { ...draft.compare!, colour: hex } })
                      else {
                        const colours = { ...(draft.chart.colours ?? {}) }
                        if (hex) colours[s.key] = hex; else delete colours[s.key]
                        setChart({ colours })
                      }
                    }, fallback)}
                  </div>
                )
              })}
            </div>
          )}
          <div className="sb-row">
            <label className="sb-field"><span>Order</span>
              <Dropdown label="Order" value={draft.chart.sort ?? 'label'} options={SORTS} onChange={(v) => setChart({ sort: v as 'label' })} />
            </label>
            <label className="sb-field sb-narrow"><span>Axis from</span>
              <input inputMode="decimal" placeholder="auto" value={draft.chart.y_min ?? ''} onChange={(e) => setChart({ y_min: e.target.value.trim() === '' || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })} />
            </label>
            <label className="sb-field sb-narrow"><span>Axis to</span>
              <input inputMode="decimal" placeholder="auto" value={draft.chart.y_max ?? ''} onChange={(e) => setChart({ y_max: e.target.value.trim() === '' || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })} />
            </label>
            <label className="sb-field sb-narrow"><span>Target line</span>
              <input inputMode="decimal" placeholder="none" value={draft.chart.target_line ?? ''} onChange={(e) => setChart({ target_line: e.target.value.trim() === '' || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })} />
            </label>
          </div>
          <label className="sb-check"><input type="checkbox" checked={draft.chart.labels !== false} onChange={(e) => setChart({ labels: e.target.checked })} /><span>Values written on the chart</span></label>
          <label className="sb-check"><input type="checkbox" checked={draft.chart.table === true} onChange={(e) => setChart({ table: e.target.checked || undefined })} /><span>Open with the table showing</span></label>
        </fieldset>

        <fieldset className="sb-group">
          <legend>Where it shows</legend>
          <label className="sb-check"><input type="checkbox" checked={draft.pinned?.stats !== false} onChange={(e) => set({ pinned: { ...draft.pinned, stats: e.target.checked } })} /><span>On the Stats page</span></label>
          <label className="sb-check">
            <input type="checkbox" checked={onToday} disabled={!onToday && settings.today_cards.length >= MAX_CARDS && !settings.today_cards.some((c) => c.kind === 'stats' && c.key === draft.id)}
              onChange={(e) => setOnToday(e.target.checked)} />
            <span>As a card on Today{!onToday && settings.today_cards.length >= MAX_CARDS ? ' (Today already has 6 cards; take one off first)' : ''}</span>
          </label>
          {!isIos() && <p className="sb-hint">It can also go on the home screen as a Hemlo stats widget.</p>}
        </fieldset>
        <div className="sheet-actions sb-foot">
          <button type="button" className="btn" onClick={() => onClose()}>Cancel</button>
          <button type="button" className="btn btn-primary grow" onClick={() => void save()}>{isNew ? 'Save as a view' : 'Save changes'}</button>
        </div>
      </div>
    </section>
  )
}

/** Every measure the modules keep, grouped by module, found with the one
 *  search (any words, any order, accents ignored). */
function MeasurePicker({ catalogue, onPick, onCancel, loading }: { catalogue: Measure[]; onPick: (m: Measure) => void; onCancel?: () => void; loading: boolean }) {
  const [q, setQ] = useState('')
  const all = catalogue.filter((m) => !m.part)
  const found = q.trim() ? search(all.map((m) => ({ ...m, name: m.label, extra: m.group })), q) : all
  const groups = new Map<string, Measure[]>()
  for (const m of found) groups.set(m.group, [...(groups.get(m.group) ?? []), m])
  return (
    // Each measure's description shows for the one in focus, or once
    // something is typed (v17: a long list of descriptions is a wall).
    <div className={`sb-picker${q.trim() ? ' is-searching' : ''}`}>
      <div className="sb-row">
        <input className="sb-search" type="search" aria-label="Find a measure" placeholder="Find a measure: protein, sleep, chores…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Close</button>}
      </div>
      {loading ? <p className="st-note">Reading your modules…</p> : found.length === 0 ? <p className="st-note">No measure matches "{q}".</p> : (
        <div className="sb-picker-list">
          {[...groups].map(([g, list]) => (
            <div key={g} role="group" aria-label={g}>
              <p className="sb-label">{g}</p>
              {list.map((m) => (
                <button key={m.key} type="button" className="sb-pick" onClick={() => onPick(m)}>
                  <span>{m.label}</span>
                  <span className="sb-pick-hint">{m.hint}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
