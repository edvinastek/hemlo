/** Finance's arithmetic and wording, with no database and no React (checked
 *  in src/test/finance.check.mjs): money typed the way people type it, the
 *  category list (top-level ones with ones under them), income and expense,
 *  a month's totals, budgets per category per month with what is spent
 *  against them, the categories used most recently first, and planned
 *  payments (rent, subscriptions) and whether a day's one is paid. */
import { occursOn, type RuleConfig, type RuleKind } from './schedule-rules.ts'

export type Kind = 'expense' | 'income'

export interface Category {
  name: string
  /** The top-level category it sits under, or null for a top-level one. */
  parent: string | null
  kind: Kind
  /** A budget for every month, unless a month has its own. */
  budget: number | null
}

export interface FinanceSettings {
  /** ISO 4217 code: EUR unless chosen otherwise. */
  currency: string
  categories: Category[]
  /** A month's own budgets, 'yyyy-MM' to category to amount, overriding the
   *  category's budget for that month only. */
  months: Record<string, Record<string, number>>
}

export const CATEGORY_MAX = 100
export const NAME_MAX = 40
export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'CAD', 'AUD', 'JPY']

/** The list a person starts with: sensible, short, and all of it can be
 *  renamed, moved, given a budget or deleted. */
export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Housing', parent: null, kind: 'expense', budget: null },
  { name: 'Rent', parent: 'Housing', kind: 'expense', budget: null },
  { name: 'Energy and water', parent: 'Housing', kind: 'expense', budget: null },
  { name: 'Internet and phone', parent: 'Housing', kind: 'expense', budget: null },
  { name: 'Food', parent: null, kind: 'expense', budget: null },
  { name: 'Groceries', parent: 'Food', kind: 'expense', budget: null },
  { name: 'Eating out', parent: 'Food', kind: 'expense', budget: null },
  { name: 'Transport', parent: null, kind: 'expense', budget: null },
  { name: 'Health', parent: null, kind: 'expense', budget: null },
  { name: 'Subscriptions', parent: null, kind: 'expense', budget: null },
  { name: 'Shopping', parent: null, kind: 'expense', budget: null },
  { name: 'Fun', parent: null, kind: 'expense', budget: null },
  { name: 'Other', parent: null, kind: 'expense', budget: null },
  { name: 'Salary', parent: null, kind: 'income', budget: null },
  { name: 'Other income', parent: null, kind: 'income', budget: null },
]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null
}
const fold = (s: string) => s.trim().toLowerCase()

/** The stored settings, checked: a broken category is dropped, a sub-category
 *  whose parent is missing (or is itself under another) becomes top-level,
 *  names are unique (case aside), and nothing stored means the defaults. */
export function readFinanceSettings(raw: Record<string, unknown> | null | undefined): FinanceSettings {
  const r = raw ?? {}
  const currency = typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : 'EUR'
  let categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c }))
  if (Array.isArray(r.categories)) {
    const seen = new Set<string>()
    const list: Category[] = []
    for (const c of r.categories) {
      if (!isObj(c) || typeof c.name !== 'string') continue
      const name = c.name.trim().slice(0, NAME_MAX)
      if (!name || seen.has(fold(name)) || list.length >= CATEGORY_MAX) continue
      seen.add(fold(name))
      list.push({ name, parent: typeof c.parent === 'string' && c.parent.trim() ? c.parent.trim() : null,
        kind: c.kind === 'income' ? 'income' : 'expense', budget: money(c.budget) })
    }
    const tops = new Set(list.filter((c) => !c.parent).map((c) => fold(c.name)))
    categories = list.map((c) => {
      if (!c.parent) return c
      const top = list.find((t) => !t.parent && fold(t.name) === fold(c.parent!))
      // One level only, and a sub-category has the kind of its parent.
      return top && tops.has(fold(top.name)) ? { ...c, parent: top.name, kind: top.kind } : { ...c, parent: null }
    })
  }
  const months: Record<string, Record<string, number>> = {}
  if (isObj(r.months)) {
    for (const [m, v] of Object.entries(r.months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || !isObj(v)) continue
      const row: Record<string, number> = {}
      for (const [c, a] of Object.entries(v)) { const n = money(a); if (n != null && c.length <= NAME_MAX) row[c] = n }
      if (Object.keys(row).length) months[m] = row
    }
  }
  return { currency, categories, months }
}

