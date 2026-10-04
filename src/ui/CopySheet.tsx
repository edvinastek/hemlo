import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { addDays } from '../lib/schedule-rules'
import {
  cleanTargets, copiesWithDay, dayLabel, mealCount, mondayOf, shortcutDays, shortcutLabel, shortcutsFor, shownDays,
  targetWords, toggleShortcut, toggleTarget, type CopyChoices, type NotesChoice, type TimeChoice,
} from '../lib/copy-rules'
import { runCopy, type CopyWhat } from '../lib/copy'
import { groupKey } from '../lib/meal-rules'
import { savePlanPrefs, usePlanPrefs } from '../lib/plan-prefs'
import { MonthScroller } from './MonthScroller'
import { MoreOptions } from './MoreOptions'
import { Dropdown } from './Dropdown'
import { useDayRange } from './useDayRange'
import { useBackClose } from './useBackClose'
import { offerUndo } from './Undo'
import './copysheet.css'

export type { CopyWhat } from '../lib/copy'

/** THE copy dialog (GEN-55, TSK-20 to TSK-25, PLN-06): one task, several,
 *  a whole day, a whole week or a day's meals (all, or one meal; v18), onto
 *  one or many days, always asking the
 *  same things in the same order (P4, rule 5 of the interaction rules):
 *
 *  1. which days (a calendar, or Tomorrow / Every weekday this week / Same
 *     day next week; for a week, Next week / The next 4 weeks);
 *  2. the time (same, new, none) — for tasks;
 *  3. what the notes become (same, ticks cleared, none, a note template),
 *     remembered for next time;
 *  4. what to keep (section, length, lock) and, for a day or week, what to
 *     bring along (tasks, repeating tasks as one-offs, meals).
 *
 *  Copies are new, independent tasks. Undo takes the whole copy back.
 *
 *  Calm (v17): the days and the calendar are in sight; 2 to 4 wait in one
 *  "Options" line that says what is chosen ("Same time, same notes"), since
 *  they are remembered and seldom changed (CALM-08). */
