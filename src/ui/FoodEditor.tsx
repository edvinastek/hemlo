import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { edit } from '../lib/write'
import {
  LABEL, STATES, draftOf, energyFrom, readFoodForm, type FoodDraft, type FoodState, type LabelKey,
} from '../lib/eu-label-rules'
import { readUnits } from '../lib/units-rules'
import { Dropdown } from './Dropdown'
import type { Food } from '../lib/types'
import './food.css'

const STATE_OPTIONS = STATES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
/** The lines shown at once; the rest open under "More figures". */
const MAIN: LabelKey[] = ['kj', 'kcal', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'fiber_g', 'protein_g', 'salt_g']

/** Whether a saved value is different from the form's: a numeric column can
 *  arrive from the server as text. */
function differs(x: unknown, before: unknown): boolean {
  if (x === null) return before !== null && before !== undefined
  if (typeof x === 'number') return before === null || before === undefined || Number(before) !== x
  if (Array.isArray(x)) return JSON.stringify(x) !== JSON.stringify(before ?? null)
  return x !== before
}

/** A food typed in by hand from its label (FOOD-01, FOOD-02): new, one of
 *  the person's own to change, or their own copy of a shared food. The
 *  figures are the EU declaration per 100 g or 100 ml; any left empty stay
 *  unknown. Energy left empty is worked out from the macros with the EU
 *  factors (FOOD-04), and the form says so. Saved on this device at once and
 *  sent with the next sync, like every change. */
