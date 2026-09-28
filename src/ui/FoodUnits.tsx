import { useEffect, useId, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { addUnit, readUnitForm, readUnits, removeUnit, unitLine, MAX_UNITS, UNIT_NAME_MAX } from '../lib/units-rules'
import type { Food } from '../lib/types'
import './amount.css'

/** One food's page: its figures per 100 g and the units it is counted in
 *  ("1 egg = 50 g"). Units of one's own foods can be added and removed here;
 *  the shared catalogue's are shown but set by GetIt, like the rest of it.
 *
 *  Changing a unit's weight never changes what was already saved: an entry
 *  typed as "2 eggs" keeps the grams it came to then. */
export function FoodUnitsSheet({ food: given, onClose }: { food: Food; onClose: () => void }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  // The stored row, so a unit added here shows at once and edits start from it.
  const food = useLiveQuery(() => db.food.get(given.id), [given.id]) ?? given
  const units = readUnits(food.units)
  const mine = !!userId && food.owner_id === userId
  const [form, setForm] = useState({ name: '', plural: '', g: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(next: ReturnType<typeof readUnits>) {
    setBusy(true)
    try {
      const row = (await db.food.get(food.id)) ?? food
      await edit('food', row, { units: next })
    } finally {
      setBusy(false)
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const read = readUnitForm(form)
    if ('error' in read) { setError(read.error); return }
    const next = addUnit(units, read.unit)
    if (next.error !== undefined) { setError(next.error); return }
    await save(next.units)
    setForm({ name: '', plural: '', g: '' })
    setError(null)
  }

  const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? '–' : Math.round(Number(v) * 10) / 10)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{food.name}</h2>
        <p className="fu-facts">
          Per 100 g: {n(food.kcal)} kcal · {n(food.protein_g)} g protein · {n(food.carbs_g)} g carbs · {n(food.fat_g)} g fat
          · {n(food.fiber_g)} g fibre
        </p>

        <h3 className="section-title" style={{ margin: 'var(--space-3) 0 var(--space-1)' }}>Units</h3>
        {units.length === 0
          ? <p className="fu-facts">Counted in grams only.{mine ? ' Add a unit to count it as eggs, slices or spoons.' : ''}</p>
          : (
            <ul className="fu-list" aria-label={`Units of ${food.name}`}>
              {units.map((u) => (
                <li key={u.name}>
                  <span>{unitLine(u)}{u.plural ? <span className="row-meta"> · {u.plural}</span> : null}</span>
                  {mine && (
                    <button type="button" className="re-remove" aria-label={`Remove the unit ${u.name}`} disabled={busy}
                      onClick={() => void save(removeUnit(units, u.name))}>×</button>
                  )}
                </li>
              ))}
            </ul>
          )}

        {mine ? (
          units.length < MAX_UNITS && (
            <form className="fu-add" onSubmit={(e) => void add(e)} style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <div className="fu-form">
                <label>Unit
                  <input value={form.name} maxLength={UNIT_NAME_MAX} placeholder="egg" autoComplete="off"
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(null) }} />
                </label>
                <label>Plural, if odd
                  <input value={form.plural} maxLength={UNIT_NAME_MAX} placeholder="eggs" autoComplete="off"
                    onChange={(e) => setForm({ ...form, plural: e.target.value })} />
                </label>
                <label>One weighs, g
                  <input value={form.g} inputMode="decimal" placeholder="50" autoComplete="off"
                    onChange={(e) => { setForm({ ...form, g: e.target.value }); setError(null) }} />
                </label>
              </div>
              {error && <p className="amt-hint is-warn" role="alert">{error}</p>}
              <p className="fu-facts">
                A new weight only counts for what is typed from now on: amounts already saved keep their grams.
              </p>
              <button type="submit" className="btn btn-primary" disabled={busy || !form.name.trim() || !form.g.trim()}>Add unit</button>
            </form>
          )
        ) : (
          <p className="fu-facts" style={{ marginTop: 'var(--space-2)' }}>
            {food.owner_id ? 'Only the person who added this food can change it.' : 'Shared foods’ units are set by GetIt.'}
          </p>
        )}

        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}
