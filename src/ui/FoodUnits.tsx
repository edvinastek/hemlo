import { useId, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { ShopNameLinks } from './ShopNameLinks'
import { edit } from '../lib/write'
import {
  LABEL, PORTIE_ATTRIBUTION, NEVO_ATTRIBUTION, USDA_UNITS_ATTRIBUTION, energyCheck, figureOf, figureText, riPercent, sodiumOf, sourceKind,
  sourceText, copiedFromNevo,
} from '../lib/eu-label-rules'
import {
  addUnit, foodWord, pluralOf, readUnitForm, readUnits, removeUnit, unitLine, withOverlay, MAX_UNITS, UNIT_NAME_MAX, type FoodUnit,
} from '../lib/units-rules'
import { saveLabelChoice, saveOwnUnits, useNutritionPrefs } from '../lib/nutrition-prefs'
import { MICROS, microOf, microText, nrvPercent } from '../lib/micros-rules'
import { offerUndo } from './Undo'
import { FoodEditor } from './FoodEditor'
import { MoreMenu } from './MoreMenu'
import { MoreOptions } from './MoreOptions'
import { AddFoodSheet } from './AddFoodSheet'
import type { Food } from '../lib/types'
import './amount.css'
import './food.css'
import { useBackClose } from './useBackClose'
import { planToday } from '../lib/day-edge'

/** One food's page: the label per 100 g or 100 ml (with %RI if wanted), what
 *  state it is in, the units it is counted in, and where the figures came
 *  from. Its main action, Add to a meal, is at the foot (it becomes the
 *  add-food sheet, with this food on the plate); the rest are in the ⋮ by its
 *  name (v17): one's own foods can be changed or deleted, a shared food
 *  copied to change it, and %RI shown or hidden. Shared foods can be given
 *  units of one's own (kept with the person, not the shared list). NEVO foods
 *  carry NEVO's attribution, as its conditions of use ask, here where the
 *  data is shown in full (CALM-13). */
export function FoodUnitsSheet({ food: given, onClose }: { food: Food; onClose: () => void }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const profileId = useApp((s) => s.profile?.id ?? null)
  // The stored row, so a change made here shows at once.
  const food = useLiveQuery(() => db.food.get(given.id), [given.id]) ?? given
  const replacement = useLiveQuery(async () => (food.replaced_by ? db.food.get(food.replaced_by) : undefined), [food.replaced_by])
  const prefs = useNutritionPrefs()
  const [mode, setMode] = useState<'view' | 'edit' | 'copy' | 'delete' | 'add'>('view')
  const canAdd = !!profileId && !food.deleted_at
  const titleId = useId()
  const mine = !!userId && food.owner_id === userId
  const shared = !food.owner_id

  // Back and Escape close the page (CALM-10) while it is shown; the editor or
  // the add-food sheet in its place takes them when open.
  useBackClose(onClose, mode === 'view' || mode === 'delete')

  if (mode === 'edit' && userId) return <FoodEditor food={food} userId={userId} onClose={() => setMode('view')} />
  if (mode === 'copy' && userId) return <FoodEditor copyOf={food} userId={userId} onClose={() => setMode('view')} onSaved={() => onClose()} />
  // The add-food sheet takes this page's place (never a sheet on a sheet),
  // for today, with this food on the plate.
  if (mode === 'add') return <AddFoodSheet day={planToday()} food={food} onClose={() => setMode('view')} />

  const per = food.per_ml ? '100 ml' : '100 g'
  const ri = prefs.label.ri
  const check = energyCheck(food)
  const sodium = sodiumOf(food)
  const kind = sourceKind(food)
  // A shared food's own units come from Nutrition's settings, read live
  // here: the food row itself does not change when one is added, so the
  // list would otherwise wait for the page to be opened again.
  const units = shared
    ? withOverlay(readUnits(food.units).filter((u) => u.source !== 'mine'), prefs.overlay[food.id] ?? [])
    : readUnits(food.units)
  const isEgg = food.food_group === 'Eggs' || /\begg\b/i.test(food.name) && units.some((u) => /egg/.test(u.name))
  const additions = kind === 'nevo' && (units.length > 0 || !!food.cook_yield || food.name !== food.name_en)

  async function remove() {
    const row = (await db.food.get(food.id)) ?? food
    await edit('food', row, { deleted_at: new Date().toISOString() })
    offerUndo(`Deleted ${food.name}`, async () => {
      const back = (await db.food.get(food.id)) ?? row
      await edit('food', back, { deleted_at: null })
    })
    onClose()
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet fs-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="fs-head">
          <h2 id={titleId}>{food.name}</h2>
          <MoreMenu className="fs-more" label={`More for ${food.name}`} items={[
            mine && { label: 'Edit', onSelect: () => setMode('edit') },
            !mine && !!userId && !food.deleted_at && { label: 'Make my own copy', onSelect: () => setMode('copy') },
            !!profileId && { label: ri ? 'Hide % of reference intake' : 'Show % of reference intake', onSelect: () => void saveLabelChoice(profileId!, { ...prefs.label, ri: !ri }) },
            mine && { label: 'Delete…', danger: true, onSelect: () => setMode('delete') },
          ]} />
        </div>
        <p className="fs-sub">
          {[food.name_nl && food.name_nl !== food.name ? food.name_nl : null, food.brand, food.food_group].filter(Boolean).join(' · ') || sourceText(food)}
        </p>
        {food.deleted_at && (
          <p className="fe-note is-warn" role="status">
            {replacement ? `No longer in the shared list: replaced by ${replacement.name}. What used it now uses that.` : 'This food is no longer in the list. What used it still adds up with these figures.'}
          </p>
        )}

        <table className="fs-table">
          <caption>Per {per}, as on an EU label</caption>
          {ri && (
            <thead><tr><th scope="col"><span className="visually-hidden">Figure</span></th><th scope="col">Per {per}</th><th scope="col">%RI</th></tr></thead>
          )}
          <tbody>
            {LABEL.map((r) => {
              const v = figureOf(food as never, r.key)
              // Optional lines without a figure are left out; the required
              // ones show a dash, so an unknown is seen as unknown.
              if (v === null && !r.required && r.key !== 'fiber_g') return null
              const pct = ri ? riPercent(r.key, v) : null
              return (
                <tr key={r.key} className={r.sub ? 'is-sub' : undefined}>
                  <th scope="row">{r.key === 'kcal' ? '' : r.label.charAt(0).toUpperCase() + r.label.slice(1)}</th>
                  <td>{figureText(v, r.unit, r.key)}</td>
                  {ri && <td className="fs-ri">{pct === null ? '' : `${pct}%`}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="fs-row">
          <span className="fe-note">
            {sodium !== null ? `Sodium ${figureText(sodium, 'g')} (salt ÷ 2.5).` : 'Sodium unknown.'}
            {check?.flagged ? ` The macros come to ${check.worked} kcal by the EU factors; the stated figure is shown.` : ''}
          </span>
        </div>
        {ri && <p className="fe-note">Reference intake of an average adult (8,400 kJ / 2,000 kcal).</p>}

        {/* Vitamins and minerals the person chose to see (FOOD-17), with
            their share of the NRV as an EU label gives it. */}
        {prefs.micros.length > 0 && (
          <table className="fs-table fs-micros">
            <caption>Vitamins and minerals per {per}</caption>
            <thead><tr><th scope="col"><span className="visually-hidden">Nutrient</span></th><th scope="col">Per {per}</th><th scope="col">%NRV</th></tr></thead>
            <tbody>
              {MICROS.filter((m) => prefs.micros.includes(m.code)).map((m) => {
                const v = microOf(food, m.code)
                const pct = nrvPercent(m.code, v)
                return (
                  <tr key={m.code}>
                    <th scope="row">{m.name}</th>
                    <td>{microText(m.code, v)}</td>
                    <td className="fs-ri">{pct === null ? '' : `${pct}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <dl className="fs-facts">
          <div><dt>State</dt> <dd>{food.state}{food.cook_yield ? ` · cooks to ${Number(food.cook_yield)}× its weight` : ''}</dd></div>
          {food.pack_size_g ? <div><dt>Pack</dt> <dd>{Number(food.pack_size_g)} g</dd></div> : null}
          {food.store_section ? <div><dt>Aisle</dt> <dd>{food.store_section}</dd></div> : null}
          {food.stores?.length ? <div><dt>Shops</dt> <dd><ShopNameLinks names={food.stores} query={food.name} /></dd></div> : null}
          {food.density ? <div><dt>Weighs</dt> <dd>{Number(food.density)} g per ml</dd></div> : null}
          {food.source_note ? (kind === 'nevo'
            ? <div><dt>NEVO’s note</dt> <dd lang="nl">{food.source_note}</dd></div>
            : <div><dt>Source</dt> <dd>{food.source_note}</dd></div>) : null}
        </dl>

        <Units food={food} units={units} mine={mine} shared={shared} profileId={profileId} />
        {isEgg && (
          <p className="fe-note" style={{ marginTop: 'var(--space-2)' }}>
            EU egg sizes, weighed in the shell: S under 53 g, M 53–63 g, L 63–73 g, XL 73 g and over. The weights above are
            what is eaten, without the shell.{units.some((u) => u.size === 'XL' && u.source !== 'mine')
              ? ' The XL weight is worked out: 78 g in the shell, less USDA’s 12% shell.' : ''}
          </p>
        )}

        <div className="fs-source">
          <div>Figures: <b>{sourceText(food)}</b>{kind === 'usda' ? ', carbohydrate given on the EU basis (fibre not included)' : ''}.</div>
          {kind === 'nevo' && <div>{NEVO_ATTRIBUTION}.</div>}
          {copiedFromNevo(food) && <div>Copied from NEVO online version 2025/9.0, RIVM, Bilthoven; the figures are yours from here.</div>}
          {additions && (
            <div>
              Added by Hemlo, not part of NEVO: {[food.name !== food.name_en ? 'the name shown' : null, units.some((u) => u.source !== 'mine') ? 'units' : null,
                food.cook_yield ? 'cook yield' : null].filter(Boolean).join(', ')}.
              {food.name_en && food.name !== food.name_en ? ` NEVO’s own name: ${food.name_en}.` : ''}
            </div>
          )}
          {units.some((u) => u.source?.startsWith('Portie')) && <div>{PORTIE_ATTRIBUTION}.</div>}
          {units.some((u) => u.source?.includes('USDA')) && <div>{USDA_UNITS_ATTRIBUTION}.</div>}
          {kind === 'off' && <div>Product data: Open Food Facts (ODbL).</div>}
        </div>

        {mode === 'delete' ? (
          <div className="fs-actions" role="alertdialog" aria-label="Delete this food">
            <p className="fe-note" style={{ flexBasis: '100%' }}>Delete {food.name}? Recipes and meals that use it keep their figures.</p>
            {/* Focused, so a delete asked from the ⋮ at the top is seen down here. */}
            <button type="button" className="btn" autoFocus onClick={() => setMode('view')}>Keep it</button>
            <button type="button" className="btn fs-danger grow" onClick={() => void remove()}>Delete</button>
          </div>
        ) : (
          <div className="fs-actions">
            <button type="button" className="btn" onClick={onClose}>Close</button>
            {canAdd && <button type="button" className="btn btn-primary grow" onClick={() => setMode('add')}>Add to a meal</button>}
          </div>
        )}
        {!mine && !shared && <p className="fe-note" style={{ marginTop: 'var(--space-2)' }}>A housemate’s food: only they can change it.</p>}
      </div>
    </>
  )
}

/** The food's units ("1 onion = 95 g (100 g as bought)"), and adding or
 *  removing them: on one's own food, its own units; on a shared food, units of
 *  one's own laid over it, kept with the person (UNIT-16). The example in the
 *  form is this food's own word, never another food's (UNIT-20). */
function Units({ food, units, mine, shared, profileId }: {
  food: Food; units: FoodUnit[]; mine: boolean; shared: boolean; profileId: string | null
}) {
  const word = foodWord(food.name)
  const mixed = units.some((u) => u.source?.startsWith('Portie'))
  const [form, setForm] = useState({ name: '', plural: '', g: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canAdd = mine || (shared && !!profileId && !food.deleted_at)
  const removable = (u: FoodUnit) => mine || (shared && u.source === 'mine')

  async function save(next: FoodUnit[]) {
    setBusy(true)
    try {
      if (mine) {
        const row = (await db.food.get(food.id)) ?? food
        await edit('food', row, { units: next })
      } else if (shared && profileId) {
        await saveOwnUnits(profileId, food.id, next.filter((u) => u.source === 'mine'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const read = readUnitForm(form)
    if ('error' in read) { setError(read.error); return }
    const unit = shared ? { ...read.unit, source: 'mine' } : read.unit
    const next = addUnit(units, unit)
    if (next.error !== undefined) { setError(next.error); return }
    await save(next.units)
    setForm({ name: '', plural: '', g: '' })
    setError(null)
    setAdding(false)
  }

  return (
    <>
      <h3 className="section-title" style={{ padding: 'var(--space-4) 0 var(--space-1)' }}>Units</h3>
      {units.length === 0
        ? <p className="fu-facts">Counted in grams only.</p>
        : (
          <ul className="fu-list" aria-label={`Units of ${food.name}`}>
            {units.map((u) => (
              <li key={u.name}>
                <span>
                  {unitLine(u)}
                  {u.source === 'mine' && <span className="fs-unit-tag">yours</span>}
                  {u.source?.startsWith('Portie') && <span className="fs-unit-tag">Portie-online</span>}
                  {/* Where Portie-online's units sit beside others, each says its source. */}
                  {mixed && u.source === 'USDA FoodData Central' && <span className="fs-unit-tag">USDA</span>}
                  {/* 'GetIt:' marks a unit the app worked out itself: a data tag in the
                      catalogue (applied migrations), kept from before the name Hemlo. */}
                  {mixed && u.source?.startsWith('GetIt:') && <span className="fs-unit-tag">worked out</span>}
                </span>
                {removable(u) && (
                  <button type="button" className="re-remove" aria-label={`Remove the unit ${u.name}`} disabled={busy}
                    onClick={() => void save(removeUnit(units, u.name))}>×</button>
                )}
              </li>
            ))}
          </ul>
        )}
      {canAdd && units.length < MAX_UNITS && !adding && (
        <button type="button" className="slot-link fu-open" onClick={() => setAdding(true)}>+ Add a unit</button>
      )}
      {canAdd && units.length < MAX_UNITS && adding && (
        <form className="fu-add" onSubmit={(e) => void add(e)} style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <div className="fu-form">
            <label>Unit
              <input value={form.name} maxLength={UNIT_NAME_MAX} placeholder={word} autoComplete="off"
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(null) }} />
            </label>
            <label>One weighs, g
              <input value={form.g} inputMode="decimal" autoComplete="off"
                onChange={(e) => { setForm({ ...form, g: e.target.value }); setError(null) }} />
            </label>
          </div>
          {/* The plural is worked out (CALM-08): only an odd one is typed. */}
          <MoreOptions open={!!form.plural.trim()} summary={form.plural.trim() ? `Plural ${form.plural.trim()}` : null}>
            <div className="fu-form is-one">
              <label>Plural, if odd
                <input value={form.plural} maxLength={UNIT_NAME_MAX} placeholder={pluralOf(form.name.trim() || word)} autoComplete="off"
                  onChange={(e) => setForm({ ...form, plural: e.target.value })} />
              </label>
            </div>
          </MoreOptions>
          {error && <p className="amt-hint is-warn" role="alert">{error}</p>}
          <p className="fu-facts">
            {shared ? 'Your own units on a shared food stay with you. ' : ''}Amounts already saved keep their grams.
          </p>
          <div className="fu-do">
            <button type="button" className="btn" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !form.name.trim() || !form.g.trim()}>Add unit</button>
          </div>
        </form>
      )}
    </>
  )
}

/** The same sheet under its plainer name. */
export const FoodSheet = FoodUnitsSheet
