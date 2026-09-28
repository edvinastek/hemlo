import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../lib/db'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { recipeMacros } from '../lib/calc'
import { authorLabel, cleanNote, macroLine, NOTE_MAX } from '../lib/sharing-rules'
import { entryText, readUnits } from '../lib/units-rules'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import '../ui/sharing.css'

interface Waiting {
  recipe: Recipe
  lines: RecipeLine[]
  author: string
}

/** Recipes people proposed to everyone, for the app's owner to approve or
 *  decline. Shown only to a reviewer (a row in app_admin, which the app can
 *  read for its own account only). Reviewing happens on the server, so it
 *  needs a connection; everyone else never sees this section. */
export function RecipeReview() {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const online = useApp((s) => s.online)
  // Remembered per account, so a reviewer offline still sees why the queue
  // is not there rather than nothing at all.
  const [reviewer, setReviewer] = useState<boolean>(false)
  const [queue, setQueue] = useState<Waiting[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])

  useEffect(() => {
    if (!userId) return
    let live = true
    void getMeta<boolean>(`reviewer:${userId}`, false).then((v) => { if (live && v) setReviewer(true) })
    if (online) {
      void supabase.from('app_admin').select('user_id').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
        // A server without the table (before migration 019) answers with an
        // error: not a reviewer.
        const yes = !error && !!data
        if (!live) return
        setReviewer(yes)
        void setMeta(`reviewer:${userId}`, yes)
      })
    }
    return () => { live = false }
  }, [userId, online])

  const load = useCallback(async () => {
    setError(null)
    const { data: waiting, error: qErr } = await supabase.rpc('recipe_review_queue')
    if (qErr) { setError('The queue could not be read. ' + qErr.message); return }
    const list = (waiting ?? []) as { id: string; author: string | null }[]
    if (list.length === 0) { setQueue([]); return }
    const ids = list.map((w) => w.id)
    const [recipes, lines] = await Promise.all([
      supabase.from('recipe').select('*').in('id', ids),
      supabase.from('recipe_line').select('*').in('recipe_id', ids),
    ])
    if (recipes.error || lines.error) { setError('The recipes could not be read.'); return }
    const byId = new Map((recipes.data as Recipe[]).map((r) => [r.id, r]))
    setQueue(list.filter((w) => byId.has(w.id)).map((w) => ({
      recipe: byId.get(w.id)!,
      lines: (lines.data as RecipeLine[]).filter((l) => l.recipe_id === w.id).sort((a, b) => a.sort_order - b.sort_order),
      author: authorLabel(w.author),
    })))
  }, [])

  useEffect(() => { if (reviewer && online) void load() }, [reviewer, online, load])

  if (!reviewer) return null
  return (
    <>
      <p className="section-title">Recipes to review{queue ? ` (${queue.length})` : ''}</p>
      {!online && <p className="empty">Reviewing needs a connection. The queue shows once you are online.</p>}
      {online && error && <p className="empty" style={{ color: 'var(--e-warn)' }}>{error}</p>}
      {online && queue && queue.length === 0 && <p className="empty">Nothing waiting. Proposed recipes appear here.</p>}
      {online && queue?.map((w) => (
        <ReviewCard key={w.recipe.id} item={w} foods={foodMap}
          onDone={() => setQueue((q) => q?.filter((x) => x.recipe.id !== w.recipe.id) ?? null)} />
      ))}
    </>
  )
}

function ReviewCard({ item, foods, onDone }: { item: Waiting; foods: Map<string, Food>; onDone: () => void }) {
  const { recipe, lines, author } = item
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const per = recipeMacros(lines, foods)
  const missing = lines.filter((l) => l.food_id && !foods.has(l.food_id)).length

  async function decide(approve: boolean) {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('review_recipe', { recipe_id: recipe.id, approve, note: cleanNote(note) })
    setBusy(false)
    if (error) { setError(error.message); return }
    onDone()
  }

  return (
    <article className="rv-card" aria-label={`Proposed recipe: ${recipe.name}`}>
      <h3>{recipe.name}</h3>
      <div className="row-meta">
        By {author}{recipe.role ? ` · ${recipe.role}` : ''} · {Number(recipe.portions_per_batch)} portion{Number(recipe.portions_per_batch) === 1 ? '' : 's'} a batch
        {recipe.cook_minutes ? ` · ${recipe.cook_minutes} min` : ''}
      </div>
      <div className="row-meta">One portion: {macroLine(per)}{missing > 0 ? ` (${missing} ingredient${missing === 1 ? '' : 's'} not counted)` : ''}</div>
      <ul className="rv-lines" aria-label="Ingredients per portion">
        {lines.map((l) => (
          <li key={l.id}>
            {(l.food_id && foods.get(l.food_id)?.name) || l.raw_text || 'A food not on this device'}
            {l.grams_per_portion === null ? ''
              : l.unit ? ` · ${entryText({ grams: Number(l.grams_per_portion), unit: l.unit, unit_qty: l.unit_qty }, readUnits(l.food_id ? foods.get(l.food_id)?.units : null))}`
              : ` · ${Number(l.grams_per_portion)} g`}
          </li>
        ))}
      </ul>
      {recipe.steps && <p className="rv-steps">{recipe.steps}</p>}
      <input className="rv-note" type="text" value={note} maxLength={NOTE_MAX} placeholder="Note to the author (optional)"
        aria-label={`Note to the author of ${recipe.name}`} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="row-meta" style={{ color: 'var(--e-warn)' }}>{error}</div>}
      <div className="rv-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void decide(false)}>Decline</button>
        <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void decide(true)}>Approve</button>
      </div>
    </article>
  )
}
