import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { EntityDef, FieldDef, ModuleDef, ViewDef } from '../types'
import { BOARD_CARD_FIELDS, boardField, computeFormulas, mainField } from '../def-rules'
import { boardColumns, moveTargets } from '../view-rules'
import { updateRecord, type Lookups, type Rec } from '../records'
import { formatValue } from '../RecordSheet'
import { recordTitle } from '../views'
import { useLongPress, type PressPoint } from '../../ui/useLongPress'
import '../../ui/move.css'
import './views.css'

/** Columns by a choice field, a card per record. A card moves to another
 *  column by holding it and dragging it there, or from its "Move" menu,
 *  which works with a keyboard and a screen reader too. Either way the
 *  record is changed through the same path as the form. */

interface Drag { id: string; ghost: HTMLElement; dx: number; dy: number; x: number; y: number; over: string | null; frame: number }

/** The fields a card shows besides its name: the ones the view picked, or
 *  else the first ones filled in. */
function cardFields(entity: EntityDef, view: ViewDef, group: FieldDef): FieldDef[] {
  const title = mainField(entity.fields)
  const byName = new Map(entity.fields.map((f) => [f.name, f]))
  const picked = (view.columns ?? []).map((c) => byName.get(c)).filter((f): f is FieldDef => !!f && !f.hidden && f !== group)
  if (picked.length) return picked.slice(0, BOARD_CARD_FIELDS)
  return entity.fields.filter((f) => !f.hidden && f !== title && f !== group)
}

