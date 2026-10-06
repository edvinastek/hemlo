import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './plan-menu.css'

export interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Drawn in the warning colour: Delete. */
  danger?: boolean
}

/** A ⋮ button and its menu: the visible way to every action a gesture
 *  also reaches (P9, GEN-52). The menu opens upwards when there is no room
 *  below, takes the arrow keys, and closes on Escape, a choice, or a tap
 *  anywhere else. */
export function MoreMenu({ label, items, className, children }: {
  /** Read out for the button: "More for Monday 5 October". */
  label: string
  items: (MenuItem | null | false)[]
  className?: string
  /** Something to say under the choices ("Or hold a task to move it."). */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const list = items.filter((x): x is MenuItem => !!x)
  return (
    <span className={`pm-wrap${className ? ` ${className}` : ''}`}>
      <button ref={btn} type="button" className="pm-button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>⋮</button>
      {open && (
        <Menu items={list} onClose={() => { setOpen(false); btn.current?.focus() }} anchor={btn}>{children}</Menu>
      )}
    </span>
  )
}

function Menu({ items, onClose, anchor, children }: {
  items: MenuItem[]; onClose: () => void; anchor: React.RefObject<HTMLButtonElement>; children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  // It hangs from the button's right edge, or from its left edge when that
  // would run off the left of the screen (a ⋮ in the week's first column).
  const [left, setLeft] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Upwards only when it fits there: inside a sheet (which clips what
    // sticks out of it) a menu too tall for the room above stays below,
    // where the sheet scrolls to it (a short recipe's ⋮, v22).
    const sheet = el.closest('.bottom-sheet')
    const ceiling = sheet ? sheet.getBoundingClientRect().top : 0
    const anchorTop = anchor.current?.getBoundingClientRect().top ?? r.top
    setAbove(r.bottom > window.innerHeight - 96 && anchorTop - r.height - 2 >= ceiling)
    setLeft(r.left < 8)
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (box.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const els = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!els.length) return
      e.preventDefault()
      const at = els.indexOf(document.activeElement as HTMLButtonElement)
      els[(at + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length].focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [onClose, anchor])

  return (
    <div ref={box} className={`pm-menu${above ? ' is-above' : ''}${left ? ' is-left' : ''}`} role="menu" data-no-swipe
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'is-danger' : undefined}
          onClick={() => { onClose(); it.onSelect() }}>{it.label}</button>
      ))}
      {children && <p className="pm-hint">{children}</p>}
    </div>
  )
}
