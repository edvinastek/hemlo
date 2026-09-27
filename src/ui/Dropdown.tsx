import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import './pickers.css'

export interface Option<V extends string = string> {
  value: V
  label: string
  /** A second, quieter line: "1.2 · desk job, little walking". */
  hint?: string
}

/** A compact list that opens under its button, instead of the phone's
 *  full-screen picker. It flips upward near the bottom of the screen, scrolls
 *  when long, and works from the keyboard (arrows, Enter, Escape). */
export function Dropdown<V extends string>({
  value, options, onChange, label, placeholder = 'Choose', className, disabled,
}: {
  value: V | null
  options: Option<V>[]
  onChange: (v: V) => void
  /** Read out by screen readers; the visible label sits beside it. */
  label: string
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [up, setUp] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !wrap.current) return
    const r = wrap.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom)
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function show() {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  function pick(i: number) {
    const o = options[i]
    if (!o) return
    onChange(o.value)
    setOpen(false)
  }
  function onKey(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div className={`dd${className ? ` ${className}` : ''}`} ref={wrap}>
      <button
        type="button" className="dd-button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}
      >
        <span className={current ? 'dd-value' : 'dd-value dd-placeholder'}>{current?.label ?? placeholder}</span>
        <span className="dd-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul id={id} role="listbox" aria-label={label} className={`dd-list${up ? ' dd-up' : ''}`} ref={list}>
          {options.map((o, i) => (
            <li
              key={o.value} role="option" aria-selected={o.value === value}
              className={i === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="dd-label">{o.label}</span>
              {o.hint && <span className="dd-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
