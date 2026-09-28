// GetIt → Google Calendar: the private feed link.
//
// Google Calendar ("Other calendars → From URL") fetches this address every
// few hours, without signing in, so the token in the address is the only key.
// It is looked up by its SHA-256 hash (the database never holds the token
// itself), and a wrong or missing token gets a plain 404 that says nothing
// about why. The file is built by the same rules the app uses for its own
// calendar export (_shared/, copied from src/lib by scripts/copy-shared.mjs).
//
// Deploy with JWT verification off: Google sends no sign-in.
//   supabase functions deploy calendar-feed --no-verify-jwt
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase itself. The
// service role reads past row-level security, so every query below is limited
// to the one profile the token belongs to.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  buildFeed, feedWindow, isFeedToken,
  type FeedEvent, type FeedException, type FeedSeries, type FeedTask,
} from '../_shared/calendar-links-rules.ts'
import { cleanZone, utcToWall } from '../_shared/ics-rules.ts'
import { addDays } from '../_shared/series-rules.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const plain = (status: number, text: string, extra: Record<string, string> = {}) =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } })
const notFound = () => plain(404, 'Not found')

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Page = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> }

/** Every row a query finds, a thousand at a time (the API's page size). */
async function all<T>(query: () => Page, cap = 20000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'Method not allowed', { Allow: 'GET, HEAD' })
  const token = new URL(req.url).searchParams.get('t')
  if (!isFeedToken(token)) return notFound()

  try {
    const { data: feed, error } = await db.from('calendar_feed').select('profile_id').eq('token_hash', await sha256Hex(token)).maybeSingle()
    if (error) throw error
    if (!feed) return notFound()
    const profileId = feed.profile_id as string

    const { data: profile, error: pErr } = await db.from('profile').select('name, timezone, settings, deleted_at').eq('id', profileId).maybeSingle()
    if (pErr) throw pErr
    if (!profile || profile.deleted_at) return notFound()

    const zone = cleanZone(profile.timezone) ?? 'UTC'
    const now = new Date()
    const today = utcToWall(now.getTime(), zone).date
    const { from, to } = feedWindow(today)
    const settings = (profile.settings ?? {}) as { calendar?: { feed_notes?: unknown } }

    const [tasks, series, events] = await Promise.all([
      all<FeedTask>(() => db.from('task')
        .select('id, title, planned_date, planned_time, duration_min, notes, category, status, series_id')
        .eq('profile_id', profileId).is('deleted_at', null).neq('status', 'dropped')
        .gte('planned_date', from).lte('planned_date', to).order('id')),
      all<FeedSeries>(() => db.from('series')
        .select('id, title, rule, rule_config, start_date, end_date, occurrence_count, time_of_day, task_template, active')
        .eq('profile_id', profileId).is('deleted_at', null).eq('active', true).order('id')),
      // A day either side of the window: the window is in the person's zone.
      all<FeedEvent>(() => db.from('calendar_event')
        .select('id, title, starts_at, ends_at, all_day, location, subscription_id')
        .eq('profile_id', profileId).is('deleted_at', null).is('subscription_id', null)
        .gte('starts_at', `${addDays(from, -1)}T00:00:00Z`).lte('starts_at', `${addDays(to, 1)}T23:59:59Z`).order('id')),
    ])
    const exceptions: FeedException[] = []
    const ids = series.map((s) => s.id)
    for (let i = 0; i < ids.length; i += 100) {
      exceptions.push(...await all<FeedException>(() => db.from('series_exception')
        .select('series_id, exception_date, action, moved_to, changes, deleted_at')
        .in('series_id', ids.slice(i, i + 100)).is('deleted_at', null).order('id')))
    }

    const body = buildFeed({
      profileName: String(profile.name ?? ''),
      timezone: zone,
      notes: settings.calendar?.feed_notes === true,
      stamp: now.toISOString(),
      today,
      tasks, series, exceptions, events,
    })
    return new Response(req.method === 'HEAD' ? null : body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="getit.ics"',
        'Cache-Control': 'private, max-age=900',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (e) {
    // Logged for the project owner; the caller learns nothing about the data.
    console.error('calendar-feed', e instanceof Error ? e.message : e)
    return plain(503, 'Try again later', { 'Retry-After': '600' })
  }
})
