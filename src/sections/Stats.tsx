import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { refreshStatsNames, saveCardPicks, useCardPicks, usePeriodFacts } from '../lib/stats'
import {
  PERIODS, PERIOD_LABEL, beforeName, canShift, clampAnchor, formatDelta, isCurrent, periodRange, periodTitle, previousRange, shiftAnchor,
  type Period,
} from '../lib/stats-rules'
import { chartData, formatValue } from '../lib/chart-rules'
import { pivot } from '../lib/pivot-rules'
import {
  blankView, cardFigure, cardMeasures, fromTemplate, MAX_CARDS, newViewId, patterns, putView, templatesFor,
  type CardFigure, type Measure,
} from '../lib/stats-builder-rules'
import type { StatsView as View } from '../lib/stats-view-rules'
import { ExportLink } from '../ui/ExportLink'
import { offerUndo } from '../ui/Undo'
import { XYChart } from '../ui/charts/XYChart'
import { MoreMenu } from '../ui/charts/MoreMenu'
import { ViewCard, saveViews, usePaper, useSeriesColour } from './StatsView'
import { StatsBuilder } from './StatsBuilder'
import type { FieldDef } from '../modules/types'
import type { Fact } from '../lib/pivot-rules'
import './stats.css'

/** The columns of the module figures, when they are exported. */
const EXPORT_FIELDS: FieldDef[] = [
  { name: 'period', label: 'Period', type: 'text' },
  { name: 'module', label: 'Module', type: 'text' },
  { name: 'metric', label: 'Figure', type: 'text' },
  { name: 'value', label: 'Value', type: 'number' },
  { name: 'unit', label: 'Unit', type: 'text' },
]

/** The Stats page: the person's own saved views first (STA-13, STA-14), in
 *  their order, with a builder for new ones and ready-made ones to add;
 *  then a card per module for a day, week, month or year, each opening out
 *  to every measure the module keeps (STA-02), and patterns across modules
 *  when there is enough to say (STA-30). A view opens at /stats?view=<id>. */
