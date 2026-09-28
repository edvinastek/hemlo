import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from './db'
import { supabase } from './supabase'
import { push, queueChange } from './sync'
import { edit } from './write'
import { useApp } from './store'
import { parseIcs } from './ics-rules'
import { addDays } from './series-rules'
import { SWATCHES } from './colours-rules'
import {
  MAX_SUBSCRIPTIONS, REFRESH_MS, cleanName, eventsFromIcs, feedUrl, feedWindow, fetchDue, normaliseCalendarUrl, planReplace,
  withoutAddresses, type LocalEvent,
} from './calendar-links-rules'
import type { CalendarEvent, CalendarSubscription } from './types'

/** Calendar links on the device: the feed link Google Calendar reads, and
 *  calendars the person follows.
 *
 *  Events of a followed calendar are kept on each device only. The calendar's
 *  address syncs (so a new phone follows the same calendars), but its events
 *  do not: every device fetches the calendar itself, through the
 *  calendar-fetch function, and the server never keeps a copy of someone's
 *  Google Calendar. The cost is one fetch per device every few hours, which
 *  is what Google's own apps do too. queueChange() in sync.ts refuses to
 *  send such an event, so nothing sends one by accident. */

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const today = () => format(new Date(), 'yyyy-MM-dd')
const live = <T extends { deleted_at?: string | null }>(r: T) => !r.deleted_at

/* ---------- the feed link --------------------------------------------------- */

export interface FeedStatus { on: boolean; since: string | null }

/** Whether the profile has a feed link, and since when. Needs a connection:
 *  the link lives only on the server. */
export async function feedStatus(profileId: string): Promise<FeedStatus> {
  const { data, error } = await supabase.from('calendar_feed').select('profile_id, rotated_at').eq('profile_id', profileId).maybeSingle()
  if (error) throw new Error('The link could not be checked. Try again with a connection.')
  return { on: !!data, since: (data?.rotated_at as string | undefined) ?? null }
}

/** A new feed link, replacing any old one. The address is shown once: only a
 *  hash of it is kept anywhere. */
export async function makeFeedLink(profileId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_calendar_feed', { p: profileId })
  if (error || typeof data !== 'string') throw new Error('The link could not be made. Try again with a connection.')
  return feedUrl(import.meta.env.VITE_SUPABASE_URL as string, data)
}

export async function turnOffFeed(profileId: string): Promise<void> {
  const { error } = await supabase.from('calendar_feed').delete().eq('profile_id', profileId)
  if (error) throw new Error('The link could not be turned off. Try again with a connection.')
}

/* ---------- calendars to follow --------------------------------------------- */

export function useSubscriptions(profileId: string | null | undefined): CalendarSubscription[] | undefined {
  return useLiveQuery(async () => (profileId
    ? (await db.calendar_subscription.where('profile_id').equals(profileId).toArray()).filter(live)
      .sort((a, b) => a.name.localeCompare(b.name))
    : []), [profileId])
}

/** A colour no other followed calendar has yet, from the swatches. */
export function nextColour(taken: string[]): string {
  const order = [5, 8, 13, 2, 10, 0, 4, 12, 7, 1, 11, 3, 9, 14, 6, 15].map((i) => SWATCHES[i].hex)
  return order.find((h) => !taken.includes(h)) ?? order[taken.length % order.length]
}

export type AddResult = { ok: true; sub: CalendarSubscription } | { ok: false; error: string }

/** Follow a calendar: kept, sent to the server, then fetched straight away. */
export async function addSubscription(profileId: string, name: string, address: string, colour: string): Promise<AddResult> {
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'Give the calendar a name, such as Work or Family.' }
  const url = normaliseCalendarUrl(address)
  if (!url.ok) return { ok: false, error: url.error }
  const mine = (await db.calendar_subscription.where('profile_id').equals(profileId).toArray()).filter(live)
  if (mine.length >= MAX_SUBSCRIPTIONS) return { ok: false, error: `That is ${MAX_SUBSCRIPTIONS} calendars. Remove one to follow another.` }
  if (mine.some((s) => !!s.url && s.url === url.url)) return { ok: false, error: 'You already follow that calendar.' }
  const now = new Date().toISOString()
  const sub: CalendarSubscription = {
    id: crypto.randomUUID(), profile_id: profileId, name: clean, url: url.url, colour,
    last_synced_at: null, last_error: null, created_at: now, updated_at: now, deleted_at: null,
  }
  await db.calendar_subscription.put(sub)
  await queueChange('calendar_subscription', sub, ['profile_id', 'name', 'url', 'colour'])
  return { ok: true, sub }
}

