import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useModuleDef } from '../modules/defs'
import { useBuiltinRuleOn } from '../modules/rule-switch'
import { useLookups, type Rec } from '../modules/records'
import { RecordSheet } from '../modules/RecordSheet'
import {
  deleteLearningRecord, planReading, restoreLearningRecord, saveBook, setBookStatus, syncStudyTasks, useLearningRecords, useReadingTasks,
} from '../lib/learning'
import {
  BOOK_STATUSES, bookProgress, describeMinutes, describePages, finishedIn, minutesBySubject, orderBooks, readBook, STATUS_LABEL,
  type Book, type BookStatus,
} from '../lib/learning-rules'
import { addDays } from '../lib/schedule-rules'
import { search } from '../lib/search-rules'
import type { ModuleRecord } from '../lib/types'
import { NO_REPEAT, RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { offerUndo } from '../ui/Undo'
import { DefView, DeleteButton, ModuleTabs, Sheet, defTabs, localToday, useTab } from './ModuleKit'
import { ModuleMenu } from '../modules/ModuleHead'
import './learning.css'

const short = (d: string) => format(parseISO(d), 'EEE d MMM')
/** A record as the record sheet edits it. */
const fromRecord = (r: ModuleRecord): Rec => ({ id: r.id, entity: r.entity, values: { ...r.data }, date: r.record_date, row: r as unknown as Rec['row'] })

/** The Learning page: study blocks (each dated one keeps a task on its day,
 *  LRN-02) with minutes per subject, the reading list (LRN-03) with time to
 *  read planned as tasks that ask for a reflection once done (LRN-04), and
 *  the module's own views. */
export function Learning({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('learning')
  const blocks = useLearningRecords(profileId, 'study')
  const ruleOn = useBuiltinRuleOn(profileId, 'learning', 'study_task')
  const tabs = [{ key: 'study', name: 'Study' }, { key: 'reading', name: 'Reading' }]
  // Blocks, the month and the books table are under ⋮ → Views (CALM-05).
  const views = defTabs(def)
  const [tab, setTab] = useTab('learning', [...tabs, ...views])

  // Every block's task follows the block (made, moved, removed) whenever the
  // blocks or the rule change while the page is open.
  const key = (blocks ?? []).map((b) => `${b.id}:${b.updated_at}`).join(',')
  useEffect(() => { if (blocks) void syncStudyTasks(profileId) }, [profileId, key, ruleOn])

  if (!def || !blocks) return null
  return (
    <>
      <ModuleMenu views={views} active={tab} onView={setTab} />
      <ModuleTabs tabs={tabs} active={tab} onTab={setTab} />
      {tab === 'study' && <Study profileId={profileId} blocks={blocks} />}
      {tab === 'reading' && <Reading profileId={profileId} />}
      {tab.startsWith('view:') && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId} onClose={() => setTab('study')} />}
    </>
  )
}

function Study({ profileId, blocks }: { profileId: string; blocks: ModuleRecord[] }) {
  const def = useModuleDef('learning')
  const books = useLearningRecords(profileId, 'book')
  const entity = def?.entities.find((e) => e.name === 'study')
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [sheet, setSheet] = useState<ModuleRecord | 'new' | null>(null)
  const today = localToday()
  const d = parseISO(today)
  const monday = format(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)), 'yyyy-MM-dd')
  const week = minutesBySubject(blocks, monday, addDays(monday, 6))
  const month = minutesBySubject(blocks, addDays(today, -29), today)
  const sum = (l: { minutes: number }[]) => l.reduce((a, x) => a + x.minutes, 0)
  const dayOf = (r: ModuleRecord) => (typeof r.data.block_date === 'string' ? r.data.block_date : r.record_date)
  const coming = blocks.filter((r) => (dayOf(r) ?? '') >= today).sort((a, b) => (dayOf(a) ?? '').localeCompare(dayOf(b) ?? '')
    || String(a.data.start ?? '99').localeCompare(String(b.data.start ?? '99')))
  const past = blocks.filter((r) => dayOf(r) && dayOf(r)! < today).sort((a, b) => (dayOf(b) ?? '').localeCompare(dayOf(a) ?? '')).slice(0, 10)
  const undated = blocks.filter((r) => !dayOf(r))
  if (!def || !entity || !books) return null

  const row = (r: ModuleRecord) => (
    <li key={r.id} className="kit-row">
      <button type="button" className="kit-open" onClick={() => setSheet(r)}>
        <span className="row-name">{String(r.data.subject ?? 'Study')}</span>
        <span className="row-meta">{[dayOf(r) ? short(dayOf(r)!) : 'No day', typeof r.data.start === 'string' ? r.data.start.slice(0, 5) : null,
          typeof r.data.source === 'string' ? r.data.source : null].filter(Boolean).join(' · ')}</span>
      </button>
      <span className="kit-right kit-num">{Number(r.data.minutes) > 0 ? describeMinutes(Number(r.data.minutes)) : ''}</span>
    </li>
  )

  return (
    <>
      <div className="kit-figures is-two" aria-label="Study at a glance">
        <div className="kit-figure"><span className="k">This week</span><span className="v">{describeMinutes(sum(week))}</span><span className="s">{week.length} {week.length === 1 ? 'subject' : 'subjects'}</span></div>
        <div className="kit-figure"><span className="k">Last 30 days</span><span className="v">{describeMinutes(sum(month))}</span><span className="s">studied</span></div>
        <div className="kit-figure"><span className="k">Books</span><span className="v">{finishedIn(books.map(readBook), Number(today.slice(0, 4)))}</span><span className="s">finished this year</span></div>
      </div>
      {blocks.length === 0 ? (
        <p className="empty">A study block is time set aside for one subject. Tap the round + button to plan the first.</p>
      ) : (
        <>
          <h2 className="section-title">Coming up</h2>
          {coming.length ? <ul className="kit-list">{coming.map(row)}</ul> : <p className="kit-note">Nothing planned from today on.</p>}
          {undated.length > 0 && <><h2 className="section-title">No day yet</h2><ul className="kit-list">{undated.map(row)}</ul></>}
          {month.length > 0 && (
            <>
              <h2 className="section-title">By subject, last 30 days</h2>
              <ul className="kit-list">
                {month.map((m) => (
                  <li key={m.subject} className="kit-row">
                    <div className="kit-open"><span className="row-name">{m.subject}</span>
                      <span className="kit-bar" aria-hidden><span style={{ width: `${(m.minutes / month[0].minutes) * 100}%` }} /></span></div>
                    <span className="kit-right kit-num">{describeMinutes(m.minutes)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {past.length > 0 && <><h2 className="section-title">Recent</h2><ul className="kit-list">{past.map(row)}</ul></>}
        </>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New study block" onClick={() => setSheet('new')}>+</button>
      {sheet && (
        <RecordSheet def={def} entity={entity} profileId={profileId} lookups={lookups} day={sheet === 'new' ? today : undefined}
          rec={sheet === 'new' ? undefined : fromRecord(sheet)} onClose={() => setSheet(null)} />
      )}
    </>
  )
}

/* ---------- the reading list (LRN-03) ------------------------------------------------- */

function Reading({ profileId }: { profileId: string }) {
  const recs = useLearningRecords(profileId, 'book')
  const [open, setOpen] = useState<ModuleRecord | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const today = localToday()
  const books = useMemo(() => {
    const list = (recs ?? []).map((r) => ({ rec: r, book: readBook(r) }))
    const found = search(list.map((x) => ({ ...x, name: x.book.title, extra: x.book.author ?? '' })), query)
    const order = orderBooks(found.map((x) => ({ ...x.book, _rec: x.rec })))
    return order
  }, [recs, query])
  if (!recs) return null

  async function move(rec: ModuleRecord, b: Book, next: BookStatus) {
    await setBookStatus(rec, b, next, today)
    offerUndo(`${b.title}: ${STATUS_LABEL[next].toLowerCase()}`, () => setBookStatus(rec, { ...b, status: next }, b.status, today))
  }

  return (
    <>
      {recs.length > 6 && (
        <div className="kit-toolbar">
          <input className="kit-search grow" type="search" value={query} placeholder="Search books" aria-label="Search books" onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {recs.length === 0 ? (
        <p className="empty">Your reading list. Tap the round + button to add a book.</p>
      ) : BOOK_STATUSES.map((st) => {
        const group = books.filter((b) => b.status === st)
        if (!group.length) return null
        return (
          <section key={st} aria-label={STATUS_LABEL[st]}>
            <h2 className="section-title">{STATUS_LABEL[st]} ({group.length})</h2>
            <ul className="kit-list">
              {group.map((b) => {
                const p = bookProgress(b)
                const rec = (b as Book & { _rec: ModuleRecord })._rec
                return (
                  <li key={b.id} className="kit-row">
                    <button type="button" className="kit-open" onClick={() => setOpen(rec)}>
                      <span className="row-name">{b.title}</span>
                      <span className="row-meta">{[b.author, describePages(b), b.rating ? `${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)} ${b.rating} of 5` : null,
                        b.status === 'finished' && b.finished_on ? `finished ${short(b.finished_on)}` : null].filter(Boolean).join(' · ')}</span>
                      {b.status === 'reading' && p != null && <span className="kit-bar lrn-bar" aria-hidden><span style={{ width: `${p * 100}%` }} /></span>}
                    </button>
                    {b.status === 'to read' && <button type="button" className="btn" onClick={() => void move(rec, b, 'reading')}>Start</button>}
                    {b.status === 'reading' && <button type="button" className="btn" onClick={() => void move(rec, b, 'finished')}>Finished</button>}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New book" onClick={() => setOpen('new')}>+</button>
      {open && <BookSheet profileId={profileId} rec={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  )
}

const int = (v: string): number | null | 'bad' => {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 'bad'
}

function BookSheet({ profileId, rec, onClose }: { profileId: string; rec: ModuleRecord | null; onClose: () => void }) {
  const today = localToday()
  const b = rec ? readBook(rec) : null
  const [title, setTitle] = useState(b?.title ?? '')
  const [author, setAuthor] = useState(b?.author ?? '')
  const [status, setStatus] = useState<BookStatus>(b?.status ?? 'to read')
  const [pages, setPages] = useState(b?.pages != null ? String(b.pages) : '')
  const [pageNow, setPageNow] = useState(b?.page_now != null ? String(b.page_now) : '')
  const [rating, setRating] = useState<number | null>(b?.rating ?? null)
  const [started, setStarted] = useState(b?.started_on ?? '')
  const [finished, setFinished] = useState(b?.finished_on ?? '')
  const [plan, setPlan] = useState(false)
  const [planDay, setPlanDay] = useState(today)
  const [planTime, setPlanTime] = useState('')
  const [planMin, setPlanMin] = useState('30')
  const [repeat, setRepeat] = useState<RepeatValue>(NO_REPEAT)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const coming = useReadingTasks(profileId, b?.title ?? null, today)

  async function save() {
    if (!title.trim()) return setError('Give the book a title.')
    const p = int(pages)
    const n = int(pageNow)
    if (p === 'bad' || n === 'bad') return setError('Pages are whole numbers.')
    if (p != null && n != null && n > p) return setError('The page you are on is past the last page.')
    if (started && finished && finished < started) return setError('Finished before it was started.')
    let next = status
    // A start or finish day typed in moves the book along with it.
    if (finished && status !== 'finished' && status !== 'stopped') next = 'finished'
    await saveBook(profileId, { title, author, status: next, pages: p, page_now: next === 'finished' && p ? p : n, rating,
      started_on: started || (next === 'reading' || next === 'finished' ? today : null), finished_on: next === 'finished' ? finished || today : finished || null }, rec ?? undefined)
    onClose()
  }
  async function remove() {
    if (!rec) return
    await deleteLearningRecord(rec)
    offerUndo(`${b?.title ?? 'Book'} deleted`, () => restoreLearningRecord(rec))
    onClose()
  }
  async function planIt() {
    if (!b) return
    const m = int(planMin)
    if (m === 'bad' || (m != null && (m < 1 || m > 600))) return setError('Minutes: 1 to 600.')
    if (!planDay) return setError('Pick the day.')
    await planReading(profileId, b, planDay, planTime || null, m, repeat, today)
    setPlan(false)
    setNote(repeat.rule ? 'Reading time planned. Each one asks for a short reflection when ticked.' : `Reading planned for ${short(planDay)}. It asks for a short reflection when ticked.`)
  }

  return (
    <Sheet title={rec ? 'Book' : 'New book'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {rec && <DeleteButton onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Title<input value={title} maxLength={200} autoFocus={!rec} onChange={(e) => { setTitle(e.target.value); setError(null) }} /></label>
        <label>Author<input value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
            {(['to read', 'reading', 'finished', 'stopped'] as BookStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <div className="two">
          <label>Pages<input inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} /></label>
          <label>Read to page<input inputMode="numeric" value={pageNow} onChange={(e) => setPageNow(e.target.value)} /></label>
        </div>
        <div className="sleep-quality lrn-rating" role="group" aria-label="Rating, 1 to 5">
          <span>Rating</span>
          <div>
            {[1, 2, 3, 4, 5].map((q) => (
              <button key={q} type="button" aria-pressed={rating === q} aria-label={`${q} of 5`} onClick={() => setRating(rating === q ? null : q)}>{q}</button>
            ))}
          </div>
        </div>
        <div className="two">
          <label>Started<input type="date" value={started} onChange={(e) => setStarted(e.target.value)} /></label>
          <label>Finished<input type="date" value={finished} onChange={(e) => setFinished(e.target.value)} /></label>
        </div>
      </div>
      {rec && b && (
        <div className="lrn-plan">
          {coming && coming.length > 0 && <p className="kit-hint">Reading planned: {coming.slice(0, 3).map((t) => short(t.planned_date!)).join(', ')}{coming.length > 3 ? ` and ${coming.length - 3} more` : ''}.</p>}
          {!plan ? <button type="button" className="btn" onClick={() => setPlan(true)}>Plan time to read it</button> : (
            <div className="form-grid">
              <div className="two">
                <label>Day<input type="date" value={planDay} onChange={(e) => setPlanDay(e.target.value)} /></label>
                <label>Time<input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} /></label>
              </div>
              <label>Minutes<input inputMode="numeric" value={planMin} onChange={(e) => setPlanMin(e.target.value)} /></label>
              <RepeatPicker value={repeat} onChange={setRepeat} start={planDay || today} today={today}
                kinds={['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'dates']} />
              <div className="sheet-actions"><button type="button" className="btn" onClick={() => setPlan(false)}>Not now</button>
                <button type="button" className="btn btn-primary grow" onClick={() => void planIt()}>Put it on the planner</button></div>
            </div>
          )}
          {note && <p className="kit-hint" role="status">{note}</p>}
        </div>
      )}
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
