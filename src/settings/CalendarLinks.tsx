import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { SWATCHES } from '../lib/colours-rules'
import { MAX_SUBSCRIPTIONS } from '../lib/calendar-links-rules'
import {
  addSubscription, feedStatus, makeFeedLink, nextColour, refreshSubscription, removeSubscription,
  setSubscriptionColour, turnOffFeed, useSubscriptions, type FeedStatus,
} from '../lib/calendar-links'
import type { CalendarSubscription, Profile } from '../lib/types'
import './colour-settings.css'
import './calendar-links.css'

/** Settings → Calendars → Calendar links. Two directions, no Google account
 *  connected: a private link Google Calendar reads (Hemlo → Google), and
 *  Google calendars followed by their secret address (Google → Hemlo). */
export function CalendarLinks() {
  const profile = useApp((s) => s.profile)
  const ref = useRef<HTMLDivElement>(null)
  // Arriving from an event's "Open subscription settings", scroll here.
  useEffect(() => {
    if (window.location.hash === '#calendar-links') ref.current?.scrollIntoView({ block: 'start' })
  }, [])
  if (!profile) return null
  return (
    <div id="calendar-links" ref={ref} className="cl">
      <p className="section-title">Calendar links</p>
      <FeedPanel key={`feed-${profile.id}`} profile={profile} />
      <FollowPanel key={`follow-${profile.id}`} profile={profile} />
    </div>
  )
}

/* ---------- Hemlo in Google Calendar ------------------------------------------ */