export async function setSubscriptionColour(sub: CalendarSubscription, colour: string) {
  await edit('calendar_subscription', sub, { colour })
}

/** Stop following: the calendar goes from every device, its events with it,
 *  and its secret address is wiped. The row itself stays, marked deleted, so
 *  other devices learn it is gone.
 *
 *  Only the deletion is sent. The server wipes the address itself when a row
 *  is marked deleted (migration 024), which also covers older copies of the
 *  app; sending the empty address as well would be refused by a server that
 *  does not have 024 yet, and hold the deletion up with it. */
export async function removeSubscription(sub: CalendarSubscription) {
  const gone = await edit('calendar_subscription', sub, { deleted_at: new Date().toISOString() })
  await db.calendar_subscription.put({ ...gone, url: null })
  await db.calendar_event.where('subscription_id').equals(sub.id).delete()
  failedAt.delete(sub.id)
}

export type RefreshResult =
  | { ok: true; added: number; changed: number; removed: number; total: number; notes: string[] }
  | { ok: false; error: string }

const running = new Map<string, Promise<RefreshResult>>()
/** When a calendar last failed to fetch: tried again after an hour, not at
 *  every quarter-hour check, so a broken address is not hammered (fetchDue). */
const failedAt = new Map<string, number>()

/** Fetch a followed calendar and make its events here match it, from three
 *  months back to twelve ahead. One fetch per calendar at a time. */
export function refreshSubscription(sub: CalendarSubscription): Promise<RefreshResult> {
  const now = running.get(sub.id)
  if (now) return now
  const job = doRefresh(sub).finally(() => running.delete(sub.id))
  running.set(sub.id, job)
  return job
}

async function doRefresh(sub: CalendarSubscription): Promise<RefreshResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, error: 'Needs a connection.' }
  // The server fetches only a calendar it knows: send a new one first.
  await push()
  const { data, error } = await supabase.functions.invoke('calendar-fetch', { body: { subscription_id: sub.id } })
  const answer = (data ?? {}) as { ok?: boolean; ics?: string; error?: string; fetched_at?: string; at?: string }
  const at = answer.fetched_at ?? answer.at ?? new Date().toISOString()
  if (error || !answer.ok || typeof answer.ics !== 'string') {
    const message = withoutAddresses(answer.error ?? (error ? 'GetIt’s server could not be reached. It will try again later.' : 'The calendar could not be read.'))
    // Not asked for again for an hour, unless the person asks.
    failedAt.set(sub.id, Date.now())
    // The server wrote this down too; the copy here shows it at once.
    await note(sub.id, { last_error: message.slice(0, 300) })
    return { ok: false, error: message }
  }
  failedAt.delete(sub.id)
  const span = feedWindow(today())
  const read = parseIcs(answer.ics, { zone: zone(), today: today(), mapSeries: false, from: span.from, to: span.to, maxEvents: 20000 })
  const { events, truncated } = eventsFromIcs(read.events, { zone: zone(), ...span })
  const current = sub.profile_id
  const existing = (await db.calendar_event.where('subscription_id').equals(sub.id).toArray()) as (CalendarEvent & LocalEvent)[]
  const plan = planReplace(existing.map((e) => ({ ...e, external_uid: e.external_uid ?? '' })), events)
  const stamp = new Date().toISOString()
  await db.transaction('rw', db.calendar_event, db.calendar_subscription, async () => {
    // Removed while it was being fetched: nothing to keep.
    const still = await db.calendar_subscription.get(sub.id)
    if (!still || still.deleted_at) {
      await db.calendar_event.where('subscription_id').equals(sub.id).delete()
      return
    }
    if (plan.remove.length) await db.calendar_event.bulkDelete(plan.remove)
    for (const u of plan.update) await db.calendar_event.update(u.id, { ...u.changes, updated_at: stamp })
    if (plan.add.length) {
      await db.calendar_event.bulkPut(plan.add.map((e): CalendarEvent => ({
        id: crypto.randomUUID(), profile_id: current, subscription_id: sub.id, ...e, updated_at: stamp, deleted_at: null,
      })))
    }
    await db.calendar_subscription.update(sub.id, { last_synced_at: at, last_error: null })
  })
  const notes = [...read.problems]
  if (truncated) notes.push('The calendar has more events than GetIt keeps; the first 5000 in the window are shown.')
  return { ok: true, added: plan.add.length, changed: plan.update.length, removed: plan.remove.length, total: events.length, notes }
}

/** What the server already wrote, copied here without sending it back. */
async function note(id: string, changes: Partial<CalendarSubscription>) {
  await db.calendar_subscription.update(id, changes)
}

