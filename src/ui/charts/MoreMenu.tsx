import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './charts.css'

export interface MenuItem { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }

/** A ⋮ button and its short menu: every action a gesture or a hidden place
 *  could offer is listed here too, as plain buttons. It opens upward near
 *  the bottom of the screen, and closes on a tap outside or Escape. */
export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  useLayoutEffect(() => {
    if (!open || !wrap.current) return
    const r = wrap.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom)
    wrap.current.querySelector<HTMLButtonElement>('.mm-list button:not(:disabled)')?.focus()
  }, [open])
  return (
    <div className="mm" ref={wrap}>
      <button type="button" className="mm-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)}>⋮</button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={`mm-list${up ? ' is-up' : ''}`}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'is-danger' : undefined}
              onClick={() => { setOpen(false); it.onSelect() }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