export function BoardView({ def, entity, view, recs, lookups, profileId, onOpen }: {
  def: ModuleDef; entity: EntityDef; view: ViewDef; recs: Rec[]; lookups: Lookups; profileId: string; onOpen: (r: Rec) => void
}) {
  const field = boardField(entity, view)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [said, say] = useState('')
  const [error, setError] = useState<string | null>(null)
  const byId = new Map(recs.map((r) => [r.id, r]))

  async function move(rec: Rec, value: string | null, label: string) {
    if (!field) return
    setError(null)
    const res = await updateRecord(profileId, def, entity, rec, { [field.name]: value })
    if (res.ok) say(`${recordTitle(entity, rec, lookups)} moved to ${label}.`)
    else setError(Object.values(res.errors)[0] ?? 'Could not move it.')
  }

  /** The column under a point, by its data-col; null when none. */
  function columnAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-col]')
    return el && scroller.current?.contains(el) ? el.dataset.col ?? null : null
  }

  function stopDrag() {
    const d = drag.current
    if (d) { cancelAnimationFrame(d.frame); d.ghost.remove() }
    drag.current = null
    setLifted(null)
    setOver(null)
  }

  /** Near the left or right edge the board scrolls by itself, so a card can
   *  reach a column that is off the screen. */
  function tick() {
    const d = drag.current
    const s = scroller.current
    if (!d || !s) return
    const r = s.getBoundingClientRect()
    const edge = 40
    const push = d.x < r.left + edge ? -(r.left + edge - d.x) : d.x > r.right - edge ? d.x - (r.right - edge) : 0
    if (push) s.scrollLeft += Math.max(-14, Math.min(14, push / 3))
    const col = columnAt(d.x, d.y)
    if (col !== d.over) { d.over = col; setOver(col) }
    d.frame = requestAnimationFrame(tick)
  }

  const hold = useLongPress<string>({
    onStart: (id, at: PressPoint, el) => {
      const rect = el.getBoundingClientRect()
      const ghost = el.cloneNode(true) as HTMLElement
      ghost.classList.add('bd-ghost')
      ghost.removeAttribute('data-col')
      ghost.setAttribute('aria-hidden', 'true')
      Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` })
      document.body.appendChild(ghost)
      drag.current = { id, ghost, dx: at.x - rect.left, dy: at.y - rect.top, x: at.x, y: at.y, over: null, frame: 0 }
      setLifted(id)
      setMenu(null)
      drag.current.frame = requestAnimationFrame(tick)
    },
    onMove: (_id, at) => {
      const d = drag.current
      if (!d) return
      d.x = at.x
      d.y = at.y
      d.ghost.style.left = `${at.x - d.dx}px`
      d.ghost.style.top = `${at.y - d.dy}px`
    },
    onDrop: (id, at) => {
      const col = columnAt(at.x, at.y)
      stopDrag()
      const rec = byId.get(id)
      if (!rec || !field || col === null) return
      const now = rec.values[field.name]
      const current = typeof now === 'string' && (field.options ?? []).includes(now) ? now : ''
      if (col === current) return
      if (col === '' && field.required) { setError(`${field.label} is needed, so a card cannot go without one.`); return }
      void move(rec, col || null, col || `no ${field.label.toLowerCase()}`)
    },
    onCancel: stopDrag,
  })

  // A drag cut short by the view going away leaves no ghost behind.
  useEffect(() => () => { const d = drag.current; if (d) { cancelAnimationFrame(d.frame); d.ghost.remove() } }, [])

  if (!field) return <p className="empty">This board needs a choice field for its columns. Add one under Edit module.</p>

  const cols = boardColumns(field, recs, field.name)
  const shown = cardFields(entity, view, field)

  return (
    <>
      {error && <p className="mp-note is-warn" role="alert">{error}</p>}
      <p className="mp-note bd-hint">Hold a card and drag it to another column, or use its Move button.</p>
      <div className={`bd${lifted ? ' is-dragging' : ''}`} ref={scroller} role="group" aria-label={`${view.name}: ${field.label} columns`}>
        {cols.map((c) => (
          <section key={c.key || '_none'} className={`bd-col${over === c.key && lifted ? ' is-over' : ''}`} data-col={c.key}
            aria-label={`${c.label}, ${c.ids.length} ${c.ids.length === 1 ? 'card' : 'cards'}`}>
            <h3 className="bd-col-head"><span>{c.label}</span><span className="bd-count">{c.ids.length}</span></h3>
            <ul className="bd-cards">
              {c.ids.map((id) => {
                const rec = byId.get(id)
                if (!rec) return null
                const calc = computeFormulas(entity.fields, rec.values)
                const title = recordTitle(entity, rec, lookups)
                const bits = shown.map((f) => {
                  const v = f.type === 'formula' ? calc[f.name] : rec.values[f.name]
                  if (v === null || v === undefined || v === '' || (f.type === 'boolean' && !v)) return null
                  return f.type === 'boolean' ? f.label : `${f.label} ${formatValue(f, v, lookups)}`
                }).filter(Boolean).slice(0, BOARD_CARD_FIELDS)
                const open = menu === id
                return (
                  <li key={id} className={`bd-card${lifted === id ? ' is-lifted' : ''}`} {...hold.bind(id)}>
                    <button type="button" className="bd-card-open" onClick={() => onOpen(rec)}>
                      <span className="bd-card-title">{title}</span>
                      {bits.length > 0 && <span className="bd-card-meta">{bits.join(' · ')}</span>}
                    </button>
                    <button type="button" className="bd-move" aria-haspopup="menu" aria-expanded={open}
                      aria-label={`Move ${title}`} onClick={() => setMenu(open ? null : id)}>Move</button>
                    {open && (
                      <MoveToMenu targets={moveTargets(field, rec.values[field.name])}
                        onPick={(t) => { setMenu(null); void move(rec, t.value, t.label) }}
                        onClose={() => setMenu(null)} />
                    )}
                  </li>
                )
              })}
            </ul>
            {c.ids.length === 0 && <p className="bd-empty">Nothing here</p>}
          </section>
        ))}
      </div>
      <p className="move-live" aria-live="polite">{said}</p>
    </>
  )
}

/** "Move to…": every other column. Arrow keys go up and down, Escape closes. */
function MoveToMenu({ targets, onPick, onClose }: {
  targets: { value: string | null; label: string }[]; onPick: (t: { value: string | null; label: string }) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // Placed on the screen itself, next to its button: inside the board's
  // sideways scroller it would be cut off at the scroller's edges.
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const el = box.current
    const anchor = document.querySelector('.bd-move[aria-expanded="true"]')
    if (!el) return
    const a = anchor?.getBoundingClientRect() ?? el.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const room = { below: window.innerHeight - a.bottom - 8, above: a.top - 8 }
    const below = room.below >= Math.min(h, 200) || room.below >= room.above
    const maxHeight = Math.max(120, below ? room.below : room.above)
    setPlace({
      position: 'fixed',
      left: Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8)),
      top: below ? a.bottom + 4 : Math.max(8, a.top - 4 - Math.min(h, maxHeight)),
      right: 'auto', bottom: 'auto', maxHeight, overflowY: 'auto',
    })
    el.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (box.current?.contains(t) || t?.closest?.('.bd-move[aria-expanded="true"]')) return
      onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      if (items.length === 0) return
      e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [onClose])

  return (
    <div ref={box} className="move-menu bd-menu" style={place} role="menu" aria-label="Move to" data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}>
      <p className="move-menu-hint bd-menu-head">Move to…</p>
      {targets.map((t) => (
        <button key={t.value ?? '_none'} type="button" role="menuitem" onClick={() => onPick(t)}>{t.label}</button>
      ))}
      {targets.length === 0 && <p className="move-menu-hint">There is no other column.</p>}
    </div>
  )
}
