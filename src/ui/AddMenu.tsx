import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { blankTask } from '../lib/tasks'
import { useModuleDefs } from '../modules/defs'
import {
  arrangeAdd, byUse, countUse, moveEntry, toggleHidden, MODULE_ADD, type AddEntry,
} from '../lib/today-prefs-rules'
import { saveTodayPrefs, useTodayPrefs } from '../lib/today-prefs'
import type { Task } from '../lib/types'
import { TaskSheet } from './TaskSheet'
import { AddFoodSheet } from './AddFoodSheet'
import { OpenRecord, SHEET_TABLES } from './RailSheets'
import { QuickAddSheet, type QuickAdd } from './AddSheets'
import { useBackClose } from './useBackClose'
import './addmenu.css'

/** What choosing an entry opens. */
type Target =
  | { kind: 'task'; inbox: boolean; task?: Task }
  | { kind: 'food' }
  | { kind: 'record'; module: string; entity: string }
  | { kind: 'page'; to: string }
  | { kind: 'quick'; what: QuickAdd }

type Entry = AddEntry & { target: Target }

/** The modules whose add sheet the + opens in place (HAB-22, decision #4):
 *  the same sheet their page opens, without going to the page. */
const QUICK_OF: Record<string, QuickAdd> = {
  habits: 'habit', supplements: 'supplement', health: 'weighin', shopping: 'shopping', household: 'chore',
}

/** The round + on Today and Plan (GEN-50): a short menu of what the person
 *  adds, at most six, most used first (or in their own order), with the
 *  rest under "More". Task and Task to Inbox are always there; then Food,
 *  Event and the main add of every other module that is on. Off modules are
 *  not offered (P1). Choosing one opens its one sheet straight away: the menu
 *  closes first, so a sheet never sits on a sheet (GEN-51).
 *
 *  Calm (v17): each entry is its name alone, no hint line under it; "Edit
 *  menu" sits at the bottom beside Close, out of the way of the choices.
 *  v18: Habit, Chore, Supplement, Weigh-in and Shopping item open their add
 *  sheet right here, not their page (HAB-22). */
