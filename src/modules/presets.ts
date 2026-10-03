import type { FieldDef, ViewDef } from './types.ts'
import { fieldNameFrom } from './def-rules.ts'
import type { ModuleView } from '../lib/module-view-rules.ts'

/** Starting points for a module someone builds: just fields and views, all
 *  of which can be changed before and after it is made. Pure. */
export interface Preset {
  key: string
  name: string
  /** One line on the card. */
  description: string
  /** What one record is called: "Book", "Expense". */
  item: string
  keywords: string[]
  fields: FieldDef[]
  views: Omit<ViewDef, 'entity'>[]
  /** Where the module shows when made from this preset, where that differs
   *  from everywhere: a private log kept off the home-screen widget. */
  show?: Partial<ModuleView>
  /** A line on the card about privacy or anything else worth knowing. */
  note?: string
}

export const PRESETS: Preset[] = [
  {
    key: 'blank',
    name: 'Blank',
    description: 'A name and a date. Add the rest yourself.',
    item: 'Item',
    keywords: [],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'day', label: 'Day', type: 'date' },
    ],
    views: [
      { key: 'list', name: 'List', type: 'list' },
      { key: 'table', name: 'Table', type: 'table' },
    ],
  },
  {
    key: 'reading',
    name: 'Reading list',
    description: 'Books to read, reading and read, with pages and a rating.',
    item: 'Book',
    keywords: ['reading', 'books', 'book', 'novels', 'library'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'author', label: 'Author', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: ['to read', 'reading', 'finished', 'stopped'] },
      { name: 'pages', label: 'Pages', type: 'integer', stats: 'sum' },
      { name: 'finished_on', label: 'Finished', type: 'date' },
      { name: 'rating', label: 'Rating', type: 'rating', stats: 'average' },
    ],
    views: [
      { key: 'list', name: 'Books', type: 'list' },
      { key: 'table', name: 'Table', type: 'table' },
    ],
  },
  {
    key: 'workout',
    name: 'Workout log',
    description: 'Sets of an exercise with reps and load, and the volume worked out.',
    item: 'Set',
    keywords: ['workout', 'gym', 'sets', 'reps', 'lifting'],
    fields: [
      { name: 'session_date', label: 'Day', type: 'date', required: true },
      { name: 'exercise', label: 'Exercise', type: 'lookup', lookup: 'exercise' },
      { name: 'sets', label: 'Sets', type: 'integer' },
      { name: 'reps', label: 'Reps', type: 'integer' },
      { name: 'load', label: 'Load', type: 'number', unit: 'kg' },
      { name: 'volume', label: 'Volume', type: 'formula', formula: 'sets * reps * load', unit: 'kg', stats: 'sum' },
    ],
    views: [
      { key: 'table', name: 'Log', type: 'table' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'expenses',
    name: 'Expenses',
    description: 'What was spent, on what, and the total.',
    item: 'Expense',
    keywords: ['expenses', 'spending', 'money', 'budget', 'costs'],
    fields: [
      { name: 'item', label: 'What', type: 'text', required: true },
      { name: 'spent_on', label: 'Day', type: 'date', required: true },
      { name: 'category', label: 'Category', type: 'select', options: ['food', 'transport', 'home', 'bills', 'fun', 'health', 'other'] },
      { name: 'amount', label: 'Amount', type: 'number', required: true, stats: 'sum' },
      { name: 'note', label: 'Note', type: 'text' },
    ],
    views: [
      { key: 'table', name: 'Table', type: 'table' },
      { key: 'list', name: 'List', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'plants',
    name: 'Plant care',
    description: 'Watering, feeding and repotting, and when each is next due.',
    item: 'Care',
    keywords: ['plants', 'plant', 'garden', 'watering', 'houseplants'],
    fields: [
      { name: 'plant', label: 'Plant', type: 'text', required: true },
      { name: 'action', label: 'Care', type: 'select', options: ['water', 'feed', 'repot', 'prune', 'mist'] },
      { name: 'next_due', label: 'Next due', type: 'date' },
      { name: 'done_on', label: 'Last done', type: 'date' },
      { name: 'note', label: 'Note', type: 'text' },
    ],
    views: [
      { key: 'list', name: 'Plants', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'car',
    name: 'Car maintenance',
    description: 'Services and repairs with mileage and cost, and what is due next.',
    item: 'Job',
    keywords: ['car', 'service', 'mot', 'apk', 'tyres', 'garage', 'mileage'],
    fields: [
      { name: 'job', label: 'Job', type: 'text', required: true },
      { name: 'done_on', label: 'Day', type: 'date' },
      { name: 'mileage', label: 'Mileage', type: 'integer', unit: 'km' },
      { name: 'cost', label: 'Cost', type: 'number', stats: 'sum' },
      { name: 'garage', label: 'Garage', type: 'text' },
      { name: 'next_due', label: 'Next due', type: 'date' },
    ],
    views: [
      { key: 'list', name: 'Jobs', type: 'list' },
      { key: 'table', name: 'Table', type: 'table' },
    ],
  },
  {
    key: 'study',
    name: 'Study sessions',
    description: 'What was studied, for how long, and how well it went.',
    item: 'Session',
    keywords: ['study', 'studying', 'revision', 'exam', 'course'],
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'studied_on', label: 'Day', type: 'date' },
      { name: 'start', label: 'Start', type: 'time' },
      { name: 'minutes', label: 'Length', type: 'duration', unit: 'min', stats: 'sum' },
      { name: 'topic', label: 'Topic', type: 'text' },
      { name: 'focus', label: 'Focus', type: 'rating', stats: 'average' },
    ],
    views: [
      { key: 'table', name: 'Sessions', type: 'table' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'mood',
    name: 'Mood and energy',
    description: 'A line a day with mood and energy out of five.',
    item: 'Entry',
    keywords: ['mood', 'journal', 'diary', 'feelings', 'energy'],
    fields: [
      { name: 'day', label: 'Day', type: 'date', required: true },
      { name: 'mood', label: 'Mood', type: 'rating', stats: 'average' },
      { name: 'energy', label: 'Energy', type: 'rating', stats: 'average' },
      { name: 'note', label: 'Note', type: 'note' },
    ],
    views: [
      { key: 'list', name: 'Entries', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },

  {
    key: 'water',
    name: 'Water intake',
    description: 'Glasses through the day, and the day’s total against a goal.',
    item: 'Drink',
    keywords: ['water', 'drinking', 'hydration', 'glasses'],
    fields: [
      { name: 'day', label: 'Day', type: 'date', required: true },
      { name: 'glasses', label: 'Glasses', type: 'integer', stats: 'sum' },
      { name: 'ml', label: 'Amount', type: 'integer', unit: 'ml', stats: 'sum' },
    ],
    views: [
      { key: 'chart', name: 'Days', type: 'chart', period: 'day', chart: 'bar' },
      { key: 'table', name: 'Table', type: 'table' },
    ],
  },
  {
    key: 'medication',
    name: 'Medication',
    description: 'What was taken, how much and when, with a note for side effects.',
    item: 'Dose',
    keywords: ['medication', 'medicine', 'pills', 'tablets', 'prescription'],
    fields: [
      { name: 'medicine', label: 'Medicine', type: 'text', required: true },
      { name: 'taken_at', label: 'Taken', type: 'datetime', required: true },
      { name: 'dose', label: 'Dose', type: 'text' },
      { name: 'taken', label: 'Taken as planned', type: 'boolean' },
      { name: 'note', label: 'Note', type: 'note' },
    ],
    views: [
      { key: 'list', name: 'Doses', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
    show: { widget: false },
    note: 'Kept off the home-screen widget, so it is not on show on the phone. Change that under Show.',
  },
  {
    key: 'cycle',
    name: 'Period and cycle',
    description: 'Days of the cycle, flow and how you felt.',
    item: 'Day',
    keywords: ['period', 'cycle', 'menstruation', 'pms'],
    fields: [
      { name: 'day', label: 'Day', type: 'date', required: true },
      { name: 'flow', label: 'Flow', type: 'select', options: ['none', 'spotting', 'light', 'medium', 'heavy'] },
      { name: 'symptoms', label: 'Symptoms', type: 'multi', options: ['cramps', 'headache', 'tired', 'bloated', 'tender', 'moody'] },
      { name: 'note', label: 'Note', type: 'note' },
    ],
    views: [
      { key: 'month', name: 'Month', type: 'calendar' },
      { key: 'list', name: 'Days', type: 'list' },
    ],
    show: { today: false, plan: false, widget: false, reminders: false },
    note: 'Private by default: kept off Today, Plan, the widget and reminders, on its own page only. Change that under Show.',
  },
  {
    key: 'pets',
    name: 'Pet care',
    description: 'Feeding, walks, the vet and medicine for each animal.',
    item: 'Care',
    keywords: ['pet', 'pets', 'dog', 'cat', 'vet', 'walks'],
    fields: [
      { name: 'pet', label: 'Pet', type: 'text', required: true },
      { name: 'care', label: 'Care', type: 'select', options: ['feed', 'walk', 'vet', 'medicine', 'grooming', 'flea treatment'] },
      { name: 'done_on', label: 'Day', type: 'date' },
      { name: 'cost', label: 'Cost', type: 'money', unit: '€', stats: 'sum' },
      { name: 'note', label: 'Note', type: 'note' },
    ],
    views: [
      { key: 'list', name: 'Care', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'fuel',
    name: 'Car fuel',
    description: 'Fill-ups with litres, price and the mileage, and what it costs per kilometre.',
    item: 'Fill-up',
    keywords: ['fuel', 'petrol', 'diesel', 'gas', 'fill up', 'tank'],
    fields: [
      { name: 'filled_on', label: 'Day', type: 'date', required: true },
      { name: 'litres', label: 'Litres', type: 'number', unit: 'l', stats: 'sum' },
      { name: 'cost', label: 'Cost', type: 'money', unit: '€', stats: 'sum' },
      { name: 'odometer', label: 'Odometer', type: 'integer', unit: 'km' },
      { name: 'per_litre', label: 'Per litre', type: 'formula', formula: 'round(cost / litres, 3)', unit: '€' },
      { name: 'station', label: 'Station', type: 'text' },
    ],
    views: [
      { key: 'table', name: 'Fill-ups', type: 'table' },
      { key: 'chart', name: 'Cost', type: 'chart', period: 'month', chart: 'bar' },
    ],
  },
  {
    key: 'language',
    name: 'Language practice',
    description: 'Minutes practised, what with, and new words learned.',
    item: 'Session',
    keywords: ['language', 'languages', 'dutch', 'spanish', 'french', 'german', 'duolingo', 'vocabulary'],
    fields: [
      { name: 'practised_on', label: 'Day', type: 'date', required: true },
      { name: 'language', label: 'Language', type: 'text' },
      { name: 'minutes', label: 'Length', type: 'duration', unit: 'min', stats: 'sum' },
      { name: 'how', label: 'How', type: 'multi', options: ['app', 'lesson', 'reading', 'listening', 'speaking', 'writing'] },
      { name: 'new_words', label: 'New words', type: 'integer', stats: 'sum' },
    ],
    views: [
      { key: 'grid', name: 'Days', type: 'grid' },
      { key: 'table', name: 'Sessions', type: 'table' },
    ],
  },
  {
    key: 'running',
    name: 'Running log',
    description: 'Distance, time and pace of each run, and how it felt.',
    item: 'Run',
    keywords: ['running', 'run', 'jogging', '5k', '10k', 'marathon'],
    fields: [
      { name: 'ran_on', label: 'Day', type: 'date', required: true },
      { name: 'km', label: 'Distance', type: 'number', unit: 'km', stats: 'sum' },
      { name: 'minutes', label: 'Time', type: 'duration', unit: 'min', stats: 'sum' },
      { name: 'pace', label: 'Pace', type: 'formula', formula: 'round(minutes / km, 2)', unit: 'min/km' },
      { name: 'feel', label: 'How it felt', type: 'rating', stats: 'average' },
      { name: 'route', label: 'Route', type: 'text' },
    ],
    views: [
      { key: 'list', name: 'Runs', type: 'list' },
      { key: 'chart', name: 'Distance', type: 'chart', period: 'week', chart: 'bar' },
    ],
  },
  {
    key: 'gratitude',
    name: 'Gratitude journal',
    description: 'Three good things a day, in your own words.',
    item: 'Entry',
    keywords: ['gratitude', 'grateful', 'thankful', 'journal', 'journaling'],
    fields: [
      { name: 'day', label: 'Day', type: 'date', required: true },
      { name: 'good_things', label: 'Good things', type: 'note' },
    ],
    views: [
      { key: 'list', name: 'Entries', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
    show: { widget: false },
  },
  {
    key: 'subscriptions',
    name: 'Subscriptions',
    description: 'What you pay for every month or year, and when it renews.',
    item: 'Subscription',
    keywords: ['subscriptions', 'subscription', 'netflix', 'spotify', 'renewals', 'memberships'],
    fields: [
      { name: 'service', label: 'Service', type: 'text', required: true },
      { name: 'price', label: 'Price', type: 'money', unit: '€', stats: 'sum' },
      { name: 'every', label: 'Billed', type: 'select', options: ['monthly', 'yearly', 'weekly'] },
      { name: 'renews_on', label: 'Renews', type: 'date' },
      { name: 'cancel_by', label: 'Cancel by', type: 'date' },
      { name: 'note', label: 'Note', type: 'note' },
    ],
    views: [
      { key: 'table', name: 'Subscriptions', type: 'table' },
      { key: 'month', name: 'Renewals', type: 'calendar' },
    ],
  },
]

export const presetByKey = (key: string) => PRESETS.find((p) => p.key === key)

/** Several presets as one starting point (MOD-10). Their fields are merged
 *  in order: a field two presets share (the same kind under the same name or
 *  label, such as "Day") is kept once; one that clashes (the same name or
 *  label, another kind) is kept under a new name. Views come from each, without
 *  repeating a kind with the same name. What one record is called comes from
 *  the first preset picked. "Blank" stands alone: it means starting from
 *  nothing. */
export function combinePresets(keys: string[]): Omit<Preset, 'key' | 'name'> & { keys: string[] } {
  const picked = keys.map(presetByKey).filter((p): p is Preset => !!p)
  const real = picked.filter((p) => p.key !== 'blank')
  const list = real.length ? real : [presetByKey('blank')!]
  const fields: FieldDef[] = []
  const views: Omit<ViewDef, 'entity'>[] = []
  const keywords: string[] = []
  let show: Partial<ModuleView> | undefined
  for (const p of list) {
    for (const f of p.fields) {
      // The same thing in two presets ("Day", a date; "Note", text) is kept
      // once, needed if either needs it.
      const twin = fields.find((x) => x.type === f.type && (x.name === f.name || x.label.toLowerCase() === f.label.toLowerCase()))
      if (twin) { if (f.required) twin.required = true; continue }
      const taken = fields.some((x) => x.name === f.name || x.label.toLowerCase() === f.label.toLowerCase())
      if (!taken) { fields.push(copyField(f)); continue }
      // A clash: the field is kept, under its preset's name to tell it apart.
      const label = `${f.label} (${p.name.toLowerCase()})`.slice(0, 60)
      const name = fieldNameFrom(label, fields.map((x) => x.name))
      const formula = f.formula
      fields.push({ ...copyField(f), name, label, ...(formula ? { formula } : {}) })
    }
    for (const v of p.views) {
      if (views.some((x) => x.type === v.type && x.name === v.name)) continue
      let key = v.key
      for (let i = 2; views.some((x) => x.key === key); i++) key = `${v.key}_${i}`
      views.push({ ...v, key })
    }
    for (const k of p.keywords) if (!keywords.includes(k)) keywords.push(k)
    // The most private wish wins: a switch off in any of them stays off.
    if (p.show) {
      show = { ...(show ?? {}) }
      for (const [k, on] of Object.entries(p.show)) if (on === false) (show as Record<string, boolean>)[k] = false
    }
  }
  return {
    keys: list.map((p) => p.key),
    description: list.map((p) => p.description).join(' '),
    item: list[0].item,
    keywords: keywords.slice(0, 20),
    fields: fields.slice(0, 40),
    views: views.slice(0, 12),
    ...(show ? { show } : {}),
    ...(list.some((p) => p.note) ? { note: list.map((p) => p.note).filter(Boolean).join(' ') } : {}),
  }
}

const copyField = (f: FieldDef): FieldDef => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })

