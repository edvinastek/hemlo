// An invented demo week for the store screenshots: one made-up person
// ("Alex", demo@example.com), made-up tasks, meals, habits, a shopping list
// with prices and three weeks of weigh-ins. Written straight into this
// browser's local copy before the app starts; nothing goes anywhere.
import { addDays, format } from 'date-fns'
import { db, setMeta } from '../../src/lib/db'
import { TIPS } from '../../src/lib/tips-rules'
import { itemKey } from '../../src/lib/shopping-rules'
import { TEMPLATES, fromTemplate } from '../../src/lib/stats-builder-rules'
import { DEMO_USER } from './supabase-stub'

const P = '00000000-0000-4000-8000-0000000000a1'
const H = '00000000-0000-4000-8000-0000000000b1'
let n = 0
/** Stable made-up ids, so every run seeds the same rows. */
const id = (kind: string) => `00000000-0000-4000-8000-${kind.padEnd(4, '0').slice(0, 4)}${String(++n).padStart(8, '0')}`

export async function seedDemo(): Promise<void> {
  await db.delete()
  await db.open()
  const now = new Date()
  const iso = now.toISOString()
  const day = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd')
  const T = day(0)

  try {
    // Every tip seen, so none covers a screenshot.
    localStorage.setItem('getit-tips', JSON.stringify({ seen: TIPS.map((t) => t.id), first: day(-40), moved: '99', runs: {} }))
  } catch { /* fine */ }
  await setMeta('owner', DEMO_USER.id)

  await db.profile.put({
    id: P, household_id: H, user_id: DEMO_USER.id, name: 'Alex', sex: 'female', birth_date: '1993-04-18', height_cm: 171,
    activity_level: 1.55, goal: 'recomp', timezone: 'Europe/Amsterdam', day_start: '07:00', day_end: '23:00',
    ai_persona_name: null, is_default: true, country: 'NL', city: null,
    settings: {
      onboarded: true,
      // Habits and supplements on Today, not on Plan's week: the week shows the plan.
      module_views: { habits: { plan: false }, supplements: { plan: false } },
      // Two of the ready-made stats views, saved as the person's own.
      stats_views: ['weight_trend', 'habit_kept'].map((k, i) => fromTemplate(TEMPLATES.find((t) => t.key === k)!, `demo${i}`))
        // The demo has three weeks of weigh-ins: show a month, not 90 days.
        .map((v) => (v.id === 'demo0' ? { ...v, name: 'Weight this month', range: { kind: 'last' as const, n: 30, unit: 'days' as const } } : v)),
      meal_times: { breakfast: '07:45', lunch: '12:30', snack: '15:30', dinner: '18:45' },
      shopping: { trip: { on: false, days: [6], time: '10:00', minutes: 45, locked: false }, window_days: 7,
        shops: [{ name: 'Market', aisles: [] }, { name: 'Corner shop', aisles: [] }] },
    },
    created_at: iso, updated_at: iso, deleted_at: null,
  } as never)

  const modules = ['core', 'nutrition', 'shopping', 'habits', 'supplements', 'health', 'stats']
  await db.module_instance.bulkPut(modules.map((k, i) => ({
    id: id('mi'), profile_id: P, module_key: k, enabled: true, sort_order: i, settings: {}, updated_at: iso,
  })))

  await db.target.put({ id: id('tg'), profile_id: P, from_date: day(-30), kcal: 2050, protein_g: 130, fat_g: 70, carbs_g: 220, fiber_g: 30, reason: null, updated_at: iso, deleted_at: null })

  // Three weeks of weigh-ins, gently down.
  const weights = [72.9, 72.8, 72.9, 72.6, 72.7, 72.5, 72.4, 72.6, 72.3, 72.2, 72.4, 72.1, 72.0, 72.2, 71.9, 71.8, 71.9, 71.7, 71.6, 71.7, 71.5]
  await db.body_log.bulkPut(weights.map((w, i) => ({
    id: id('bl'), profile_id: P, log_date: day(i - weights.length + 1), weight_kg: w, waist_cm: i % 7 === 0 ? 79 - i * 0.05 : null, note: null, updated_at: iso, deleted_at: null,
  })))

  // Today and the week ahead.
  const task = (offset: number, time: string | null, title: string, category: string | null, minutes: number | null, done = false) => ({
    id: id('tk'), profile_id: P, title, category, module_key: null, horizon: 'day', goal_id: null, series_id: null,
    duration_min: minutes, total_effort_min: null, daily_quota_min: null, fixed: false, locked: false,
    planned_date: day(offset), planned_time: time, start_date: null, due_date: null, sort_order: 0,
    status: done ? 'done' : 'todo', push_count: 0, extension_count: 0, needs_review: false, source: 'manual', source_ref: null,
    notes: null, project_id: null, updated_at: iso, completed_at: done ? iso : null, deleted_at: null,
  })
  await db.task.bulkPut([
    task(0, '07:00', 'Morning run', 'Personal', 30, true),
    task(0, '09:00', 'Draft the project proposal', 'Work', 90, true),
    task(0, '11:00', 'Team check-in', 'Work', 30),
    task(0, '14:00', 'Call the dentist', 'Personal', 15),
    task(0, '17:30', 'Pick up the parcel', 'Errands', 15),
    task(0, '20:30', 'Read 30 pages', 'Personal', 30),
    task(1, '08:30', 'Gym: upper body', 'Personal', 60),
    task(1, '10:00', 'Review the budget', 'Work', 45),
    task(1, '19:00', 'Dinner with Sam', 'Personal', 120),
    task(2, '09:30', 'Write the weekly report', 'Work', 60),
    task(2, '18:00', 'Bike repair', 'Errands', 30),
    task(3, '07:00', 'Morning run', 'Personal', 30),
    task(3, '13:00', 'Lunch with the team', 'Work', 60),
    task(4, '11:00', 'Plan next sprint', 'Work', 90),
    task(4, '16:00', 'Library: return books', 'Errands', 20),
    task(5, '10:00', 'Farmers market', 'Errands', 60),
    task(5, '15:00', 'Call Mum', 'Personal', 30),
    task(6, '09:00', 'Long walk in the park', 'Personal', 90),
    task(6, '17:00', 'Meal prep for the week', 'Personal', 90),
  ] as never)

  // Meals: planned as plain numbers for today and tomorrow, breakfast eaten.
  const slot = (offset: number, s: string, label: string, kcal: number, protein: number, carbs: number, fat: number, eaten = false) => ({
    id: id('ms'), profile_id: P, slot_date: day(offset), slot: s, recipe_id: null, portion_multiplier: 1,
    status: eaten ? 'eaten' : 'planned', slot_time: null, food_id: null, sort_order: 0, label,
    kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: Math.round(carbs / 9), grams: null, updated_at: iso, deleted_at: null,
  })
  const meals = [
    slot(0, 'breakfast', 'Overnight oats with berries', 420, 22, 58, 11, true),
    slot(0, 'lunch', 'Chicken and avocado wrap', 560, 38, 52, 21),
    slot(0, 'snack', 'Greek yoghurt with honey', 190, 15, 20, 5),
    slot(0, 'dinner', 'Salmon, rice and greens', 640, 42, 62, 22),
    slot(1, 'breakfast', 'Scrambled eggs on toast', 450, 27, 38, 20),
    slot(1, 'lunch', 'Lentil soup and bread', 520, 26, 74, 12),
    slot(1, 'dinner', 'Chickpea curry', 610, 24, 80, 18),
  ]
  await db.meal_plan_slot.bulkPut(meals as never)
  await db.food_log.put({
    id: id('fl'), profile_id: P, log_date: T, log_time: '07:50', food_id: null, recipe_id: null, grams: null, portions: 1, planned: true,
    label: 'Overnight oats with berries', kcal: 420, protein_g: 22, carbs_g: 58, fat_g: 11, fiber_g: 6, updated_at: iso, deleted_at: null,
  } as never)

  // Habits with two weeks behind them.
  const habits = [
    { name: 'Stretch 10 minutes', time: '07:15', part: 'morning' },
    { name: 'Walk 8,000 steps', time: null, part: 'afternoon' },
    { name: 'Two litres of water', time: null, part: null },
    { name: 'No phone after 22:00', time: '22:00', part: 'evening' },
  ].map((h, i) => ({
    id: id('hb'), profile_id: P, name: h.name, schedule: 'daily', rule: null, time_of_day: h.time, day_part: h.part,
    sort_order: i, active: true, start_date: day(-30), updated_at: iso, deleted_at: null,
  }))
  await db.habit.bulkPut(habits as never)
  const logs = []
  for (const [i, h] of habits.entries()) {
    for (let d = -14; d <= 0; d++) {
      if (d === 0 && i > 0) continue
      if ((d * 7 + i * 3) % 5 === 0) continue
      logs.push({ id: id('hl'), habit_id: h.id, log_date: day(d), done: true, updated_at: iso })
    }
  }
  await db.habit_log.bulkPut(logs as never)

  await db.supplement.bulkPut([
    { id: id('sp'), profile_id: P, name: 'Vitamin D', dose_text: '25 µg', time_slot: 'morning', active: true, sort_order: 0, updated_at: iso, deleted_at: null },
    { id: id('sp'), profile_id: P, name: 'Magnesium', dose_text: '300 mg', time_slot: 'evening', active: true, sort_order: 1, updated_at: iso, deleted_at: null },
  ] as never)

  // The shopping list, with the prices the household noted.
  const items: [string, number | null, string, number | null][] = [
    ['Rolled oats', 1, 'Market', 1.89], ['Blueberries', 2, 'Market', 2.49], ['Greek yoghurt', 1, 'Market', 2.19],
    ['Chicken breast', 1, 'Market', 6.99], ['Avocados', 3, 'Corner shop', 0.99], ['Wholemeal wraps', 1, 'Market', 1.59],
    ['Salmon fillets', 2, 'Market', 4.75], ['Basmati rice', 1, 'Market', 2.29], ['Spinach', 1, 'Corner shop', 1.35],
    ['Red lentils', 1, 'Market', 1.65], ['Coconut milk', 2, 'Market', 1.19], ['Eggs, 10', 1, 'Corner shop', null],
  ]
  await db.shopping_entry.bulkPut(items.map(([name, qty, shop], i) => ({
    id: id('se'), household_id: H, plan_key: null, food_id: null, name, qty, grams: null, note: null, aisle: null, shop,
    checked: false, checked_at: null, sort_order: i, added_by: DEMO_USER.id, list: null, created_at: iso, updated_at: iso, deleted_at: null,
  })) as never)
  await db.shop_price.bulkPut(items.filter(([, , , price]) => price !== null).map(([name, , shop, price]) => ({
    id: id('pr'), household_id: H, shop, item_key: itemKey({ name }), food_id: null, name, price: price!, amount_g: null,
    noted_on: day(-3), added_by: DEMO_USER.id, created_at: iso, updated_at: iso, deleted_at: null,
  })) as never)
}
