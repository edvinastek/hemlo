import { useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useModuleDef } from '../modules/defs'
import {
  deleteRecordRow, renameCategoryEverywhere, restoreRecordRow, saveCategories, saveEntry, saveFinanceSettings, savePayment,
  setMonthBudget, togglePaid, useEntries, useFinanceSettings, usePayments,
} from '../lib/finance'
import {
  budgetFor, budgetRows, categoryGrid, categoryProblem, CURRENCIES, describeLeft, dropCategory, entryAmount, entryCategory, entryDay,
  entryKind, formatMoney, monthTotals, paidEntry, parseAmount, paymentDue, putCategory, treeOrder,
  type Category, type FinanceSettings, type Kind, type Payment,
} from '../lib/finance-rules'
import { addDays, describeSchedule } from '../lib/schedule-rules'
import type { ModuleRecord } from '../lib/types'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { offerUndo } from '../ui/Undo'
import { DefView, DeleteButton, ModuleTabs, Sheet, defTabs, localToday, useTab } from './ModuleKit'
import { ModuleMenu, QuietAdd } from '../modules/ModuleHead'
import './finance.css'

const monthOf = (d: string) => d.slice(0, 7)
const monthLabel = (m: string) => format(parseISO(`${m}-01`), 'MMMM yyyy')
const shiftMonth = (m: string, n: number) => { const d = parseISO(`${m}-01`); return format(new Date(d.getFullYear(), d.getMonth() + n, 1), 'yyyy-MM') }
const short = (d: string) => format(parseISO(d), 'EEE d MMM')

/** The Finance page (FIN-02 to FIN-05): a month at a glance (money in, out,
 *  budgets, by category, its entries), planned payments, the category list
 *  with budgets and the currency, and the module's own views. The + adds an
 *  entry the fast way: the amount, then a tap on a category. */
export function Finance({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('finance')
  const settings = useFinanceSettings(profileId)
  const entries = useEntries(profileId)
  const payments = usePayments(profileId)
  const tabs = [{ key: 'overview', name: 'Overview' }, { key: 'planned', name: 'Planned' }, { key: 'categories', name: 'Categories' }]
  // Entries and the calendar are under ⋮ → Views (CALM-05).
  const views = defTabs(def)
  const [tab, setTab] = useTab('finance', [...tabs, ...views])
  const [quick, setQuick] = useState(false)
  if (!settings || !entries || !payments) return null

  return (
    <>
      <ModuleMenu views={views} active={tab} onView={setTab} />
      <ModuleTabs tabs={tabs} active={tab} onTab={setTab} />
      {tab === 'overview' && <Overview profileId={profileId} s={settings} entries={entries} payments={payments.map((p) => p.payment)} onAdd={() => setQuick(true)}
        onBudgets={() => setTab('categories')} />}
      {tab === 'planned' && <Planned profileId={profileId} s={settings} entries={entries} payments={payments} />}
      {tab === 'categories' && <Categories profileId={profileId} s={settings} />}
      {tab.startsWith('view:') && def && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId} onClose={() => setTab('overview')} />}
      {quick && <QuickEntry profileId={profileId} s={settings} entries={entries} onClose={() => setQuick(false)} />}
    </>
  )
}

/* ---------- a month at a glance ------------------------------------------------- */

