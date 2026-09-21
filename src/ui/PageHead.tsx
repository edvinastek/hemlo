import { addDays, format, isSameDay, startOfWeek } from 'date-fns'

interface Props {
  date: Date
  onPick: (d: Date) => void
  sections: string[]
  active: string
  onSection: (s: string) => void
  sub?: string
}

/** Serif date, week strip, section tabs. The header owns about a third of the
 *  screen at most — past that the page stops being the subject. */
export function PageHead({ date, onPick, sections, active, onSection, sub }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const today = new Date()

  return (
    <header className="page-head">
      <h1 className="page-date">{format(date, 'EEEE d MMMM')}</h1>
      {sub && <p className="page-sub">{sub}</p>}

      <div className="week-strip">
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
