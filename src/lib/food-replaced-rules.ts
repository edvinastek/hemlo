/** Old shared foods that a newer catalogue replaced (migration 027): rows
 *  on this device that still point at one are pointed at its replacement.
 *  Pure, checked in src/test/foodreplaced.check.mjs; the database side is in
 *  food-replaced.ts. The server moves its own rows in the migration; this
 *  covers what this device made before it caught up (a meal logged offline)
 *  and its waiting edits. */

/** Each old id to the food it ends up as, following a replacement that was
 *  itself replaced later (at most a few steps; a loop is cut). */
export function replacementMap(foods: { id: string; replaced_by?: string | null }[]): Map<string, string> {
  const direct = new Map<string, string>()
  for (const f of foods) if (f.replaced_by && f.replaced_by !== f.id) direct.set(f.id, f.replaced_by)
  const out = new Map<string, string>()
  for (const [from] of direct) {
    let to = direct.get(from)!
    const seen = new Set([from])
    while (direct.has(to) && !seen.has(to) && seen.size < 6) { seen.add(to); to = direct.get(to)! }
    if (to !== from) out.set(from, to)
  }
  return out
}

/** The value with every string that is an old id changed to its new one,
 *  at any depth. The same value comes back when nothing changed. */
export function swapMany(v: unknown, map: Map<string, string>): unknown {
  if (typeof v === 'string') return map.get(v) ?? v
  if (Array.isArray(v)) {
    const out = v.map((x) => swapMany(x, map))
    return out.some((x, i) => x !== v[i]) ? out : v
  }
  if (v && typeof v === 'object') {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const y = swapMany(x, map)
      if (y !== x) changed = true
      out[k] = y
    }
    return changed ? out : v
  }
  return v
}

/** The fields of a row that pointed at an old food, now pointing at the
 *  new one; null when the row did not point at any. */
export function movedFields(row: Record<string, unknown>, fields: string[], map: Map<string, string>): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {}
  for (const f of fields) {
    const next = swapMany(row[f], map)
    if (next !== row[f]) changes[f] = next
  }
  return Object.keys(changes).length ? changes : null
}

/** A short fingerprint of the replacements, so the device only looks
 *  through its rows again when the catalogue's replacements change. */
export function mapKey(map: Map<string, string>): string {
  let h = 0
  const text = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, b]) => `${a}>${b}`).join(',')
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return `${map.size}:${(h >>> 0).toString(16)}`
}
