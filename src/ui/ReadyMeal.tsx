import { useId, useState } from 'react'
import { useApp } from '../lib/store'
import { portionChoices } from '../lib/ready-meal-rules'
import { saveReadyMeal } from '../lib/ready-meals'
import type { Product } from '../lib/products-rules'
import type { Food, Recipe } from '../lib/types'

/** "Save as ready meal" (PROD-10): a pack bought ready to eat becomes a
 *  recipe of one portion, the whole pack or the serving it states, logged
 *  and planned like any recipe after that. Shown in place, never as a
 *  second sheet. */
export function ReadyMealForm({ food, product, onSaved, onCancel }: {
  food: Food
  product?: Pick<Product, 'pack' | 'packUnit' | 'serving'> | null
  onSaved: (recipe: Recipe, existed: boolean) => void
  onCancel: () => void
}) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const choices = portionChoices({
    pack: product?.pack ?? food.pack_size_g ?? null, packUnit: product?.packUnit ?? (food.per_ml ? 'ml' : 'g'),
    serving: product?.serving ?? null, units: food.units,
  })
  const [pick, setPick] = useState<'pack' | 'serving' | 'own'>(choices[0]?.key ?? 'own')
  const [grams, setGrams] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const name = useId()
  const typed = Number(grams.replace(',', '.'))
  const portion = pick === 'own'
    ? (typed > 0 && typed <= 5000 ? { grams: typed, unit: null } : null)
    : choices.find((c) => c.key === pick) ?? null

  async function save() {
    if (!portion || !userId || busy) { if (!userId) setProblem('Sign in to keep ready meals.'); return }
    setBusy(true)
    try {
      const { recipe, existed } = await saveReadyMeal(food, portion, userId)
      onSaved(recipe, existed)
    } catch {
      setProblem('The ready meal could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rm" role="group" aria-labelledby={name}>
      <p className="rm-title" id={name}>Save {food.name} as a ready meal</p>
      <p className="row-meta">It joins your recipes, so it can be logged, planned and shopped for in one tap. One portion is:</p>
      <div className="rm-choices">
        {choices.map((c) => (
          <label key={c.key} className="rm-choice">
            <input type="radio" name={`${name}-portion`} checked={pick === c.key} onChange={() => setPick(c.key)} />
            {c.label}
          </label>
        ))}
        <label className="rm-choice">
          <input type="radio" name={`${name}-portion`} checked={pick === 'own'} onChange={() => setPick('own')} />
          Another amount
        </label>
        {pick === 'own' && (
          <label className="rm-own">
            <span>One portion, g</span>
            <input type="text" inputMode="decimal" autoComplete="off" value={grams} autoFocus onChange={(e) => setGrams(e.target.value)} />
          </label>
        )}
      </div>
      {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
      <div className="rm-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!portion || busy} onClick={() => void save()}>Save ready meal</button>
      </div>
    </div>
  )
}
