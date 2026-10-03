import { useRef, useState, type PointerEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { readSettings, type TodayCard } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { useModuleColours } from '../lib/colours'
import { enabledModules } from '../lib/day'
import { addCard, changeCard, MAX_CARDS, moveCard, NUTRIENT_NAMES } from '../lib/stats-builder-rules'
import { offerUndo } from '../ui/Undo'
import { Dropdown } from '../ui/Dropdown'
import '../sections/stats.css'

/** Today's pinned cards (TOD-20), set up in one list: add a module's
 *  summary or a saved stats view (at most six), drag or use ↑ ↓ to put them
 *  in order, make each small or large, and show it every day, on weekdays
 *  or at weekends. Removing a card is for good, with Undo for 8 seconds. */
export function TodayCardsSettings() {
  return (
    <>
      <p className="section-title">Cards on Today</p>
      <CardsEditor />
    </>
  )
}

const SHOW = [{ value: 'always', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekends', label: 'Weekends' }]
const SIZE = [{ value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }]
/** Modules whose cards make sense on Today; Stats itself is the views. */
const NO_CARD = new Set(['stats', 'custom', 'core'])

export function cardName(c: TodayCard, label: (k: string) => string, viewName: (id: string) => string | null): string {
  if (c.kind === 'stats') return viewName(c.key) ?? 'A deleted view'
  const [mod, ...rest] = c.key.split(':')
  if (mod === 'nutrition' && rest.length) return `${NUTRIENT_NAMES[rest.join(':')]?.label ?? 'Food'} today`
  return c.key === 'tasks' ? 'Tasks' : label(mod)
}

export function CardsEditor({ onDone }: { onDone?: () => void }) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const colours = useModuleColours()
  const built = colours.built
  const enabled = useLiveQuery(async (): Promise<string[]> => (profile ? enabledModules(profile.id, built) : []), [profile?.id, built], [] as string[])
  const cards = settings.today_cards
  const views = settings.stats_views
  const viewName = (id: string) => views.find((v) => v.id === id)?.name ?? null
  const [adding, setAdding] = useState('')
  const [drag, setDrag] = useState<{ from: number; to: number; y0: number } | null>(null)
  const holdTimer = useRef<number | null>(null)
  const list = useRef<HTMLOListElement>(null)
  if (!profile) return null

  const save = (next: TodayCard[], undo?: string) => {
    const before = cards
    void saveSettings(profile, { today_cards: next, stats_views: views.map((v) => ({ ...v, pinned: { ...v.pinned, today: next.some((c) => c.kind === 'stats' && c.key === v.id) } })) })
    if (undo) offerUndo(undo, async () => { const p = useApp.getState().profile; if (p) await saveSettings(p, { today_cards: before, stats_views: views }) })
  }

  const offers = [
    { value: 'module:tasks', label: 'Tasks: done of planned' },
    ...enabled.filter((k) => !NO_CARD.has(k)).flatMap((k) => k === 'nutrition'
      ? settings.nutrients.map((n) => ({ value: `module:nutrition:${n}`, label: `${NUTRIENT_NAMES[n]?.label ?? n} eaten today` }))
      : [{ value: `module:${k}`, label: colours.label(k) }]),
    ...(enabled.includes('stats') ? views.map((v) => ({ value: `stats:${v.id}`, label: `View: ${v.name}` })) : []),
  ].filter((o) => !cards.some((c) => `${c.kind}:${c.key}` === o.value))

  // A short hold then a move drags a card; ↑ and ↓ do the same without one.
  const rows = () => [...(list.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])]
  const startHold = (e: PointerEvent, i: number) => {
    if ((e.target as HTMLElement).closest('button, .dd')) return
    const y0 = e.clientY
    holdTimer.current = window.setTimeout(() => {
      setDrag({ from: i, to: i, y0 })
      navigator.vibrate?.(10)
    }, settings.hold.drag_ms)
  }
  const cancelHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null } }
  const moveDrag = (e: PointerEvent) => {
    if (!drag) { if (holdTimer.current && Math.abs(e.movementY) > 6) cancelHold(); return }
    e.preventDefault()
    const mids = rows().map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 })
    let to = mids.findIndex((m) => e.clientY < m)
    if (to < 0) to = mids.length - 1
    setDrag({ ...drag, to })
  }
  const endDrag = () => {
    cancelHold()
    if (!drag) return
    if (drag.to !== drag.from) {
      const next = [...cards]
      const [c] = next.splice(drag.from, 1)
      next.splice(drag.to, 0, c)
      save(next, 'Card moved')
    }
    setDrag(null)
  }

  return (
    <div className="tc-edit">
      {cards.length === 0 && <p className="sb-hint">No cards yet. Add up to six: a module's figure for the day, or any stats view you saved.</p>}
      <ol className="tc-edit-list" ref={list} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} style={drag ? { touchAction: 'none' } : undefined}>
        {cards.map((c, i) => {
          const name = cardName(c, colours.label, viewName)
          const off = c.kind === 'module' ? c.key !== 'tasks' && !enabled.includes(c.key.split(':')[0]) : !viewName(c.key) || !enabled.includes('stats')
          return (
            <li key={`${c.kind}${c.key}`} className={`tc-edit-row${drag?.from === i ? ' is-lifted' : ''}${drag && drag.to === i && drag.from !== i ? ' is-target' : ''}`}
              onPointerDown={(e) => startHold(e, i)} onPointerLeave={() => { if (!drag) cancelHold() }}>
              <div className="tc-edit-head">
                <span className="tc-grip" aria-hidden>⠿</span>
                <span className="tc-edit-name">{name}{off && <span className="st-sub">Hidden: {c.kind === 'stats' ? 'the view or Stats is gone or off' : 'its module is off'}</span>}</span>
                <button type="button" className="btn sb-small" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => save(moveCard(cards, i, -1), 'Card moved')}>↑</button>
                <button type="button" className="btn sb-small" aria-label={`Move ${name} down`} disabled={i === cards.length - 1} onClick={() => save(moveCard(cards, i, 1), 'Card moved')}>↓</button>
                <button type="button" className="btn sb-small" aria-label={`Remove ${name}`} onClick={() => save(cards.filter((_, j) => j !== i), `"${name}" taken off Today`)}>✕</button>
              </div>
              <div className="sb-row">
                <Dropdown label={`Size of ${name}`} value={c.size} options={SIZE} onChange={(v) => save(changeCard(cards, i, { size: v as 'small' }))} />
                <Dropdown label={`When ${name} shows`} value={c.show} options={SHOW} onChange={(v) => save(changeCard(cards, i, { show: v as 'always' }))} />
              </div>
            </li>
          )
        })}
      </ol>
      {cards.length < MAX_CARDS ? (
        offers.length > 0 && (
          <div className="sb-row">
            <Dropdown className="tc-add" label="Add a card" placeholder="Add a card…" value={adding || null} options={offers}
              onChange={(v) => {
                setAdding('')
                const [kind, ...key] = v.split(':')
                save(addCard(cards, { kind: kind as 'module', key: key.join(':'), size: kind === 'stats' ? 'large' : 'small', show: 'always' }))
              }} />
          </div>
        )
      ) : <p className="sb-hint">Today has six cards, the most it takes. Remove one to add another.</p>}
      {onDone && <div className="sheet-actions"><button type="button" className="btn btn-primary grow" onClick={onDone}>Done</button></div>}
    </div>
  )
}
