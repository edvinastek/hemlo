// Fetching a calendar someone typed the address of, without letting the
// address reach anything but the public internet (see index.ts). Kept apart
// from the handler so it can be tried on its own with Deno.
import { errorKind, ipLiteral, isPublicIp, looksLikeCalendar, normaliseCalendarUrl } from '../_shared/calendar-links-rules.ts'

const MAX_BYTES = 3 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

/** A reason the person can act on; anything else is reported more vaguely. */
export class Problem extends Error {}

/** The calendar's server could not be reached or stopped answering. It carries
 *  only what may be logged: the kind of error and the server's name. Deno's
 *  own network errors quote the whole address, secret part and all, so they
 *  never leave this file. */
export class Unreachable extends Error {
  constructor(readonly kind: string, readonly host: string) {
    super(`${kind} at ${host}`)
    this.name = kind
  }
}
const PRIVATE = 'That address points at a private network, so it cannot be followed.'

/** Hosts known to be public calendar servers (and this project's own, whose
 *  feed links can be followed too). Used only if this runtime cannot look
 *  names up, so the check still fails closed for every other host. */
const OWN = (() => { try { return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname } catch { return '' } })()
const KNOWN = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /^outlook\.(office365|live)\.com$/, /^outlook\.office\.com$/]
const known = (host: string) => host === OWN || KNOWN.some((r) => r.test(host))
const CANNOT_CHECK = 'GetIt could not check where that address leads, so it was not fetched.'

export async function checkHost(u: URL): Promise<void> {
  const host = u.hostname.toLowerCase()
  const literal = ipLiteral(host)
  if (literal !== null) {
    if (!isPublicIp(literal)) throw new Problem(PRIVATE)
    return
  }
  if (typeof Deno.resolveDns !== 'function') {
    if (known(host)) return
    throw new Problem(CANNOT_CHECK)
  }
  const found = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')])
  const addresses = found.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (addresses.length === 0) {
    // No such name, or no way to ask (a runtime that refuses DNS lookups).
    const unanswered = found.some((r) => r.status === 'rejected' && !(r.reason instanceof Deno.errors.NotFound))
    if (unanswered && known(host)) return
    throw new Problem(unanswered ? CANNOT_CHECK : 'That address’s server could not be found. Check the address.')
  }
  if (addresses.some((a) => !isPublicIp(a))) throw new Problem(PRIVATE)
}

/** Reads a body, giving up past MAX_BYTES. */
async function readCapped(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await res.body?.cancel()
    throw new Problem('That calendar is larger than 3 MB, too large to follow.')
  }
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Problem('That calendar is larger than 3 MB, too large to follow.')
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.byteLength }
  return out
}

export async function fetchCalendar(address: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let current = address
  for (let hop = 0; ; hop++) {
    const checked = normaliseCalendarUrl(current)
    if (!checked.ok) throw new Problem(checked.error)
    const url = new URL(checked.url)
    await checkHost(url)
    let res: Response
    try {
      res = await fetch(url.href, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'User-Agent': 'GetIt-calendar/1.0' },
      })
    } catch (e) {
      throw new Unreachable(errorKind(e), url.hostname)
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel().catch(() => undefined)
      const next = res.headers.get('location')
      if (!next) throw new Problem('The calendar’s server sent GetIt on without saying where.')
      if (hop >= MAX_REDIRECTS) throw new Problem('The calendar’s server sent GetIt on too many times.')
      try {
        current = new URL(next, url).href
      } catch {
        // The error would quote the address it was sent to.
        throw new Problem('The calendar’s server sent GetIt on to something that is not an address.')
      }
      continue
    }
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel()
      throw new Problem('No calendar at that address any more. If you made a new secret address, paste the new one.')
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel()
      throw new Problem('The calendar refused. The address may be out of date: copy the secret address again.')
    }
    if (!res.ok) {
      await res.body?.cancel()
      throw new Problem(`The calendar’s server answered ${res.status}. It will be tried again later.`)
    }
    let bytes: Uint8Array
    try {
      bytes = await readCapped(res)
    } catch (e) {
      if (e instanceof Problem) throw e
      // Cut off half-way, or too slow (the 10 seconds ran out while reading).
      throw new Unreachable(errorKind(e), url.hostname)
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    if (!looksLikeCalendar(text)) {
      throw new Problem('That address does not give a calendar file. In Google Calendar, use the “Secret address in iCal format”.')
    }
    return text
  }
}
