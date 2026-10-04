import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Task } from '../lib/types'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { saveTask } from '../lib/tasks'
import {
  changeSeriesRule, deleteTasks, editFollowing, editOccurrence, seriesChanges, startSeriesWith, stopSeries, upcomingCount,
} from '../lib/series'
import { describeRule, repeatChanged, repeatOfSeries, TASK_RULE_KINDS } from '../lib/series-rules'
import { cleanSection, sectionChoices } from '../lib/plan-view-rules'
import { savePlanPrefs, usePlanPrefs } from '../lib/plan-prefs'
import { applyTaskTemplate, duplicateOf, templateOfTask, templateRepeat, withTaskTemplate } from '../lib/task-sheet-rules'
import { useModuleColours } from '../lib/colours'
import { durationBetween, endFrom, shortSpan, toMinutes } from '../lib/timeframe'
import { Dropdown, type Option } from './Dropdown'
import { NoteEditor } from './NoteEditor'
import { NotesPage } from './NotesPage'
import { RepeatPicker, NO_REPEAT, type RepeatValue } from './RepeatPicker'
import { CopySheet } from './CopySheet'
import { MoreOptions } from './MoreOptions'
import { MoreMenu } from './MoreMenu'
import { GoalField, ProjectField } from '../sections/ProjectField'
import { useBackClose } from './useBackClose'
import { offerUndo } from './Undo'
import './tasksheet.css'

type Step = 'form' | 'scope' | 'rule' | 'stop' | 'template'

/** Add or edit one task (TSK-01 to TSK-09, TSK-20 to TSK-26).
 *
 *  Duration goes after the name, never inside it, and a locked task is one
 *  nothing (reminders' pushes or a future assistant) may move. A task with
 *  no day waits in Plan's Inbox (PLN-07): clearing its day never makes it
 *  vanish. Back and Escape close the sheet (TSK-09).
 *
 *  A task can repeat, with the one repeat control used everywhere. A new
 *  repeating task starts a series, which fills the weeks ahead; editing one
 *  of its days asks whether the change is for that day or for it and every
 *  day after, and a new rule asks whether it is for every day or from this
 *  one on (GEN-23).
 *
 *  Duplicate opens a copy of the task in this same sheet, as a new task,
 *  so anything can be changed before saving (TSK-24).
 *
 *  Staged (v17, CALM-08): what a task needs is in sight (what, day, time,
 *  minutes, repeat, note); the rest (an end time instead of minutes,
 *  section, project, goal, fixed, locked, starting from a saved task) is in
 *  one "More options", open by itself when any of it is set. Copy to…,
 *  Duplicate and Save as template are in the ⋮ beside the title. */
export function TaskSheet({ task, isNew, onClose }: { task: Task; isNew: boolean; onClose: () => void }) {
  const [open, setOpen] = useState({ task, isNew, n: 0 })
  return (
    <TaskForm key={open.n} task={open.task} isNew={open.isNew} onClose={onClose}
      onDuplicate={(t) => setOpen((o) => ({ task: duplicateOf(t, crypto.randomUUID(), new Date().toISOString()), isNew: true, n: o.n + 1 }))} />
  )
}

