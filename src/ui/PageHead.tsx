import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { addDays, format, isSameDay, startOfWeek } from 'date-fns'

interface Props {
  date: Date
  onPick: (d: Date) => void
  sections: string[]
  active: string
  onSection: (s: string) => void
  sub?: string
  /** Under the date: the day's public holidays on Today. */
  note?: ReactNode
}

/** Serif date, week strip, section tabs. The header owns about a third of the
 *  screen at most — past that the page stops being the subject. */
export function PageHead({ date, onPick, sections, active, onSection, sub, note }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const today = new Date()
  const strip = useWeekSwipe((dir) => onPick(addDays(date, dir * 7)))

  return (
    <header className="page-head">
      <h1 className="page-date">{format(date, 'EEEE d MMMM')}</h1>
      {sub && <p className="page-sub">{sub}</p>}
      {note}

      <div className={`week-strip${strip.slide ? ` slide-${strip.slide}` : ''}`}
        key={weekStart.toISOString()} {...strip.handlers}>
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
          <button
            key={d.toISOString()}
            className={isSameDay(d, today) ? 'today' : undefined}
            onClick={() => onPick(d)}
            aria-current={isSameDay(d, date) ? 'date' : undefined}
          >
            <span>{format(d, 'EEEEE')}</span>
            <span className="disc">{format(d, 'd')}</span>
          </button>
        ))}
      </div>

      <div className="tabs" role="tablist">
        {sections.map((s) => (
          <button key={s} role="tab" aria-selected={s === active} onClick={() => onSection(s)}>
            {s}
          </button>
        ))}
      </div>
    </header>
  )
}

/** Swiping the week strip sideways moves it a week, and only the week: the
 *  page-swipe hook leaves anything starting in .week-strip alone. Pointer
 *  events cover touch and a mouse drag on the desktop alike; the strip's
 *  touch-action (pan-y) keeps the phone from treating the swipe as its own.
 *  A tap still picks a day: only a clear sideways drag counts, and the click
 *  that a mouse drag ends with is swallowed. */
function useWeekSwipe(onWeek: (dir: 1 | -1) => void) {
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
    setSlide(dir === 1 ? 'next' : 'prev')
    onWeek(dir)
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
