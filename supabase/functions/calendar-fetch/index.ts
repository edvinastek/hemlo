// Google Calendar (or any calendar) → GetIt: fetch one followed calendar.
//
// A browser may not read another site's calendar file (no CORS), so the app
// asks this function to fetch it. The caller must be signed in, and the
// subscription is read with the caller's own sign-in, so row-level security
// decides whether it is theirs. The file is returned as it is; the app reads
// it with the same rules as its calendar import (src/lib/ics-rules.ts) and
// keeps the events on the device.
//
// The server fetching an address someone typed is how servers get tricked
// into reaching their own private network (server-side request forgery). So:
// https only, on the usual port, no name and password in the address; the
// name must lead only to public internet addresses (IPv4 and IPv6, checked
// with the same rules the app tests); at most 3 redirects, each checked the
// same way; 10 seconds in all; at most 3 MB; and the answer must be a calendar.
//
// Deploy with JWT verification on:
//   supabase functions deploy calendar-fetch
// SUPABASE_URL and SUPABASE_ANON_KEY are set by Supabase itself.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ipLiteral, isPublicIp, looksLikeCalendar, normaliseCalendarUrl } from '../_shared/calendar-links-rules.ts'

const MAX_BYTES = 3 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** A reason the person can act on; anything else is reported more vaguely. */
class Problem extends Error {}
const PRIVATE = 'That address points at a private network, so it cannot be followed.'

/** Hosts known to be public calendar servers. Used only if this runtime
 *  cannot look names up, so the check fails closed for everything else. */
const KNOWN = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /^outlook\.(office365|live)\.com$/, /^outlook\.office\.com$/]

async function checkHost(u: URL): Promise<void> {
  const host = u.hostname.toLowerCase()
  const literal = ipLiteral(host)
  if (literal !== null) {
    if (!isPublicIp(literal)) throw new Problem(PRIVATE)
    return
  }
  if (typeof Deno.resolveDns !== 'function') {
    if (KNOWN.some((r) => r.test(host))) return
    throw new Problem('GetIt could not check where that address leads, so it was not fetched.')
  }
  const found = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')])
  const addresses = found.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (addresses.length === 0) throw new Problem('That address’s server could not be found. Check the address.')
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

async function fetchCalendar(address: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let current = address
  for (let hop = 0; ; hop++) {
    const checked = normaliseCalendarUrl(current)
    if (!checked.ok) throw new Problem(checked.error)
    const url = new URL(checked.url)
    await checkHost(url)
    const res = await fetch(url.href, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'User-Agent': 'GetIt-calendar/1.0' },
    })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel()
      const next = res.headers.get('location')
      if (!next) throw new Problem('The calendar’s server sent GetIt on without saying where.')
      if (hop >= MAX_REDIRECTS) throw new Problem('The calendar’s server sent GetIt on too many times.')
      current = new URL(next, url).href
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
    const text = new TextDecoder('utf-8').decode(await readCapped(res))
    if (!looksLikeCalendar(text)) {
      throw new Problem('That address does not give a calendar file. In Google Calendar, use the “Secret address in iCal format”.')
    }
    return text
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Sign in first.' }, 401)
  const key = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  // The caller's own sign-in: row-level security applies to everything below.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: who, error: whoErr } = await sb.auth.getUser(auth.slice(7))
  if (whoErr || !who?.user) return json({ ok: false, error: 'Sign in first.' }, 401)

  let id: unknown
  try { id = (await req.json())?.subscription_id } catch { id = null }
  if (typeof id !== 'string' || !UUID.test(id)) return json({ ok: false, error: 'Which calendar?' }, 400)

  const { data: sub, error } = await sb.from('calendar_subscription').select('id, url, deleted_at').eq('id', id).maybeSingle()
  if (error) return json({ ok: false, error: 'The calendar could not be read. Try again later.' }, 503)
  if (!sub || sub.deleted_at) return json({ ok: false, error: 'No such calendar.' }, 404)

  let ics: string | null = null
  let problem: string | null = null
  try {
    ics = await fetchCalendar(String(sub.url))
  } catch (e) {
    if (e instanceof Problem) problem = e.message
    else if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      problem = 'The calendar took more than 10 seconds to answer. It will be tried again later.'
    } else {
      console.error('calendar-fetch', e instanceof Error ? e.message : e)
      problem = 'The calendar could not be fetched. It will be tried again later.'
    }
  }
  const at = new Date().toISOString()
  await sb.from('calendar_subscription')
    .update(problem ? { last_error: problem.slice(0, 300) } : { last_synced_at: at, last_error: null })
    .eq('id', id)
  // A calendar that could not be fetched is an answer, not a failure of this
  // function: 200, with the reason for the person to read.
  return problem ? json({ ok: false, error: problem, at }) : json({ ok: true, ics, fetched_at: at })
})
