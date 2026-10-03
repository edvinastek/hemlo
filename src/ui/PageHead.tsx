import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { inRange, moveWeek } from '../lib/calendar-rules'
import { MonthScroller } from './MonthScroller'
import { useDayRange } from './useDayRange'
import './pagehead.css'

interface Props {
  date: Date
  onPick: (d: Date) => void
  sections: string[]
  active: string
  onSection: (s: string) => void
  sub?: string
  /** Under the date: the day's public holidays on Today. */
  note?: ReactNode
  /** In place of the date (Plan's Inbox has no day). */
  heading?: ReactNode
  /** The week strip; on unless a view has no day to pick. */
  strip?: boolean
  /** What a tab says, when more than its name ("Inbox 3"). */
  tabLabel?: (section: string) => ReactNode
  /** At the right of the title line: the page's one ⋮ (PageMenu, CALM-03),
   *  and anything that belongs with the title (Month's ‹ ›). */
  menu?: ReactNode
  /** What the date button says instead of the day ("October 2026" on Plan's
   *  Month); it still opens the calendar. */
  title?: string
}

/** Serif date, week strip, section tabs. The header owns about a third of the
 *  screen at most — past that the page stops being the subject.
 *
 *  Tapping the date opens a calendar to jump to any day. Every way of moving
 *  (the calendar, the strip, a swipe) stops three years back and five years
 *  ahead of today. */
export function PageHead({ date, onPick, sections, active, onSection, sub, note, heading: own, strip: showStrip = true, tabLabel, menu, title }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const today = new Date()
  const { range, clamp, today: todayKey } = useDayRange()
  const day = format(date, 'yyyy-MM-dd')
  const [picking, setPicking] = useState(false)
  const pick = (d: Date) => onPick(clamp(d))
  const strip = useWeekSwipe((dir) => {
    const next = moveWeek(day, dir, range)
    if (next) pick(parseISO(next))
    return !!next
  })
  // The year is only said when it is not this one.
  const heading = format(date, date.getFullYear() === today.getFullYear() ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy')

  return (
    <header className="page-head">
      <div className="ph-title">
        <h1 className="page-date">
          {own ?? (
            <button type="button" className="page-date-pick" aria-haspopup="dialog" aria-expanded={picking}
              title="Go to a day" onClick={() => setPicking(true)}>{title ?? heading}</button>
          )}
        </h1>
        {menu}
      </div>
      {sub && <p className="page-sub">{sub}</p>}
      {note}

      {showStrip && <div className={`week-strip${strip.slide ? ` slide-${strip.slide}` : ''}`}
        key={weekStart.toISOString()} {...strip.handlers}>
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
          <button
            key={d.toISOString()}
            className={isSameDay(d, today) ? 'today' : undefined}
            onClick={() => onPick(d)}
            disabled={!inRange(format(d, 'yyyy-MM-dd'), range)}
            aria-current={isSameDay(d, date) ? 'date' : undefined}
          >
            <span>{format(d, 'EEEEE')}</span>
            <span className="disc">{format(d, 'd')}</span>
          </button>
        ))}
      </div>}

      <div className="tabs" role="tablist">
        {sections.map((s) => (
          <button key={s} role="tab" aria-selected={s === active} onClick={() => onSection(s)}>
            {tabLabel ? tabLabel(s) : s}
          </button>
        ))}
      </div>

      {picking && (
        <DayPicker day={day} today={todayKey} first={range.first} last={range.last}
          onPick={(d) => { pick(parseISO(d)); setPicking(false) }} onClose={() => setPicking(false)} />
      )}
    </header>
  )
}

/** The calendar behind the date: months scrolling top to bottom, opened on
 *  the day being shown. A tap goes to that day and closes it. */
function DayPicker({ day, today, first, last, onPick, onClose }: {
  day: string; today: string; first: string; last: string
  onPick: (day: string) => void; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet ph-pick" role="dialog" aria-label="Go to a day">
        <h2>Go to a day</h2>
        <MonthScroller first={first} last={last} openAt={day} today={today}
          label="Days to go to" chosen={day} onDayClick={onPick} />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => onPick(today)}>Today</button>
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}

/** Swiping the week strip sideways moves it a week, and only the week: the
 *  page-swipe hook leaves anything starting in .week-strip alone. Pointer
 *  events cover touch and a mouse drag on the desktop alike; the strip's
 *  touch-action (pan-y) keeps the phone from treating the swipe as its own.
 *  A tap still picks a day: only a clear sideways drag counts, and the click
 *  that a mouse drag ends with is swallowed. At either end of the range the
 *  swipe does nothing, and the strip does not slide. */
function useWeekSwipe(onWeek: (dir: 1 | -1) => boolean) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const swallowClick = useRef(false)
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)

  const end = (e: PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < 1.5 * Math.abs(dy)) return
    const dir = dx < 0 ? 1 : -1
    swallowClick.current = true
    window.setTimeout(() => { swallowClick.current = false }, 0)
    if (onWeek(dir)) setSlide(dir === 1 ? 'next' : 'prev')
  }

  return {
    slide,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      },
      onPointerUp: end,
      onPointerCancel: () => { start.current = null },
      onClickCapture: (e: MouseEvent) => {
        if (swallowClick.current) { e.stopPropagation(); e.preventDefault() }
      },
      onAnimationEnd: () => setSlide(null),
    },
  }
}