/** Every followed calendar that is due, one after another; and the events
 *  of calendars no longer followed (removed on another device) go. */
export async function refreshDueSubscriptions(force = false): Promise<void> {
  const subs = await db.calendar_subscription.toArray()
  const following = new Set(subs.filter(live).map((s) => s.id))
  const orphans = (await db.calendar_event.where('subscription_id').above('').toArray())
    .filter((e) => e.subscription_id && !following.has(e.subscription_id)).map((e) => e.id)
  if (orphans.length) await db.calendar_event.bulkDelete(orphans)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const now = Date.now()
  for (const s of subs.filter(live)) {
    if (fetchDue({ lastSyncedAt: s.last_synced_at, failedAt: failedAt.get(s.id), now, force })) await refreshSubscription(s)
  }
}

/** While the app is open: fetch what is due once the first sync has had time
 *  to bring the list in, then check every quarter of an hour (each calendar
 *  is fetched at most every three hours), and again on coming back online. */
export function watchCalendarFollows(): () => void {
  if (!useApp.getState().session) return () => undefined
  const run = () => { if (navigator.onLine) void refreshDueSubscriptions().catch(() => undefined) }
  const first = window.setTimeout(run, 5000)
  const every = window.setInterval(run, Math.min(REFRESH_MS, 15 * 60 * 1000))
  window.addEventListener('online', run)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(every)
    window.removeEventListener('online', run)
  }
}

/* ---------- showing them ---------------------------------------------------- */

/** One followed event on one day, ready to draw. */
export interface FollowedItem {
  event: CalendarEvent
  sub: Pick<CalendarSubscription, 'id' | 'name' | 'colour'>
  /** 'HH:mm', or null for a whole day. */
  time: string | null
  /** Minutes it takes, for the day's load; 0 for a whole day. */
  minutes: number
}

const EMPTY = new Map<string, FollowedItem[]>()

/** Followed events by local day, from `from` to `to` (both included). A
 *  several-day event is on each of its days (at most 31). */
export function useFollowedEvents(profileId: string | null | undefined, from: string, to: string): Map<string, FollowedItem[]> {
  return useLiveQuery(async () => {
    if (!profileId) return EMPTY
    const subs = new Map((await db.calendar_subscription.where('profile_id').equals(profileId).toArray()).filter(live).map((s) => [s.id, s]))
    if (subs.size === 0) return EMPTY
    const lo = new Date(`${addDays(from, -31)}T00:00`).toISOString()
    const hi = new Date(`${addDays(to, 1)}T00:00`).toISOString()
    const rows = await db.calendar_event.where('starts_at').between(lo, hi, true, false)
      .filter((e) => !!e.subscription_id && e.profile_id === profileId && !e.deleted_at).toArray()
    const map = new Map<string, FollowedItem[]>()
    for (const e of rows) {
      const sub = subs.get(e.subscription_id!)
      if (!sub) continue
      const start = new Date(e.starts_at)
      if (Number.isNaN(start.getTime())) continue
      const end = e.ends_at ? new Date(e.ends_at) : null
      const first = format(start, 'yyyy-MM-dd')
      const time = e.all_day ? null : format(start, 'HH:mm')
      const minutes = e.all_day ? 0 : end && end > start ? Math.min(Math.round((end.getTime() - start.getTime()) / 60000), 24 * 60) : 30
      const last = e.all_day && end ? format(end, 'yyyy-MM-dd') : first
      for (let d = first, n = 0; d <= last && n < 31; d = addDays(d, 1), n++) {
        if (d < from || d > to) continue
        const list = map.get(d) ?? []
        list.push({ event: e, sub: { id: sub.id, name: sub.name, colour: sub.colour }, time, minutes: d === first ? minutes : 0 })
        map.set(d, list)
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.event.title.localeCompare(b.event.title))
    return map
  }, [profileId, from, to], EMPTY) ?? EMPTY
}

/** The followed calendars on some days, each once, for a legend. */
export function calendarsIn(days: (FollowedItem[] | undefined)[]): { id: string; name: string; colour: string }[] {
  const seen = new Map<string, { id: string; name: string; colour: string }>()
  for (const list of days) for (const f of list ?? []) if (!seen.has(f.sub.id)) seen.set(f.sub.id, f.sub)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** A followed event's calendar, for the read-only sheet. */
export async function subscriptionOf(event: Pick<CalendarEvent, 'subscription_id'>): Promise<CalendarSubscription | undefined> {
  return event.subscription_id ? db.calendar_subscription.get(event.subscription_id) : undefined
}

/** Where the settings for followed calendars are. */
export const CALENDAR_SETTINGS = '/more?section=Profile#calendar-links'
