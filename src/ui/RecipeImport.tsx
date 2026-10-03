import { useEffect, useId, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import { FoodMatcher } from '../lib/match-food'
import { planRecipes, readRecipes, toCsv, toGetItJson, toSchemaOrg } from '../lib/recipe-io-rules'
import { attributionFor } from '../lib/eu-label-rules'
import { saveFile } from '../lib/native'
import { offerUndo } from './Undo'
import { exportShape } from './RecipeView'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './recipes.css'

/** Recipes in (REC-07, DATA-05): paste a recipe's text ("200 g oats, 2
 *  eggs"), a page's source with its schema.org data, or a recipe file
 *  (GetIt's JSON, a CSV); or give a web address, which works where the site
 *  lets an app read it. Shown before anything is saved: each recipe, and
 *  which lines found a food. Lines that did not are kept as text to finish
 *  later, so nothing typed is lost. Imported recipes are the person's own
 *  and private. */
export function RecipeImport({ userId, onClose }: { userId: string; onClose: () => void }) {
  const titleId = useId()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const visible = useMemo(() => {
    const live = foods.filter((f) => !f.deleted_at && (!f.owner_id || f.owner_id === userId))
    // The person's own foods first, so their "Oats" is found before the shared one.
    return [...live.filter((f) => f.owner_id), ...live.filter((f) => !f.owner_id)]
  }, [foods, userId])
  const matcher = useMemo(() => new FoodMatcher(visible), [visible])
  const read = useMemo(() => readRecipes(text), [text])
  const planned = useMemo(() => planRecipes(read.recipes, visible, (n) => matcher.match(n).food), [read, visible, matcher])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function fetchUrl() {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) { setProblem('A web address starts with https://'); return }
    setBusy(true); setProblem(null)
    try {
      const res = await fetch(u)
      if (!res.ok) throw new Error(String(res.status))
      setText(await res.text())
    } catch {
      setProblem('That site does not let an app read its pages. Open the page in a browser, choose "View source" (or Share → Copy), and paste it here.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseFile(file: File) {
    setProblem(null)
    if (file.size > 2_000_000) { setProblem('That file is larger than 2 MB: it is not a recipe file.'); return }
    setText(await file.text())
  }

  async function save() {
    if (busy || planned.length === 0) return
    setBusy(true)
    try {
      const made: Recipe[] = []
      for (const p of planned) {
        const r = await edit('recipe', { id: crypto.randomUUID() } as Recipe, {
          owner_id: userId, name: p.name, role: p.role, portions_per_batch: p.portions_per_batch, cook_minutes: p.cook_minutes,
          steps: p.steps, sharing: 'private', deleted_at: null,
        })
        made.push(r)
        let i = 0
        for (const l of p.lines) {
          await edit('recipe_line', { id: crypto.randomUUID() } as RecipeLine, {
            recipe_id: r.id, food_id: l.food_id, raw_text: l.raw_text, grams_per_portion: l.grams_per_portion, state: l.state, note: l.note,
            sort_order: i++, ...(l.unit && l.unit_qty ? { unit: l.unit, unit_qty: l.unit_qty } : {}),
          })
        }
      }
      offerUndo(`Imported ${made.length} ${made.length === 1 ? 'recipe' : 'recipes'}`, async () => {
        for (const r of made) await edit('recipe', r, { deleted_at: new Date().toISOString() })
      })
      onClose()
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The recipes could not be saved on this phone.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Import recipes</h2>
        <div className="form-grid">
          <label>
            Paste a recipe
            <textarea value={text} rows={6} placeholder={'Banana pancakes\n1 banana\n2 eggs\n30 g oats\nMethod\nMash and fry.'}
              onChange={(e) => { setText(e.target.value); setProblem(null) }} style={{ fontFamily: 'var(--font-sans)', fontSize: 14 }} />
          </label>
          <p className="fe-note">Its text, a recipe page’s source (schema.org recipe data is read), or a GetIt or CSV recipe file.</p>
          <div className="rv-actions">
            <label className="btn" style={{ cursor: 'pointer' }}>
              Choose a file
              <input type="file" accept=".json,.csv,.txt,.html,.htm" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void chooseFile(f) }} />
            </label>
          </div>
          <div className="two">
            <label>Or a web address<input type="url" inputMode="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} /></label>
            <button type="button" className="btn" style={{ alignSelf: 'end', minHeight: 44 }} disabled={busy || !url.trim()} onClick={() => void fetchUrl()}>Read the page</button>
          </div>
          {problem && <p className="re-error" role="alert">{problem}</p>}

          {text.trim() && (
            planned.length === 0
              ? <p className="fe-note">No recipe found in that ({read.kind}).</p>
              : (
                <div>
                  <p className="rv-section">Found · {read.kind}</p>
                  <ul className="rv-list">
                    {planned.map((p, i) => (
                      <li key={i} style={{ display: 'grid', gap: 2 }}>
                        <span className="row-name" style={{ fontSize: 15 }}>{p.name}</span>
                        <span className="fe-note">
                          {p.portions_per_batch} {p.portions_per_batch === 1 ? 'portion' : 'portions'} · {p.matched} of {p.lines.length} ingredients found
                          {p.unmatched.length ? `; kept as text to finish: ${p.unmatched.slice(0, 4).join(', ')}${p.unmatched.length > 4 ? ` and ${p.unmatched.length - 4} more` : ''}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary grow" disabled={busy || planned.length === 0} onClick={() => void save()}>
            {planned.length > 1 ? `Import ${planned.length} recipes` : 'Import'}
          </button>
        </div>
      </div>
    </>
  )
}

/** Every recipe the person can see, out (DATA-05), as one file. */
export async function exportRecipes(kind: 'json' | 'csv' | 'schema', recipes: Recipe[], lines: RecipeLine[], foods: Map<string, Food>) {
  const shapes = recipes.map((r) => exportShape(r, lines, foods, ['kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'fiber_g', 'salt_g']))
  const used = lines.filter((l) => recipes.some((r) => r.id === l.recipe_id)).flatMap((l) => (l.food_id && foods.get(l.food_id) ? [foods.get(l.food_id)!] : []))
  const attribution = attributionFor(used)
  const body = kind === 'json' ? toGetItJson(shapes, attribution) : kind === 'csv' ? toCsv(shapes)
    : JSON.stringify(shapes.map((s) => toSchemaOrg(s, attribution)), null, 2)
  const day = new Date().toISOString().slice(0, 10)
  return saveFile(kind === 'json' ? `recipes-${day}.getit-recipes.json` : kind === 'csv' ? `recipes-${day}.csv` : `recipes-${day}.schema.json`,
    new Blob([body], { type: kind === 'csv' ? 'text/csv' : 'application/json' }))
}
