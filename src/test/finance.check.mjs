// Checks Finance's rules: amounts as people type them, the category list,
// income and expense, a month's totals, budgets, the fast entry's category
// order, and planned payments.
import {
  readFinanceSettings, DEFAULT_CATEGORIES, parseAmount, formatMoney, entryKind, entryAmount, monthTotals, budgetFor, budgetRows,
  describeLeft, categoryGrid, categoryProblem, putCategory, dropCategory, treeOrder, topOf, readPayment, paymentDue, paidEntry,
  entryForPayment, paymentsBetween, financeSeries,
} from '../lib/finance-rules.ts'
import { dayItems } from '../lib/day-items-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// Settings.
const d = readFinanceSettings(null)
eq('nothing stored: euros and the starting list', [d.currency, d.categories.length, d.categories[1].parent], ['EUR', DEFAULT_CATEGORIES.length, 'Housing'])
eq('a stored list is read strictly', readFinanceSettings({
  currency: 'gbp', categories: [{ name: 'Food', kind: 'expense' }, { name: 'food', kind: 'expense' }, { name: 'Snacks', parent: 'Food', kind: 'income', budget: '20' },
    { name: 'Orphan', parent: 'Missing' }, { name: 'Deep', parent: 'Snacks' }, { name: '' }, 'junk'],
  months: { '2026-10': { Food: 300, Bad: -1 }, '2026-13': { Food: 1 } },
}), {
  currency: 'EUR',
  categories: [{ name: 'Food', parent: null, kind: 'expense', budget: null }, { name: 'Snacks', parent: 'Food', kind: 'expense', budget: 20 },
    { name: 'Orphan', parent: null, kind: 'expense', budget: null }, { name: 'Deep', parent: null, kind: 'expense', budget: null }],
  months: { '2026-10': { Food: 300 } },
})
eq('a real currency is kept', readFinanceSettings({ currency: 'GBP' }).currency, 'GBP')

// Amounts.
eq('a comma for the cents', parseAmount('12,50'), { ok: true, value: 12.5 })
eq('a point for the cents', parseAmount('12.5'), { ok: true, value: 12.5 })
eq('Dutch thousands and cents', parseAmount('€ 1.234,56'), { ok: true, value: 1234.56 })
eq('British thousands and cents', parseAmount('1,234.56'), { ok: true, value: 1234.56 })
eq('thousands without cents', parseAmount('1.234'), { ok: true, value: 1234 })
eq('a minus is taken off: the type says which way', parseAmount('-5'), { ok: true, value: 5 })
eq('nothing typed', parseAmount('abc'), { ok: false, message: 'Type an amount.' })
eq('zero', parseAmount('0,00'), { ok: false, message: 'The amount is more than nothing.' })
eq('euros written the British way', formatMoney(1234.5), '€1,234.50')
eq('pounds', formatMoney(9.99, 'GBP'), '£9.99')
eq('a negative amount', formatMoney(-3, 'EUR'), '−€3.00')
eq('a sign for money in', formatMoney(3, 'EUR', { sign: true }), '+€3.00')

// Entries.
const e = (id, day, amount, category, kind, x = {}) => ({ id, record_date: day, data: { entry_date: day, amount, category, ...(kind ? { kind } : {}), ...x } })
const entries = [
  e('1', '2026-10-01', 950, 'Rent', 'expense'), e('2', '2026-10-03', 62.4, 'Groceries', 'expense'), e('3', '2026-10-05', 30.1, 'Groceries', 'expense'),
  e('4', '2026-10-05', 18, 'Eating out', 'expense'), e('5', '2026-10-25', 3100, 'Salary', 'income'), e('6', '2026-10-07', 12, 'Snacks from the machine', null),
  e('7', '2026-10-09', -50, 'Refund', null), e('8', '2026-09-30', 500, 'Rent', 'expense'), e('9', '2026-10-10', 999, 'Fun', 'expense', {}),
]
entries[8].deleted_at = 'x'
eq('an old entry without a type and a negative amount is money in', [entryKind(entries[6]), entryAmount(entries[6])], ['income', 50])
eq('an old entry without a type is money out', entryKind(entries[5]), 'expense')
const t = monthTotals(entries, '2026-10', d.categories)
eq('the month: in, out, net, count (deleted and other months left out)', [t.income, t.expense, t.net, t.count], [3150, 1072.5, 2077.5, 7])
eq('spent per category as entered', t.byCategory, { Rent: 950, Groceries: 92.5, 'Eating out': 18, 'Snacks from the machine': 12 })
eq('spent per top-level category; a name not in the list counts as itself', t.byTop, { Housing: 950, Food: 110.5, 'Snacks from the machine': 12 })
eq('a sub-category counts under its parent', topOf('groceries', d.categories), 'Food')

