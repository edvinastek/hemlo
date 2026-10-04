import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import type { Habit, HabitLog } from '../lib/types'
import {
  archiveHabit, blankHabit, moduleEnabled, moveInList, restoreHabit, retireHabitsDailyRule, saveHabit, setHabitAmount,
  setHabitChecks, setHabitDone, toggleHabit,
} from '../lib/tracking'
import {
  DAY_PARTS, DAY_PART_LABEL, amountText, dayChecklist, doneDays, habitKept, habitMonth, habitStreak, habitStreakText,
  habitStrength, habitWhen, habitYear, monthAfter, monthBefore, nextSortOrder, pickLog, toggleDayCheck, type DayPart,
  type HistoryCell,
} from '../lib/tracking-rules'
import { describeSchedule, habitDay, habitSchedule, shortDate } from '../lib/schedule-rules'
import { hasNote } from '../lib/notes'
import { SWATCHES } from '../lib/colours-rules'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { NoteEditor } from '../ui/NoteEditor'
import { offerUndo } from '../ui/Undo'
import { MoreOptions } from '../ui/MoreOptions'
import { TrackSheet, Choices, SwitchRow } from './TrackSheet'
import './tracking.css'
import { planToday } from '../lib/day-edge'

const HABIT_KINDS = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'times_per_week', 'monthly', 'monthly_nth', 'yearly', 'dates'] as const

/** Habits: on their page, every habit with its tick for the day, its run
 *  and its strength, and, opened, its pinned checklist ticked for the day
 *  (HAB-11), its history to look back on and correct (HAB-08), and its
 *  actions. The habit itself is made and changed in a sheet: any schedule
 *  (HAB-01, HAB-02), start and end (HAB-04), time or part of the day
 *  (HAB-03), a number to reach (HAB-05), a colour and a mark (HAB-06) and a
 *  pinned note (HAB-10). Nothing here celebrates a run; the number is
 *  reported, not praised. */
