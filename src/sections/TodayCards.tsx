import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { readSettings, type TodayCard } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { useTodayCardData, useView } from '../lib/stats'
import { cardsFor, cardText, changeCard, moveCard } from '../lib/stats-builder-rules'
import { formatValue } from '../lib/chart-rules'
import { decimalsFor, unitFor } from '../lib/pivot-rules'
import type { StatsView as View } from '../lib/stats-view-rules'
import { MoreMenu } from '../ui/charts/MoreMenu'
import { offerUndo } from '../ui/Undo'
import { useBackClose } from '../ui/useBackClose'
import { CardsEditor, cardName } from '../settings/TodayCardsSettings'
import { ViewBody, useSeriesColour } from './StatsView'
import { useLiveQuery } from 'dexie-react-hooks'
import { allStudyRecords } from '../lib/learning'
import { reviewScheduleOn } from '../lib/learning-rules'
import { REVIEW_CARD_KEY, reviewCardText, reviewsDue } from '../lib/study-review-rules'
import { instanceFor } from '../modules/defs'
import './stats.css'

/** Cards the person pinned to Today (TOD-20, TOD-21): up to six, each a
 *  module's figure for the day ("Protein 82 / 140 g", "3 chores due",
 *  "Sleep 7.2 h") or a saved stats view, small or large, on the days the
 *  person chose, each with one glanceable figure and one main action. A card
 *  of a module that is off, or of a deleted view, does not show. */
export function TodayCards({ day }: { day: string }) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const all = settings.today_cards
  const modules = [...new Set(all.filter((c) => c.kind === 'module').map((c) => c.key.split(':')[0]))]
  const data = useTodayCardData(profile?.id, day, today, modules)
  const [arranging, setArranging] = useState(false)
  if (!profile || !all.length || !data) return null

  const views = settings.stats_views
  const alive = (c: TodayCard) => c.kind === 'stats'
    ? data.enabled.has('stats') && views.some((v) => v.id === c.key)
    : c.key === 'tasks' || data.enabled.has(c.key.split(':')[0])
  const shown = cardsFor(all, day, alive)
  if (!shown.length) return null
  const label = (k: string) => data.names.get(k) ?? k

  const save = (next: TodayCard[], undo?: string) => {
    const before = all
    void saveSettings(profile, { today_cards: next, stats_views: views.map((v) => ({ ...v, pinned: { ...v.pinned, today: next.some((c) => c.kind === 'stats' && c.key === v.id) } })) })
    if (undo) offerUndo(undo, async () => { const p = useApp.getState().profile; if (p) await saveSettings(p, { today_cards: before, stats_views: views }) })
  }
  const menu = (c: TodayCard, name: string) => {
    const i = all.indexOf(c)
    return [
      { label: c.size === 'large' ? 'Make it small' : 'Make it large', onSelect: () => save(changeCard(all, i, { size: c.size === 'large' ? 'small' : 'large' })) },
      { label: 'Move earlier', disabled: i === 0, onSelect: () => save(moveCard(all, i, -1), 'Card moved') },
      { label: 'Move later', disabled: i === all.length - 1, onSelect: () => save(moveCard(all, i, 1), 'Card moved') },
      { label: 'Show every day', disabled: c.show === 'always', onSelect: () => save(changeCard(all, i, { show: 'always' })) },
      { label: 'Show on weekdays only', disabled: c.show === 'weekdays', onSelect: () => save(changeCard(all, i, { show: 'weekdays' })) },
      { label: 'Show at weekends only', disabled: c.show === 'weekends', onSelect: () => save(changeCard(all, i, { show: 'weekends' })) },
      { label: 'Arrange all cards', onSelect: () => setArranging(true) },
      { label: 'Take off Today', danger: true, onSelect: () => save(all.filter((_, j) => j !== i), `"${name}" taken off Today`) },
    ]
  }

  return (
    <section className="tc" aria-label="Pinned cards">
      <div className="tc-grid">
        {shown.map((c) => {
          const name = cardName(c, label, (id) => views.find((v) => v.id === id)?.name ?? null)
          if (c.kind === 'module' && c.key === REVIEW_CARD_KEY) {
            return <ReviewsTodayCard key={`m${c.key}`} card={c} profileId={profile.id} day={day} menu={menu(c, name)} />
          }
          return c.kind === 'stats'
            ? <ViewTodayCard key={`s${c.key}`} card={c} view={views.find((v) => v.id === c.key)!} profileId={profile.id} today={today} menu={menu(c, name)} />
            : <ModuleTodayCard key={`m${c.key}`} card={c} name={name} day={day} today={today} data={data} menu={menu(c, name)} />
        })}
      </div>
      {arranging && <ArrangeSheet onClose={() => setArranging(false)} />}
    </section>
  )
}

/** "Arrange all cards": the cards editor in a sheet; Back and Escape close it (CALM-10). */
function ArrangeSheet({ onClose }: { onClose: () => void }) {
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Cards on Today">
        <h2>Cards on Today</h2>
        <CardsEditor onDone={onClose} />
      </div>
    </>
  )
}

/** The one thing each module's card does (TOD-21). Adding is the round
 *  +'s alone (CALM-01): the food card opens the day's food instead. */