// Budgets.
const s = readFinanceSettings({ categories: [...DEFAULT_CATEGORIES.map((c) => (c.name === 'Food' ? { ...c, budget: 100 } : c.name === 'Eating out' ? { ...c, budget: 50 } : c))],
  months: { '2026-10': { 'Eating out': 10 } } })
eq('a month\'s own budget wins', budgetFor(s, '2026-10', 'Eating out'), 10)
eq('another month uses the standing one', budgetFor(s, '2026-11', 'Eating out'), 50)
eq('no budget', budgetFor(s, '2026-10', 'Rent'), null)
const rows = budgetRows(s, entries, '2026-10')
eq('budgets: the top-level one counts what is under it; over is marked',
  rows.map((r) => [r.category, r.top, r.budget, r.spent, r.left, r.over]), [['Food', true, 100, 110.5, -10.5, true], ['Eating out', false, 10, 18, -8, true]])
eq('over in words', describeLeft(rows[0], 'EUR'), '€10.50 over')
eq('left in words', describeLeft({ ...rows[0], left: 12, over: false }, 'EUR'), '€12.00 left')

// The fast entry's grid.
eq('expense categories, most recently used first (a tie in the list order)', categoryGrid(d, entries, 'expense').slice(0, 5), ['Groceries', 'Eating out', 'Rent', 'Housing', 'Energy and water'])
eq('income categories', categoryGrid(d, entries, 'income'), ['Salary', 'Other income'])

// The list.
eq('a new name', categoryProblem({ name: 'Pets', parent: null, kind: 'expense', budget: null }, d.categories), null)
eq('a name twice', categoryProblem({ name: 'rent', parent: null, kind: 'expense', budget: null }, d.categories), 'There is already a category with that name.')
eq('renaming to its own name is fine', categoryProblem({ name: 'Rent', parent: 'Housing', kind: 'expense', budget: 900 }, d.categories, 'Rent'), null)
eq('a parent cannot go under another', categoryProblem({ name: 'Food', parent: 'Housing', kind: 'expense', budget: null }, d.categories, 'Food'),
  'This one has others under it, so it stays top-level.')
const renamed = putCategory(d.categories, { name: 'Home', parent: null, kind: 'expense', budget: null }, 'Housing')
eq('renaming a top-level one takes the ones under it along', renamed.filter((c) => c.parent === 'Home').map((c) => c.name), ['Rent', 'Energy and water', 'Internet and phone'])
eq('a new one under a parent takes its kind', putCategory(d.categories, { name: 'Bonus', parent: 'Salary', kind: 'expense', budget: null }).at(-1),
  { name: 'Bonus', parent: 'Salary', kind: 'income', budget: null })
eq('dropping a top-level one lifts the ones under it', dropCategory(d.categories, 'Food').filter((c) => c.name === 'Groceries')[0].parent, null)
eq('tree order: each top-level one followed by its own', treeOrder(d.categories).slice(0, 5).map((c) => c.name), ['Housing', 'Rent', 'Energy and water', 'Internet and phone', 'Food'])