/* ---------- money ------------------------------------------------------------ */

/** An amount as typed: "12,50", "12.50", "€ 1.234,56", "1,234.56", "-5".
 *  The last comma or point is the decimal one when it has one or two digits
 *  after it. Returns the amount (always positive) or a message. */
export function parseAmount(text: string): { ok: true; value: number } | { ok: false; message: string } {
  let t = text.replace(/[^\d.,-]/g, '')
  if (!t) return { ok: false, message: 'Type an amount.' }
  t = t.replace(/^-/, '')
  const last = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'))
  let whole = t
  let frac = ''
  if (last >= 0 && t.length - last - 1 <= 2 && t.length - last - 1 > 0) { whole = t.slice(0, last); frac = t.slice(last + 1) }
  else if (last === t.length - 1) whole = t.slice(0, -1)
  whole = whole.replace(/[.,]/g, '')
  const n = Number(`${whole || '0'}.${frac || '0'}`)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: 'The amount is more than nothing.' }
  if (n >= 1e9) return { ok: false, message: 'That amount is too large.' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/** €1,234.50 — the person's currency, written the British way. */
export function formatMoney(amount: number, currency = 'EUR', opts: { sign?: boolean } = {}): string {
  let s: string
  try {
    s = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount))
  } catch {
    s = `${currency} ${Math.abs(amount).toFixed(2)}`
  }
  if (amount < 0) return `−${s}`
  return opts.sign && amount > 0 ? `+${s}` : s
}

/* ---------- entries ---------------------------------------------------------- */

export interface EntryLike { id: string; data: Record<string, unknown>; record_date: string | null; deleted_at?: string | null }

/** Income or expense. Entries from before there was a type: a negative
 *  amount was money in, anything else money out. */
export function entryKind(e: EntryLike): Kind {
  if (e.data.kind === 'income' || e.data.kind === 'expense') return e.data.kind
  return Number(e.data.amount) < 0 ? 'income' : 'expense'
}
/** The amount as a positive number, or null when there is none. */
export function entryAmount(e: EntryLike): number | null {
  const n = Number(e.data.amount)
  return e.data.amount == null || e.data.amount === '' || !Number.isFinite(n) ? null : Math.abs(n)
}
export const entryCategory = (e: EntryLike) => (typeof e.data.category === 'string' && e.data.category.trim() ? e.data.category.trim() : 'No category')
export const entryDay = (e: EntryLike) => (typeof e.data.entry_date === 'string' ? e.data.entry_date : e.record_date)

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)
const inMonth = (e: EntryLike, month: string) => (entryDay(e) ?? '').slice(0, 7) === month

/** The top-level category an entry counts under ("Groceries" counts under
 *  "Food"); a category not in the list counts as itself. */
export function topOf(name: string, cats: Category[]): string {
  const c = cats.find((x) => fold(x.name) === fold(name))
  return c?.parent ?? c?.name ?? name
}

export interface MonthTotals {
  income: number
  expense: number
  net: number
  /** Spent per category as entered, and per top-level category. */
  byCategory: Record<string, number>
  byTop: Record<string, number>
  count: number
}

export function monthTotals(entries: EntryLike[], month: string, cats: Category[]): MonthTotals {
  const out: MonthTotals = { income: 0, expense: 0, net: 0, byCategory: {}, byTop: {}, count: 0 }
  for (const e of live(entries)) {
    if (!inMonth(e, month)) continue
    const a = entryAmount(e)
    if (a == null) continue
    out.count++
    if (entryKind(e) === 'income') { out.income += a; continue }
    out.expense += a
    const c = entryCategory(e)
    out.byCategory[c] = (out.byCategory[c] ?? 0) + a
    const top = topOf(c, cats)
    out.byTop[top] = (out.byTop[top] ?? 0) + a
  }
  const r = (n: number) => Math.round(n * 100) / 100
  out.income = r(out.income)
  out.expense = r(out.expense)
  out.net = r(out.income - out.expense)
  for (const k of Object.keys(out.byCategory)) out.byCategory[k] = r(out.byCategory[k])
  for (const k of Object.keys(out.byTop)) out.byTop[k] = r(out.byTop[k])
  return out
}

/* ---------- budgets (FIN-03) -------------------------------------------------- */

/** A category's budget for a month: the month's own, else its standing one. */
export function budgetFor(s: FinanceSettings, month: string, category: string): number | null {
  const own = s.months[month]?.[category]
  if (own != null) return own
  return s.categories.find((c) => fold(c.name) === fold(category))?.budget ?? null
}

