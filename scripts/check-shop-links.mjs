// Checks that the links Hemlo gives to the shops' own pages still lead
// somewhere (PRICE-09): every chain's weekly offers page, and its site search
// with one harmless word ("melk", "milch"). Run monthly by
// .github/workflows/shop-links.yml, which fails, and so sends GitHub's failure
// email, when a link is broken.
//
//   node --experimental-strip-types --max-http-header-size=65536 scripts/check-shop-links.mjs
//
// (Some shops send more headers than Node takes by default; behind a proxy,
// as on a developer's machine, add NODE_USE_ENV_PROXY=1.)
//
// What counts:
//   broken          404 or 410, or the site's name no longer exists (DNS): fix
//                   the link in src/lib/shops-rules.ts (LINKS).
//   could not check 403 or 429 (the shop's bot protection turns robots away),
//                   other answers, time-outs; or the site's robots.txt asks
//                   robots not to open that page, which this script respects.
//                   A warning, not a failure: open the link by hand now and then.
//   moved?          a deep link that now ends on the site's home page.
//
// One request per page, one at a time, a pause between requests to the same
// site, nothing read from the page but the answer's status: a link check,
// not a crawl. Nothing is copied from any shop.
import { pathToFileURL } from 'node:url'
import { LINKS, LINKS_CHECKED } from '../src/lib/shops-rules.ts'

export const AGENT = 'Hemlo-link-check/1.0 (monthly check that the shop links in the Hemlo app still work; one request per page)'
const WORD = { NL: 'melk', BE: 'melk', DE: 'milch' }
const PAUSE_MS = 1500
const TIMEOUT_MS = 20000

/** Every link to ask about, each address once (Coop's are Plus's). */
export function linksToCheck(links = LINKS) {
  const out = []
  const seen = new Set()
  for (const [country, chains] of Object.entries(links)) {
    for (const [chain, l] of Object.entries(chains)) {
      const pages = [['offers', l.offers], ['search', l.search?.replace('{q}', encodeURIComponent(WORD[country] ?? 'milk'))]]
      for (const [kind, url] of pages) {
        if (!url || seen.has(url)) continue
        seen.add(url)
        out.push({ country, chain, kind, url })
      }
    }
  }
  return out
}

/** What an answer means for a link: 'ok', 'broken', 'unchecked' (a warning)
 *  or 'moved' (a warning). `error` is a failed request's code. */
export function judge({ status = null, error = null, from = null, to = null }) {
  if (error) {
    if (['ENOTFOUND', 'EAI_NONAME', 'ERR_NAME_NOT_RESOLVED'].includes(error)) return { verdict: 'broken', why: 'the site’s name no longer exists' }
    return { verdict: 'unchecked', why: `no answer (${error})` }
  }
  if (status === 404 || status === 410) return { verdict: 'broken', why: `${status} not found` }
  if (status === 403 || status === 429 || status === 401) return { verdict: 'unchecked', why: `${status}: the site turns robots away` }
  if (status === null || status < 200 || status >= 400) return { verdict: 'unchecked', why: `answered ${status}` }
  if (from && to) {
    const a = new URL(from)
    const b = new URL(to)
    if (a.pathname.length > 1 && b.pathname === '/' && !b.search) return { verdict: 'moved', why: `now leads to the home page ${b.origin}/` }
  }
  return { verdict: 'ok', why: String(status) }
}

/** Does a robots.txt let a robot called `agent` open `path` (with its
 *  query)? The group for the agent's own name if there is one, else "*";
 *  the longest matching rule wins, Allow on a tie; "*" and "$" as Google
 *  reads them. No robots.txt (or none readable) allows everything. */
export function robotsAllows(text, path, agent = AGENT) {
  if (!text) return true
  const name = agent.split('/')[0].toLowerCase()
  const groups = []
  let current = null
  let lastWasAgent = false
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else {
      lastWasAgent = false
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value })
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  let best = null
  for (const r of rules) {
    if (!r.path) continue
    const end = r.path.endsWith('$')
    const body = (end ? r.path.slice(0, -1) : r.path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    const pattern = new RegExp(`^${body}${end ? '$' : ''}`)
    if (!pattern.test(path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return best ? best.allow : true
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchRobots(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** One page: the status of the last answer after following redirects
 *  (at most five), and where it ended. The page itself is not read. */
async function ask(url) {
  let at = url
  for (let hop = 0; hop < 6; hop++) {
    let res
    try {
      res = await fetch(at, { redirect: 'manual', headers: { 'user-agent': AGENT, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (e) {
      const code = e?.cause?.code ?? (e?.name === 'TimeoutError' ? 'time-out' : e?.code ?? 'failed')
      return { error: code, to: at }
    }
    await res.body?.cancel().catch(() => {})
    const next = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && next) { at = new URL(next, at).href; continue }
    return { status: res.status, to: at }
  }
  return { status: 310, to: at }
}

async function main() {
  const links = linksToCheck()
  const robots = new Map()
  const lastAsked = new Map()
  const results = []
  console.log(`Checking ${links.length} shop links (table last checked by hand ${LINKS_CHECKED}).\n`)
  for (const l of links) {
    const u = new URL(l.url)
    if (!robots.has(u.origin)) robots.set(u.origin, await fetchRobots(u.origin))
    let r
    if (!robotsAllows(robots.get(u.origin), u.pathname + u.search)) {
      r = { verdict: 'unchecked', why: 'the site’s robots.txt asks robots not to open it' }
    } else {
      const wait = PAUSE_MS - (Date.now() - (lastAsked.get(u.host) ?? 0))
      if (wait > 0) await sleep(wait)
      const answer = await ask(l.url)
      lastAsked.set(u.host, Date.now())
      r = judge({ ...answer, from: l.url })
    }
    results.push({ ...l, ...r })
    const mark = { ok: 'ok   ', broken: 'BROKEN', unchecked: 'warn ', moved: 'moved?' }[r.verdict]
    console.log(`${mark} ${l.country} ${l.chain} ${l.kind}: ${l.url} — ${r.why}`)
  }

  const broken = results.filter((r) => r.verdict === 'broken')
  const warned = results.filter((r) => r.verdict === 'unchecked' || r.verdict === 'moved')
  const line = (r) => `${r.country} ${r.chain} (${r.kind}): ${r.url} — ${r.why}`
  console.log(`\n${results.length - broken.length - warned.length} fine, ${warned.length} could not be checked or may have moved, ${broken.length} broken.`)
  if (process.env.GITHUB_ACTIONS) {
    for (const r of broken) console.log(`::error title=Broken shop link::${line(r)}`)
    for (const r of warned) console.log(`::warning title=Shop link not checked::${line(r)}`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    const md = [
      '## Shop links', '',
      broken.length ? `**${broken.length} broken** — fix them in \`src/lib/shops-rules.ts\` (LINKS):` : 'No broken links.',
      ...broken.map((r) => `- ${line(r)}`), '',
      warned.length ? `${warned.length} could not be checked (bot protection, robots.txt) or may have moved — worth opening by hand:` : '',
      ...warned.map((r) => `- ${line(r)}`),
    ].join('\n')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
  }
  if (broken.length) {
    console.log('\nBroken links:')
    for (const r of broken) console.log(`  ${line(r)}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
