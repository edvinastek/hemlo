/** Reading a recipe from a web address (REC-07): which addresses are tried,
 *  what a fetched page must hold, and what to say when it fails. Pure,
 *  checked in src/test/recipefetch.check.mjs. The fetching itself is in
 *  recipe-fetch.ts: through the phone's own connection in the app (no
 *  browser rules), an ordinary fetch on the web, where most recipe sites do
 *  not allow it and pasting the recipe is the way. */

/** The most of a page read: a recipe page with its pictures' markup is well
 *  under this; anything larger is not a recipe page. */
export const PAGE_MAX = 3_000_000

/** Addresses on the person's own network or machine are never fetched. */
function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  // An IPv6 literal: loopback, link-local and unique-local.
  return h.includes(':') && (h === '::1' || /^f[cd]/.test(h) || /^fe80/.test(h))
}

/** A typed web address, tidied ("bbcgoodfood.com/recipes/x" gets https://),
 *  or what is wrong with it. */
export function checkRecipeUrl(text: string): { url: string } | { error: string } {
  let t = text.trim()
  if (!t) return { error: 'Type or paste the recipe’s web address.' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`
  let u: URL
  try { u = new URL(t) } catch { return { error: 'That is not a web address.' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'A web address starts with https://' }
  if (!u.hostname.includes('.') && !u.hostname.includes(':')) return { error: 'That is not a web address.' }
  if (privateHost(u.hostname)) return { error: 'That address is on your own network: GetIt reads public recipe pages only.' }
  u.hash = ''
  return { url: u.toString() }
}

/** A fetched page, if it holds recipe data GetIt can read (schema.org, as
 *  nearly every recipe site publishes), or what to say. */
export function readPage(body: unknown): { html: string } | { error: string } {
  if (typeof body !== 'string' || !body.trim()) return { error: 'That page came back empty.' }
  if (body.length > PAGE_MAX) return { error: 'That page is too large to be a recipe page.' }
  if (!/<script[^>]*application\/ld\+json/i.test(body)) {
    return { error: 'That page has no recipe data GetIt can read. Copy the recipe’s ingredients and paste them above.' }
  }
  return { html: body }
}

export type FetchFailure = 'offline' | 'blocked' | 'status' | 'timeout'

/** What to say when a page could not be read. On the web a site that sends
 *  no permission for other pages to read it looks like a network failure. */
export function fetchProblem(kind: FetchFailure, opts: { status?: number; web?: boolean } = {}): string {
  switch (kind) {
    case 'offline': return 'You are offline. Paste the recipe instead, or try again when you are back online.'
    case 'timeout': return 'The site took too long to answer. Try again, or paste the recipe instead.'
    case 'status':
      return opts.status === 404 ? 'There is no page at that address.'
        : opts.status === 401 || opts.status === 403 ? 'That site turned GetIt away. Open the page, copy the recipe and paste it above.'
          : `The site answered with an error (${opts.status ?? 'unknown'}). Try again later, or paste the recipe instead.`
    case 'blocked':
      return opts.web
        ? 'That site does not let a web page read it. The GetIt app on your phone can; here, open the page, copy the recipe and paste it above.'
        : 'That page could not be read. Open it, copy the recipe and paste it above.'
  }
}

/** The site's name, for "Read from bbcgoodfood.com". */
export const siteOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
