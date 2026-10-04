import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { loadPlanDay, startTheDay } from '../lib/plan-day'
import { leftoverChoices, leftoverMinutes, workload, type LeftoverChoice } from '../lib/plan-day-rules'
import { dayName } from '../lib/review-rules'
import { useBackClose } from '../ui/useBackClose'
import { offerUndo } from '../ui/Undo'
import './planday.css'

const CHOICE_WORDS: Record<LeftoverChoice, string> = { today: 'Today', inbox: 'Inbox', leave: 'Leave' }

/** Plan my day (TOD-22): what was left on earlier days (each to today, the
 *  Inbox, or left), a few suggestions to add to today, and a bar of the
 *  minutes planned against what the day can hold, which warns when over.
 *  Nothing changes until "Start the day", and that has one Undo. Opens by
 *  itself on the first open of the day when switched on (Settings →
 *  Planning), and from Today's ⋮ at any time. Back and Escape close it. */
export function PlanMyDay({ today, onClose }: { today: string; onClose: () => void }) {
  useBackClose(onClose)
  const profile = useApp((s) => s.profile)
  // Kept live: a change synced in while it is open shows; choices are kept by id.
  const data = useLiveQuery(async () => (profile ? loadPlanDay(profile, today) : null), [profile?.id, today])
  const [choices, setChoices] = useState<Record<string, LeftoverChoice>>({})
  const [taken, setTaken] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useMemo(() => {
    if (!data) return null
    const adding = [
      ...data.leftovers.filter((t) => choices[t.id] === 'today').map(leftoverMinutes),
      ...data.suggestions.filter((s) => taken.has(s.key)).map((s) => s.minutes),
    ]
    return workload(data.planned, adding, data.capacity)
  }, [data, choices, taken])

  if (!profile || !data || !load) return null

  async function start() {
    if (!profile || !data || busy) return
    setBusy(true)
    try {
      const done = await startTheDay(profile, today, data, choices, taken)
      if (done) offerUndo(done.words, done.undo)
      onClose()
    } finally { setBusy(false) }
  }

  const toggle = (key: string) => setTaken((t) => {
    const next = new Set(t)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const empty = data.leftovers.length === 0 && data.suggestions.length === 0

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pd-sheet" role="dialog" aria-modal="true" aria-labelledby="pd-title" data-no-swipe>
        <h2 id="pd-title">Plan my day</h2>

        {/* The workload bar: planned against what the day holds. */}
        <div className={`pd-load${load.over ? ' is-over' : ''}`}>
          <div className="pd-track" role="meter" aria-label="Planned today" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(load.share * 100)} aria-valuetext={load.words}>
            <div className="pd-fill" style={{ width: `${load.share * 100}%` }} />
          </div>
          <p className="pd-words" aria-live="polite">{load.words}</p>
        </div>

        {empty && <p className="pd-empty">Nothing left over and nothing due.</p>}

        {data.leftovers.length > 0 && (
          <section aria-labelledby="pd-left">
            <h3 id="pd-left" className="pd-head">Left from earlier</h3>
            <ul className="pd-list">
              {data.leftovers.map((t) => {
                const chosen = choices[t.id] ?? 'leave'
                return (
                  <li key={t.id} className="pd-row">
                    <span className="pd-main">
                      <span className="pd-name">{t.title || 'Untitled task'}</span>
                      <span className="pd-meta">{[t.planned_date ? `From ${dayName(t.planned_date, today)}` : null, t.duration_min ? `${t.duration_min} min` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="pd-choice" role="radiogroup" aria-label={`Where “${t.title || 'this task'}” goes`}>
                      {leftoverChoices(t).map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={chosen === c} className="chip pd-chip"
                          onClick={() => setChoices((x) => ({ ...x, [t.id]: c }))}>{CHOICE_WORDS[c]}</button>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {data.suggestions.length > 0 && (
          <section aria-labelledby="pd-sugg">
            <h3 id="pd-sugg" className="pd-head">Suggestions</h3>
            <ul className="pd-list">
              {data.suggestions.map((s) => (
                <li key={s.key} className="pd-row">
                  <span className="pd-main">
                    <span className="pd-name">{s.title}</span>
                    <span className="pd-meta">{s.meta}</span>
                  </span>
                  <button type="button" className="chip pd-chip" aria-pressed={taken.has(s.key)}
                    aria-label={`${taken.has(s.key) ? 'Added to today' : 'Add to today'}: ${s.title}`}
                    onClick={() => toggle(s.key)}>{taken.has(s.key) ? 'Today ✓' : 'Today'}</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
          {!empty && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()}>Start the day</button>}
        </div>
      </div>
    </>
  )
}
