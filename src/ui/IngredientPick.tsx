import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { search } from '../lib/search-rules'
import { foodSearchText } from '../lib/eu-label-rules'
import { readUnits } from '../lib/units-rules'
import type { Food } from '../lib/types'
import './pickers.css'
import { ScanIcon } from './BarcodeScan'
import './recipes.css'

/** How many matches show before "Show all" (GEN-10: pickers show the best
 *  20). */
const BEST = 20

/** Adding an ingredient (REC-10): type to find a food with the one search
 *  (English or Dutch, every word, best first); the list always ends with what
 *  to do when the food is not there: add what was typed as a new food, keep
 *  it as a line of text, scan a barcode, or find it in the shops. The list
 *  sits in the sheet itself, so nothing opens over the editor. */
export function IngredientPick({ foods, userId, onPick, onNewFood, onText, onScan, onFind }: {
  foods: Food[]
  userId: string
  onPick: (food: Food) => void
  /** "Add '<typed>' as a new food": the food form, with the name filled in. */
  onNewFood: (name: string) => void
  /** Keep what was typed as a line of text ("Salt to taste"). */
  onText: (text: string) => void
  onScan: () => void
  onFind: () => void
}) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const items = useMemo(() => foods
    .filter((f) => !f.deleted_at && (!f.owner_id || f.owner_id === userId))
    .map((f) => ({ food: f, name: f.name, extra: foodSearchText(f), mine: !!f.owner_id })), [foods, userId])
  const typed = query.trim()
  const hits = useMemo(() => (typed ? search(items, typed) : []), [items, typed])
  const shown = all ? hits : hits.slice(0, BEST)

  function pick(f: Food) {
    onPick(f)
    setQuery('')
    setAll(false)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active].food) }
    else if (e.key === 'Escape') setQuery('')
  }

  return (
    <div className="ip">
      <div className="ip-field">
        <input type="search" role="combobox" aria-expanded={!!typed} aria-controls={listId} aria-autocomplete="list"
          aria-label="Add an ingredient" placeholder="Add an ingredient: type to find it" autoComplete="off"
          value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); setAll(false) }} onKeyDown={onKey} />
        <button type="button" className="ip-scan" aria-label="Scan a barcode" title="Scan a barcode" onClick={onScan}><ScanIcon /></button>
      </div>
      {typed && (
        <ul id={listId} className="ip-list" role="listbox" aria-label="Foods found">
          {shown.map((h, i) => {
            const f = h.food
            const units = readUnits(f.units).slice(0, 2).map((u) => u.name).join(' · ')
            return (
              <li key={f.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : undefined}
                onPointerEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(f)}>
                <span className="sp-name">{f.name}</span>
                {f.owner_id && <span className="sp-tag">mine</span>}
                <span className="sp-meta">
                  {[f.kcal != null ? `${Math.round(Number(f.kcal))} kcal / 100 ${f.per_ml ? 'ml' : 'g'}` : null, f.name_nl && f.name_nl !== f.name ? f.name_nl : null, units || null]
                    .filter(Boolean).join(' · ')}
                </span>
              </li>
            )
          })}
          {hits.length === 0 && <li className="sp-empty" aria-disabled="true">No food called “{typed}” yet.</li>}
          {!all && hits.length > BEST && (
            <li className="ip-action" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => setAll(true)}>
              Show all {hits.length}
            </li>
          )}
        </ul>
      )}
      {/* At the end of what is found, so a food that is not there is one tap
          away; the scanner is in the field (v17). */}
      {typed && (
        <div className="ip-actions">
          <button type="button" className="btn" onClick={() => { onNewFood(typed); setQuery('') }}>Add “{typed}” as a new food</button>
          <button type="button" className="btn" onClick={() => { onText(typed); setQuery('') }}>Keep “{typed}” as text</button>
          <button type="button" className="btn" onClick={onFind}>Find in stores</button>
        </div>
      )}
    </div>
  )
}