export function Stats({ profileId, day }: { profileId: string; day: string }) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const [params, setParams] = useSearchParams()
  const openId = params.get('view')
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(() => clampAnchor(day, today))
  // The tick shows the change at once; the saved setting catches up.
  const [tickedNow, setTickedNow] = useState<boolean | null>(null)
  const showDisabled = tickedNow ?? settings.stats.show_disabled
  useEffect(() => setTickedNow(null), [settings.stats.show_disabled])
  useEffect(() => { void refreshStatsNames(profile?.household_id) }, [profile?.household_id])
  const cur = periodRange(period, anchor)
  const prev = previousRange(period, anchor)
  const span = useMemo(() => ({ start: prev.start, end: cur.end }), [prev.start, cur.end])
  const data = usePeriodFacts(profileId, span, today, showDisabled)
  const picks = useCardPicks(profileId)
  const [building, setBuilding] = useState<View | null | 'new'>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const views = settings.stats_views
  const opened = openId ? views.find((v) => v.id === openId) ?? null : null
  const pinned = views.filter((v) => v.pinned?.stats !== false || v.id === openId)
  const listOnly = views.filter((v) => v.pinned?.stats === false && v.id !== openId)

  const step = (dir: 1 | -1) => { if (canShift(period, anchor, dir, today)) setAnchor(shiftAnchor(period, anchor, dir)) }
  const current = isCurrent(period, anchor, today)
  const on = data?.modules.filter((m) => m.on).map((m) => m.key) ?? []
  const ready = templatesFor(on).filter((t) => !views.some((v) => v.name === t.name))

  function addTemplate(key: string) {
    const t = ready.find((x) => x.key === key)
    if (!t) return
    const view = fromTemplate(t, newViewId(views.map((v) => v.id)))
    void saveViews(putView(views, view), `"${t.name}" added`, views)
  }

  if (building) {
    return (
      <StatsBuilder profileId={profileId} today={today} start={building === 'new' ? null : building}
        onClose={(saved) => {
          setBuilding(null)
          if (saved) setParams({ view: saved.id }, { replace: true })
        }} />
    )
  }

  // Cards: tasks first, then each counted module in module order.
  const cards = data ? [{ key: 'tasks', name: 'Tasks', on: true }, ...data.modules] : []
  const exportRows = data ? cards.flatMap((m) => cardMeasures(data.catalogue, m.key, picks[m.key]).shown.map((x) => {
    const f = cardFigure(x, data.facts, cur, prev, today)
    return f.value == null ? null : { period: `${period} ${cur.start === cur.end ? cur.start : `${cur.start} to ${cur.end}`}`, module: m.name, metric: x.label, value: Math.round(f.value * 100) / 100, unit: x.unit }
  }).filter((r): r is NonNullable<typeof r> => !!r)) : []

  return (
    <section className="st" aria-label="Stats">
      <div className="st-views-head">
        <h2 className="st-h">Your views</h2>
        <button type="button" className="btn" aria-expanded={showTemplates} onClick={() => setShowTemplates((s) => !s)}>Ready-made</button>
        <button type="button" className="btn btn-primary" onClick={() => setBuilding('new')}>+ New view</button>
      </div>
      {showTemplates && (
        <div className="st-templates" role="group" aria-label="Ready-made views">
          {ready.length === 0 ? <p className="st-note">Every ready-made view for the modules you have on is already in your list.</p> : ready.map((t) => (
            <div key={t.key} className="st-template">
              <span className="st-template-text"><b>{t.name}</b><span className="st-sub">{t.hint}</span></span>
              <button type="button" className="btn" onClick={() => addTemplate(t.key)} aria-label={`Add ${t.name}`}>Add</button>
            </div>
          ))}
          <p className="st-note">Each one becomes a view of your own: change it, or delete it, as you like.</p>
        </div>
      )}
      {views.length === 0 ? (
        <div className="st-empty-views">
          <p>Build the stats you want to see: pick any measure from any module, how to sum it up, what to group it by, and the days. Save it as a view, put it on Today or on your home screen.</p>
          <div className="st-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => setBuilding('new')}>Build a view</button>
            <button type="button" className="btn" onClick={() => setShowTemplates(true)}>Start from a ready-made one</button>
          </div>
        </div>
      ) : (
        <div className="st-cards">
          {opened === null && openId && <p className="st-note">That view has been deleted.</p>}
          {pinned.map((v) => (
            <ViewCard key={v.id} view={v} index={views.indexOf(v)} count={views.length} profileId={profileId} today={today}
              startOpen={v.id === openId} onEdit={(x) => setBuilding(x)} />
          ))}
          {listOnly.length > 0 && (
            <details className="st-listonly">
              <summary>{listOnly.length === 1 ? 'One more view' : `${listOnly.length} more views`}, kept in the list only</summary>
              <ul>
                {listOnly.map((v) => (
                  <li key={v.id}>
                    <span>{v.name}</span>
                    <button type="button" className="btn" onClick={() => setParams({ view: v.id })}>Open</button>
                    <button type="button" className="btn" onClick={() => setBuilding(v)}>Edit</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <h2 className="st-h st-h-modules">By module</h2>
      <div className="tabs st-periods" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === period} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
        ))}
      </div>
      <div className="st-nav">
        <button type="button" className="btn" aria-label={`Previous ${period}`} disabled={!canShift(period, anchor, -1, today)} onClick={() => step(-1)}>‹</button>
        <h2 aria-live="polite">{periodTitle(period, anchor)}</h2>
        {!current && <button type="button" className="btn" onClick={() => setAnchor(today)}>Today</button>}
        <button type="button" className="btn" aria-label={`Next ${period}`} disabled={!canShift(period, anchor, 1, today)} onClick={() => step(1)}>›</button>
      </div>
      <label className="st-check">
        <input type="checkbox" checked={showDisabled} disabled={!profile || profile.id !== profileId}
          onChange={(e) => {
            if (!profile) return
            setTickedNow(e.target.checked)
            void saveSettings(profile, { stats: { show_disabled: e.target.checked } })
          }} />
        <span>Show switched-off modules</span>
      </label>
      {anchor > today && !current && <p className="st-note">This {period} has not started yet. Only what is planned for it counts so far.</p>}

      {data === undefined ? <p className="st-note">Working it out…</p> : (
        <>
          <div className="st-cards">
            {cards.map((m) => (
              <ModuleCard key={m.key} moduleKey={m.key} name={m.name} off={!m.on} period={period} cur={cur} prev={prev} today={today}
                facts={data.facts} catalogue={data.catalogue} picked={picks[m.key]} profileId={profileId}
                onChart={(x) => setBuilding({ ...blankView(newViewId(views.map((v) => v.id)), x), range: { kind: 'this', unit: period === 'day' ? 'days' : `${period}s` as 'weeks' } })} />
            ))}
          </div>
          {data.hiddenOff > 0 && (
            <p className="st-note">
              {data.hiddenOff === 1 ? 'One switched-off module is' : `${data.hiddenOff} switched-off modules are`} left out.
              Tick "Show switched-off modules" to see {data.hiddenOff === 1 ? 'it' : 'them'}.
            </p>
          )}
          <Patterns profileId={profileId} today={today} showDisabled={showDisabled} />
          <ExportLink source={{ rows: exportRows as unknown as Record<string, unknown>[], fields: EXPORT_FIELDS, label: `Stats, ${periodTitle(period, anchor)}` }} />
        </>
      )}
    </section>
  )
}

/** A module's card: its picked measures for the period, each with the
 *  average a day and the change on the period before, a small chart of the
 *  first, and every other measure it keeps one tap away (STA-02). */
function ModuleCard({ moduleKey, name, off, period, cur, prev, today, facts, catalogue, picked, profileId, onChart }: {
  moduleKey: string; name: string; off: boolean; period: Period; cur: { start: string; end: string }; prev: { start: string; end: string }
  today: string; facts: Fact[]; catalogue: Measure[]; picked?: string[]; profileId: string; onChart: (m: Measure) => void
}) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const colourOf = useSeriesColour()
  const paper = usePaper()
  const [open, setOpen] = useState(false)
  const { all, shown } = cardMeasures(catalogue, moduleKey, picked)
  const mine = facts.filter((f) => f.module === moduleKey)
  const figures = shown.map((m) => cardFigure(m, mine, cur, prev, today))
  const any = figures.some((f) => f.value != null && !(f.value === 0 && f.delta == null))
  const onToday = settings.today_cards.some((c) => c.kind === 'module' && c.key === moduleKey)
  const first = shown[0]
  const chart = useMemo(() => {
    if (!first || period === 'day') return null
    const result = pivot({ rows: period === 'year' ? 'month' : 'day', columns: 'none', values: [{ measure: first.key, summary: first.summary === 'sum' ? 'sum' : first.summary }], filters: [], range: cur }, mine, catalogue, today)
    return chartData(result, { measures: [{ source: first.key, summary: first.summary }], compare: null, chart: { type: 'bar' }, columns: 'none' }, colourOf, paper)
  }, [first?.key, period, cur.start, cur.end, mine.length, paper]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string, show: boolean) => {
    const now = shown.map((m) => m.key)
    const next = show ? [...now, key] : now.filter((k) => k !== key)
    void saveCardPicks(profileId, moduleKey, next.length ? next : null)
  }
  const pinToday = () => {
    if (!profile) return
    const before = settings.today_cards
    const after = onToday ? before.filter((c) => !(c.kind === 'module' && c.key === moduleKey)) : [...before, { kind: 'module' as const, key: moduleKey, size: 'small' as const, show: 'always' as const }]
    void saveSettings(profile, { today_cards: after })
    if (onToday) offerUndo('Card taken off Today', async () => { const p = useApp.getState().profile; if (p) await saveSettings(p, { today_cards: before }) })
  }

  return (
    <article className="st-card" style={{ '--st-accent': colourOf(moduleKey) } as CSSProperties} aria-label={name}>
      <header className="st-card-head">
        <span className="st-dot" aria-hidden />
        <h3>{name}</h3>
        {off && <span className="chip">switched off</span>}
        <MoreMenu label={`More for ${name}`} items={[
          { label: open ? 'Hide the other measures' : `Every measure (${all.length})`, onSelect: () => setOpen((o) => !o) },
          { label: onToday ? 'Take its card off Today' : 'Pin a card to Today', disabled: !onToday && settings.today_cards.length >= MAX_CARDS, onSelect: pinToday },
          ...(first ? [{ label: `Chart ${first.label.toLowerCase()}`, onSelect: () => onChart(first) }] : []),
          { label: 'Back to its main measures', disabled: !picked?.length, onSelect: () => void saveCardPicks(profileId, moduleKey, null) },
        ]} />
      </header>
      {!any ? <p className="st-empty">{emptyText(moduleKey, name)}</p> : (
        <>
          <dl className="st-figures">
            {figures.map((x) => <Figure key={x.key} x={x} period={period} />)}
          </dl>
          {chart && <XYChart data={chart} type="bar" labels={false} height={72} hint={false} summary={`${first!.label} for each ${period === 'year' ? 'month' : 'day'}`} />}
        </>
      )}
      <button type="button" className="st-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the other measures' : `Every measure ${name} keeps (${all.length})`}
      </button>
      {open && (
        <ul className="st-measures" aria-label={`Measures ${name} keeps`}>
          {all.map((m) => {
            const isShown = shown.some((s) => s.key === m.key)
            return (
              <li key={m.key}>
                <label className="st-check-row">
                  <input type="checkbox" checked={isShown} onChange={(e) => toggle(m.key, e.target.checked)} />
                  <span><span className="st-measure-name">{m.label}</span><span className="st-sub">{m.hint}</span></span>
                </label>
                <button type="button" className="btn st-chart-it" onClick={() => onChart(m)} aria-label={`Build a view of ${m.label}`}>Chart</button>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function emptyText(key: string, name: string): string {
  switch (key) {
    case 'tasks': return 'No tasks planned in this period. Plan one on Today or in Plan and it counts here.'
    case 'habits': return 'No habit ticks in this period. Add a habit on the Habits page and tick it off each day.'
    case 'supplements': return 'No supplements ticked in this period. Add them on the Supplements page and tick them off as you take them.'
    case 'nutrition': return 'Nothing eaten logged in this period. Tick a meal as eaten or add one on the Food page.'
    case 'health': return 'No weigh-ins in this period. Log your weight on the Health page.'
    case 'sleep': return 'No nights logged in this period. Add when you went to bed and woke on the Sleep page.'
    case 'training': return 'No sets logged in this period. Log a set on the Training page.'
    case 'agenda': return 'No events in this period. Add one on the Agenda page.'
    case 'household': return 'No chores done in this period.'
    case 'shopping': return 'Nothing ticked off the shopping list in this period.'
  }
  return `Nothing in ${name} for this period. Add a record on its page and it counts here.`
}

function Figure({ x, period }: { x: CardFigure; period: Period }) {
  const perDecimals = x.perDay != null && Math.abs(x.perDay) >= 100 ? 0 : 1
  let change: string | null = null
  if (x.delta != null) {
    const dec = x.deltaPer ? perDecimals : x.decimals
    const d = formatDelta(x.delta, dec)
    const unit = x.unit === '%' ? (d === '+1' || d === '−1' ? ' point' : ' points') : x.unit === 'time' ? '' : x.unit ? ` ${x.unit}` : ''
    const aDay = x.deltaPer && period !== 'day' ? ' a day' : ''
    change = d === 'no change' ? `same as ${beforeName(period)}` : x.unit === 'time'
      ? `${x.delta > 0 ? '+' : '−'}${Math.round(Math.abs(x.delta) * 60)} min vs ${beforeName(period)}`
      : `${d}${unit}${aDay} vs ${beforeName(period)}`
  }
  return (
    <div className="st-figure">
      <dt>{x.label}</dt>
      <dd>
        <span className="st-value">{formatValue(x.value, x.unit, x.decimals)}</span>
        {x.perDay != null && period !== 'day' && <span className="st-sub">{formatValue(x.perDay, x.unit, perDecimals)} {x.perLabel}</span>}
        {change && <span className="st-sub">{change}</span>}
      </dd>
    </div>
  )
}

/** Patterns across modules over the last 90 days (STA-30), only where
 *  there is enough to say, and always said as a pattern, not a cause. */
function Patterns({ profileId, today, showDisabled }: { profileId: string; today: string; showDisabled: boolean }) {
  const span = useMemo(() => ({ start: shiftAnchor('day', today, -89), end: today }), [today])
  const data = usePeriodFacts(profileId, span, today, showDisabled)
  const found = data ? patterns(data.catalogue, data.facts, span, today) : []
  if (!found.length) return null
  return (
    <section className="st-patterns" aria-label="Patterns">
      <h2 className="st-h">Patterns, last 90 days</h2>
      <div className="st-cards">
        {found.map((p) => {
          const d = p.result.difference!
          const unit = p.outcome.unit
          const dec = Math.max(1, p.outcome.decimals)
          const flag = p.flag.label.toLowerCase()
          return (
            <article key={`${p.flag.key}${p.outcome.key}`} className="st-card st-pattern">
              <p className="st-pattern-line">
                On days with {flag}, {p.outcome.label.toLowerCase()} was {unit === '%' ? `${formatValue(Math.abs(d), '', 0)} points` : formatValue(Math.abs(d), unit, dec)} {d > 0 ? 'higher' : 'lower'}.
              </p>
              <p className="st-sub">
                {formatValue(p.result.with.mean, unit, dec)} over {p.result.with.days} days with, {formatValue(p.result.without.mean, unit, dec)} over {p.result.without.days} days without.
                A pattern, not proof: other things may explain it.
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** /stats and /stats?view=<id> (the address a stats widget opens) lead to
 *  the Stats page, which lives at /m/stats like every module page. */
export function StatsAddress() {
  const { search } = useLocation()
  return <Navigate to={`/m/stats${search}`} replace />
}