function actionFor(key: string, name: string): { label: string; to: string } {
  switch (key) {
    case 'nutrition': return { label: 'Open food', to: '/food' }
    case 'tasks': return { label: 'Open Plan', to: '/plan' }
    case 'health': return { label: 'Log weight', to: '/m/health' }
    case 'sleep': return { label: 'Log sleep', to: '/m/sleep' }
    case 'training': return { label: 'Log a set', to: '/m/training' }
    case 'habits': return { label: 'Open habits', to: '/m/habits' }
    case 'supplements': return { label: 'Open supplements', to: '/m/supplements' }
    case 'household': return { label: 'Open chores', to: '/m/household' }
    case 'shopping': return { label: 'Open the list', to: '/shop' }
    case 'agenda': return { label: 'Open agenda', to: '/m/agenda' }
  }
  return { label: `Open ${name}`, to: `/m/${key}` }
}

function ModuleTodayCard({ card, name, day, today, data, menu }: {
  card: TodayCard; name: string; day: string; today: string; data: NonNullable<ReturnType<typeof useTodayCardData>>
  menu: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }[]
}) {
  const navigate = useNavigate()
  const colourOf = useSeriesColour()
  const [mod, ...rest] = card.key.split(':')
  const t = cardText({
    moduleKey: mod, measureKey: rest.length ? card.key : null, name: data.names.get(mod) ?? name, day, today,
    facts: data.facts, catalogue: data.catalogue, items: data.items, listCount: data.listCount, weight: data.weight, nutrient: data.nutrient,
  })
  const action = actionFor(mod, data.names.get(mod) ?? name)
  return (
    <article className={`tc-card is-${card.size}`} style={{ '--st-accent': colourOf(mod) } as CSSProperties} aria-label={t.label}>
      <header className="tc-head">
        <span className="st-dot" aria-hidden />
        <span className="tc-label">{t.label}</span>
        <MoreMenu label={`More for the ${t.label} card`} items={menu} />
      </header>
      <p className="tc-figure">{t.headline}</p>
      {t.progress != null && (
        <div className="tc-meter" role="meter" aria-label={t.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.progress * 100)}>
          <span style={{ width: `${Math.round(t.progress * 100)}%` }} />
        </div>
      )}
      {t.sub && <p className="tc-sub">{t.sub}</p>}
      <button type="button" className="tc-action" onClick={() => navigate(action.to)}>{action.label}</button>
    </article>
  )
}

function ViewTodayCard({ card, view, profileId, today, menu }: {
  card: TodayCard; view: View; profileId: string; today: string
  menu: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }[]
}) {
  const navigate = useNavigate()
  const outcome = useView(profileId, view, today)
  const colourOf = useSeriesColour()
  const v0 = outcome?.result.values[0]
  return (
    <article className={`tc-card is-${card.size}`} style={{ '--st-accent': v0 ? colourOf(v0.info.module) : 'var(--e-accent)' } as CSSProperties} aria-label={view.name}>
      <header className="tc-head">
        <span className="st-dot" aria-hidden />
        <span className="tc-label">{view.name}</span>
        <MoreMenu label={`More for the ${view.name} card`} items={menu} />
      </header>
      {!outcome ? <p className="tc-sub">Working it out…</p> : card.size === 'small' || !v0 ? (
        <>
          <p className="tc-figure">{v0 ? formatValue(outcome.result.grand[0], unitFor(v0.info, v0.spec.summary), decimalsFor(v0.info, v0.spec.summary)) : '–'}</p>
          {v0 && <p className="tc-sub">{v0.spec.label ?? v0.info.label}</p>}
        </>
      ) : <ViewBody view={view} outcome={outcome} compact />}
      <button type="button" className="tc-action" onClick={() => navigate(`/m/stats?view=${encodeURIComponent(view.id)}`)}>Open</button>
    </article>
  )
}

/** "3 reviews due" (LRN-05): Learning's review schedule on Today, as one of
 *  the pinned cards rather than a surface of its own (CALM-02). It is put
 *  here when the schedule is switched on, and draws nothing while it is off. */
function ReviewsTodayCard({ card, profileId, day, menu }: {
  card: TodayCard; profileId: string; day: string
  menu: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }[]
}) {
  const navigate = useNavigate()
  const colourOf = useSeriesColour()
  const due = useLiveQuery(async () => {
    const inst = await instanceFor(profileId, 'learning')
    return reviewScheduleOn(inst?.settings) ? reviewsDue(await allStudyRecords(profileId), day) : null
  }, [profileId, day])
  if (!due) return null
  const t = reviewCardText(due)
  return (
    <article className={`tc-card is-${card.size}`} style={{ '--st-accent': colourOf('learning') } as CSSProperties} aria-label={t.label}>
      <header className="tc-head">
        <span className="st-dot" aria-hidden />
        <span className="tc-label">{t.label}</span>
        <MoreMenu label={`More for the ${t.label} card`} items={menu} />
      </header>
      <p className="tc-figure">{t.headline}</p>
      {t.sub && <p className="tc-sub">{t.sub}</p>}
      <button type="button" className="tc-action" onClick={() => navigate('/m/learning')}>Open Learning</button>
    </article>
  )
}
