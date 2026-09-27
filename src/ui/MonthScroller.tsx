import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { monthAt, monthDays, monthIndex, monthsBetween, monthTops, type MonthBlock } from '../lib/calendar-rules'
import './colours.css'
import './monthscroller.css'

/** Heights the layout is worked out from. The stylesheet takes them from
 *  here (as --ms-head and --ms-row), so the two can never disagree. */
const HEAD_H = 34
const ROW_H = 44
/** Months drawn beyond the ones on screen, above and below, so a quick
 *  flick does not show blank space before the next months are drawn. */
const SPARE = 2

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
/** "Tuesday 6 October 2026", read out for each day. */
function spokenDay(day: string, lead: number): string {
  const d = Number(day.slice(8, 10))
  return `${WEEKDAYS[(lead + d - 1) % 7]} ${d} ${monthName(day.slice(0, 7))}`
}

/** A day's load as a background. `strong` is for the darkest step, where the
 *  number is drawn in the page colour so it can still be read. */
export interface DayHeat { colour: string; strong?: boolean }

interface Props {
  /** The first and last day that can be shown, as 'yyyy-MM-dd'. Whole months
   *  are drawn; days outside these two cannot be tapped. */
  first: string
  last: string
  /** The day whose month is at the top when the calendar opens. It scrolls
   *  there again whenever this moves to another month, or `jump` changes. */
  openAt: string
  /** Change this to scroll back to openAt's month even when it has not moved. */
  jump?: number
  today: string
  /** Read out for the whole calendar: "Pick days", "The year by day". */
  label: string
  /** Colours of small dots under a day's number, at most three drawn. */
  marks?: (day: string) => string[]
  /** A background for the day, for load. */
  heat?: (day: string) => DayHeat | undefined
  /** When given, days are on/off choices and read out as pressed or not. */
  selected?: ReadonlySet<string>
  /** One day drawn as chosen without being an on/off choice: the day a
   *  screen is showing, in a "go to a day" calendar. */
  chosen?: string
  /** A day that cannot be tapped: before the first, after the last, or as this says. */
  disabled?: (day: string) => boolean
  /** More words read out after the day: "2 h planned". */
  describe?: (day: string) => string | undefined
  onDayClick?: (day: string) => void
  className?: string
}

/** Months stacked top to bottom, scrolled like a phone's calendar. About two
 *  months fit a phone screen. Only the months on screen and a couple either
 *  side are drawn: eight years of days would be close to three thousand
 *  buttons, and the page would crawl. Every month's height is known in
 *  advance (a heading and four to six rows), which is what makes that work. */
export function MonthScroller({
  first, last, openAt, jump, today, label, marks, heat, selected, chosen, disabled, describe, onDayClick, className,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const months = useMemo(() => monthsBetween(first, last), [first, last])
  const { tops, total } = useMemo(() => monthTops(months, HEAD_H, ROW_H), [months])
  const openIndex = monthIndex(months, openAt)
  const [shown, setShown] = useState<[number, number]>([openIndex - SPARE, openIndex + 2 + SPARE])
  const frame = useRef(0)

  /** Which months are near the screen, worked out from where it is scrolled to. */
  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const top = monthAt(tops, el.scrollTop)
    const bottom = monthAt(tops, el.scrollTop + Math.max(el.clientHeight, ROW_H * 12))
    setShown((was) => (was[0] === top - SPARE && was[1] === bottom + SPARE ? was : [top - SPARE, bottom + SPARE]))
  }, [tops])

  // Open on the month asked for, before the first paint, so it never flashes
  // the top of the range first.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = tops[openIndex] ?? 0
    measure()
  }, [openIndex, jump, tops, measure])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(measure)
  }

  const from = Math.max(0, shown[0])
  const to = Math.min(months.length - 1, shown[1])
  const style = { '--ms-head': `${HEAD_H}px`, '--ms-row': `${ROW_H}px` } as CSSProperties

  return (
    <div className={`ms${className ? ` ${className}` : ''}`} style={style} role="group" aria-label={label}>
      <div className="ms-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w}>{w[0]}</span>)}
      </div>
      <div className="ms-scroll" ref={scroller} onScroll={onScroll}>
        <div className="ms-inner" style={{ height: total }}>
          {months.slice(from, to + 1).map((m, i) => (
            <Month key={m.key} block={m} top={tops[from + i]} first={first} last={last} today={today}
              marks={marks} heat={heat} selected={selected} chosen={chosen} disabled={disabled} describe={describe}
              onDayClick={onDayClick} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Month({ block, top, first, last, today, marks, heat, selected, chosen, disabled, describe, onDayClick }:
  Omit<Props, 'openAt' | 'jump' | 'label' | 'className'> & { block: MonthBlock; top: number }) {
  return (
    <section className="ms-month" style={{ top, height: HEAD_H + block.weeks * ROW_H }} aria-label={monthName(block.key)}>
      <h3 className="ms-title">{monthName(block.key)}</h3>
      <div className="ms-grid">
        {block.lead > 0 && <span style={{ gridColumn: `span ${block.lead}` }} aria-hidden="true" />}
        {monthDays(block).map((day) => {
          const off = day < first || day > last || !!disabled?.(day)
          const dots = marks?.(day).slice(0, 3) ?? []
          const warm = heat?.(day)
          const picked = selected?.has(day) || day === chosen
          const extra = [day === chosen ? 'showing now' : null, describe?.(day)].filter(Boolean).join(', ')
          const cls = ['ms-day', day === today && 'is-today', picked && 'is-picked', warm?.strong && 'is-strong']
            .filter(Boolean).join(' ')
          return (
            <button key={day} type="button" className={cls} disabled={off || !onDayClick}
              aria-pressed={selected ? !!selected.has(day) : undefined}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${spokenDay(day, block.lead)}${extra ? `, ${extra}` : ''}`}
              data-day={day}
              style={warm ? ({ '--ms-heat': warm.colour } as CSSProperties) : undefined}
              onClick={() => onDayClick?.(day)}>
              <span className="ms-num">{Number(day.slice(8, 10))}</span>
              {dots.length > 0 && (
                <span className="ms-dots" aria-hidden="true">
                  {dots.map((c, i) => <i key={i} className="mod-dot" style={{ '--mod': c } as CSSProperties} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
