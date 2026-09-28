import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { CALENDAR_SETTINGS, subscriptionOf, useFollowedEvents, type FollowedItem } from '../lib/calendar-links'
import type { CalendarEvent } from '../lib/types'
import './followed.css'

/** Events from calendars the person follows (More → Profile → Calendar
 *  links). They are someone else's to change, so they read like the day's
 *  tasks but have no tick and open a sheet that only shows them. Their mark
 *  is a short upright bar in the calendar's colour: not a module's round dot,
 *  not a holiday's flat bar. */

const colour = (hex: string) => ({ '--fe': hex } as CSSProperties)

/** Today: the day's followed events, under their own small heading. */
export function FollowedDay({ profileId, day }: { profileId: string; day: string }) {
  const items = useFollowedEvents(profileId, day, day).get(day) ?? []
  const [open, setOpen] = useState<CalendarEvent | null>(null)
  if (items.length === 0) return null
  return (
    <section className="fe-day" aria-label="From calendars you follow">
      <p className="fe-day-title">From your calendars</p>
      <ul>
        {items.map((f) => (
          <li key={`${f.event.id}:${day}`}>
            <button type="button" className="fe-row" onClick={() => setOpen(f.event)}
              aria-label={`${f.event.title}, ${f.time ?? 'all day'}, from ${f.sub.name}. Read only`}>
              <span className="fe-time">{f.time ?? 'All day'}</span>
              <i className="fe-bar" style={colour(f.sub.colour)} aria-hidden="true" />
              <span className="fe-main">
                <span className="fe-name">{f.event.title}</span>
                <span className="fe-meta">{[f.sub.name, f.event.location].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <FollowedSheet event={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** Plan's week: one followed event among a day's tasks. */
export function FollowedWeekItem({ item, onOpen }: { item: FollowedItem; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button type="button" className="week-item fe-week" onClick={() => onOpen(item.event)}
      title={`From ${item.sub.name}. Read only`}>
      <i className="fe-bar" style={colour(item.sub.colour)} aria-hidden="true" />
      <span><span className="t">{item.time ?? ''}</span> {item.event.title}<span className="visually-hidden"> (from {item.sub.name}, read only)</span></span>
    </button>
  )
}

/** Under Week and Month: which colour is which followed calendar. */
export function FollowedLegend({ calendars }: { calendars: { id: string; name: string; colour: string }[] }) {
  if (calendars.length === 0) return null
  return (
    <div className="mod-legend fe-legend" aria-label="Followed calendar colours">
      <span>Calendars</span>
      {calendars.map((c) => (
        <span key={c.id} style={colour(c.colour)}><i className="fe-key" aria-hidden="true" />{c.name}</span>
      ))}
    </div>
  )
}

/** One followed event, shown and not edited: its time, place and calendar,
 *  and the way to that calendar's settings. */
export function FollowedSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const navigate = useNavigate()
  const sub = useLiveQuery(() => subscriptionOf(event), [event.subscription_id])
  const start = new Date(event.starts_at)
  const end = event.ends_at ? new Date(event.ends_at) : null
  const when = event.all_day
    ? (end && format(end, 'yyyy-MM-dd') > format(start, 'yyyy-MM-dd')
      ? `${format(start, 'EEE d MMM')} to ${format(end, 'EEE d MMM yyyy')}, all day`
      : `${format(start, 'EEE d MMM yyyy')}, all day`)
    : `${format(start, 'EEE d MMM yyyy, HH:mm')}${end ? `–${format(end, format(end, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd') ? 'HH:mm' : 'EEE d MMM HH:mm')}` : ''}`
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet fe-sheet" role="dialog" aria-modal="true" aria-labelledby="fe-sheet-title">
        <h2 id="fe-sheet-title">{event.title}</h2>
        <p className="fe-from">
          <i className="fe-bar" style={colour(sub?.colour ?? '#78716a')} aria-hidden="true" />
          From {sub?.name ?? 'a calendar you follow'}
        </p>
        <dl className="fe-facts">
          <dt>When</dt><dd>{when}</dd>
          {event.location && <><dt>Where</dt><dd>{event.location}</dd></>}
        </dl>
        <p className="fe-why">
          Read-only here. Change it in its own calendar; GetIt picks the change up the next time it fetches
          that calendar.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => { onClose(); navigate(CALENDAR_SETTINGS) }}>Open subscription settings</button>
          <button type="button" className="btn btn-primary grow" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </>
  )
}
