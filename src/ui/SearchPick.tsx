import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import './pickers.css'

export interface PickItem {
  id: string
  name: string
  /** "380 kcal / 100 g", "recipe · 4 items" */
  meta?: string
  /** Shown as a small tag: "mine", "recipe". */
  tag?: string
}

/** Type to find: the same quick search as the Foods page, as a picker. Results
 *  filter on every key, best matches first (name starts with the words, then
 *  contains them), at most `limit` shown. Used wherever a food or recipe is
 *  chosen, so picking one feels the same everywhere. */
export function SearchPick({
  items, onPick, placeholder = 'Search', label, value, limit = 8, autoFocus, onClear,
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
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()

  const results = useMemo(() => rank(items, query).slice(0, limit), [items, query, limit])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => setActive(0), [query])

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
              // pointerdown, not click: picking must win against the input losing focus.
              onPointerDown={(e) => { e.preventDefault(); pick(r) }}>
              <span className="sp-name">{r.name}</span>
              {r.tag && <span className="sp-tag">{r.tag}</span>}
              {r.meta && <span className="sp-meta">{r.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Every word typed must appear; names that start with the first word come
 *  first, then shorter names (the plain food before its variations). */
export function rank<T extends { name: string }>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items].sort((a, b) => a.name.localeCompare(b.name))
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    const name = item.name.toLowerCase()
    if (!words.every((w) => name.includes(w))) continue
    const score = (name.startsWith(words[0]) ? 0 : name.split(/\W+/).some((p) => p.startsWith(words[0])) ? 1 : 2) * 1000 + name.length
    scored.push({ item, score })
  }
  return scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name)).map((s) => s.item)
}
