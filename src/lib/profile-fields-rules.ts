/** Profile fields typed in Settings, read the way they are meant. Pure. */

/** Height as typed (HLT-06): empty is "not known" (null), never 0; a number
 *  from 50 to 260 cm (a comma counts as a point); anything else is refused
 *  (undefined), and nothing is saved. */
export function heightFrom(v: string): number | null | undefined {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 50 && n <= 260 ? Math.round(n * 10) / 10 : undefined
}