export interface BudgetRow { category: string; top: boolean; budget: number; spent: number; left: number; share: number; over: boolean }

/** Every expense category with a budget this month, with what was spent
 *  against it: a top-level category counts what is under it too. */
export function budgetRows(s: FinanceSettings, entries: EntryLike[], month: string): BudgetRow[] {
  const t = monthTotals(entries, month, s.categories)
  const out: BudgetRow[] = []
  for (const c of s.categories) {
    if (c.kind !== 'expense') continue
    const budget = budgetFor(s, month, c.name)
    if (budget == null) continue
    const spent = c.parent ? t.byCategory[c.name] ?? 0 : t.byTop[c.name] ?? 0
    const left = Math.round((budget - spent) * 100) / 100
    out.push({ category: c.name, top: !c.parent, budget, spent, left, share: budget > 0 ? Math.round((spent / budget) * 1000) / 1000 : spent > 0 ? 1 : 0, over: spent > budget })
  }
  return out
}

/** "€42.10 left", "€12.00 over". */
export const describeLeft = (r: BudgetRow, currency: string) => (r.over ? `${formatMoney(-r.left, currency)} over` : `${formatMoney(r.left, currency)} left`)

/* ---------- fast entry (FIN-05) ------------------------------------------------- */

/** The categories to offer for a kind, the most recently used first, then
 *  the rest in the list's order. Top-level ones that have others under them
 *  are offered too ("Food" when it is not worth saying which). */
export function categoryGrid(s: FinanceSettings, entries: EntryLike[], kind: Kind): string[] {
  const names = s.categories.filter((c) => c.kind === kind).map((c) => c.name)
  const last = new Map<string, string>()
  for (const e of live(entries)) {
    if (entryKind(e) !== kind) continue
    const c = entryCategory(e)
    const key = names.find((n) => fold(n) === fold(c))
    if (!key) continue
    const when = `${entryDay(e) ?? ''}|${String(e.data.updated_at ?? '')}`
    if ((last.get(key) ?? '') < when) last.set(key, when)
  }
  const used = [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([n]) => n)
  return [...used, ...names.filter((n) => !last.has(n))]
}

/* ---------- the category list ---------------------------------------------------- */

