// Checks the measures Stats gained in version 18 (STA-03, SLP-02, STA-15,
// HAB-07, HLT-03, FIN-02/03, PRICE-02) against figures worked out by hand,
// and that money in is never counted as spending (P8).
// "today" in these checks is Sunday 2026-10-04.
import { sleepStatsFacts, trendFacts, habitStrengthFacts, foodFigure, partsFigure, financeFacts, boughtCost } from '../lib/stats-rules.ts'
import { habitStrength, habitStrengths } from '../lib/tracking-rules.ts'
import { sleepDebt } from '../lib/sleep-rules.ts'
import { trendLine } from '../lib/trend-rules.ts'
import { readFinanceSettings } from '../lib/finance-rules.ts'
import { measureCatalogue, TEMPLATES, fromTemplate, viewSpec, LABEL_FIGURE_NAMES } from '../lib/stats-builder-rules.ts'
import { readStatsView, upgradeSource } from '../lib/stats-view-rules.ts'
import { pivot, cellValue, spanDays } from '../lib/pivot-rules.ts'
import { MODULES } from '../modules/registry.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const today = '2026-10-04'
const of = (facts, measure) => Object.fromEntries(facts.filter((f) => f.measure === measure).map((f) => [f.day, Math.round(f.value * 100) / 100]))

/* ---------- sleep against the target (SLP-02) ---------- */
const night = (log_date, went_to_bed, woke_at) => ({ id: `n${log_date}`, log_date, went_to_bed, woke_at, hours: null, quality: null })
const nights = [
  night('2026-09-28', '23:00', '06:00'), // 7 h, an hour late
  night('2026-09-29', '22:00', '06:00'), // 8 h, on time
  night('2026-09-30', '22:30', '05:30'), // 7 h
  night('2026-10-02', '00:00', '06:00'), // 6 h, two hours late
]
const target = { target_hours: 8, bedtime: '22:00' }
const sleep = sleepStatsFacts(nights, target, { start: '2026-09-29', end: '2026-10-05' }, today)
is('hours against the target, night by night (only the range)', of(sleep, 'sleep:vs_target'), { '2026-09-29': 0, '2026-09-30': -1, '2026-10-02': -2 })
is('bedtime against the target, in minutes', of(sleep, 'sleep:bed_late'), { '2026-09-29': 0, '2026-09-30': 30, '2026-10-02': 120 })
// 29 Sep: nights of 28 and 29 Sep in its 7 days: 1 + 0 = 1 h of debt.
is('sleep debt counts the 7 days up to each day, from before the range too', of(sleep, 'sleep:debt')['2026-09-29'], 1)
is('a day with no new night keeps its window (1 Oct: 1 + 0 + 1)', of(sleep, 'sleep:debt')['2026-10-01'], 2)
is('debt agrees with the Sleep page on today', of(sleep, 'sleep:debt')[today], sleepDebt(nights, 8, today).hours)
is('days still to come have no debt', of(sleep, 'sleep:debt')['2026-10-05'], undefined)
const lonely = sleepStatsFacts([night('2026-09-01', '22:00', '06:00')], target, { start: '2026-09-20', end: '2026-09-21' }, today)
is('no night in the window: unknown, not zero', lonely.filter((f) => f.measure === 'sleep:debt').length, 0)
is('regularity needs three nights (29 Sep has two)', of(sleep, 'sleep:bed_spread')['2026-09-29'], undefined)
is('regularity from three nights on', typeof of(sleep, 'sleep:bed_spread')['2026-09-30'], 'number')
is('wake times 06:00, 06:00, 05:30, 06:00 wander little', of(sleep, 'sleep:wake_spread')['2026-10-02'] <= 15, true)

/* ---------- trend weight (HLT-03) ---------- */
const weighIns = [
  { log_date: '2026-09-01', weight_kg: 80 }, { log_date: '2026-09-08', weight_kg: 79 },
  { log_date: '2026-09-15', weight_kg: 78.4 }, { log_date: '2026-09-29', weight_kg: 78 },
]
const trend = trendFacts(weighIns, { start: '2026-09-10', end: '2026-10-04' })
const line = trendLine(weighIns)
is('the trend on weigh-in days in the range, carrying the history before it', of(trend, 'health:trend'), { '2026-09-15': line[2].trend, '2026-09-29': line[3].trend })
is('the rate needs a week of weigh-ins and is negative when losing', of(trend, 'health:rate')['2026-09-29'] < 0, true)