export function FoodEditor({ food, copyOf, name, barcode, userId, onClose, onSaved }: {
  /** One of the person's own foods to change. */
  food?: Food | null
  /** A shared food to start a copy from. */
  copyOf?: Food | null
  /** A name to start a new food with ("Add 'quark' as a new food"). */
  name?: string
  /** A scanned barcode no product was found for. */
  barcode?: string | null
  userId: string
  onClose: () => void
  onSaved?: (food: Food) => void
}) {
  const titleId = useId()
  const [draft, setDraft] = useState<FoodDraft>(() =>
    food ? draftOf(food as never) : copyOf ? draftOf(copyOf as never, copyOf.name) : { ...draftOf(null), name: name ?? '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const moreOpen = useMemo(() => LABEL.some((r) => !MAIN.includes(r.key) && draft.figures[r.key]), [])
  const set = (change: Partial<FoodDraft>) => { setDraft((d) => ({ ...d, ...change })); setError(null) }
  const setFigure = (key: LabelKey, v: string) => set({ figures: { ...draft.figures, [key]: v } })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const read = readFoodForm(draft)
  const per = draft.per === 'ml' ? '100 ml' : '100 g'
  // What the energy comes to from the macros as typed, shown while the
  // energy boxes are empty, so the person sees what will be saved.
  const typedEnergy = !draft.figures.kcal?.trim() && !draft.figures.kj?.trim()
  const worked = typedEnergy ? energyFrom(Object.fromEntries(Object.entries(draft.figures).map(([k, v]) => [k, v?.replace(',', '.')]))) : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if ('error' in read) { setError(read.error); return }
    setBusy(true)
    try {
      const v = read.values
      let saved: Food
      if (food) {
        // Only what changed goes, so an edit on another phone to another
        // field is kept.
        const changes: Partial<Food> = {}
        for (const [k, x] of Object.entries(v)) {
          if (differs(x, (food as unknown as Record<string, unknown>)[k])) (changes as Record<string, unknown>)[k] = x
        }
        saved = Object.keys(changes).length ? await edit('food', food, changes) : food
      } else {
        const fresh = { id: crypto.randomUUID() } as Food
        const units = copyOf ? readUnits(copyOf.units).filter((u) => u.source !== 'mine') : []
        saved = await edit('food', fresh, {
          ...v, owner_id: userId, deleted_at: null, units,
          // A copy of a NEVO food remembers where it came from; the figures
          // are the person's own from now on.
          source: 'own', source_ref: copyOf?.nevo_code ? `nevo:${copyOf.nevo_code}` : copyOf?.barcode ? copyOf.source_ref ?? null : null,
          ...(barcode ? { barcode } : {}),
        } as Partial<Food>)
      }
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved on this phone.')
    } finally {
      setBusy(false)
    }
  }

  const title = food ? 'Edit food' : copyOf ? 'Your own copy' : 'New food'
  const field = (key: LabelKey) => {
    const row = LABEL.find((r) => r.key === key)!
    const unit = row.unit
    const label = row.key === 'kj' ? 'Energy, kJ' : row.key === 'kcal' ? 'Energy, kcal' : row.label.charAt(0).toUpperCase() + row.label.slice(1)
    return (
      <label key={key} className={`fe-figure${row.sub ? ' is-sub' : ''}`}>
        <span>{label}</span>
        <span className="fe-input">
          <input inputMode="decimal" autoComplete="off" value={draft.figures[key] ?? ''}
            placeholder={key === 'kcal' && worked ? String(worked.kcal) : key === 'kj' && worked ? String(worked.kj) : '–'}
            onChange={(e) => setFigure(key, e.target.value)} />
          <span className="fe-unit" aria-hidden="true">{unit}</span>
        </span>
      </label>
    )
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet fe-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={(e) => void save(e)} noValidate>
        <h2 id={titleId}>{title}</h2>
        {copyOf && <p className="fe-note">From {copyOf.name}. Your copy is yours to change; the shared food stays as it is.</p>}
        <div className="form-grid">
          <label>
            Name
            <input value={draft.name} maxLength={120} autoFocus={!food && !copyOf} autoComplete="off"
              onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            Brand <span className="fe-optional">optional</span>
            <input value={draft.brand} maxLength={120} autoComplete="off" onChange={(e) => set({ brand: e.target.value })} />
          </label>

          <div className="fe-per" role="group" aria-label="The figures are per">
            <span>Figures per</span>
            <div className="amt-units">
              <button type="button" aria-pressed={draft.per === 'g'} onClick={() => set({ per: 'g' })}>100 g</button>
              <button type="button" aria-pressed={draft.per === 'ml'} onClick={() => set({ per: 'ml' })}>100 ml</button>
            </div>
          </div>

          <fieldset className="fe-label">
            <legend>As on the label, per {per}</legend>
            {MAIN.map(field)}
            <details open={moreOpen}>
              <summary>More figures: mono- and polyunsaturates, polyols, starch, alcohol</summary>
              {LABEL.filter((r) => !MAIN.includes(r.key)).map((r) => field(r.key))}
            </details>
            <p className="fe-note" aria-live="polite">
              {worked
                ? `Energy left empty: worked out from the macros with the EU factors, ${worked.kcal} kcal (${worked.kj} kJ).`
                : 'Leave a figure empty when the label does not give it: it stays unknown, never 0. Leave energy empty to work it out from the macros.'}
            </p>
            {'notes' in read && read.notes.filter((n) => n.startsWith('The macros')).map((n) => <p key={n} className="fe-note is-warn">{n}</p>)}
          </fieldset>

          <div className="two">
            <div className="fe-field">
              <span>State</span>
              <Dropdown<FoodState> value={draft.state} options={STATE_OPTIONS} label="State" onChange={(state) => set({ state })} />
            </div>
            <label>
              Cook yield <span className="fe-optional">cooked ÷ raw</span>
              <input inputMode="decimal" autoComplete="off" value={draft.cook_yield} placeholder="e.g. 2.9 for rice"
                onChange={(e) => set({ cook_yield: e.target.value })} />
            </label>
          </div>
          <div className="two">
            <label>
              Pack size, g <span className="fe-optional">optional</span>
              <input inputMode="decimal" autoComplete="off" value={draft.pack_size_g} onChange={(e) => set({ pack_size_g: e.target.value })} />
            </label>
            <label>
              Aisle <span className="fe-optional">optional</span>
              <input value={draft.store_section} maxLength={40} autoComplete="off" onChange={(e) => set({ store_section: e.target.value })} />
            </label>
          </div>
          <label>
            Shops <span className="fe-optional">optional, with commas between</span>
            <input value={draft.stores} autoComplete="off" placeholder="Albert Heijn, Jumbo" onChange={(e) => set({ stores: e.target.value })} />
          </label>
          {draft.per === 'g' && (
            <label>
              Grams in a millilitre <span className="fe-optional">optional, to count it in spoons and cups</span>
              <input inputMode="decimal" autoComplete="off" value={draft.density} placeholder="e.g. 0.92 for oil"
                onChange={(e) => set({ density: e.target.value })} />
            </label>
          )}
          {error && <p className="re-error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary grow" disabled={busy}>{busy ? 'Saving' : food ? 'Save' : 'Save food'}</button>
        </div>
      </form>
    </>
  )
}