export function CopySheet({ what, onClose, onDone }: { what: CopyWhat; onClose: () => void; onDone?: (days: string[]) => void }) {
  useBackClose(onClose)
  const profile = useApp((s) => s.profile)
  const prefs = usePlanPrefs(profile?.id)
  const { range, today } = useDayRange()
  const noteTemplates = readSettings(profile).note_templates
  const [choices, setChoices] = useState<CopyChoices | null>(null)
  const c = choices ?? prefs.copy
  const set = (patch: Partial<CopyChoices>) => setChoices({ ...c, ...patch })
  const [days, setDays] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const kind = what.kind
  const from = what.kind === 'task' ? what.task.planned_date ?? today
    : what.kind === 'tasks' ? what.tasks[0]?.planned_date ?? today
      : what.kind === 'week' ? what.monday : what.day
  const week = kind === 'week'
  const isTasks = kind === 'task' || kind === 'tasks'
  // Meals (GEN-55): only the days; Food's copy keeps their times and portions.
  const isMeals = kind === 'meals'
  const mealGroups = what.kind === 'meals' ? what.groups : 'all'
  const list = kind === 'task' ? [what.task] : kind === 'tasks' ? what.tasks : []
  const targets = cleanTargets(days, kind, from, range)

  // What a day or week holds, to say what comes along.
  const source = useLiveQuery(async () => {
    if (!profile || isTasks) return null
    const last = week ? addDays(from, 6) : from
    const [tasks, meals] = await Promise.all([
      db.task.where('[profile_id+planned_date]').between([profile.id, from], [profile.id, last], true, true).toArray(),
      db.meal_plan_slot.where('profile_id').equals(profile.id).filter((s) => s.slot_date >= from && s.slot_date <= last).toArray(),
    ])
    return { tasks, meals: mealGroups === 'all' ? meals : meals.filter((m) => mealGroups.includes(groupKey(m))) }
  }, [profile?.id, from, week, isTasks, mealGroups === 'all' ? 'all' : mealGroups.join('|')], null)
  const counts = useMemo(() => {
    if (!source) return { tasks: 0, repeats: 0, meals: 0 }
    const all = { ...c, tasks: true, repeats: true }
    const live = source.tasks.filter((t) => copiesWithDay(t, all))
    return {
      tasks: live.filter((t) => !t.series_id).length,
      repeats: live.filter((t) => !!t.series_id).length,
      meals: mealCount(source.meals),
    }
  }, [source, c])

  const title = kind === 'task' ? `Copy “${what.task.title || 'task'}” to…`
    : kind === 'tasks' ? `Copy ${what.tasks.length} ${what.tasks.length === 1 ? 'task' : 'tasks'} to…`
      : what.kind === 'day' ? `Copy ${dayLabel(what.day)} to…`
        : what.kind === 'meals' ? `Copy ${what.label ?? `the food of ${dayLabel(what.day)}`} to…`
          : `Copy the week of ${dayLabel(what.monday).slice(4)} to…`

  const picked = useMemo(() => new Set(shownDays(targets, kind)), [targets, kind])
  const sourceDays = useMemo(() => new Set(kind === 'day' || isMeals ? [from] : week ? shownDays([mondayOf(from)], 'week') : []), [kind, isMeals, from, week])
  const oneTime = list.length === 1 ? list[0].planned_time?.slice(0, 5) ?? null : null
  const tpl = noteTemplates.find((t) => t.id === c.templateId)
  const nothing = isMeals ? !!source && counts.meals === 0
    : !isTasks && ((!c.tasks || counts.tasks === 0) && (!c.repeats || counts.repeats === 0) && (!c.meals || counts.meals === 0))
  const badTime = c.time === 'new' && !c.newTime

  // The closed Options line: what the copy will do, in a few words.
  const summary = [
    isTasks ? (c.time === 'keep' ? (list.length > 1 ? 'Times kept' : 'Same time') : c.time === 'new' ? (c.newTime ? `At ${c.newTime}` : 'A new time') : 'No time') : null,
    c.notes === 'same' ? 'same notes' : c.notes === 'cleared' ? 'notes with ticks cleared' : c.notes === 'none' ? 'no notes' : `notes from ${tpl?.name ?? 'a template'}`,
    !isTasks ? ([c.tasks && 'tasks', c.repeats && 'repeats', c.meals && 'meals'].filter(Boolean).join(', ') || 'nothing brought') : null,
    [!c.keepSection && 'section', !c.keepMinutes && 'length', !c.keepLocked && 'lock'].filter(Boolean).length
      ? `without ${[!c.keepSection && 'section', !c.keepMinutes && 'length', !c.keepLocked && 'lock'].filter(Boolean).join(', ')}` : null,
  ].filter(Boolean).join(', ')
  const said = summary.charAt(0).toUpperCase() + summary.slice(1)

  async function copy() {
    if (!profile || busy || targets.length === 0 || nothing || badTime) return
    setBusy(true)
    try {
      const result = await runCopy(profile.id, what, targets, c, noteTemplates)
      // The choices are kept for next time (TSK-22), on every device. A meals
      // copy has none of its own.
      if (!isMeals) await savePlanPrefs(profile.id, { copy: c })
      const skipped = result.skippedRepeats ? ` (${result.skippedRepeats} ${result.skippedRepeats === 1 ? 'repeat was' : 'repeats were'} there already)` : ''
      offerUndo(result.summary + skipped, result.undo)
      onDone?.(targets)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const radio = <T extends string>(name: string, value: T, current: T, onPick: (v: T) => void, label: string, sub?: string) => (
    <label className="cs-choice">
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} />
      <span><span className="cs-choice-name">{label}</span>{sub && <span className="cs-choice-sub">{sub}</span>}</span>
    </label>
  )
  const check = (on: boolean, onToggle: (v: boolean) => void, label: string, sub?: string, disabled?: boolean) => (
    <label className={`cs-choice${disabled ? ' is-off' : ''}`}>
      <input type="checkbox" checked={on && !disabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
      <span><span className="cs-choice-name">{label}</span>{sub && <span className="cs-choice-sub">{sub}</span>}</span>
    </label>
  )

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet cs-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>

        <section className="cs-part" aria-labelledby="cs-days">
          <h3 id="cs-days" className="cs-head">{week ? 'Weeks' : 'Days'}</h3>
          <div className="cs-quick" role="group" aria-label="Quick choices">
            {shortcutsFor(kind).map((s) => {
              const its = shortcutDays(s, from, today)
              const on = its.length > 0 && its.every((d) => targets.includes(d))
              return (
                <button key={s} type="button" className="cs-chip" aria-pressed={on} disabled={its.length === 0}
                  title={its.length === 0 ? 'No days left this week' : its.map(dayLabel).join(', ')}
                  onClick={() => setDays((ds) => toggleShortcut(cleanTargets(ds, kind, from, range), s, from, today))}>
                  {shortcutLabel(s, from, today)}
                </button>
              )
            })}
          </div>
          <div className="cs-count">
            <span aria-live="polite">{targets.length === 0 ? (week ? 'Tap a day in each week to copy to.' : 'Tap the days to copy to.') : `To ${targetWords(targets, kind)}`}</span>
            <button type="button" className="btn cs-clear" disabled={targets.length === 0} onClick={() => setDays([])}>Clear</button>
          </div>
          <MonthScroller first={range.first} last={range.last} openAt={from > today ? from : today} today={today}
            label={week ? 'Weeks to copy to' : 'Days to copy to'} selected={picked}
            disabled={(d) => d < today || sourceDays.has(d)}
            onDayClick={(d) => setDays((ds) => toggleTarget(cleanTargets(ds, kind, from, range), d, kind))} />
        </section>

        {isMeals && nothing && <p className="cs-count" role="status">There is no food to copy here.</p>}

        {!isMeals && (
        <MoreOptions label="Options" summary={said} open={badTime || nothing}>
        {isTasks && (
          <section className="cs-part" role="radiogroup" aria-labelledby="cs-time">
            <h3 id="cs-time" className="cs-head">Time</h3>
            {radio<TimeChoice>('cs-time', 'keep', c.time, (time) => set({ time }), oneTime ? `Same time, ${oneTime}` : list.length > 1 ? 'Each keeps its time' : 'Same time (none)')}
            <div className="cs-row">
              {radio<TimeChoice>('cs-time', 'new', c.time, (time) => set({ time }), 'A new time')}
              {c.time === 'new' && (
                <input type="time" className="cs-time" aria-label="New time" value={c.newTime ?? ''}
                  onChange={(e) => set({ newTime: e.target.value || null })} />
              )}
            </div>
            {radio<TimeChoice>('cs-time', 'none', c.time, (time) => set({ time }), 'No time', 'In "Any time" on the day')}
          </section>
        )}

        <section className="cs-part" role="radiogroup" aria-labelledby="cs-notes">
          <h3 id="cs-notes" className="cs-head">Notes</h3>
          {radio<NotesChoice>('cs-notes', 'same', c.notes, (notes) => set({ notes }), 'Same notes')}
          {radio<NotesChoice>('cs-notes', 'cleared', c.notes, (notes) => set({ notes }), 'Same notes, ticks cleared', 'A checklist starts fresh')}
          {radio<NotesChoice>('cs-notes', 'none', c.notes, (notes) => set({ notes }), 'No notes')}
          {radio<NotesChoice>('cs-notes', 'template', c.notes, (notes) => set({ notes, templateId: c.templateId ?? noteTemplates[0]?.id ?? null }),
            'A note template', noteTemplates.length === 0 ? 'You have no note templates' : tpl?.after_done ? 'Asks for it when the task is done' : undefined)}
          {c.notes === 'template' && noteTemplates.length > 0 && (
            <div className="ts-field cs-template">
              <span className="ts-field-name">Template</span>
              <Dropdown label="Note template" value={c.templateId ?? ''} placeholder="Choose a template"
                options={noteTemplates.map((t) => ({ value: t.id, label: t.name }))} onChange={(templateId) => set({ templateId })} />
            </div>
          )}
        </section>

        {!isTasks && (
          <section className="cs-part" aria-labelledby="cs-bring">
            <h3 id="cs-bring" className="cs-head">Bring along</h3>
            {check(c.tasks, (tasks) => set({ tasks }), 'Tasks', source ? count(counts.tasks, 'task') : undefined, counts.tasks === 0)}
            {check(c.repeats, (repeats) => set({ repeats }), 'Repeating tasks, as one-offs',
              source ? `${count(counts.repeats, 'task')}. Their series already have days of their own.` : undefined, counts.repeats === 0)}
            {check(c.meals, (meals) => set({ meals }), 'Meals', source ? `${count(counts.meals, 'meal')}, with their food and portions` : undefined, counts.meals === 0)}
          </section>
        )}

        <section className="cs-part" aria-labelledby="cs-keep">
          <h3 id="cs-keep" className="cs-head">Keep</h3>
          <div className="cs-keep">
            {check(c.keepSection, (keepSection) => set({ keepSection }), 'Section')}
            {check(c.keepMinutes, (keepMinutes) => set({ keepMinutes }), 'Length')}
            {check(c.keepLocked, (keepLocked) => set({ keepLocked }), 'Locked')}
          </div>
        </section>
        </MoreOptions>
        )}

        <div className="sheet-actions cs-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary grow" disabled={busy || targets.length === 0 || nothing || badTime} onClick={() => void copy()}>
            {targets.length === 0 ? 'Copy' : `Copy to ${targetWords(targets, kind)}`}
          </button>
        </div>
      </div>
    </>
  )
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