// Planned payments.
const rent = readPayment({ id: 'p1', data: { name: 'Rent', amount: 950, category: 'Rent', rule: 'monthly', rule_config: { day_of_month: 1 }, start_date: '2026-01-01', time: '09:00:00' } })
eq('a payment read safely', [rent.name, rent.amount, rent.kind, rent.time, rent.active], ['Rent', 950, 'expense', '09:00', true])
eq('due on the 1st', [paymentDue(rent, '2026-11-01'), paymentDue(rent, '2026-11-02')], [true, false])
eq('not before its first day', paymentDue(rent, '2025-12-01'), false)
const late = readPayment({ id: 'p3', created_at: '2026-10-03T10:00:00Z', data: { name: 'Gym', rule: 'monthly', rule_config: { day_of_month: 1 }, start_date: '2026-01-01' } })
eq('set up on the 3rd with a first day in January: not due before it was set up', [paymentDue(late, '2026-10-01'), paymentDue(late, '2026-11-01')], [false, true])
const ahead = readPayment({ id: 'p4', created_at: '2026-10-03T10:00:00Z', data: { name: 'Tax', start_date: '2026-09-30' } })
eq('a one-off set up after its day is not asked about', paymentDue(ahead, '2026-09-30'), false)
eq('paused is not due', paymentDue({ ...rent, active: false }, '2026-11-01'), false)
const once = readPayment({ id: 'p2', data: { name: 'Insurance', amount: '120', start_date: '2026-10-15' } })
eq('a one-off is due on its day only', [paymentDue(once, '2026-10-15'), paymentDue(once, '2026-11-15')], [true, false])
const paid = [e('x', '2026-10-02', 950, 'Rent', 'expense', { payment_id: 'p1', due_date: '2026-10-01' })]
eq('a day marked paid finds its entry', paidEntry(paid, 'p1', '2026-10-01')?.id, 'x')
eq('another day is not paid', paidEntry(paid, 'p1', '2026-11-01'), null)
eq('marking paid makes this entry', entryForPayment(rent, '2026-11-01', '2026-11-02'),
  { entry_date: '2026-11-02', kind: 'expense', category: 'Rent', amount: 950, note: 'Rent', payment_id: 'p1', due_date: '2026-11-01' })
eq('payments in a range with their state', paymentsBetween([rent, once], paid, '2026-10-01', '2026-10-31', ['2026-10-01', '2026-10-15', '2026-10-20'])
  .map((x) => `${x.payment.id}:${x.day}:${x.paid ? 'paid' : 'due'}`), ['p1:2026-10-01:paid', 'p2:2026-10-15:due'])

// Stats.
eq('spent per day', financeSeries(entries.slice(0, 4), 'expense', d.categories), { '2026-10-01': 950, '2026-10-03': 62.4, '2026-10-05': 48.1 })
eq('spent on a top-level category', financeSeries(entries, 'expense', d.categories, 'Food'), { '2026-10-03': 62.4, '2026-10-05': 48.1 })
eq('net per day', financeSeries([entries[4], entries[0]], 'net', d.categories), { '2026-10-25': 3100, '2026-10-01': -950 })

// Planned payments on the day list (day-items-rules.ts, the payments block).
const src = (x = {}) => ({
  today: '2026-11-01', enabled: ['finance'], views: {}, tasks: [], habits: [], habitLogs: [], chores: [], choreLogs: [], supplements: [], supplementLogs: [],
  events: [], records: [], payments: [{ ...rent, meta: '€950.00 · Rent · monthly' }], paidPayments: [], ...x,
})
const items = dayItems(['2026-10-31', '2026-11-01'], 'today', src())
eq('a payment shows on its day as "… due", at its time', items.map((i) => [i.kind, i.day, i.title, i.time, i.done]), [['payment', '2026-11-01', 'Rent due', '09:00', false]])
const paidSrc = src({ paidPayments: [{ payment_id: 'p1', due_date: '2026-11-01', entry_id: 'e1' }],
  records: [{ id: 'e1', profile_id: 'x', module_key: 'finance', entity: 'entry', data: { category: 'Rent' }, record_date: '2026-11-01', updated_at: '', deleted_at: null }] })
eq('paid: ticked, and its entry is not listed again as a record', dayItems(['2026-11-01'], 'today', paidSrc).map((i) => [i.kind, i.done, i.meta]),
  [['payment', true, '€950.00 · Rent · monthly · paid']])
eq('Finance off: no payments', dayItems(['2026-11-01'], 'today', src({ enabled: [] })), [])
eq('Finance not shown on Plan: none there', dayItems(['2026-11-01'], 'plan', src({ views: { finance: { plan: false } } })), [])
eq('money expected in reads "expected"', dayItems(['2026-11-01'], 'today', src({ payments: [{ ...rent, kind: 'income', name: 'Salary', meta: '' }] }))[0].title, 'Salary expected')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall finance checks passed')
