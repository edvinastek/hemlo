import { useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Task } from '../lib/types'
import { db } from '../lib/db'
import { deleteTask, saveTask } from '../lib/tasks'
import { deleteOccurrence, editFollowing, editOccurrence, seriesChanges, startSeries, stopSeries, upcomingCount } from '../lib/series'
import { dayName, describeRule, endsBeforeStart, ruleFromChoice, weekdayOf, WEEK_ORDER, type RepeatKind } from '../lib/series-rules'
import { durationBetween, endFrom, shortSpan, toMinutes } from '../lib/timeframe'
import { Dropdown, type Option } from './Dropdown'
import { NoteEditor } from './NoteEditor'
import { NotesPage } from './NotesPage'
import './tasksheet.css'

const REPEAT_OPTIONS: Option<RepeatKind>[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly on chosen days' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly, same day' },
]

const END_OPTIONS: Option<'never' | 'date'>[] = [
  { value: 'never', label: 'Never' },
  { value: 'date', label: 'On a date' },
]

const SECTIONS = ['Work', 'Meal', 'Training', 'Learning', 'Home', 'Body', 'Night']

type Step = 'form' | 'scope' | 'stop'

/** Add or edit one task. Duration goes after the name, never inside it, and a
 *  locked task is one nothing — reminders' pushes or a future assistant — may move.
 *
 *  A task can repeat. A new repeating task starts a series, which fills the
 *  weeks ahead with its own tasks; editing one of those asks whether the
 *  change is for that day or for it and every day after. */
