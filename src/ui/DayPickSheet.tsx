import { MonthScroller } from './MonthScroller'
import { useDayRange } from './useDayRange'
import { useBackClose } from './useBackClose'
import { addDays, weekdayOf } from '../lib/schedule-rules'
import './copysheet.css'

/** "Plan for…" and "Move to day…": one day, picked on the scrolling
 *  calendar or with a shortcut. With `inbox`, a button sends it to no day
 *  at all (the Inbox). */
export function DayPickSheet({ title, current, onPick, onClose, inbox, note }: {
  title: string
  /** The day shown as chosen, and where the calendar opens. */
  current?: string | null
  onPick: (day: string | null) => void
  onClose: () => void
  /** Offer "No day (Inbox)". */
  inbox?: boolean
  note?: string
}) {
  useBackClose(onClose)
  const { range, today } = useDayRange()
  const nextMonday = addDays(today, 7 - ((weekdayOf(today) + 6) % 7))
  const shortcuts: [string, string][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next Monday', nextMonday]]
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet dp-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {note && <p className="dp-note">{note}</p>}
        <div className="dp-quick" role="group" aria-label="Quick choices">
          {shortcuts.map(([label, day]) => (
            <button key={label} type="button" className="btn" aria-pressed={current === day} onClick={() => onPick(day)}>{label}</button>
          ))}
          {inbox && <button type="button" className="btn" aria-pressed={current === null} onClick={() => onPick(null)}>No day (Inbox)</button>}
        </div>
        <MonthScroller first={range.first} last={range.last} openAt={current ?? today} today={today}
          label="Days to choose from" chosen={current ?? undefined} onDayClick={(d) => onPick(d)} />
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  )
}
