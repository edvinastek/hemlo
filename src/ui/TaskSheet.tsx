import { useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Task } from '../lib/types'
import { db } from '../lib/db'
import { deleteTask, saveTask } from '../lib/tasks'
import { editFollowing, editOccurrence, seriesChanges, startSeries, stopSeries, upcomingCount } from '../lib/series'
import { dayName, describeRule, ruleFromChoice, weekdayOf, WEEK_ORDER, type RepeatKind } from '../lib/series-rules'
import './tasksheet.css'

const REPEAT_LABELS: [RepeatKind, string][] = [
  ['never', 'Never'],
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'Weekly on chosen days'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Monthly, same day'],
]

type Step = 'form' | 'scope' | 'stop'

/** Add or edit one task. Duration goes after the name, never inside it, and a
 *  locked task is one nothing — reminders' pushes or a future assistant — may move.
 *
 *  A task can repeat. A new repeating task starts a series, which fills the
 *  weeks ahead with its own tasks; editing one of those asks whether the
 *  change is for that day or for it and every day after. */
export function TaskSheet({ task, isNew, onClose }: { task: Task; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Task>(task)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [busy, setBusy] = useState(false)
  const [repeat, setRepeat] = useState<RepeatKind>('never')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [endKind, setEndKind] = useState<'never' | 'date'>('never')
  const [endDate, setEndDate] = useState('')
  const [upcoming, setUpcoming] = useState(0)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const today = format(new Date(), 'yyyy-MM-dd')
  const series = useLiveQuery(
    async () => (task.series_id ? (await db.series.get(task.series_id)) ?? null : null),
    [task.series_id], null)
  const inSeries = !!series && !series.deleted_at
  // A series that ended before today has nothing left to change or stop.
  const running = inSeries && series.active && (!series.end_date || series.end_date >= today)

  const start = draft.planned_date ?? today
  const pickedDays = weekdays.length ? weekdays : [weekdayOf(start)]
  const preview = repeat === 'never' ? null : {
    ...ruleFromChoice(repeat, start, pickedDays),
    start_date: start,
    end_date: endKind === 'date' && endDate ? endDate : null,
    occurrence_count: null,
  }

  function chooseRepeat(kind: RepeatKind) {
    setRepeat(kind)
    if ((kind === 'weekly' || kind === 'biweekly') && weekdays.length === 0) setWeekdays([weekdayOf(start)])
  }

  // At least one day stays picked: a weekly series on no day is not a series.
  function toggleDay(wd: number) {
    setWeekdays((ws) => {
      const now = ws.length ? ws : [weekdayOf(start)]
      if (now.includes(wd)) return now.length > 1 ? now.filter((w) => w !== wd) : now
      return [...now, wd]
    })
  }

  /** Only what the person changed is sent, so an edit here and a tick on
   *  another device both survive the merge. */
  const changedFields = (next: Task = draft) =>
    (Object.keys(next) as (keyof Task & string)[]).filter((k) => k !== 'updated_at' && next[k] !== task[k])

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.title.trim()
    if (!title || busy) return
    const next = { ...draft, title }
    setDraft(next)

    if (!inSeries) {
      if (preview) {
        const choice = { kind: repeat as Exclude<RepeatKind, 'never'>, weekdays: pickedDays, endDate: preview.end_date }
        return run(() => startSeries(next, choice, isNew))
      }
      return run(() => saveTask(next))
    }

    const fields = changedFields(next)
    if (fields.length === 0) return onClose()
    // Only a change the series itself carries needs the question; a new day or
    // a ticked status is always about this one day.
    if (running && seriesChanges(task, next).length > 0) return setStep('scope')
    return run(() => editOccurrence(task, next, fields))
  }

  async function askStop() {
    if (!series) return
    setUpcoming(await upcomingCount(series))
    setStep('stop')
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" onSubmit={save} role="dialog" aria-label={isNew ? 'New task' : 'Edit task'}>
        <h2>{isNew ? 'New task' : 'Edit task'}</h2>

        {step === 'scope' && series && (
          <div className="ts-question">
            <p className="ts-question-title">{draft.title}</p>
            <p className="ts-question-sub">{describeRule(series)}. Change which days?</p>
            <button type="button" className="ts-offer" disabled={busy}
              onClick={() => void run(() => editOccurrence(task, draft, changedFields()))}>
              <span className="ts-offer-name">Only this one</span>
              <span className="ts-offer-why">The other days keep their title, time and note.</span>
            </button>
            <button type="button" className="ts-offer" disabled={busy}
              onClick={() => void run(() => editFollowing(task, draft, changedFields()))}>
              <span className="ts-offer-name">This and following</span>
              <span className="ts-offer-why">The series changes, and so does every later day that is not done.</span>
            </button>
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setStep('form')}>Back</button>
            </div>
          </div>
        )}

        {step === 'stop' && series && (
          <div className="ts-question">
            <p className="ts-question-title">{series.title}</p>
            <p className="ts-question-sub">
              The series ends today.{' '}
              {upcoming === 0
                ? 'There are no later days to remove.'
                : `${upcoming} later ${upcoming === 1 ? 'day that is not done is' : 'days that are not done are'} removed.`}
              {' '}Today and anything already done stay.
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setStep('form')}>Back</button>
              <button type="button" className="btn btn-primary grow" disabled={busy}
                onClick={() => void run(() => stopSeries(series))}>Stop repeating</button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="form-grid">
              <label>What
                <input autoFocus required value={draft.title} placeholder="Mobility"
                  onChange={(e) => set('title', e.target.value)} />
              </label>
              <div className="two">
                <label>Day
                  <input type="date" value={draft.planned_date ?? ''} onChange={(e) => set('planned_date', e.target.value || null)} />
                </label>
                <label>Time
                  <input type="time" value={draft.planned_time?.slice(0, 5) ?? ''} onChange={(e) => set('planned_time', e.target.value || null)} />
                </label>
              </div>
              <div className="two">
                <label>Minutes
                  <input type="number" min={0} step={5} value={draft.duration_min ?? ''}
                    onChange={(e) => set('duration_min', e.target.value ? Number(e.target.value) : null)} />
                </label>
                <label>Section
                  <select value={draft.category ?? ''} onChange={(e) => set('category', e.target.value || null)}>
                    <option value="">—</option>
                    {['Work', 'Meal', 'Training', 'Learning', 'Home', 'Body', 'Night'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              {inSeries ? (
                <div className="ts-repeat">
                  <span className="ts-repeat-label">Repeat</span>
                  <p className="ts-repeat-rule">{describeRule(series)}</p>
                  {running && (
                    <button type="button" className="btn ts-stop" onClick={() => void askStop()}>Stop repeating</button>
                  )}
                </div>
              ) : (
                <>
                  <label>Repeat
                    <select value={repeat} onChange={(e) => chooseRepeat(e.target.value as RepeatKind)}>
                      {REPEAT_LABELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </label>
                  {(repeat === 'weekly' || repeat === 'biweekly') && (
                    <div className="ts-days" role="group" aria-label="Days">
                      {WEEK_ORDER.map((wd) => (
                        <button key={wd} type="button" className="ts-day" aria-pressed={pickedDays.includes(wd)}
                          onClick={() => toggleDay(wd)}>{dayName(wd)}</button>
                      ))}
                    </div>
                  )}
                  {repeat !== 'never' && (
                    <div className="two">
                      <label>Ends
                        <select value={endKind} onChange={(e) => setEndKind(e.target.value as 'never' | 'date')}>
                          <option value="never">Never</option>
                          <option value="date">On a date</option>
                        </select>
                      </label>
                      {endKind === 'date' && (
                        <label>Last day
                          <input type="date" min={start} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </label>
                      )}
                    </div>
                  )}
                  {preview && (
                    <p className="ts-repeat-rule">
                      {describeRule(preview)}. Starts {format(new Date(`${start}T12:00:00`), 'd MMM')}.
                      {endKind === 'date' && endDate && endDate < start ? ' The last day is before the first, so nothing repeats.' : ''}
                    </p>
                  )}
                </>
              )}

              <label style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={draft.locked} onChange={(e) => set('locked', e.target.checked)} />
                Locked — nothing may move it
              </label>
              <label>Note
                <textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
              </label>
            </div>
            {inSeries && confirmDelete && (
              <p className="ts-repeat-rule">Deleting removes this day only. The series goes on.</p>
            )}
            <div className="sheet-actions">
              {!isNew && !confirmDelete && <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>}
              {!isNew && confirmDelete && (
                <button type="button" className="btn" style={{ color: 'var(--e-warn)' }}
                  onClick={() => void deleteTask(task).then(onClose)}>{inSeries ? 'Delete this day' : 'Delete for good'}</button>
              )}
              <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
            </div>
          </>
        )}
      </form>
    </>
  )
}
