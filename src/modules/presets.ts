import type { FieldDef, ViewDef } from './types.ts'

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
      { name: 'rating', label: 'Rating', type: 'integer', unit: '/5' },
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
      { name: 'focus', label: 'Focus', type: 'integer', unit: '/5', stats: 'average' },
    ],
    views: [
      { key: 'table', name: 'Sessions', type: 'table' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
  {
    key: 'mood',
    name: 'Mood journal',
    description: 'A line a day with mood and energy out of five.',
    item: 'Entry',
    keywords: ['mood', 'journal', 'diary', 'feelings', 'energy'],
    fields: [
      { name: 'day', label: 'Day', type: 'date', required: true },
      { name: 'mood', label: 'Mood', type: 'integer', unit: '/5', stats: 'average' },
      { name: 'energy', label: 'Energy', type: 'integer', unit: '/5', stats: 'average' },
      { name: 'note', label: 'Note', type: 'text' },
    ],
    views: [
      { key: 'list', name: 'Entries', type: 'list' },
      { key: 'month', name: 'Month', type: 'calendar' },
    ],
  },
]

export const presetByKey = (key: string) => PRESETS.find((p) => p.key === key)