/** Problems with a category as typed, or null. */
export function categoryProblem(c: Category, all: Category[], was?: string): string | null {
  const n = c.name.trim()
  if (!n) return 'Give the category a name.'
  if (n.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`
  if (all.some((x) => fold(x.name) === fold(n) && (!was || fold(x.name) !== fold(was)))) return 'There is already a category with that name.'
  if (c.parent && fold(c.parent) === fold(n)) return 'A category cannot sit under itself.'
  if (c.parent && was && all.some((x) => x.parent && fold(x.parent) === fold(was))) return 'This one has others under it, so it stays top-level.'
  if (c.budget != null && !(c.budget >= 0 && c.budget < 1e9)) return 'A budget is an amount of 0 or more.'
  if (!was && all.length >= CATEGORY_MAX) return `There can be up to ${CATEGORY_MAX} categories.`
  return null
}

/** The list with one category changed (or added, when `was` is absent). A
 *  renamed top-level category takes the ones under it along. */
export function putCategory(all: Category[], c: Category, was?: string): Category[] {
  const name = c.name.trim()
  const parent = all.find((x) => !x.parent && c.parent && fold(x.name) === fold(c.parent))
  const next: Category = { ...c, name, parent: parent?.name ?? null, kind: parent?.kind ?? c.kind }
  if (!was) return [...all, next]
  return all.map((x) => {
    if (fold(x.name) === fold(was)) return next
    if (x.parent && fold(x.parent) === fold(was)) return { ...x, parent: name, kind: next.kind }
    return x
  })
}

/** The list without a category; those under it become top-level. Entries
 *  keep the name they have, so nothing is lost. */
export function dropCategory(all: Category[], name: string): Category[] {
  return all.filter((x) => fold(x.name) !== fold(name)).map((x) => (x.parent && fold(x.parent) === fold(name) ? { ...x, parent: null } : x))
}

/** Top-level categories, each followed by the ones under it, for lists. */
export function treeOrder(all: Category[]): Category[] {
  const out: Category[] = []
  for (const top of all.filter((c) => !c.parent)) {
    out.push(top)
    out.push(...all.filter((c) => c.parent && fold(c.parent) === fold(top.name)))
  }
  return out
}

/* ---------- planned payments (FIN-04) -------------------------------------------- */

export interface Payment {
  id: string
  name: string
  amount: number | null
  kind: Kind
  category: string | null
  rule: RuleKind | null
  rule_config: RuleConfig
  start_date: string | null
  end_date: string | null
  time: string | null
  note: string | null
  active: boolean
  deleted_at?: string | null
}

/** A payment as kept in its module_record's data, read safely. */
export function readPayment(r: { id: string; data: Record<string, unknown>; deleted_at?: string | null }): Payment {
  const d = r.data ?? {}
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return {
    id: r.id,
    name: str(d.name, 80) ?? 'Payment',
    amount: money(d.amount),
    kind: d.kind === 'income' ? 'income' : 'expense',
    category: str(d.category, NAME_MAX),
    rule: typeof d.rule === 'string' ? (d.rule as RuleKind) : null,
    rule_config: isObj(d.rule_config) ? (d.rule_config as RuleConfig) : {},
    start_date: str(d.start_date, 10),
    end_date: str(d.end_date, 10),
    time: typeof d.time === 'string' && /^\d{2}:\d{2}/.test(d.time) ? d.time.slice(0, 5) : null,
    note: str(d.note, 500),
    active: d.active !== false,
    deleted_at: r.deleted_at ?? null,
  }
}

/** Is a payment due on a day? A payment without a repeat is due once, on its first day. */
export function paymentDue(p: Payment, day: string): boolean {
  if (!p.active || p.deleted_at || !p.start_date) return false
  if (!p.rule) return day === p.start_date
  return occursOn({ rule: p.rule, rule_config: p.rule_config, start_date: p.start_date, end_date: p.end_date }, day)
}

/** The entry that paid a payment's day, if it was marked paid. */
export const paidEntry = <E extends EntryLike>(entries: E[], paymentId: string, day: string) =>
  live(entries).find((e) => e.data.payment_id === paymentId && e.data.due_date === day) ?? null

/** The entry marking a payment's day as paid creates. */
export function entryForPayment(p: Payment, day: string, paidOn: string): Record<string, unknown> {
  return {
    entry_date: paidOn, kind: p.kind, category: p.category, amount: p.amount, note: p.name,
    payment_id: p.id, due_date: day,
  }
}

/** The payments due from `from` to `to`, by day, with whether each is paid. */
export function paymentsBetween(payments: Payment[], entries: EntryLike[], from: string, to: string, days: string[]):
  { payment: Payment; day: string; paid: EntryLike | null }[] {
  const out: { payment: Payment; day: string; paid: EntryLike | null }[] = []
  for (const day of days) {
    if (day < from || day > to) continue
    for (const p of payments) if (paymentDue(p, day)) out.push({ payment: p, day, paid: paidEntry(entries, p.id, day) })
  }
  return out
}

/** "€950.00 · Rent · monthly" style meta for a day's item. */
export function paymentMeta(p: Payment, currency: string, schedule: string): string {
  return [p.amount != null ? `${p.kind === 'income' ? 'in ' : ''}${formatMoney(p.amount, currency)}` : null, p.category, schedule].filter(Boolean).join(' · ')
}

/** The measures Finance gives Stats, by source key. */
export const FINANCE_MEASURES = [
  { source: 'finance.expense', label: 'Spent', per: ['category'], summary: 'sum' as const },
  { source: 'finance.income', label: 'Money in', per: ['category'], summary: 'sum' as const },
  { source: 'finance.net', label: 'Money in less spent', per: [], summary: 'sum' as const },
]

/** A value per day for one of those measures, optionally for one category
 *  (a top-level one counts what is under it). */
export function financeSeries(entries: EntryLike[], measure: 'expense' | 'income' | 'net', cats: Category[], category?: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of live(entries)) {
    const a = entryAmount(e)
    const d = entryDay(e)
    if (a == null || !d) continue
    const k = entryKind(e)
    if (category && fold(entryCategory(e)) !== fold(category) && fold(topOf(entryCategory(e), cats)) !== fold(category)) continue
    const v = measure === 'net' ? (k === 'income' ? a : -a) : k === measure ? a : null
    if (v == null) continue
    out[d] = Math.round(((out[d] ?? 0) + v) * 100) / 100
  }
  return out
}