export function Habits({ profileId, day }: { profileId: string; day: string }) {
  const profile = useApp((s) => s.profile)
  const onPage = useLocation().pathname.startsWith('/m/')
  const data = useLiveQuery(async () => {
    if (!(await moduleEnabled(profileId, 'habits'))) return null
    const habits = (await db.habit.where('profile_id').equals(profileId).toArray())
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    const logs = habits.length ? await db.habit_log.where('habit_id').anyOf(habits.map((h) => h.id)).toArray() : []
    return { habits, logs }
  }, [profileId])

  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Habit | 'new' | null>(null)
  const [showOff, setShowOff] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => { if (profile && profile.id === profileId) void retireHabitsDailyRule(profile) }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?open=<habit id> (a tap on the widget's habit row, HAB-11): that habit
  // opens with its pinned note and today's checklist, in view.
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !data) return
    if (data.habits.some((h) => h.id === openId && h.active && !h.deleted_at)) {
      setOpen(openId)
      window.setTimeout(() => document.getElementById(`habit-${openId}`)?.scrollIntoView({ block: 'center' }), 50)
    }
    setParams((p) => { const next = new URLSearchParams(p); next.delete('open'); return next }, { replace: true })
  }, [openId, data, setParams])

  // Still loading, or the module is switched off: nothing is shown either way.
  if (!data) return null
  const live = data.habits.filter((h) => h.active && !h.deleted_at)
  const archived = data.habits.filter((h) => !h.active || h.deleted_at)
  const logsOf = (id: string) => data.logs.filter((l) => l.habit_id === id)
  const withState = live.map((h) => ({ h, state: habitDay(h, day, doneDays(logsOf(h.id))) }))
  const dueToday = withState.filter((x) => x.state !== 'off')
    .sort((a, b) => habitWhen(a.h).key.localeCompare(habitWhen(b.h).key) || a.h.sort_order - b.h.sort_order)
  const notToday = withState.filter((x) => x.state === 'off')
  const doneCount = dueToday.filter((x) => x.state === 'done' || x.state === 'met').length

  const row = (h: Habit) => (
    <HabitRow key={h.id} habit={h} logs={logsOf(h.id)} day={day} open={open === h.id}
      onToggle={() => setOpen(open === h.id ? null : h.id)} onEdit={() => setSheet(h)}
      onMove={(dir) => void moveInList('habit', live, h.id, dir)} canUp={live[0]?.id !== h.id} canDown={live.at(-1)?.id !== h.id}
      onArchive={async () => {
        setOpen(null)
        await archiveHabit(h)
        offerUndo(`${h.name} archived`, () => restoreHabit(h))
      }} />
  )

  return (
    <section aria-labelledby="habits-title" className="track">
      <div className={`track-head${onPage ? ' is-page' : ''}`}>
        {/* On its own page the page title already says it (CALM-07); the heading stays for screen readers. */}
        <h2 className={onPage ? 'visually-hidden' : 'section-title'} id="habits-title">Habits</h2>
        {dueToday.length > 0 && <span className="track-count">{doneCount} of {dueToday.length} done {day === planToday() ? 'today' : 'that day'}</span>}
      </div>
      {live.length === 0 && (
        <p className="empty">A habit is something to do again and again{onPage ? '. Tap the round + button to add the first' : ''}.</p>
      )}
      {dueToday.map((x) => row(x.h))}
      {live.length > 0 && dueToday.length === 0 && <p className="empty">No habit is due {day === planToday() ? 'today' : 'that day'}.</p>}
      {notToday.length > 0 && (
        <>
          <button type="button" className="track-fold" aria-expanded={showOff} onClick={() => setShowOff(!showOff)}>
            Not due {day === planToday() ? 'today' : 'that day'} ({notToday.length})
          </button>
          {showOff && notToday.map((x) => row(x.h))}
        </>
      )}
      {/* One add on the page: the round + (CALM-01); Today's Body tab keeps the row. */}
      {!onPage && <button className="track-add" onClick={() => setSheet('new')}><PlusGlyph />Add a habit</button>}
      {archived.length > 0 && onPage && (
        <>
          <button type="button" className="track-fold" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            Archived ({archived.length})
          </button>
          {showArchived && archived.map((h) => (
            <div key={h.id} className="track-row is-off">
              <div>
                <div className="row-name">{h.name}</div>
                <div className="row-meta">Past ticks kept · {doneDays(logsOf(h.id)).length} days done</div>
              </div>
              <button type="button" className="btn" onClick={() => void restoreHabit(h)}>Bring back</button>
            </div>
          ))}
        </>
      )}
      {onPage && <button type="button" className="fab" aria-label="Add a habit" onClick={() => setSheet('new')}>+</button>}
      {sheet && (
        <HabitSheet profileId={profileId} habit={sheet === 'new' ? null : sheet} today={planToday()}
          nextOrder={nextSortOrder(data.habits)} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}

function HabitRow({ habit: h, logs, day, open, onToggle, onEdit, onMove, canUp, canDown, onArchive }: {
  habit: Habit
  logs: HabitLog[]
  day: string
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onMove: (dir: -1 | 1) => void
  canUp: boolean
  canDown: boolean
  onArchive: () => void
}) {
  const log = pickLog(logs.filter((l) => l.log_date === day))
  const days = useMemo(() => doneDays(logs), [logs])
  const state = habitDay(h, day, days)
  const done = state === 'done'
  const streak = habitStreak(h, days, day)
  const strength = habitStrength(h, days, day)
  const when = habitWhen(h)
  // The row says when, in plain words (CALM-06); the run and the strength
  // are in the opened habit.
  const meta = [
    describeSchedule(habitSchedule(h)),
    when.label !== 'Any time' ? when.label : null,
    state === 'met' ? 'done this week' : null,
  ].filter(Boolean).join(' · ')
  const record = [habitStreakText(streak), strength > 0 ? `strength ${strength}%` : null].filter(Boolean).join(' · ')
  const count = h.target != null

  return (
    <div id={`habit-${h.id}`} className={`track-item${open ? ' is-open' : ''}`}>
      <div className={`track-row${done || state === 'met' ? ' is-done' : ''}${state === 'off' ? ' is-off' : ''}`}>
        <div className="track-main">
          <Mark habit={h} />
          <div className="track-text">
            <div className="row-name">
              <button type="button" onClick={onToggle} aria-expanded={open}>{h.name}</button>
              {hasNote(h.note) && <span className="row-notemark" aria-label="Has a note"> ▤</span>}
            </div>
            <div className="row-meta">{meta}</div>
          </div>
        </div>
        <div className="track-right">
          {count ? (
            <CountControl habit={h} day={day} amount={log?.amount ?? null} />
          ) : (
            <button className="tick" aria-pressed={done} aria-label={`${h.name}, ${done ? 'done' : 'not done'}`}
              onClick={() => void toggleHabit(h.id, day)}>
              {done && <TickGlyph />}
            </button>
          )}
          <button type="button" className="track-more" aria-label={`More for ${h.name}`} aria-expanded={open} onClick={onToggle}>⋮</button>
        </div>
      </div>
      {open && (
        <div className="track-open">
          {record && <p className="hist-kept">{record}</p>}
          <div className="track-actions">
            <button type="button" className="btn" onClick={onEdit}>Edit</button>
            <button type="button" className="btn" disabled={!canUp} onClick={() => onMove(-1)}>Move up</button>
            <button type="button" className="btn" disabled={!canDown} onClick={() => onMove(1)}>Move down</button>
            <button type="button" className="btn" onClick={onArchive}>Archive</button>
          </div>
          <DayChecklist habit={h} day={day} log={log} />
          <History habit={h} days={days} logs={logs} day={day} />
        </div>
      )}
    </div>
  )
}

/** A habit's colour and mark: a small disc, the mark (or first letter) in it. */
function Mark({ habit: h }: { habit: Habit }) {
  if (!h.colour && !h.mark) return null
  return (
    <span className="track-mark" aria-hidden="true" style={h.colour ? { background: h.colour, color: '#fff' } : undefined}>
      {h.mark || Array.from(h.name)[0]?.toUpperCase()}
    </span>
  )
}

/** A count habit's day: − and + by one, and a tap on the figure to type it. */
function CountControl({ habit: h, day, amount }: { habit: Habit; day: string; amount: number | null }) {
  const [typing, setTyping] = useState<string | null>(null)
  const step = (d: number) => void setHabitAmount(h.id, day, Math.max(0, (amount ?? 0) + d), h.target ?? null)
  const reached = h.target != null && (amount ?? 0) >= h.target
  return (
    <div className={`track-count-ctl${reached ? ' is-done' : ''}`} role="group" aria-label={`${h.name}: ${amountText(amount, h.target, h.unit)}`}>
      <button type="button" className="track-step" aria-label="One less" disabled={!amount} onClick={() => step(-1)}>−</button>
      {typing != null ? (
        <input className="track-amount-in" type="number" inputMode="decimal" min={0} value={typing} autoFocus aria-label={`How much ${h.unit ?? ''}`}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={() => { const n = Number(typing); void setHabitAmount(h.id, day, typing.trim() === '' || !Number.isFinite(n) ? null : n, h.target ?? null); setTyping(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      ) : (
        <button type="button" className="track-amount" onClick={() => setTyping(String(amount ?? ''))} aria-label="Type the amount">
          {amountText(amount, h.target, h.unit)}
        </button>
      )}
      <button type="button" className="track-step" aria-label="One more" onClick={() => step(1)}>+</button>
    </div>
  )
}

/** The pinned note's checklist, ticked for this day only (HAB-11). Ticking
 *  the last item asks whether the habit is done; it is never marked done
 *  without asking. A note with no checklist is shown as it is. */
function DayChecklist({ habit: h, day, log }: { habit: Habit; day: string; log: HabitLog | undefined }) {
  const items = dayChecklist(h.note, log?.checks)
  const [ask, setAsk] = useState(false)
  if (!hasNote(h.note)) return null
  if (!items.length) return <p className="track-note">{h.note}</p>
  async function tick(index: number) {
    const next = toggleDayCheck(log?.checks, index)
    await setHabitChecks(h.id, day, next)
    if (next.length === items.length && !log?.done) setAsk(true)
  }
  return (
    <div className="track-checks">
      <ul className="np-list">
        {items.map((it) => (
          <li key={it.index} className={`np-item${it.done ? ' is-done' : ''}`} style={it.depth ? { marginLeft: it.depth * 22 } : undefined}>
            <label className="np-check">
              <input type="checkbox" checked={it.done} onChange={() => void tick(it.index)} />
              <span className="np-words">{it.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {ask && (
        <div className="track-ask" role="status">
          <span>All ticked. Mark {h.name} done for the day?</span>
          <button type="button" className="btn btn-primary" onClick={() => { void setHabitDone(h.id, day, true); setAsk(false) }}>Yes</button>
          <button type="button" className="btn" onClick={() => setAsk(false)}>Not yet</button>
        </div>
      )}
    </div>
  )
}

const CELL_WORD: Record<HistoryCell, string> = { done: 'done', missed: 'not done', open: 'open', off: 'not due', future: 'to come', blank: '' }

/** A month of the habit as a calendar to look back on, and to correct: a
 *  tap on a past day ticks or unticks it (HAB-08). Under it, the last year
 *  as small squares, and how many due days were kept. */
function History({ habit: h, days, logs, day }: { habit: Habit; days: string[]; logs: HabitLog[]; day: string }) {
  const [month, setMonth] = useState(day.slice(0, 7))
  const weeks = habitMonth(h, days, month, day)
  const year = habitYear(h, days, day)
  const from = `${month}-01`
  const to = weeks.flat().filter((c) => c.cell !== 'blank').at(-1)!.day
  const kept = habitKept(h, days, from, to < day ? to : day)
  const [y, m] = month.split('-').map(Number)
  const title = format(new Date(y, m - 1, 1), 'MMMM yyyy')
  const colour = h.colour ?? undefined

  function flip(d: string) {
    if (h.target != null) {
      const log = pickLog(logs.filter((l) => l.log_date === d))
      void setHabitAmount(h.id, d, log?.done ? null : h.target, h.target)
    } else void toggleHabit(h.id, d)
  }

  return (
    <div className="hist">
      <div className="hist-nav">
        <button type="button" className="btn" aria-label="Month before" onClick={() => setMonth(monthBefore(month))}>‹</button>
        <span className="hist-title">{title}</span>
        <button type="button" className="btn" aria-label="Month after" disabled={month >= day.slice(0, 7)} onClick={() => setMonth(monthAfter(month))}>›</button>
      </div>
      <div className="hist-grid" role="grid" aria-label={`${h.name}, ${title}`}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="hist-wd" aria-hidden="true">{d}</span>)}
        {weeks.flat().map(({ day: d, cell }) => cell === 'blank' ? <span key={d} /> : (
          <button key={d} type="button" className={`hist-cell is-${cell}`} disabled={cell === 'future'}
            style={cell === 'done' && colour ? { background: colour, borderColor: colour, color: '#fff' } : undefined}
            aria-pressed={cell === 'done'} aria-label={`${shortDate(d)}, ${CELL_WORD[cell]}`} onClick={() => flip(d)}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
      <p className="hist-kept">
        {kept.due > 0 ? `${kept.done} of ${kept.due} ${kept.unit === 'week' ? 'weeks' : 'due days'} kept in ${title}.` : `Nothing was due in ${title}.`}
        {' '}Tap a day to tick or untick it.
      </p>
      <svg className="hist-year" viewBox={`0 0 ${year.length * 6} 42`} role="img"
        aria-label={`The last year: ${year.flat().filter((c) => c === 'done').length} days done`}>
        {year.map((col, x) => col.map((cell, yy) => (
          <rect key={`${x}-${yy}`} x={x * 6} y={yy * 6} width={5} height={5} rx={1} className={`yr-${cell}`}
            style={cell === 'done' && colour ? { fill: colour } : undefined} />
        )))}
      </svg>
    </div>
  )
}

/** Make or change a habit. Everything but the name has a sensible start:
 *  every day from today, at any time, ticked once. */
export function HabitSheet({ profileId, habit, today, nextOrder, onClose }: {
  profileId: string
  habit: Habit | null
  today: string
  nextOrder: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Habit>(() => habit
    ? { ...habit, rule: habitSchedule(habit).rule, rule_config: habitSchedule(habit).rule_config }
    : blankHabit(profileId, today, nextOrder))
  const [error, setError] = useState<string | null>(null)
  const [when, setWhen] = useState<'any' | DayPart | 'time'>(draft.time_of_day ? 'time' : (draft.day_part ?? 'any'))
  const [counting, setCounting] = useState(draft.target != null)
  const [targetText, setTargetText] = useState(draft.target != null ? String(draft.target) : '8')
  const set = <K extends keyof Habit>(k: K, v: Habit[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const start = draft.start_date ?? today
  const repeat: RepeatValue = { rule: draft.rule ?? 'daily', rule_config: draft.rule_config ?? {}, end_date: draft.end_date ?? null }
  // More options opens by itself when something inside is set, and says what.
  const moreSummary = [
    habit && draft.start_date ? `from ${draft.start_date}` : null,
    counting ? `to ${targetText}${draft.unit ? ` ${draft.unit}` : ''}` : null,
    draft.colour || draft.mark ? 'colour' : null,
    draft.note ? 'pinned note' : null,
  ].filter(Boolean).join(' · ') || null
  const [moreSet] = useState(() => !!(habit && (habit.target != null || habit.colour || habit.mark || habit.note)))

  async function save() {
    const target = counting ? Number(targetText) : null
    if (counting && (!Number.isFinite(target) || target! <= 0 || target! > 100000)) return setError('The number to reach must be above 0.')
    if (draft.end_date && draft.end_date < start) return setError('The last day is before the first.')
    try {
      await saveHabit({
        ...draft,
        // An old habit without a start day keeps having none until one is picked.
        start_date: draft.start_date ?? (habit ? null : today),
        time_of_day: when === 'time' ? draft.time_of_day ?? '08:00' : null,
        day_part: when !== 'any' && when !== 'time' ? when : null,
        target: counting ? Math.round(target! * 100) / 100 : null,
        unit: counting ? (draft.unit?.trim().slice(0, 16) || null) : null,
        mark: draft.mark?.trim() ? Array.from(draft.mark.trim()).slice(0, 2).join('') : null,
      }, habit)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be saved.')
    }
  }

  return (
    <TrackSheet label={habit ? 'Edit habit' : 'New habit'} onClose={onClose} onSubmit={() => void save()}>
      <label>Name
        <input className="serif" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Mobility" autoFocus={!habit} maxLength={120} />
      </label>
      <RepeatPicker value={repeat} start={start} today={today} kinds={[...HABIT_KINDS]} allowNone={false} loose
        onChange={(v) => setDraft((d) => ({ ...d, rule: v.rule ?? 'daily', rule_config: v.rule_config, end_date: v.end_date }))} />
      <Choices label="When in the day" value={when} onChange={setWhen}
        options={[{ value: 'any', label: 'Any time' }, ...DAY_PARTS.map((p) => ({ value: p, label: DAY_PART_LABEL[p] })), { value: 'time', label: 'At a time' }]} />
      {when === 'time' && (
        <label>Time
          <input type="time" value={(draft.time_of_day ?? '08:00').slice(0, 5)} onChange={(e) => set('time_of_day', e.target.value || null)} />
        </label>
      )}
      {/* What makes the habit is above; the rest waits here (CALM-08). */}
      <MoreOptions open={moreSet} summary={moreSummary}>
      <label title={habit ? 'Ticks from before the start day are kept, and count again if it moves back.' : undefined}>Starts on
        <input type="date" value={draft.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
      </label>
      <SwitchRow label="Count towards a number" hint="8 glasses of water, 10 minutes"
        on={counting} onChange={setCounting} />
      {counting && (
        <div className="two">
          <label>Number to reach
            <input type="number" inputMode="decimal" min={0} step="any" value={targetText} onChange={(e) => setTargetText(e.target.value)} />
          </label>
          <label>Unit
            <input value={draft.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="glasses" maxLength={16} />
          </label>
        </div>
      )}
      <div className="ts-field">
        <span className="ts-field-name">Colour and mark</span>
        <div className="track-swatches" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={!draft.colour} className="track-swatch is-none" aria-label="No colour" onClick={() => set('colour', null)} />
          {SWATCHES.map((s) => (
            <button key={s.hex} type="button" role="radio" aria-checked={draft.colour === s.hex} className="track-swatch" aria-label={s.name}
              style={{ background: s.hex }} onClick={() => set('colour', s.hex)} />
          ))}
        </div>
        <input className="track-mark-in" value={draft.mark ?? ''} onChange={(e) => set('mark', e.target.value)} placeholder="A letter or two" aria-label="Mark" maxLength={4} />
      </div>
      <NoteEditor label="Pinned note" value={draft.note ?? ''} onChange={(t) => set('note', t || null)} afterDone={false}
        context={{ day: today, title: draft.name, start }} />
      </MoreOptions>
      {error && <p className="track-error" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.name.trim()}>Save</button>
      </div>
    </TrackSheet>
  )
}

/** The row tick, drawn at the weight of the other row glyphs. */
export function TickGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6.5 4.8 9.2 10 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlusGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
