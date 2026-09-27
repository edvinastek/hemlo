import { useState, type CSSProperties } from 'react'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { useModuleColours } from '../lib/colours'
import { useStats } from '../lib/stats'
import {
  PERIODS, PERIOD_LABEL, beforeName, canShift, clampAnchor, formatDelta, formatNumber, isCurrent, shiftAnchor,
  type Bucket, type Metric, type ModuleStats, type Period,
} from '../lib/stats-rules'
import './stats.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The Stats page: a period (day, week, month, year), arrows to move it, and
 *  a card per module with its figures, the average a day, the change on the
 *  period before and a small bar chart. */
export function Stats({ profileId, day }: { profileId: string; day: string }) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(() => clampAnchor(day, today))
  const showDisabled = settings.stats.show_disabled
  const stats = useStats(profileId, period, anchor, today, { showDisabled, nutrients: settings.nutrients })
  const colours = useModuleColours()

  const step = (dir: 1 | -1) => { if (canShift(period, anchor, dir, today)) setAnchor(shiftAnchor(period, anchor, dir)) }
  const current = isCurrent(period, anchor, today)

  return (
    <section className="st" aria-label="Stats">
      <div className="tabs st-periods" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === period} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
        ))}
      </div>

      <div className="st-nav">
        <button type="button" className="btn" aria-label={`Previous ${period}`} disabled={!canShift(period, anchor, -1, today)} onClick={() => step(-1)}>‹</button>
        <h2 aria-live="polite">{stats?.title ?? ''}</h2>
        {!current && <button type="button" className="btn" onClick={() => setAnchor(today)}>Today</button>}
        <button type="button" className="btn" aria-label={`Next ${period}`} disabled={!canShift(period, anchor, 1, today)} onClick={() => step(1)}>›</button>
      </div>

      <label className="st-check">
        <input type="checkbox" checked={showDisabled} disabled={!profile || profile.id !== profileId}
          onChange={(e) => profile && void saveSettings(profile, { stats: { show_disabled: e.target.checked } })} />
        <span>Show switched-off modules</span>
      </label>

      {stats === undefined ? null : (
        <>
          {anchor > today && !current && (
            <p className="st-note">This {period} has not started yet. Only what is planned for it counts so far.</p>
          )}
          <div className="st-cards">
            {/* Tasks belong to no module, so their card is drawn in the quiet ink. */}
            {stats.modules.map((m) => (
              <Card key={m.key} m={m} period={period}
                colour={m.key === 'tasks' ? 'var(--e-ink-soft)' : colours.of(m.key)} />
            ))}
          </div>
          {stats.hiddenOff > 0 && (
            <p className="st-note">
              {stats.hiddenOff === 1 ? 'One switched-off module is' : `${stats.hiddenOff} switched-off modules are`} left out.
              Tick "Show switched-off modules" to see {stats.hiddenOff === 1 ? 'it' : 'them'}.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Card({ m, period, colour }: { m: ModuleStats; period: Period; colour: string }) {
  return (
    <article className="st-card" style={{ '--st-accent': colour } as CSSProperties} aria-label={m.label}>
      <header className="st-card-head">
        <span className="st-dot" aria-hidden />
        <h3>{m.label}</h3>
        {m.off && <span className="chip">switched off</span>}
      </header>
      {m.empty ? <p className="st-empty">{m.empty}</p> : (
        <>
          <dl className="st-figures">
            {m.metrics.map((x) => <Figure key={x.key} x={x} period={period} />)}
          </dl>
          {m.chart && period !== 'day' && <Chart chart={m.chart} period={period} />}
        </>
      )}
    </article>
  )
}

const withUnit = (v: number, unit: string, decimals: number) =>
  unit === '%' ? `${formatNumber(v, decimals)}%` : unit ? `${formatNumber(v, decimals)} ${unit}` : formatNumber(v, decimals)

function Figure({ x, period }: { x: Metric; period: Period }) {
  // An average a day of a big figure (2,216 kcal) needs no decimals; a small one (1.7 tasks) does.
  const perDecimals = x.perDay != null && Math.abs(x.perDay) >= 100 ? 0 : Math.max(1, x.decimals)
  let change: string | null = null
  if (x.delta != null) {
    const d = formatDelta(x.delta, x.perDay != null ? perDecimals : x.decimals)
    const unit = x.unit === '%' ? (d === '+1' || d === '−1' ? ' point' : ' points') : x.unit ? ` ${x.unit}` : ''
    // On the Day tab the day's total is its average a day, so "a day" says nothing.
    const aDay = x.perDay != null && period !== 'day' ? ' a day' : ''
    change = d === 'no change'
      ? (x.deltaWithin ? `no change over the ${period}` : `same as ${beforeName(period)}`)
      : x.deltaWithin ? `${d}${unit} over the ${period}`
      : `${d}${unit}${aDay} vs ${beforeName(period)}`
  }
  return (
    <div className="st-figure">
      <dt>{x.label}</dt>
      <dd>
        <span className="st-value">{x.value == null ? '–' : withUnit(x.value, x.unit, x.decimals)}</span>
        {x.perDay != null && period !== 'day' && (
          <span className="st-sub">{withUnit(x.perDay, x.unit, perDecimals)} {x.perLabel ?? 'a day'}</span>
        )}
        {change && <span className="st-sub">{change}</span>}
      </dd>
    </div>
  )
}

/** Where a bar's readout says it is: "Wed 23 Sep", "September". */
function bucketName(b: Bucket, period: Period): string {
  if (period === 'year') return MONTHS[Number(b.key.slice(5, 7)) - 1]
  const d = new Date(`${b.key}T12:00`)
  return format(d, 'EEE d MMM')
}

/** One series as columns from a shared baseline, in the module's colour.
 *  Tapping (or pointing at) a column reads its value out under the chart;
 *  the columns are buttons, so the values are there for a screen reader too. */
function Chart({ chart, period }: { chart: NonNullable<ModuleStats['chart']>; period: Period }) {
  const [picked, setPicked] = useState<string | null>(null)
  // Heights from zero; a value below zero (money out, say) is drawn as tall
  // as its size, hollow, so it never reads as the same thing as one above.
  const span = Math.max(0, ...chart.buckets.map((b) => Math.abs(b.value ?? 0))) || 1
  const shown = chart.buckets.find((b) => b.key === picked)
  const fmt = (v: number | null) => (v == null ? 'nothing logged' : withUnit(v, chart.unit, chart.decimals))
  // A month's 28 to 31 dates cannot all fit under their bars at 360 px.
  const labelled = (i: number) => period !== 'month' || i % 7 === 0
  const best = chart.buckets.reduce<Bucket | null>((a, b) => (b.value != null && (!a || (b.value > (a.value ?? -Infinity))) ? b : a), null)

  return (
    <figure className="st-chart">
      <figcaption className="st-chart-cap">
        <span>{chart.label}</span>
        <span className="st-readout" aria-live="polite">
          {shown ? `${bucketName(shown, period)}: ${shown.future && shown.value == null ? 'still to come' : fmt(shown.value)}`
            : best && best.value ? `Highest: ${fmt(best.value)}, ${bucketName(best, period)}` : ''}
        </span>
      </figcaption>
      <div className={`st-bars n-${chart.buckets.length > 12 ? 'many' : 'few'}`}
        style={{ gridTemplateColumns: `repeat(${chart.buckets.length}, minmax(0, 1fr))` }}>
        {chart.buckets.map((b) => {
          const v = b.value ?? 0
          const h = Math.abs(v) / span * 100
          return (
            <button key={b.key} type="button" className={`st-col${b.future ? ' is-future' : ''}${v < 0 ? ' is-neg' : ''}${picked === b.key ? ' is-picked' : ''}`}
              aria-label={`${bucketName(b, period)}: ${b.future && b.value == null ? 'still to come' : fmt(b.value)}`}
              aria-pressed={picked === b.key}
              onClick={() => setPicked((p) => (p === b.key ? null : b.key))}
              onMouseEnter={() => setPicked(b.key)} onMouseLeave={() => setPicked(null)}>
              {b.value != null && v !== 0 && <span className="st-bar" style={{ height: `${Math.max(h, 2)}%` }} />}
            </button>
          )
        })}
      </div>
      <div className="st-labels" aria-hidden style={{ gridTemplateColumns: `repeat(${chart.buckets.length}, minmax(0, 1fr))` }}>
        {chart.buckets.map((b, i) => <span key={b.key}>{labelled(i) ? (period === 'week' ? b.label.slice(0, 2) : b.label) : ''}</span>)}
      </div>
    </figure>
  )
}
