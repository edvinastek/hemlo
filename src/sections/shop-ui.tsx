import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from '../lib/db'
import { PageMenu } from '../ui/PageMenu'
import { useBackClose } from '../ui/useBackClose'
import type { MenuItem as PageMenuItem } from '../ui/MoreMenu'
import './shop.css'

/** Small pieces the Shop page's tabs share: a choice remembered on this
 *  device, the ⋮ menu and a bottom sheet. */

/** A choice remembered on this device only (the shop filter, which aisles
 *  are folded): a convenience, not something to sync. */
export function useDeviceChoice<T>(key: string, fallback: T): [T, (v: T) => void] {
  const stored = useLiveQuery(() => getMeta<T>(key, fallback), [key])
  const [local, setLocal] = useState<T | undefined>(undefined)
  const value = local !== undefined ? local : stored !== undefined ? stored : fallback
  return [value, (v: T) => { setLocal(v); void setMeta(key, v) }]
}

/** The open tab's items in the page's one ⋮, by the title (CALM-03). */
export function TabMenu({ slot, items }: { slot: HTMLElement | null; items: (PageMenuItem | null | false)[] }) {
  return slot ? createPortal(<PageMenu label="More for Shopping" items={items} />, slot) : null
}

/** A barcode, drawn: the scan button inside an add field. */
export function ScanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" />
      <path d="M7 8v8M10 8v8M13 8v8M15.5 8v8M18 8v8" />
    </svg>
  )
}

export interface MenuItem { label: string; onSelect: () => void; disabled?: boolean; warn?: boolean }

/** A ⋮ button and its menu: every action a row has, reachable by tap and
 *  keyboard. It opens upwards near the bottom of the screen. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [above, setAbove] = useState(false)
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !box.current) return
    setAbove(box.current.getBoundingClientRect().bottom > window.innerHeight - 96)
    box.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || button.current?.contains(t)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!list.length) return
      e.preventDefault()
      const at = list.indexOf(document.activeElement as HTMLButtonElement)
      list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <div className="shop-more-wrap">
      <button ref={button} type="button" className="shop-more" aria-label={label} aria-haspopup="menu"
        aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>⋮</button>
      {open && (
        <div ref={box} id={id} className={`shop-menu${above ? ' is-above' : ''}`} role="menu" data-no-swipe>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} className={it.warn ? 'is-warn' : undefined}
              onClick={() => { setOpen(false); it.onSelect() }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A bottom sheet with a title and a Close button. Back (the phone's, the
 *  browser's), Escape and the scrim close it (CALM-10): Back takes away the
 *  history step the sheet added, so it never leaves the Shop page. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useBackClose(onClose)
  useEffect(() => {
    // The first field (or button) gets the focus, so a keyboard user is in
    // the sheet. Once, when it opens: not again on every change inside it.
    box.current?.querySelector<HTMLElement>('[data-autofocus], input, button.btn-primary')?.focus()
  }, [])
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={box} className={`bottom-sheet shop-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} data-no-swipe>
        <div className="shop-sheet-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="slot-link" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </>
  )
}