function TaskForm({ task, isNew, onClose, onDuplicate }: {
  task: Task; isNew: boolean; onClose: () => void; onDuplicate: (draft: Task) => void
}) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const prefs = usePlanPrefs(profile?.id)
  const colours = useModuleColours()
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
  const [copyOpen, setCopyOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [busy, setBusy] = useState(false)
  const [upcoming, setUpcoming] = useState(0)
  const [newSection, setNewSection] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [said, setSaid] = useState('')
  // The note template this task was started from (NOT-13), so Save as
  // template can carry it rather than a copy of its text (NOT-15).
  const [noteTpl, setNoteTpl] = useState<string | null>(null)
  const [carryNote, setCarryNote] = useState(true)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((d) => ({ ...d, [k]: v }))

  useBackClose(onClose)
  // The note page closes itself on Back, keeping what was typed.

  const today = format(new Date(), 'yyyy-MM-dd')
  // Undefined while it is being read, null when there is none.
  const series = useLiveQuery(
    async () => (task.series_id ? (await db.series.get(task.series_id)) ?? null : null),
    [task.series_id])
  const inSeries = !!series && !series.deleted_at
  // A series that ended before today has nothing left to change or stop.
  const running = inSeries && series.active && (!series.end_date || series.end_date >= today)

  // The repeat control: a new rule for a one-off task, or the series' own
  // rule, which can be changed while it runs (GEN-23).
  const [repeatEdit, setRepeatEdit] = useState<RepeatValue | null>(null)
  // Redraws the control when a saved task brings its own repeat.
  const [pickerKey, setPickerKey] = useState(0)
  const seriesRepeat = useMemo<RepeatValue | null>(() => (series ? { ...repeatOfSeries(series) } as RepeatValue : null), [series])
  const repeat: RepeatValue = repeatEdit ?? seriesRepeat ?? NO_REPEAT
  const ruleChanged = inSeries && running && !!repeatEdit && !!series && repeatChanged(series, repeatEdit)

  const day = draft.planned_date
  const start = day ?? today
  const endsEarly = !!repeat.rule && !!repeat.end_date && repeat.end_date < start
  // Picking dates with none picked would be a series with nothing in it.
  const noDates = repeat.rule === 'dates' && (repeat.rule_config.dates ?? []).length === 0

  // GEN-05: sections of modules that are on, the person's own, and the
  // task's own, so it never shows blank.
  const sections = sectionChoices(colours.enabled, prefs.own_sections, task.category)
  const sectionOptions: Option[] = [{ value: '', label: '—' }, ...sections.map((c) => ({ value: c, label: c })),
    { value: '__new', label: 'New section…' }]

  // An end time means nothing without a start, so the choice waits for one.
  const hasStart = toMinutes(draft.planned_time) !== null
  const showUntil = until && hasStart

  const savedTemplates = settings.task_templates
  const usedNoteTemplate = noteTpl ? settings.note_templates.find((t) => t.id === noteTpl) ?? null : null

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

  function chooseSection(v: string) {
    if (v === '__new') { setNewSection(''); return }
    set('category', v || null)
  }

  async function addSection() {
    const name = cleanSection(newSection)
    setNewSection(null)
    if (!name || !profile) return
    set('category', name)
    if (!sections.includes(name)) await savePlanPrefs(profile.id, { own_sections: [...prefs.own_sections, name].slice(-20) })
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

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    const title = draft.title.trim()
    if (!title || busy || endsEarly || noDates) return
    const next = { ...draft, title }
    setDraft(next)

    if (!inSeries) {
      // A repeat needs a day to start from.
      if (repeat.rule && next.planned_date) {
        return run(() => startSeriesWith(next, repeat, isNew, isNew ? [] : changedFields(next)))
      }
      return run(() => saveTask(next))
    }

    // "Does not repeat" chosen for a running series is Stop repeating.
    if (running && repeatEdit && !repeatEdit.rule) return askStop()
    if (ruleChanged) return setStep('rule')
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

  async function remove() {
    const undo = await deleteTasks([task])
    offerUndo(inSeries ? 'This day deleted' : 'Task deleted', undo)
    onClose()
  }

  async function saveTemplate() {
    if (!profile) return
    const t = templateOfTask({ ...draft, title: draft.title.trim() }, templateName, repeat.rule ? repeat : null,
      savedTemplates.map((x) => x.id), carryNote ? usedNoteTemplate : null)
    await saveSettings(profile, { task_templates: withTaskTemplate(savedTemplates, t) })
    setSaid(`Saved as the template “${t.name}”.`)
    setStep('form')
  }

  function startFrom(id: string) {
    const tpl = savedTemplates.find((t) => t.id === id)
    if (!tpl) return
    setDraft((d) => applyTaskTemplate(d, tpl, settings.note_templates))
    setNoteTpl(tpl.note_template_id)
    const r = templateRepeat(tpl)
    setRepeatEdit(r ? { ...r } as RepeatValue : null)
    setPickerKey((k) => k + 1)
  }

  const heading = isNew ? (task.planned_date ? 'New task' : 'New task for the Inbox') : 'Edit task'
  const named = !!draft.title.trim()
  // Never a sheet on a sheet (CALM-10): while copying, the copy dialog
  // stands in for this one, and Back or Cancel there comes back here.
  if (copyOpen) {
    return <CopySheet what={{ kind: 'task', task: { ...draft, title: draft.title.trim() } }} onClose={() => setCopyOpen(false)} />
  }
  const extras = [
    draft.category ? `Section ${draft.category}` : null,
    draft.project_id ? 'a project' : null,
    draft.goal_id ? 'a goal' : null,
    draft.fixed ? 'fixed' : null,
    draft.locked ? 'locked' : null,
  ].filter(Boolean).join(' · ')
  const hasExtras = !!(task.category || task.project_id || task.goal_id || task.fixed || task.locked)

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" onSubmit={(e) => void save(e)} role="dialog" aria-modal="true" aria-label={heading}>
        <div className="ts-top">
          <h2>{heading}</h2>
          {step === 'form' && (
            <MoreMenu label="More for this task" items={[
              !isNew && { label: 'Copy to…', disabled: !named, onSelect: () => setCopyOpen(true) },
              !isNew && { label: 'Duplicate', disabled: !named, onSelect: () => onDuplicate({ ...draft, title: draft.title.trim() }) },
              { label: 'Save as template…', disabled: !named, onSelect: () => { setTemplateName(draft.title.trim()); setStep('template') } },
            ]} />
          )}
        </div>

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

        {step === 'rule' && series && repeatEdit && (
          <div className="ts-question">
            <p className="ts-question-title">{draft.title}</p>
            <p className="ts-question-sub">
              From “{describeRule(series)}” to “{describeRule({ ...series, ...repeatEdit, occurrence_count: repeatEdit.count ?? null } as never)}”. For which days?
            </p>
            <button type="button" className="ts-offer" disabled={busy}
              onClick={() => void run(() => changeSeriesRule(base, { ...draft, title: draft.title.trim() }, changedFields(), repeatEdit, 'following'))}>
              <span className="ts-offer-name">This and following</span>
              <span className="ts-offer-why">Days before this one keep the old rule; from this day on, the new one.</span>
            </button>
            <button type="button" className="ts-offer" disabled={busy}
              onClick={() => void run(() => changeSeriesRule(base, { ...draft, title: draft.title.trim() }, changedFields(), repeatEdit, 'all'))}>
              <span className="ts-offer-name">All days</span>
              <span className="ts-offer-why">The whole series takes the new rule. Days already past, and anything done, stay as they were.</span>
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

        {step === 'template' && (
          <div className="ts-question">
            <label className="ts-template-name">Template name
              <input autoFocus value={templateName} placeholder={draft.title || 'Morning read'} maxLength={60}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveTemplate() } }} />
            </label>
            <p className="ts-question-sub">Keeps the title, length, section, lock, note{repeat.rule ? ' and repeat' : ''}. Start a new task from it with “Start from a saved task”.</p>
            {usedNoteTemplate && (
              <label className="ts-check">
                <input type="checkbox" checked={carryNote} onChange={(e) => setCarryNote(e.target.checked)} />
                <span>Bring the note template “{usedNoteTemplate.name}”
                  <span className="ts-check-sub">{usedNoteTemplate.after_done
                    ? 'Each new task asks for it when ticked done.'
                    : 'Each new task gets it filled in for its own day, instead of a copy of this note.'}</span></span>
              </label>
            )}
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setStep('form')}>Back</button>
              <button type="button" className="btn btn-primary grow" onClick={() => void saveTemplate()}>Save template</button>
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
              <div className="ts-daycell">
                <label>Day
                  <input type="date" value={day ?? ''} onChange={(e) => set('planned_date', e.target.value || null)} />
                </label>
                {day ? (
                  <button type="button" className="ts-inbox-link"
                    onClick={() => set('planned_date', null)}>No day (Inbox)</button>
                ) : (
                  <button type="button" className="ts-inbox-link" onClick={() => set('planned_date', today)}>Today</button>
                )}
              </div>
              <div className="two">
                <label>Time
                  <input type="time" value={draft.planned_time?.slice(0, 5) ?? ''} onChange={(e) => changeStart(e.target.value)} />
                </label>
                {/* Minutes, or an end time when "End time instead" is on (in
                    More options): one cell either way (TSK-02). */}
                {showUntil ? (
                  <label>
                    <span className="ts-dur-name">Ends{draft.duration_min ? ` · ${shortSpan(draft.duration_min)}` : ''}</span>
                    <input type="time" aria-label="End time" value={endTime} onChange={(e) => changeEnd(e.target.value)} />
                  </label>
                ) : (
                  <label>Minutes
                    <input type="number" min={0} step={5} value={draft.duration_min ?? ''}
                      onChange={(e) => set('duration_min', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                )}
              </div>

              {inSeries && !running && (
                <div className="ts-repeat">
                  <span className="ts-repeat-label">Repeat</span>
                  <p className="ts-repeat-rule">{describeRule(series)}. This series has ended.</p>
                </div>
              )}
              {series !== undefined && (!inSeries || running) && (day ? (
                <div className="ts-repeatbox">
                  <RepeatPicker key={`${series?.id ?? 'new'}:${pickerKey}`} value={repeat} onChange={setRepeatEdit} start={start} today={today}
                    kinds={TASK_RULE_KINDS} allowCount loose noneLabel={inSeries ? 'Stop repeating' : 'Does not repeat'} />
                  {running && (
                    <button type="button" className="btn ts-stop" onClick={() => void askStop()}>Stop repeating</button>
                  )}
                  {!inSeries && repeat.rule === 'dates' && !noDates && !(repeat.rule_config.dates ?? []).includes(start) && (
                    <p className="ts-repeat-rule">
                      {isNew ? 'The day above is not picked, so nothing is added on it.' : 'The day above is not picked, so this task stays there as a one-off.'}
                    </p>
                  )}
                  {ruleChanged && <p className="ts-repeat-rule">Saving asks whether the new rule is for every day or from this one on.</p>}
                </div>
              ) : (
                <p className="ts-repeat-rule">Give it a day to make it repeat.</p>
              ))}

              <NoteEditor value={draft.notes ?? ''} onChange={(text) => set('notes', text || null)}
                context={{ day: start, title: draft.title.trim() || undefined, time: draft.planned_time, start: repeat.rule ? start : null }}
                startLabel={isNew ? 'Start from a note template' : undefined}
                onTemplateUsed={(t) => setNoteTpl(t.id)}
                aside={<button type="button" className="ne-open" onClick={() => setNotesOpen(true)}>Open as page</button>} />

              <MoreOptions open={hasExtras} summary={extras || null}>
                {isNew && savedTemplates.length > 0 && (
                  <div className="ts-field">
                    <span className="ts-field-name">Start from a saved task</span>
                    <Dropdown label="Start from a saved task" value="" placeholder="Choose one"
                      options={savedTemplates.map((t) => ({ value: t.id, label: t.name }))} onChange={startFrom} />
                  </div>
                )}
                <label className="ts-check" title={hasStart ? undefined : 'Set a time first'}>
                  <input type="checkbox" checked={showUntil} disabled={!hasStart} onChange={(e) => chooseUntil(e.target.checked)} />
                  <span>End time instead of minutes</span>
                </label>
                <div className="ts-field">
                  <span className="ts-field-name">Section</span>
                  {newSection === null ? (
                    <Dropdown label="Section" placeholder="—" value={draft.category ?? ''}
                      options={sectionOptions} onChange={chooseSection} />
                  ) : (
                    <div className="ts-newsection">
                      <input autoFocus aria-label="New section name" value={newSection} maxLength={30} placeholder="Garden"
                        onChange={(e) => setNewSection(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void addSection() }
                          if (e.key === 'Escape') { e.preventDefault(); setNewSection(null) }
                        }}
                        onBlur={() => void addSection()} />
                    </div>
                  )}
                </div>

                {/* Projects and goals: shown only while Projects is on (P1). */}
                <ProjectField value={draft.project_id ?? null} onChange={(id) => set('project_id', id)} />
                <GoalField value={draft.goal_id} onChange={(id) => set('goal_id', id)} />

                {/* What each one means is in its tooltip, not a line under it (CALM-11). */}
                <label className="ts-check" title="It belongs at this day and time: moving it asks first.">
                  <input type="checkbox" checked={draft.fixed} onChange={(e) => set('fixed', e.target.checked)} />
                  <span>Fixed</span>
                </label>
                <label className="ts-check" title="Nothing may move it: no pushes, and it stays when days swap.">
                  <input type="checkbox" checked={draft.locked} onChange={(e) => set('locked', e.target.checked)} />
                  <span>Locked</span>
                </label>
              </MoreOptions>
            </div>

            {said && <p className="ts-repeat-rule" role="status">{said}</p>}

            {inSeries && confirmDelete && (
              <p className="ts-repeat-rule">Deleting removes this day only. The series goes on.</p>
            )}
            <div className="sheet-actions">
              {!isNew && !confirmDelete && <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>}
              {!isNew && confirmDelete && (
                <button type="button" className="btn" style={{ color: 'var(--e-warn)' }}
                  onClick={() => void remove()}>{inSeries ? 'Delete this day' : 'Delete'}</button>
              )}
              <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || endsEarly || noDates}>Save</button>
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
