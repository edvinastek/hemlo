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
// The address is a secret (anyone with it can read the calendar), so it never
// goes in a log or in the error kept and shown: a log line names only the kind
// of error and the server's name (logLine), and every message is passed
// through withoutAddresses first.
//
// Deploy with JWT verification on:
//   supabase functions deploy calendar-fetch
// SUPABASE_URL and SUPABASE_ANON_KEY are set by Supabase itself.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { hostOf, logLine, withoutAddresses } from '../_shared/calendar-links-rules.ts'
import { Problem, Unreachable, fetchCalendar } from './fetch-calendar.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

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
  // A removed calendar has no address left (024).
  if (!sub || sub.deleted_at || typeof sub.url !== 'string') return json({ ok: false, error: 'No such calendar.' }, 404)

  let ics: string | null = null
  let problem: string | null = null
  try {
    ics = await fetchCalendar(sub.url)
  } catch (e) {
    if (e instanceof Problem) problem = e.message
    else if (['TimeoutError', 'AbortError'].includes(e instanceof Unreachable ? e.kind : e instanceof DOMException ? e.name : '')) {
      problem = 'The calendar took more than 10 seconds to answer. It will be tried again later.'
    } else {
      // The server's name, from the hop that failed when known; never the path.
      console.error(logLine('calendar-fetch', e, e instanceof Unreachable ? e.host : hostOf(sub.url)))
      problem = 'The calendar could not be fetched. It will be tried again later.'
    }
  }
  if (problem) problem = withoutAddresses(problem).slice(0, 300)
  const at = new Date().toISOString()
  await sb.from('calendar_subscription')
    .update(problem ? { last_error: problem } : { last_synced_at: at, last_error: null })
    .eq('id', id)
  // A calendar that could not be fetched is an answer, not a failure of this
  // function: 200, with the reason for the person to read.
  return problem ? json({ ok: false, error: problem, at }) : json({ ok: true, ics, fetched_at: at })
})