/* ---------- habit strength (HAB-07) ---------- */
const daily = { id: 'h1', name: 'Walk', active: true, rule: 'daily', rule_config: {}, start_date: '2026-09-01' }
const ticks = []
for (let d = 1; d <= 30; d++) if (d % 4 !== 0) ticks.push(`2026-09-${String(d).padStart(2, '0')}`)
const strength = habitStrengthFacts([daily], { h1: ticks }, { start: '2026-08-25', end: '2026-10-06' }, today)
const sv = of(strength, 'habits:strength')
is('strength from the habit\'s start, not before', Object.keys(sv)[0], '2026-09-01')
is('strength up to today only', Object.keys(sv).at(-1), today)
is('the same figure as the Habits page, every day', Object.entries(sv).every(([d, v]) => v === habitStrength(daily, ticks, d)), true)
is('a habit put away has no strength in Stats', habitStrengthFacts([{ ...daily, active: false }], { h1: ticks }, { start: '2026-09-01', end: '2026-09-30' }, today).length, 0)
const monthly = { rule: 'monthly', rule_config: {}, start_date: '2024-01-15' }
const monthTicks = ['2025-08-15', '2025-09-15', '2026-07-15', '2026-08-15', '2026-09-15']
is('an old monthly habit is read on its own day (the 15th), not the look-back\'s', habitStrength(monthly, monthTicks, '2026-09-20') > 0, true)
const days = ['2026-09-10', '2026-09-20', '2026-09-30']
is('worked out together or one day at a time, the same', habitStrengths(monthly, monthTicks, days), Object.fromEntries(days.map((d) => [d, habitStrength(monthly, monthTicks, d)])))

/* ---------- extra label figures (FOOD-16) ---------- */
const oats = { kcal: 370, sugars_g: 1, salt_g: 0.02 }
const jam = { kcal: 250, sugars_g: 60 }
is('a figure for an amount', foodFigure(oats, 50, 'sugars_g'), 0.5)
is('a figure the label leaves out is unknown, not 0', foodFigure(jam, 20, 'salt_g'), null)
is('a recipe adds its lines up', partsFigure([{ food: oats, grams: 50 }, { food: jam, grams: 20 }], 'sugars_g'), 12.5)
is('a recipe with one line unknown is unknown, never short', partsFigure([{ food: oats, grams: 50 }, { food: jam, grams: 20 }], 'salt_g'), null)
is('a line with no amount does not spoil it', partsFigure([{ food: oats, grams: 50 }, { food: jam, grams: 0 }], 'salt_g'), 0.01)

/* ---------- finance (FIN-02, FIN-03, STA-15, P8) ---------- */
const fin = readFinanceSettings({
  currency: 'EUR',
  categories: [
    { name: 'Food', parent: null, kind: 'expense', budget: 300 },
    { name: 'Groceries', parent: 'Food', kind: 'expense', budget: 250 },
    { name: 'Fun', parent: null, kind: 'expense', budget: null },
    { name: 'Cinema', parent: 'Fun', kind: 'expense', budget: 30 },
    { name: 'Salary', parent: null, kind: 'income', budget: null },
  ],
})
const entry = (id, entry_date, kind, category, amount) => ({ id, record_date: entry_date, data: { entry_date, kind, category, amount } })
const entries = [
  entry('e1', '2026-09-30', 'expense', 'Groceries', 40),
  entry('e2', '2026-10-01', 'expense', 'Groceries', 60),
  entry('e3', '2026-10-01', 'income', 'Salary', 3000),
  entry('e4', '2026-10-02', 'expense', 'Cinema', 12),
  entry('e5', '2026-10-03', 'expense', 'Fun', 20),
  { ...entry('e6', '2026-10-03', 'expense', 'Food', 99), deleted_at: '2026-10-03T10:00:00Z' },
  // From before there was a type: a negative amount was money in.
  { id: 'e7', record_date: '2026-10-02', data: { entry_date: '2026-10-02', category: 'Other income', amount: -50 } },
]
const octSpan = { start: '2026-10-01', end: '2026-10-31' }
const money = financeFacts(entries, fin, octSpan, today)
const sum = (m) => Math.round(money.filter((f) => f.measure === m).reduce((a, f) => a + f.value, 0) * 100) / 100
is('spent is money out only (never the salary)', sum('finance:spent'), 92)
is('money in is the salary and the old negative amount', sum('finance:income'), 3050)
is('net is money in less spent', sum('finance:net'), 2958)
is('a deleted entry counts nowhere', money.some((f) => f.ref?.id === 'e6'), false)
is('entries outside the range count nowhere', money.some((f) => f.ref?.id === 'e1'), false)
is('spending in budgeted categories: groceries under Food, cinema; not Fun itself', sum('finance:budget_spent'), 72)
// October has 31 days; budgets up to today (4 days): Food 300 covers Groceries;
// Cinema 30 is its own (Fun has none): (300 + 30) * 4 / 31.
is('budgets spread over the month up to today', sum('finance:budget'), Math.round((330 * 4 / 31) * 100) / 100)
is('a sub-category inside a budgeted top-level one adds no budget of its own', money.some((f) => f.measure === 'finance:budget' && f.item === 'Groceries'), false)
is('no entries yet: no budget either (not using Finance is not spending nothing)', financeFacts([], fin, octSpan, today).length, 0)

