/** The build trims moment-timezone's data to the years the calendar reaches
 *  (vite.config.ts). Trimming merges zones that agree from 2000 on into
 *  links, and can leave a link pointing at a name that is itself only a
 *  link now (Europe/Amsterdam → Europe/Brussels → Europe/Paris).
 *  moment-timezone follows a link one step only, so such a name would have
 *  no data ("Moment Timezone has no data for Europe/Amsterdam") and the
 *  holiday library would log an error for it. This rewrites the links so
 *  every name is linked straight to a zone that has data.
 *
 *  `zones` are packed zone strings ("Name|abbrs|…"); `links` are "A|B"
 *  pairs meaning A and B are the same zone. */
export function flattenLinks(zones: string[], links: string[]): string[] {
  const real = new Set(zones.map((z) => z.split('|')[0]))
  // Names that are the same zone, joined in groups (union-find).
  const parent = new Map<string, string>()
  const find = (n: string): string => {
    let at = n
    while (parent.has(at) && parent.get(at) !== at) at = parent.get(at)!
    // Shorten the path walked, so later finds are quick.
    let step = n
    while (step !== at) { const next = parent.get(step)!; parent.set(step, at); step = next }
    return at
  }
  const join = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const link of links) {
    const [a, b] = link.split('|')
    if (a && b) join(a, b)
  }
  // Each group's zone with data: the first real one met, in name order so
  // the result does not depend on the order of the links.
  const zoneOf = new Map<string, string>()
  for (const name of [...parent.keys()].sort()) {
    const root = find(name)
    if (real.has(name) && !zoneOf.has(root)) zoneOf.set(root, name)
  }
  const out: string[] = []
  for (const name of [...parent.keys()].sort()) {
    const zone = zoneOf.get(find(name))
    // A group with no zone at all has no data to give; it is left out.
    if (zone && zone !== name && !real.has(name)) out.push(`${zone}|${name}`)
  }
  return out
}
