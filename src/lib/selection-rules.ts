/** Selecting several rows at once (GEN-52, GEN-53, CALM-16), as plain rules
 *  with no React, so every case can be checked in Node
 *  (src/test/selection.check.mjs). src/ui/useSelection.ts keeps the state
 *  and feeds these.
 *
 *  The ticked ids are a Set. Rows come and go under it (a sync, a delete on
 *  another phone), so what the actions act on is always worked out from the
 *  rows on screen now: an id with no row any more is simply never acted on. */

export interface Row { id: string }

/** One row ticked or unticked. */
export function toggleOne(selected: ReadonlySet<string>, id: string, on?: boolean): Set<string> {
  const next = new Set(selected)
  const want = on ?? !next.has(id)
  if (want) next.add(id)
  else next.delete(id)
  return next
}

/** Every row on screen is ticked already. */
export function allTicked(selected: ReadonlySet<string>, shown: readonly Row[]): boolean {
  return shown.length > 0 && shown.every((r) => selected.has(r.id))
}

/** "Select all shown" ticks every row on screen; when they are all ticked
 *  already, it clears them instead. Rows ticked elsewhere (under another
 *  search) are kept either way. */
export function toggleShown(selected: ReadonlySet<string>, shown: readonly Row[]): Set<string> {
  const all = allTicked(selected, shown)
  const next = new Set(selected)
  for (const r of shown) {
    if (all) next.delete(r.id)
    else next.add(r.id)
  }
  return next
}

/** The ticked rows, in the order the list shows them. */
export function pickedRows<T extends Row>(rows: readonly T[], selected: ReadonlySet<string>): T[] {
  return rows.filter((r) => selected.has(r.id))
}

/** Ids whose rows have gone are dropped, so the count never says more than
 *  can be acted on. The same Set comes back when nothing changed, so React
 *  does not draw again for nothing. */
export function pruneGone(selected: ReadonlySet<string>, rows: readonly Row[]): ReadonlySet<string> {
  if (selected.size === 0) return selected
  const live = new Set(rows.map((r) => r.id))
  let gone = false
  for (const id of selected) if (!live.has(id)) { gone = true; break }
  if (!gone) return selected
  return new Set([...selected].filter((id) => live.has(id)))
}

/** "3 tasks selected", "1 recipe selected". `noun` is the plural. */
export function countWords(n: number, noun: string): string {
  return `${n} ${n === 1 ? singular(noun) : noun} selected`
}

/** "tasks" → "task", "entries" → "entry", "boxes" → "box". */
export function singular(noun: string): string {
  if (/ies$/.test(noun)) return noun.replace(/ies$/, 'y')
  if (/(s|x|z|ch|sh)es$/.test(noun)) return noun.replace(/es$/, '')
  return noun.replace(/s$/, '')
}

/** What a bulk delete asks before it acts: one row goes at once (Undo is
 *  there), several ask once more on the same button. */
export function deleteNeedsAsk(count: number): boolean {
  return count > 1
}

/** What "Change repeat" on several tasks did, in one line for the bar:
 *  "3 tasks now repeat: weekly on Mon", "2 tasks stopped repeating", and the
 *  ones without a day, which cannot repeat. */
export function repeatManyWords(r: { changed: number; noDay: number }, rule: string | null): string {
  const n = (k: number) => `${k} ${k === 1 ? 'task' : 'tasks'}`
  const did = r.changed === 0 ? '' : rule
    ? `${n(r.changed)} now ${r.changed === 1 ? 'repeats' : 'repeat'}: ${rule.charAt(0).toLowerCase()}${rule.slice(1)}.`
    : `${n(r.changed)} stopped repeating.`
  const left = r.noDay ? `${n(r.noDay)} without a day ${r.noDay === 1 ? 'was' : 'were'} left as ${r.noDay === 1 ? 'it was' : 'they were'}.` : ''
  return [did, left].filter(Boolean).join(' ') || 'Nothing to change.'
}
