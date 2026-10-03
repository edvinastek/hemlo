import { useState } from 'react'
import { Dropdown } from './Dropdown'
import { AmountInput } from './AmountInput'
import {
  BASES, EMPTY_FORM, MACROS, amountLine, formFrom, nutrientLabel, quickMacros, readQuick,
  type Basis, type QuickEntry, type QuickForm,
} from '../lib/quick-food'
import type { Nutrient } from '../lib/settings'

const GRAMS = [{ key: 'g', label: 'g', g: 1, unit: null }]

/** "Just numbers" (MEAL-15): what it was, its calories as the total or per
 *  100 g / 50 g / 30 g / 25 g / a portion with how much was eaten, and any
 *  macros known. Only calories are needed; an empty macro stays unknown,
 *  never zero. Used by the add sheet and to correct an entry on the Day tab.
 *  `start` fills it from an entry already saved (shown as its totals). */
export function QuickNumbers({ start, label, shown, action, onSubmit, autoFocus }: {
  start?: Partial<QuickEntry> | null
  /** A name to start with (what was searched for, a scanned barcode). */
  label?: string
  shown: Nutrient[]
  /** The button's words: "Put on plate", "Save". */
  action: string
  onSubmit: (entry: QuickEntry) => void
  autoFocus?: boolean
}) {
  const [form, setForm] = useState<QuickForm>(() => (start ? formFrom(start) : { ...EMPTY_FORM, label: label ?? '' }))
  const first = MACROS.filter((k) => shown.includes(k))
  const rest = MACROS.filter((k) => !shown.includes(k))
  const [more, setMore] = useState(() => rest.some((k) => form[k] !== ''))
  const set = (change: Partial<QuickForm>) => setForm((f) => ({ ...f, ...change }))

  const result = readQuick(form)
  const entry = 'entry' in result ? result.entry : null
  const touched = form.kcal !== '' || form.grams !== ''
  const same = !!entry && !!start && JSON.stringify(formFrom(entry)) === JSON.stringify(formFrom(start))
  const per = form.basis === 'total' ? '' : ` ${BASES.find((b) => b.value === form.basis)!.label.replace('…', form.portion_g || '…')}`

  const field = (key: keyof QuickForm, text: string, placeholder?: string) => (
    <label key={key} className="qf-field">
      <span>{text}</span>
      <input type="text" inputMode="decimal" autoComplete="off" value={form[key]} placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )

  return (
    <form className="qf" onSubmit={(e) => { e.preventDefault(); if (entry && !same) onSubmit(entry) }}>
      <input className="qf-label" type="text" value={form.label} maxLength={120} placeholder="What it was (optional)"
        aria-label="What it was" autoFocus={autoFocus} onChange={(e) => set({ label: e.target.value })} />
      <div className="qf-grid">
        {/* The dropdown sits in the left column so its list, wider than the
            field, opens across the screen and not off its edge. */}
        <div className="qf-field">
          <span>Calories are</span>
          <Dropdown<Basis> value={form.basis} options={BASES.map((b) => ({ value: b.value, label: b.label }))} label="Calories are"
            onChange={(basis) => set({ basis })} />
        </div>
        {field('kcal', `kcal${per}`)}
        {form.basis === 'portion' && field('portion_g', 'One portion, g')}
        {form.basis !== 'total' && (
          <div className="qf-field">
            <span>Eaten</span>
            <div className="qf-amount">
              <AmountInput text={form.grams} choice="g" choices={GRAMS} onText={(grams) => set({ grams })} onChoice={() => undefined}
                label="How much was eaten, in grams" />
            </div>
          </div>
        )}
        {first.map((k) => field(k, `${nutrientLabel(k)}, g${per}`, 'optional'))}
        {more && rest.map((k) => field(k, `${nutrientLabel(k)}, g${per}`, 'optional'))}
      </div>
      <div className="qf-actions">
        {!more && rest.length > 0 && (
          <button type="button" className="slot-link" onClick={() => setMore(true)}>
            {first.length ? 'More' : 'Add macros'}
          </button>
        )}
        <span className="row-meta qf-result" aria-live="polite">
          {entry ? `Comes to ${amountLine(quickMacros(entry), shown)}` : touched ? (result as { error: string }).error : ''}
        </span>
        <button type="submit" className="btn btn-primary" disabled={!entry || same}>{same ? 'Saved' : action}</button>
      </div>
    </form>
  )
}