const finModule = { key: 'finance', name: 'Finance', entities: MODULES.find((m) => m.key === 'finance').entities }
const cat = measureCatalogue([finModule], ['kcal'], { currency: 'EUR' })
const keys = cat.map((m) => m.key)
is('the old amount that added money in and out together is not offered', keys.includes('finance:entry:amount'), false)
is('spent, money in, net, budget and budget used are', ['finance:spent', 'finance:income', 'finance:net', 'finance:budget', 'finance:budget_used'].every((k) => keys.includes(k)), true)
is('money is in the person\'s currency', cat.find((m) => m.key === 'finance:spent').unit, 'EUR')
const tpl = TEMPLATES.find((t) => t.key === 'spending_category')
is('"Spending by category" reads spending', tpl.view.measures[0].source, 'finance:spent')
const view = fromTemplate(tpl, 'v1')
const res = pivot(viewSpec(view, today), money, cat, today)
const rowsOf = (r) => Object.fromEntries(r.rows.map((h, i) => [h.label, r.cells[i][0][0]]).sort(([a], [b]) => a.localeCompare(b)))
is('…and income categories never show in it', rowsOf(res), { Cinema: 12, Fun: 20, Groceries: 60 })
const used = cat.find((m) => m.key === 'finance:budget_used')
is('budget used: spent in budgeted categories over their budget for the same days', Math.round(cellValue(used, { measure: used.key, summary: 'avg' }, money, spanDays(octSpan), today)), Math.round(100 * 72 / (330 * 4 / 31)))
const byTop = pivot(viewSpec(fromTemplate(TEMPLATES.find((t) => t.key === 'budget_category'), 'v2'), today), money, cat, today)
is('budget used by main category: Fun is its cinema against the cinema budget', Math.round(rowsOf(byTop).Fun), Math.round(100 * 12 / (30 * 4 / 31)))

is('an old view of the amount reads as spending', upgradeSource('finance:entry:amount', []), 'finance:spent')
is('…or as money in when it was filtered to income', upgradeSource('finance:entry:amount', [{ field: 'field:kind', op: 'is', value: 'income' }]), 'finance:income')
is('other measures are left alone', upgradeSource('u_ab:entry:amount', []), 'u_ab:entry:amount')
const saved = readStatsView({ id: 'old', name: 'Spending', measures: [{ source: 'finance:entry:amount', summary: 'sum' }], rows: 'field:category' })
is('a saved view is upgraded as it is read', saved.measures[0].source, 'finance:spent')

/* ---------- the other new measures in the catalogue ---------- */
const all = measureCatalogue(['habits', 'sleep', 'health', 'shopping', 'nutrition'].map((key) => ({ key, name: key })), ['kcal'], { figures: ['salt_g', 'sugars_g', 'protein_g'] })
const has = (k) => all.some((m) => m.key === k)
is('sleep: against the target, debt, bedtime and regularity', ['sleep:vs_target', 'sleep:debt', 'sleep:bed_late', 'sleep:bed_spread', 'sleep:wake_spread'].every(has), true)
is('health: trend weight and its rate', ['health:trend', 'health:rate'].every(has), true)
is('habits: strength', has('habits:strength'), true)
is('shopping: money spent and items with no price', ['shopping:spent', 'shopping:unpriced'].every(has), true)
is('nutrition: the extra label figures chosen, eaten and planned', ['nutrition:salt_g', 'nutrition:sugars_g', 'nutrition:planned_salt_g'].every(has), true)
is('…and not the ones not chosen', has('nutrition:alcohol_g'), false)
is('every extra figure has a name', Object.values(LABEL_FIGURE_NAMES).every((n) => n.label && n.unit === 'g'), true)
is('debt and regularity read best as the latest day', ['sleep:debt', 'sleep:bed_spread'].map((k) => all.find((m) => m.key === k).summary), ['latest', 'latest'])

/* ---------- shopping spend at own prices (PRICE-02) ---------- */
const prices = [
  { shop: 'Albert Heijn', noted_on: '2026-09-01', price: 2.5, amount_g: 1000 },
  { shop: 'Jumbo', noted_on: '2026-09-20', price: 2.0, amount_g: 1000 },
]
is('bought at a shop with a price there: that price', boughtCost({ grams: 500, qty: null, shop: 'Albert Heijn' }, prices), 1.25)
is('no price at that shop: the latest noted anywhere', boughtCost({ grams: 500, qty: null, shop: 'Lidl' }, prices), 1)
is('by the piece', boughtCost({ grams: null, qty: 3, shop: null }, [{ shop: 'Lidl', noted_on: '2026-09-01', price: 0.4, amount_g: null }]), 1.2)
is('no price of our own: unknown, never free', boughtCost({ grams: 500, qty: null, shop: null }, []), null)
is('a deleted price does not count', boughtCost({ grams: 500, qty: null, shop: null }, [{ ...prices[0], deleted_at: 'x' }]), null)

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1) }
console.log('\nall checks passed')