function FeedPanel({ profile }: { profile: Profile }) {
  const online = useApp((s) => s.online)
  const [status, setStatus] = useState<FeedStatus | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'new' | 'off' | null>(null)
  const [copied, setCopied] = useState(false)
  const notes = readSettings(profile).calendar.feed_notes

  useEffect(() => {
    if (!online) return
    let live = true
    feedStatus(profile.id).then((s) => { if (live) setStatus(s) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [profile.id, online])

  async function make() {
    setBusy(true); setError(null); setConfirm(null); setCopied(false)
    try {
      setLink(await makeFeedLink(profile.id))
      setStatus({ on: true, since: new Date().toISOString() })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function off() {
    setBusy(true); setError(null); setConfirm(null)
    try {
      await turnOffFeed(profile.id)
      setStatus({ on: false, since: null })
      setLink(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch {
      // No clipboard here (an old browser): the field is selected instead.
      const field = document.getElementById('cl-feed-link') as HTMLInputElement | null
      field?.select()
    }
  }

  const on = status?.on ?? false
  return (
    <section className="cl-block" aria-labelledby="cl-feed-title">
      <div className="setting-row cl-top">
        <div>
          <div className="row-name" id="cl-feed-title">Show Hemlo in Google Calendar</div>
          <div className="row-meta">A private, read-only link to your tasks and events; health details stay out.</div>
          <div className="row-meta cl-state" role="status">
            {!online ? 'Needs a connection.' : status === null && !error ? 'Checking…'
              : on ? `On${status?.since ? ` · link made ${new Date(status.since).toLocaleDateString()}` : ''}` : 'Off'}
          </div>
        </div>
        {status && !on && <button className="btn btn-primary" disabled={!online || busy} onClick={() => void make()}>Make link</button>}
      </div>

      {link && (
        <div className="cl-link">
          <label className="row-meta" htmlFor="cl-feed-link">Your link, shown only now. Keep it private: anyone who has it can read what it shows.</label>
          <div className="cl-copy">
            <input id="cl-feed-link" className="cl-field" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-primary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <ol className="cl-steps">
            <li>On a computer, open Google Calendar (calendar.google.com).</li>
            <li>Beside <b>Other calendars</b> on the left, choose <b>+</b>, then <b>From URL</b>.</li>
            <li>Paste the link and choose <b>Add calendar</b>. It shows on your phone too.</li>
          </ol>
        </div>
      )}

      {on && (
        <>
          <div className="setting-row">
            <div>
              <div className="row-name" id="cl-notes">Include task notes</div>
              <div className="row-meta">Anyone with the link would see them.</div>
            </div>
            <button className="switch" role="switch" aria-checked={notes} aria-labelledby="cl-notes"
              onClick={() => void saveSettings(profile, { calendar: { feed_notes: !notes } })} />
          </div>
          <div className="cl-actions">
            {confirm === null && (
              <>
                <button className="btn" disabled={!online || busy} onClick={() => setConfirm('new')}>Make a new link</button>
                <button className="btn" disabled={!online || busy} onClick={() => setConfirm('off')}>Turn off</button>
              </>
            )}
            {confirm !== null && (
              <div className="cl-confirm" role="alertdialog" aria-labelledby="cl-confirm-text">
                <p id="cl-confirm-text" className="row-meta">
                  {confirm === 'new'
                    ? 'The old link stops working at once. Google Calendar will need the new one.'
                    : 'The link stops working at once, and Google Calendar will show nothing new from Hemlo. Remove it there too.'}
                </p>
                <div className="cl-copy">
                  <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void (confirm === 'new' ? make() : off())}>
                    {confirm === 'new' ? 'Make a new link' : 'Turn off'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {error && <p className="cl-error" role="alert">{error}</p>}
    </section>
  )
}

/* ---------- calendars you follow ---------------------------------------------- */

function FollowPanel({ profile }: { profile: Profile }) {
  const online = useApp((s) => s.online)
  const subs = useSubscriptions(profile.id) ?? []
  const [adding, setAdding] = useState(false)
  const full = subs.length >= MAX_SUBSCRIPTIONS

  return (
    <section className="cl-block" aria-labelledby="cl-follow-title">
      <div className="setting-row cl-top">
        <div>
          <div className="row-name" id="cl-follow-title">Calendars you follow</div>
          <div className="row-meta">Google Calendar or any iCal address, read-only, on Today and Plan.</div>
        </div>
        {!adding && <button className="btn" disabled={full} onClick={() => setAdding(true)}>Add</button>}
      </div>
      {full && <p className="cl-note">That is {MAX_SUBSCRIPTIONS} calendars. Remove one to follow another.</p>}
      {adding && <AddForm profileId={profile.id} online={online} taken={subs.map((s) => s.colour)} onDone={() => setAdding(false)} />}
      <div className="cl-list">
        {subs.map((s) => <SubRow key={s.id} sub={s} online={online} />)}
      </div>
      {subs.length === 0 && !adding && <p className="cl-note">None yet.</p>}
    </section>
  )
}

function AddForm({ profileId, online, taken, onDone }: { profileId: string; online: boolean; taken: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await addSubscription(profileId, name, url, nextColour(taken))
      if (!res.ok) { setError(res.error); return }
      onDone()
      void refreshSubscription(res.sub)
    } finally { setBusy(false) }
  }

  return (
    <form className="cl-form" onSubmit={(e) => void submit(e)} noValidate aria-label="Follow a calendar">
      <ol className="cl-steps">
        <li>On a computer, open Google Calendar and choose <b>Settings</b> (the gear).</li>
        <li>Under <b>Settings for my calendars</b>, choose the calendar, then <b>Integrate calendar</b>.</li>
        <li>Copy the <b>Secret address in iCal format</b> and paste it below. Anyone with that address can read the calendar, so it is kept private to you.</li>
      </ol>
      <label>
        Name
        <input className="cl-field" value={name} maxLength={60} placeholder="Work, Family…" autoComplete="off"
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Secret address
        <input className="cl-field" type="url" inputMode="url" value={url} autoComplete="off" spellCheck={false}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-invalid={!!error}
          onChange={(e) => setUrl(e.target.value)} />
      </label>
      {!online && <p className="cl-note">Needs a connection to fetch the calendar.</p>}
      {error && <p className="cl-error" role="alert">{error}</p>}
      <div className="cl-copy">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !online}>Follow</button>
      </div>
    </form>
  )
}

function SubRow({ sub, online }: { sub: CalendarSubscription; online: boolean }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const count = useLiveQuery(() => db.calendar_event.where('subscription_id').equals(sub.id).count(), [sub.id], 0)
  const swatch = SWATCHES.find((s) => s.hex === sub.colour)

  async function refresh() {
    setBusy(true); setMessage(null)
    const res = await refreshSubscription(sub)
    setBusy(false)
    setMessage(res.ok
      ? `Up to date: ${res.total} events${res.added || res.removed || res.changed ? ` (${res.added} new, ${res.changed} changed, ${res.removed} gone)` : ''}.${res.notes.length ? ' ' + res.notes.slice(0, 2).join(' ') : ''}`
      : null)
  }

  const when = sub.last_synced_at ? new Date(sub.last_synced_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div className="cs-row">
      <div className="cl-line">
        <button className="cs-head" aria-expanded={open} onClick={() => setOpen(!open)}
          aria-label={`${sub.name}: ${swatch?.name ?? sub.colour}. Change colour`}>
          <i className="cs-swatch" style={{ '--mod': sub.colour } as CSSProperties} aria-hidden="true" />
          <span className="row-name">{sub.name}</span>
          <span className="row-meta">{count} events</span>
        </button>
      </div>
      <p className="cl-meta" role="status">
        {when ? `Fetched ${when}` : 'Not fetched yet'}
        {sub.last_error && <span className="cl-error-inline"> · {sub.last_error}</span>}
        {message && <> · {message}</>}
      </p>
      {open && (
        <div className="cs-panel">
          <div className="cs-grid" role="group" aria-label={`Colours for ${sub.name}`}>
            {SWATCHES.map((s) => (
              <button key={s.hex} className="cs-pick" aria-label={s.name} aria-pressed={s.hex === sub.colour}
                title={s.name} style={{ '--mod': s.hex } as CSSProperties} onClick={() => void setSubscriptionColour(sub, s.hex)} />
            ))}
          </div>
        </div>
      )}
      <div className="cl-actions">
        {!confirm ? (
          <>
            <button className="btn" disabled={!online || busy} onClick={() => void refresh()}>{busy ? 'Fetching…' : 'Refresh now'}</button>
            <button className="btn" onClick={() => setConfirm(true)} aria-label={`Remove ${sub.name}`}>Remove</button>
          </>
        ) : (
          <div className="cl-confirm" role="alertdialog" aria-label={`Remove ${sub.name}?`}>
            <p className="row-meta">Stop following {sub.name}? Its events leave Hemlo on every device and its address is erased. The calendar itself is not touched.</p>
            <div className="cl-copy">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void removeSubscription(sub)}>Remove</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