export function TaskSheet({ task, isNew, onClose }: { task: Task; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Task>(task)
  // The task as it is saved. It starts as the one opened and moves on when
  // the notes page saves a tick, so Save afterwards sees only what else
  // changed and does not ask a series about a ticked box.
  const [base, setBase] = useState<Task>(task)
  // A length can be typed as minutes or picked as an end time. Minutes are
  // what is stored, so a task always opens showing them.
  const [until, setUntil] = useState(false)
  const [endTime, setEndTime] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
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
  // A section set elsewhere (by a module, say) stays choosable rather than
  // showing as blank.
  const sectionOptions: Option[] = [{ value: '', label: '—' },
    ...[...SECTIONS, ...(task.category && !SECTIONS.includes(task.category) ? [task.category] : [])]
      .map((c) => ({ value: c, label: c }))]
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

  const endsEarly = !!preview && endsBeforeStart(start, preview.end_date)

  // An end time means nothing without a start, so the choice waits for one.
  const hasStart = toMinutes(draft.planned_time) !== null
  const showUntil = until && hasStart

  function chooseUntil(on: boolean) {
    // Ticking never changes the length by itself: the end shown is the one the
    // current minutes give, or blank when there are none (or a day or more).
    if (on) setEndTime(endFrom(draft.planned_time, draft.duration_min) ?? '')
    setUntil(on)
  }

  function changeEnd(end: string) {
    setEndTime(end)
    const mins = durationBetween(draft.planned_time, end)
    if (mins !== null) set('duration_min', mins || null)
  }

  // With an end time showing, moving the start keeps the end where it is:
  // "until five" still means five. The length is what gives.
  function changeStart(time: string) {
    set('planned_time', time || null)
    if (!showUntil || !endTime) return
    const mins = durationBetween(time, endTime)
    if (mins !== null) set('duration_min', mins || null)
  }

  /** The notes page keeps what it changes at once for a task that exists, so
   *  a ticked box lasts even if the sheet is then cancelled. Only the note is
   *  written, on top of the row as it is on this device, so a half-edited
   *  title here is not saved with it. A new task has no row yet: its note
   *  waits in the form for Save like everything else. */
  async function keepNotes(notes: string | null) {
    set('notes', notes)
    if (isNew) return
    setBase((b) => ({ ...b, notes }))
    const current = (await db.task.get(task.id)) ?? base
    await saveTask({ ...current, notes }, ['notes'])
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
    (Object.keys(next) as (keyof Task & string)[]).filter((k) => k !== 'updated_at' && next[k] !== base[k])

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
        // A last day before the first would leave the series empty and the new
        // task saved nowhere, so nothing is saved until the dates make sense.
        if (endsEarly) return
        return run(() => startSeries(next, choice, isNew, isNew ? [] : changedFields(next)))
      }
      return run(() => saveTask(next))
    }

    const fields = changedFields(next)
    if (fields.length === 0) return onClose()
    // Only a change the series itself carries needs the question; a new day or
    // a ticked status is always about this one day.
    if (running && seriesChanges(base, next).length > 0) return setStep('scope')
    return run(() => editOccurrence(base, next, fields))
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
              onClick={() => void run(() => editOccurrence(base, draft, changedFields()))}>
              <span className="ts-offer-name">Only this one</span>
              <span className="ts-offer-why">The other days keep their title, time and note.</span>
            </button>
            <button type="button" className="ts-offer" disabled={busy}
              onClick={() => void run(() => editFollowing(base, draft, changedFields()))}>
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
                  <input type="time" value={draft.planned_time?.slice(0, 5) ?? ''} onChange={(e) => changeStart(e.target.value)} />
                </label>
              </div>
              <div className="two">
                {/* One cell, two ways to give the length; the box in its corner
                    switches between them without adding a row. */}
                <div className="ts-dur">
                  {showUntil ? (
                    <label>
                      <span className="ts-dur-name">Ends{draft.duration_min ? ` · ${shortSpan(draft.duration_min)}` : ''}</span>
                      <input type="time" aria-label="End time" value={endTime} onChange={(e) => changeEnd(e.target.value)} />
                    </label>
                  ) : (
                    <label>
                      <span className="ts-dur-name">Minutes</span>
                      <input type="number" min={0} step={5} value={draft.duration_min ?? ''}
                        onChange={(e) => set('duration_min', e.target.value ? Number(e.target.value) : null)} />
                    </label>
                  )}
                  <label className="ts-until" title={hasStart ? 'Give an end time instead of minutes' : 'Set a time first'}>
                    <input type="checkbox" checked={showUntil} disabled={!hasStart} onChange={(e) => chooseUntil(e.target.checked)} />
                    Until
                  </label>
                </div>
                <div className="ts-field">
                  <span className="ts-field-name">Section</span>
                  <Dropdown className="dd-end" label="Section" placeholder="—" value={draft.category ?? ''}
                    options={sectionOptions} onChange={(v) => set('category', v || null)} />
                </div>
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
                  <div className="ts-field">
                    <span className="ts-field-name">Repeat</span>
                    <Dropdown label="Repeat" value={repeat} options={REPEAT_OPTIONS} onChange={chooseRepeat} />
                  </div>
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
                      <div className="ts-field">
                        <span className="ts-field-name">Ends</span>
                        <Dropdown label="Ends" value={endKind} options={END_OPTIONS} onChange={setEndKind} />
                      </div>
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
                      {endsEarly ? ' The last day is before the first. Pick a later one to save.' : ''}
                    </p>
                  )}
                </>
              )}

              <label style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={draft.locked} onChange={(e) => set('locked', e.target.checked)} />
                Locked — nothing may move it
              </label>
              <NoteEditor value={draft.notes ?? ''} onChange={(text) => set('notes', text || null)}
                aside={<button type="button" className="ne-open" onClick={() => setNotesOpen(true)}>Open as page</button>} />
            </div>
            {inSeries && confirmDelete && (
              <p className="ts-repeat-rule">Deleting removes this day only. The series goes on.</p>
            )}
            <div className="sheet-actions">
              {!isNew && !confirmDelete && <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>}
              {!isNew && confirmDelete && (
                <button type="button" className="btn" style={{ color: 'var(--e-warn)' }}
                  onClick={() => void (inSeries ? deleteOccurrence(task) : deleteTask(task)).then(onClose)}>{inSeries ? 'Delete this day' : 'Delete for good'}</button>
              )}
              <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || endsEarly}>Save</button>
            </div>
          </>
        )}
      </form>
      {notesOpen && (
        <NotesPage title={draft.title} notes={draft.notes} onKeep={(n) => void keepNotes(n)} onClose={() => setNotesOpen(false)} />
      )}
    </>
  )
}