function Overview({ profileId, s, entries, payments, onAdd, onBudgets }: {
  profileId: string; s: FinanceSettings; entries: ModuleRecord[]; payments: Payment[]; onAdd: () => void; onBudgets: () => void
}) {
  const today = localToday()
  const [month, setMonth] = useState(monthOf(today))
  const [entry, setEntry] = useState<ModuleRecord | null>(null)
  const [budget, setBudget] = useState<string | null>(null)
  const t = useMemo(() => monthTotals(entries, month, s.categories), [entries, month, s.categories])
  const rows = useMemo(() => budgetRows(s, entries, month), [s, entries, month])
  const list = entries.filter((e) => (entryDay(e) ?? '').slice(0, 7) === month)
    .sort((a, b) => (entryDay(b) ?? '').localeCompare(entryDay(a) ?? '') || b.updated_at.localeCompare(a.updated_at))
  const tops = Object.entries(t.byTop).sort((a, b) => b[1] - a[1])
  // Payments due this month and not paid yet, up to today and the week ahead.
  const due: { p: Payment; day: string }[] = []
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) {
    if (d > addDays(today, 7)) break
    for (const p of payments) if (paymentDue(p, d) && !paidEntry(entries, p.id, d)) due.push({ p, day: d })
  }

  async function pay(p: Payment, day: string) {
    const res = await togglePaid(profileId, p.id, day, today)
    if (res.made) offerUndo(`${p.name} marked paid`, () => deleteRecordRow(res.made!))
  }

  return (
    <>
      <div className="fin-monthnav plan-monthnav">
        <button type="button" className="btn" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <span aria-live="polite">{monthLabel(month)}</span>
        <button type="button" className="btn" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <div className="kit-figures" aria-label={`${monthLabel(month)} in figures`}>
        <div className="kit-figure"><span className="k">Money in</span><span className="v fin-v">{formatMoney(t.income, s.currency)}</span></div>
        <div className="kit-figure"><span className="k">Spent</span><span className="v fin-v">{formatMoney(t.expense, s.currency)}</span></div>
        <div className="kit-figure"><span className="k">Left over</span><span className={`v fin-v${t.net < 0 ? ' kit-warn' : ''}`}>{formatMoney(t.net, s.currency)}</span></div>
      </div>

      {due.length > 0 && (
        <>
          <h2 className="section-title">Due</h2>
          <ul className="kit-list">
            {due.map(({ p, day }) => (
              <li key={`${p.id}|${day}`} className="kit-row">
                <div className="kit-open">
                  <span className="row-name">{p.name}</span>
                  <span className={`row-meta${day < today ? ' kit-warn' : ''}`}>{short(day)}{day < today ? ' · not marked paid' : day === today ? ' · today' : ''}
                    {p.amount != null ? ` · ${formatMoney(p.amount, s.currency)}` : ''}</span>
                </div>
                <button type="button" className="btn" onClick={() => void pay(p, day)}>Mark paid</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* No budgets: no empty block, a quiet way to set them (CALM-15). */}
      {rows.length === 0 ? <QuietAdd label="Set budgets" onClick={onBudgets} /> : (
        <>
        <h2 className="section-title">Budgets</h2>
        <ul className="kit-list" aria-label="Budgets this month">
          {rows.map((r) => (
            <li key={r.category} className="kit-row fin-budget">
              <button type="button" className="kit-open" onClick={() => setBudget(r.category)} aria-label={`${r.category}: change this month's budget`}>
                <span className="row-name">{r.category}</span>
                <span className="row-meta">{formatMoney(r.spent, s.currency)} of {formatMoney(r.budget, s.currency)} · <span className={r.over ? 'kit-warn' : ''}>{describeLeft(r, s.currency)}</span></span>
                <span className={`kit-bar${r.over ? ' is-over' : ''}`} aria-hidden><span style={{ width: `${Math.min(1, r.share) * 100}%` }} /></span>
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {tops.length > 0 && (
        <>
          <h2 className="section-title">Spent by category</h2>
          <ul className="kit-list">
            {tops.map(([name, amount]) => (
              <li key={name} className="kit-row">
                <div className="kit-open">
                  <span className="row-name">{name}</span>
                  <span className="kit-bar fin-share" aria-hidden><span style={{ width: `${t.expense ? (amount / t.expense) * 100 : 0}%` }} /></span>
                </div>
                <span className="kit-right kit-num">{formatMoney(amount, s.currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section-title">Entries</h2>
      {list.length === 0 ? (
        <p className="kit-note">Nothing in {monthLabel(month)} yet.</p>
      ) : (
        <ul className="kit-list" aria-label={`Entries in ${monthLabel(month)}`}>
          {list.map((e) => {
            const income = entryKind(e) === 'income'
            const a = entryAmount(e)
            return (
              <li key={e.id} className="kit-row">
                <button type="button" className="kit-open" onClick={() => setEntry(e)}>
                  <span className="row-name">{entryCategory(e)}</span>
                  <span className="row-meta">{[entryDay(e) ? short(entryDay(e)!) : null, typeof e.data.note === 'string' ? e.data.note : null, income ? 'money in' : null].filter(Boolean).join(' · ')}</span>
                </button>
                <span className={`kit-right kit-num${income ? ' kit-good' : ''}`}>{a != null ? formatMoney(income ? a : -a, s.currency, { sign: income }) : '—'}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="Add money in or out" onClick={onAdd}>+</button>
      {entry && <EntrySheet profileId={profileId} s={s} entry={entry} onClose={() => setEntry(null)} />}
      {budget && <BudgetSheet profileId={profileId} s={s} month={month} category={budget} onClose={() => setBudget(null)} />}
    </>
  )
}

/* ---------- fast entry (FIN-05) ---------------------------------------------------- */

function QuickEntry({ profileId, s, entries, onClose }: { profileId: string; s: FinanceSettings; entries: ModuleRecord[]; onClose: () => void }) {
  const today = localToday()
  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const grid = categoryGrid(s, entries, kind)

  async function save(category: string | null) {
    const a = parseAmount(amount)
    if (!a.ok) { setError(a.message); input.current?.focus(); return }
    if (!day) { setError('Pick the day.'); return }
    const row = await saveEntry(profileId, { entry_date: day, kind, amount: a.value, category, note })
    offerUndo(`${formatMoney(a.value, s.currency)} ${category ?? (kind === 'income' ? 'money in' : 'spent')} saved`, () => deleteRecordRow(row))
    onClose()
  }

  return (
    <Sheet title={kind === 'income' ? 'Money in' : 'Money out'} onClose={onClose} onSubmit={() => void save(null)}
      actions={<button type="button" className="btn grow" onClick={onClose}>Cancel</button>}>
      <div className="fin-quick">
        <div className="kit-seg" role="group" aria-label="Money out or in">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Out</button>
          <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>In</button>
        </div>
        <label className="fin-amount">
          <span className="visually-hidden">Amount</span>
          <span className="fin-cur" aria-hidden>{formatMoney(0, s.currency).replace(/[\d.,\s]/g, '') || s.currency}</span>
          <input ref={input} inputMode="decimal" autoFocus value={amount} placeholder="0,00" aria-invalid={!!error}
            onChange={(e) => { setAmount(e.target.value); setError(null) }} />
        </label>
        <div className="fin-quick-row form-grid">
          <div className="two">
            <label>Day<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
            <label>Note<input value={note} maxLength={240} placeholder="Optional" onChange={(e) => setNote(e.target.value)} /></label>
          </div>
        </div>
        {error && <p className="kit-error" role="alert">{error}</p>}
        <p className="kit-hint">Then tap its category: it is saved at once.</p>
        <div className="fin-grid" role="group" aria-label="Category">
          {grid.map((c) => <button key={c} type="button" onClick={() => void save(c)}>{c}</button>)}
          <button type="button" className="is-plain" onClick={() => void save(null)}>No category</button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- one entry ----------------------------------------------------------------- */

function CategorySelect({ s, kind, value, onChange }: { s: FinanceSettings; kind: Kind; value: string; onChange: (v: string) => void }) {
  const list = treeOrder(s.categories).filter((c) => c.kind === kind)
  const known = list.some((c) => c.name === value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No category</option>
      {!known && value && <option value={value}>{value} (not in the list)</option>}
      {list.map((c) => <option key={c.name} value={c.name}>{c.parent ? `   ${c.name}` : c.name}</option>)}
    </select>
  )
}

function EntrySheet({ profileId, s, entry, onClose }: { profileId: string; s: FinanceSettings; entry: ModuleRecord; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(entryKind(entry))
  const [amount, setAmount] = useState(entryAmount(entry) != null ? String(entryAmount(entry)).replace('.', ',') : '')
  const [day, setDay] = useState(entryDay(entry) ?? localToday())
  const [category, setCategory] = useState(typeof entry.data.category === 'string' ? entry.data.category : '')
  const [note, setNote] = useState(typeof entry.data.note === 'string' ? entry.data.note : '')
  const [error, setError] = useState<string | null>(null)
  async function save() {
    const a = parseAmount(amount)
    if (!a.ok) return setError(a.message)
    if (!day) return setError('Pick the day.')
    await saveEntry(profileId, { entry_date: day, kind, amount: a.value, category: category || null, note }, entry)
    onClose()
  }
  async function remove() {
    await deleteRecordRow(entry)
    offerUndo('Entry deleted', () => restoreRecordRow(entry))
    onClose()
  }
  return (
    <Sheet title="Change entry" onClose={onClose} onSubmit={() => void save()}
      actions={<>
        <DeleteButton onDelete={() => void remove()} />
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <div className="kit-seg" role="group" aria-label="Money out or in">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Out</button>
          <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>In</button>
        </div>
        <div className="two">
          <label>Amount<input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null) }} /></label>
          <label>Day<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        </div>
        <label>Category<CategorySelect s={s} kind={kind} value={category} onChange={setCategory} /></label>
        <label>Note<input value={note} maxLength={240} onChange={(e) => setNote(e.target.value)} /></label>
        {typeof entry.data.payment_id === 'string' && <p className="kit-hint">Made by marking a planned payment paid{typeof entry.data.due_date === 'string' ? ` (due ${short(entry.data.due_date)})` : ''}. Deleting it marks that day unpaid again.</p>}
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

function BudgetSheet({ profileId, s, month, category, onClose }: { profileId: string; s: FinanceSettings; month: string; category: string; onClose: () => void }) {
  const standing = s.categories.find((c) => c.name === category)?.budget ?? null
  const own = s.months[month]?.[category]
  const [value, setValue] = useState(own != null ? String(own).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)
  async function save() {
    if (!value.trim()) { await setMonthBudget(profileId, month, category, null); onClose(); return }
    const a = parseAmount(value)
    if (!a.ok) return setError(a.message)
    await setMonthBudget(profileId, month, category, a.value)
    onClose()
  }
  return (
    <Sheet title={`${category} in ${monthLabel(month)}`} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>This month's budget
          <input inputMode="decimal" value={value} placeholder={standing != null ? formatMoney(standing, s.currency) : 'None'} onChange={(e) => { setValue(e.target.value); setError(null) }} />
        </label>
        <p className="kit-hint">{standing != null ? `Every month has ${formatMoney(standing, s.currency)} unless a month has its own. Leave this empty to use that.` : 'This category has no standing budget; set one under Categories.'}
          {' '}Now: {formatMoney(budgetFor(s, month, category) ?? 0, s.currency)}.</p>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- planned payments (FIN-04) ---------------------------------------------- */

function Planned({ profileId, s, entries, payments }: { profileId: string; s: FinanceSettings; entries: ModuleRecord[]; payments: { row: ModuleRecord; payment: Payment }[] }) {
  const today = localToday()
  const [open, setOpen] = useState<{ row: ModuleRecord; payment: Payment } | 'new' | null>(null)

  /** The first day from a month back that is due and not paid, else the next due day. */
  const nextOf = (p: Payment): { day: string; paid: boolean } | null => {
    for (let d = addDays(today, -31), i = 0; i < 400; d = addDays(d, 1), i++) {
      if (!paymentDue(p, d)) continue
      const paid = !!paidEntry(entries, p.id, d)
      if (!paid || d > today) return { day: d, paid }
    }
    return null
  }
  async function pay(p: Payment, day: string) {
    const res = await togglePaid(profileId, p.id, day, today)
    if (res.made) offerUndo(`${p.name} marked paid`, () => deleteRecordRow(res.made!))
  }

  return (
    <>
      {payments.length === 0 ? (
        <p className="empty">Rent, subscriptions, your salary: payments you know are coming. Tap the round + button to add one.</p>
      ) : (
        <ul className="kit-list" aria-label="Planned payments">
          {payments.map(({ row, payment: p }) => {
            const n = nextOf(p)
            const late = n && !n.paid && n.day < today
            const when = p.rule && p.start_date ? describeSchedule({ rule: p.rule, rule_config: p.rule_config, start_date: p.start_date, end_date: p.end_date }) : 'Once'
            return (
              <li key={row.id} className="kit-row">
                <button type="button" className="kit-open" onClick={() => setOpen({ row, payment: p })}>
                  <span className="row-name">{p.name}{!p.active && <span className="row-chip">paused</span>}</span>
                  <span className="row-meta">{[p.amount != null ? formatMoney(p.amount, s.currency) : null, p.kind === 'income' ? 'money in' : null, p.category, when].filter(Boolean).join(' · ')}</span>
                  {n && <span className={`row-meta${late ? ' kit-warn' : ''}`}>{late ? `Due ${short(n.day)}, not marked paid` : n.day === today ? 'Due today' : `Next ${short(n.day)}`}</span>}
                </button>
                {n && !n.paid && n.day <= today && <button type="button" className="btn" onClick={() => void pay(p, n.day)}>Mark paid</button>}
              </li>
            )
          })}
        </ul>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New planned payment" onClick={() => setOpen('new')}>+</button>
      {open && <PaymentSheet profileId={profileId} s={s} start={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  )
}

function PaymentSheet({ profileId, s, start, onClose }: { profileId: string; s: FinanceSettings; start: { row: ModuleRecord; payment: Payment } | null; onClose: () => void }) {
  const today = localToday()
  const p = start?.payment
  const [name, setName] = useState(p?.name ?? '')
  const [kind, setKind] = useState<Kind>(p?.kind ?? 'expense')
  const [amount, setAmount] = useState(p?.amount != null ? String(p.amount).replace('.', ',') : '')
  const [category, setCategory] = useState(p?.category ?? '')
  const [first, setFirst] = useState(p?.start_date ?? today)
  const [repeat, setRepeat] = useState<RepeatValue>({ rule: p?.rule ?? 'monthly', rule_config: p?.rule_config ?? { day_of_month: Number(today.slice(8, 10)) }, end_date: p?.end_date ?? null })
  const [time, setTime] = useState(p?.time ?? '')
  const [note, setNote] = useState(p?.note ?? '')
  const [active, setActive] = useState(p?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return setError('Give the payment a name.')
    if (name.trim().length > 80) return setError('Keep the name to 80 characters.')
    let value: number | null = null
    if (amount.trim()) { const a = parseAmount(amount); if (!a.ok) return setError(a.message); value = a.value }
    if (!first) return setError('Pick the first day.')
    if (repeat.end_date && repeat.end_date < first) return setError('The last day is before the first.')
    await savePayment(profileId, { name, kind, amount: value, category: category || null, rule: repeat.rule, rule_config: repeat.rule_config,
      start_date: first, end_date: repeat.end_date, time: time || null, note, active }, start?.row)
    onClose()
  }
  async function remove() {
    if (!start) return
    await deleteRecordRow(start.row)
    offerUndo(`${start.payment.name} deleted`, () => restoreRecordRow(start.row))
    onClose()
  }

  return (
    <Sheet title={start ? 'Change planned payment' : 'New planned payment'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {start && <DeleteButton onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Name<input value={name} maxLength={80} autoFocus={!start} placeholder="Rent, phone, gym" onChange={(e) => { setName(e.target.value); setError(null) }} /></label>
        <div className="kit-seg" role="group" aria-label="Money out or in">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Out</button>
          <button type="button" aria-pressed={kind === 'income'} onClick={() => setKind('income')}>In</button>
        </div>
        <div className="two">
          <label>Amount<input inputMode="decimal" value={amount} placeholder="Optional" onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Category<CategorySelect s={s} kind={kind} value={category} onChange={setCategory} /></label>
        </div>
        <div className="two">
          <label>First day<input type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
          <label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
      </div>
      <RepeatPicker value={repeat} start={first || today} today={today} noneLabel="Once" onChange={setRepeat}
        kinds={['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates']} />
      <div className="form-grid fin-more">
        <label>Note<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        <label className="kit-check"><input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} />Paused: not shown on the planner</label>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- the category list (FIN-02) ------------------------------------------------- */

function Categories({ profileId, s }: { profileId: string; s: FinanceSettings }) {
  const [open, setOpen] = useState<Category | 'new' | null>(null)
  const list = treeOrder(s.categories)
  return (
    <>
      <div className="setting-row">
        <div><div className="row-name">Currency</div><div className="row-meta">Amounts are shown in it everywhere in Finance.</div></div>
        <select className="fin-select" aria-label="Currency" value={s.currency} onChange={(e) => void saveFinanceSettings(profileId, { currency: e.target.value })}>
          {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {!s.categories.some((c) => c.budget != null) && <p className="kit-note">Tap a category to give it a monthly budget.</p>}
      {(['expense', 'income'] as Kind[]).map((k) => (
        <section key={k} aria-label={k === 'expense' ? 'Money out' : 'Money in'}>
          <h2 className="section-title">{k === 'expense' ? 'Money out' : 'Money in'}</h2>
          <ul className="kit-list">
            {list.filter((c) => c.kind === k).map((c) => (
              <li key={c.name} className={`kit-row${c.parent ? ' fin-sub' : ''}`}>
                <button type="button" className="kit-open" onClick={() => setOpen(c)}>
                  <span className="row-name">{c.name}</span>
                  <span className="row-meta">{[c.parent ? `under ${c.parent}` : null, c.budget != null ? `${formatMoney(c.budget, s.currency)} a month` : null].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New category" onClick={() => setOpen('new')}>+</button>
      {open && <CategorySheet profileId={profileId} s={s} category={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  )
}

function CategorySheet({ profileId, s, category, onClose }: { profileId: string; s: FinanceSettings; category: Category | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<Kind>(category?.kind ?? 'expense')
  const [parent, setParent] = useState(category?.parent ?? '')
  const [budget, setBudget] = useState(category?.budget != null ? String(category.budget).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)
  const hasChildren = !!category && s.categories.some((c) => c.parent === category.name)
  const parents = s.categories.filter((c) => !c.parent && c.kind === kind && c.name !== category?.name)

  async function save() {
    let b: number | null = null
    if (budget.trim()) { const a = parseAmount(budget); if (!a.ok) return setError(a.message); b = a.value }
    const next: Category = { name: name.trim(), parent: hasChildren ? null : parent || null, kind, budget: kind === 'expense' ? b : null }
    const problem = categoryProblem(next, s.categories, category?.name)
    if (problem) return setError(problem)
    await saveCategories(profileId, putCategory(s.categories, next, category?.name))
    if (category && category.name !== next.name) await renameCategoryEverywhere(profileId, category.name, next.name)
    onClose()
  }
  async function remove() {
    if (!category) return
    const before = s.categories
    await saveCategories(profileId, dropCategory(s.categories, category.name))
    offerUndo(`${category.name} taken off the list`, () => saveCategories(profileId, before))
    onClose()
  }

  return (
    <Sheet title={category ? 'Change category' : 'New category'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {category && <DeleteButton onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Name<input value={name} maxLength={40} autoFocus={!category} onChange={(e) => { setName(e.target.value); setError(null) }} /></label>
        {!category?.parent && !hasChildren && (
          <div className="kit-seg" role="group" aria-label="Money out or in">
            <button type="button" aria-pressed={kind === 'expense'} onClick={() => { setKind('expense'); setParent('') }}>Out</button>
            <button type="button" aria-pressed={kind === 'income'} onClick={() => { setKind('income'); setParent('') }}>In</button>
          </div>
        )}
        <label>Sits under
          <select value={hasChildren ? '' : parent} disabled={hasChildren} onChange={(e) => setParent(e.target.value)}>
            <option value="">Nothing: a top-level category</option>
            {parents.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        {hasChildren && <p className="kit-hint">Other categories sit under this one, so it stays top-level.</p>}
        {kind === 'expense' && (
          <label>Budget every month<input inputMode="decimal" value={budget} placeholder="None" onChange={(e) => setBudget(e.target.value)} /></label>
        )}
        {category && <p className="kit-hint">Renaming changes the entries and planned payments that use it. Deleting takes it off the list; its entries keep the name.</p>}
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
