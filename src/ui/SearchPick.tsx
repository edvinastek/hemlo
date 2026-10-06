import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { search } from '../lib/search-rules'
import './pickers.css'

export interface PickItem {
  id: string
  name: string
  /** "380 kcal / 100 g", "recipe · 4 items" */
  meta?: string
  /** Shown as a small tag: "mine", "recipe". */
  tag?: string
  /** Other words the search finds it by (brand, aisle, tags), not shown. */
  extra?: string
  /** The person's own: ranked ahead of the rest. */
  mine?: boolean
  /** Used recently, higher is more recent: ranked ahead too. */
  recent?: number
  /** Deleted, kept only so a link to it can say so; never offered. */
  gone?: boolean
}

/** Type to find, with THE search (search-rules.ts, GEN-10 to GEN-12): every
 *  word in any order, accents ignored, starts-with first, own and recent
 *  things first. It updates on every letter, over the whole list; the best
 *  `limit` (20) are shown, with "Show all" for the rest. Used wherever a
 *  food, recipe, country or anything else is chosen, so picking one feels
 *  the same everywhere. */
export function SearchPick({
  items, onPick, placeholder = 'Search', label, value, limit = 20, autoFocus, onClear,
}: {
  items: PickItem[]
  onPick: (item: PickItem) => void
  placeholder?: string
  label: string
  /** The chosen item's name, shown when the field is not being typed in. */
  value?: string | null
  limit?: number
  autoFocus?: boolean
  /** Offered as "Clear" when something is chosen. */
  onClear?: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [all, setAll] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()

  const found = useMemo(() => rank(items, query), [items, query])
  const results = all ? found : found.slice(0, limit)
  const more = found.length - results.length

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => { setActive(0); setAll(false) }, [query])

  function pick(item: PickItem | undefined) {
    if (!item) return
    onPick(item)
    setQuery('')
    setOpen(false)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="sp" ref={wrap}>
      <div className="sp-field">
        <input
          type="search" role="combobox" aria-expanded={open} aria-controls={id} aria-label={label}
          aria-autocomplete="list" autoComplete="off" autoFocus={autoFocus}
          placeholder={value ?? placeholder}
          className={value ? 'sp-has-value' : undefined}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={onKey}
        />
        {value && onClear && !query && (
          <button type="button" className="sp-clear" onClick={onClear} aria-label={`Clear ${label}`}>×</button>
        )}
      </div>
      {open && (
        <ul id={id} role="listbox" className="sp-list" aria-label={label}>
          {results.length === 0 && <li className="sp-empty" aria-disabled>No match</li>}
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(i)}
              // Picked on click, not pointerdown: picking on the way down removed
              // the list under the finger, and the tap's click then landed on
              // whatever lay beneath (the next meal's checkbox). mousedown is
              // held back so the field keeps focus while the list is tapped.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}>
              <span className="sp-name">{r.name}</span>
              {r.tag && <span className="sp-tag">{r.tag}</span>}
              {r.meta && <span className="sp-meta">{r.meta}</span>}
            </li>
          ))}
          {more > 0 && (
            <li className="sp-more" role="presentation">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setAll(true)}>
                Show all {found.length}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** The picker's order: THE search (search-rules.ts). Kept under this name
 *  for code that ranks a list the way the picker does. */
export function rank<T extends { name: string; extra?: string; mine?: boolean; recent?: number }>(items: T[], query: string): T[] {
  return search(items, query)
}