export function AddFab({ day, label = 'Add' }: { day: string; label?: string }) {
  const profile = useApp((s) => s.profile)
  const navigate = useNavigate()
  const defs = useModuleDefs()
  const prefs = useTodayPrefs()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [
      { key: 'task', label: 'Task', hint: 'On this day', target: { kind: 'task', inbox: false } },
      { key: 'inbox', label: 'Task to Inbox', hint: 'No day yet; plan it later', target: { kind: 'task', inbox: true } },
    ]
    for (const e of defs ?? []) {
      if (!e.enabled) continue
      const key = e.def.key
      const fixed = MODULE_ADD[key]
      if (fixed === null) continue
      if (key === 'nutrition') { out.push({ key: 'food', label: fixed!.label, hint: fixed!.hint, target: { kind: 'food' } }); continue }
      if (key === 'agenda') {
        const ent = e.def.entities.find((x) => x.table === 'calendar_event')
        if (ent) out.push({ key: 'event', label: fixed!.label, hint: fixed!.hint, target: { kind: 'record', module: key, entity: ent.name } })
        continue
      }
      if (fixed && QUICK_OF[key]) { out.push({ key: `m:${key}`, label: fixed.label, hint: fixed.hint, target: { kind: 'quick', what: QUICK_OF[key] } }); continue }
      const ent = e.def.entities.find((x) => !x.table || SHEET_TABLES.includes(x.table))
      if (!ent) continue
      out.push({ key: `m:${key}`, label: fixed?.label ?? ent.label, hint: fixed?.hint ?? e.def.name, target: { kind: 'record', module: key, entity: ent.name } })
    }
    // Event first among the modules, as the person expects to find it.
    return out.sort((a, b) => rank(a.key) - rank(b.key))
  }, [defs])

  const { shown, more, hidden } = arrangeAdd(entries, prefs.add)
  // Back and Escape close the menu (CALM-10).
  const close = () => { setOpen(false); setEditing(false); setShowMore(false) }
  useBackClose(close, open)

  if (!profile) return null

  const blank = (inbox: boolean): Task => blankTask(profile!.id, day, inbox ? { planned_date: null } : {})

  function choose(e: Entry) {
    setOpen(false)
    setEditing(false)
    setShowMore(false)
    void saveTodayPrefs(profile!.id, (p) => ({ ...p, add: countUse(p.add, e.key) }))
    if (e.target.kind === 'page') navigate(e.target.to)
    // The new task is made once, here, so the sheet keeps the same one.
    else if (e.target.kind === 'task') setTarget({ ...e.target, task: blank(e.target.inbox) })
    else setTarget(e.target)
  }

  const change = (f: (a: typeof prefs.add) => typeof prefs.add) => void saveTodayPrefs(profile.id, (p) => ({ ...p, add: f(p.add) }))

  const row = (e: Entry, i: number, list: Entry[], isHidden = false) => (
    <li key={e.key} className="add-item">
      {editing ? (
        <div className="add-edit">
          <span className="add-label">{e.label}</span>
          {!isHidden && (
            <>
              <button type="button" className="add-step" aria-label={`Move ${e.label} up`} disabled={i === 0 && list === shown}
                onClick={() => change((a) => moveEntry(entries, a, e.key, -1))}>↑</button>
              <button type="button" className="add-step" aria-label={`Move ${e.label} down`} disabled={list !== shown ? i === list.length - 1 : i === list.length - 1 && more.length === 0}
                onClick={() => change((a) => moveEntry(entries, a, e.key, 1))}>↓</button>
            </>
          )}
          <button type="button" className="chip add-hide" aria-pressed={isHidden}
            onClick={() => change((a) => toggleHidden(a, e.key))}>{isHidden ? 'Show' : 'Hide'}</button>
        </div>
      ) : (
        <button type="button" className="add-pick" onClick={() => choose(e)}>
          <span className="add-label">{e.label}</span>
        </button>
      )}
    </li>
  )


  return (
    <>
      <button type="button" className="fab" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}>+</button>

      {open && (
        <>
          <div className="sheet-scrim" onClick={close} />
          <div className="bottom-sheet add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title" data-no-swipe>
            <h2 id="add-title">{editing ? 'Arrange this menu' : 'Add'}</h2>
            {editing && (
              <p className="add-why">{prefs.add.order.length ? 'Your order.' : 'Most used first.'} Hidden ones stay under More.</p>
            )}
            <ul className="add-list">{shown.map((e, i) => row(e, i, shown))}</ul>
            {(more.length > 0 || hidden.length > 0) && (
              <>
                {!editing && (
                  <button type="button" className="add-more" aria-expanded={showMore} onClick={() => setShowMore((x) => !x)}>
                    {showMore ? 'Fewer' : `More (${more.length + hidden.length})`}
                  </button>
                )}
                {(showMore || editing) && (
                  <ul className="add-list add-rest" aria-label="More">
                    {more.map((e, i) => row(e, i, more))}
                    {hidden.map((e, i) => row(e, i, hidden, true))}
                  </ul>
                )}
              </>
            )}
            <div className="sheet-actions">
              <button type="button" className="btn add-editbtn" aria-pressed={editing} onClick={() => setEditing((x) => !x)}>
                {editing ? 'Done' : 'Edit menu'}
              </button>
              {editing && prefs.add.order.length > 0 && (
                <button type="button" className="btn" onClick={() => change(byUse)}>Most used first</button>
              )}
              <button type="button" className="btn grow" onClick={close} autoFocus>Close</button>
            </div>
          </div>
        </>
      )}

      {target?.kind === 'task' && target.task && <TaskSheet task={target.task} isNew onClose={() => setTarget(null)} />}
      {target?.kind === 'food' && <AddFoodSheet day={day} onClose={() => setTarget(null)} />}
      {target?.kind === 'quick' && <QuickAddSheet what={target.what} day={day} onClose={() => setTarget(null)} />}
      {target?.kind === 'record' && (
        <OpenRecord moduleKey={target.module} entityName={target.entity} day={day} onClose={() => setTarget(null)} />
      )}
    </>
  )
}

const FIRST = ['task', 'inbox', 'food', 'event']
const rank = (key: string) => { const i = FIRST.indexOf(key); return i === -1 ? FIRST.length : i }
