import type { Nutrient, TodayCard } from './settings.ts'
import { templateViews, type ModuleView } from './module-view-rules.ts'

/** Starting layouts for different kinds of days. A template only decides what
 *  is switched on at the start: every module can be turned on or off later,
 *  and nothing is lost by doing so. Pure: no database, no React.
 *
 *  Suggesting one from a few typed words is plain keyword matching on purpose.
 *  It works offline, gives the same answer every time, and can say which words
 *  it matched, which a guess from a model could not. */

export interface Template {
  key: string
  name: string
  /** One line under the name on the card. */
  description: string
  /** Module keys switched on; everything else starts off. */
  modules: string[]
  nutrients: Nutrient[]
  /** 'none' for templates that are not about food, so Today shows no figure. */
  today_metric: Nutrient | 'none'
  /** Whether the calorie and body targets step starts switched on. */
  targets: boolean
  /** Words that point clearly at this template (worth 2). */
  keywords: string[]
  /** Words that lean towards it (worth 1). */
  hints: string[]
  /** Where its modules show, where that differs from the default (every
   *  switch on): a busy module kept off Plan's week, say (ONB-10). */
  views?: Record<string, Partial<ModuleView>>
  /** Cards pinned to the top of Today to start with (TOD-20). */
  cards?: TodayCard[]
}

/** A small card for a module, shown every day. */
const card = (key: string, size: TodayCard['size'] = 'small'): TodayCard => ({ kind: 'module', key, size, show: 'always' })

export const TEMPLATES: Template[] = [
  {
    key: 'minimal',
    name: 'Minimal planner',
    description: 'Tasks and a calendar, nothing else. Add the rest when you want it.',
    modules: ['agenda'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['minimal', 'simple', 'basic', 'to do', 'todo', 'to-do', 'just tasks', 'calendar'],
    hints: ['plan', 'planner', 'tasks', 'organised', 'organized', 'busy'],
    cards: [],
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Lectures, study blocks, deadlines and enough sleep.',
    modules: ['agenda', 'learning', 'projects', 'habits', 'sleep'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['student', 'study', 'studying', 'school', 'university', 'uni', 'college', 'exam', 'exams',
      'lecture', 'lectures', 'homework', 'thesis', 'course', 'courses', 'class', 'classes', 'revision'],
    hints: ['learn', 'learning', 'reading', 'assignment', 'assignments', 'semester', 'campus'],
    views: { sleep: { plan: false, widget: false } },
    cards: [card('learning'), card('habits')],
  },
  {
    key: 'office',
    name: 'Office worker',
    description: 'Set work hours, a commute, and the evenings and weekends around them.',
    modules: ['agenda', 'projects', 'habits', 'shopping'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['office', 'desk', '9 to 5', '9-5', 'nine to five', 'meetings', 'hybrid', 'remote',
      'commute', 'commuting', 'colleagues', 'manager'],
    hints: ['work', 'job', 'working', 'weekdays', 'emails', 'admin'],
    cards: [card('projects')],
  },
  {
    key: 'shift',
    name: 'Shift worker',
    description: 'Changing hours and nights, with sleep and meals planned around the rota.',
    modules: ['agenda', 'sleep', 'habits', 'shopping', 'nutrition'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['shift', 'shifts', 'night shift', 'nights', 'rota', 'roster', 'rotating', 'early shift',
      'late shift', 'nurse', 'hospital', 'warehouse', 'factory', 'care home'],
    hints: ['logistics', 'driver', 'security', 'weekends', 'overtime', 'sleep'],
    views: { sleep: { widget: false } },
    cards: [card('sleep'), card('nutrition')],
  },
  {
    key: 'household',
    name: 'Parent / household',
    description: 'Family meals, shopping, chores and everyone’s appointments.',
    modules: ['agenda', 'household', 'shopping', 'nutrition', 'habits'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['parent', 'kids', 'children', 'child', 'family', 'mum', 'mom', 'dad', 'baby', 'toddler',
      'school run', 'household', 'chores', 'housework'],
    hints: ['home', 'house', 'cooking', 'groceries', 'shopping', 'laundry', 'partner'],
    cards: [card('household', 'large'), card('shopping')],
  },
  {
    key: 'fitness',
    name: 'Fitness & nutrition',
    description: 'Training, a meal plan with macro targets, weigh-ins and supplements.',
    modules: ['agenda', 'nutrition', 'shopping', 'training', 'habits', 'supplements', 'health'],
    nutrients: ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
    today_metric: 'kcal',
    targets: true,
    keywords: ['gym', 'fitness', 'training', 'workout', 'workouts', 'lifting', 'bodybuilding', 'macros',
      'protein', 'calories', 'diet', 'cut', 'bulk', 'recomp', 'muscle', 'fat loss', 'lose weight', 'meal prep'],
    hints: ['run', 'running', 'sport', 'health', 'healthy', 'weight', 'nutrition', 'food', 'supplements'],
    // Supplement slots every day would fill the week view; they stay on Today.
    views: { supplements: { plan: false }, health: { plan: false } },
    cards: [card('nutrition', 'large'), card('health'), card('training')],
  },
  {
    key: 'freelance',
    name: 'Freelancer / projects',
    description: 'Projects and deadlines, client work, and money in and out.',
    modules: ['agenda', 'projects', 'finance', 'learning', 'habits'],
    nutrients: ['kcal'],
    today_metric: 'none',
    targets: false,
    keywords: ['freelance', 'freelancer', 'freelancing', 'self-employed', 'self employed', 'client', 'clients',
      'invoice', 'invoices', 'startup', 'business', 'side project', 'side projects', 'contractor', 'consultant'],
    hints: ['projects', 'project', 'deadline', 'deadlines', 'budget', 'money', 'brand', 'shop'],
    cards: [card('projects', 'large'), card('finance')],
  },
  {
    key: 'everything',
    name: 'Everything on',
    description: 'Every module switched on, to look around and turn off what you do not need.',
    modules: ['nutrition', 'shopping', 'training', 'habits', 'supplements', 'health', 'learning', 'agenda',
      'sleep', 'projects', 'finance', 'household', 'stats'],
    nutrients: ['kcal', 'protein_g'],
    today_metric: 'kcal',
    targets: true,
    keywords: ['everything', 'all of it', 'all modules', 'full'],
    hints: [],
    views: { supplements: { plan: false }, health: { plan: false }, sleep: { widget: false } },
    cards: [card('nutrition'), card('habits')],
  },
]

export const DEFAULT_TEMPLATE = 'minimal'

const byKey = new Map(TEMPLATES.map((t) => [t.key, t]))

export function templateByKey(key: string | null | undefined): Template | undefined {
  return key ? byKey.get(key) : undefined
}

export interface Suggestion {
  key: string
  score: number
  /** The words that led to it, as the person typed them, to show why. */
  matched: string[]
}

/** Lower case, accents off, anything that is not a letter or digit a space.
 *  "Mum of 2, part-time" becomes "mum of 2 part time". */
function normalise(text: string): string {
  return ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `
}

/** Every keyword of every template, longest phrase first, with its weight. */
const PHRASES = TEMPLATES
  .flatMap((t) => [
    ...t.keywords.map((k) => ({ template: t.key, keyword: k, weight: 2 })),
    ...t.hints.map((k) => ({ template: t.key, keyword: k, weight: 1 })),
  ])
  .map((p) => ({ ...p, words: normalise(p.keyword).trim() }))
  .filter((p) => p.words.length > 0)
  .sort((a, b) => b.words.split(' ').length - a.words.split(' ').length)

/** The template a few words describe best, or null when none of them match.
 *
 *  Keywords match whole words only: "uni" matches "uni" but not "community".
 *  Longer phrases are read first and use their words up, so "school run"
 *  counts for the household and not also "school" for the student. Clear
 *  keywords count 2, leaning ones 1; a tie goes to the template listed first,
 *  which puts the plainer layout ahead. */
export function suggestTemplate(text: string): Suggestion | null {
  let t = normalise(text)
  if (!t.trim()) return null
  const found = new Map<string, Set<string>>()
  const score = new Map<string, number>()
  // Phrases grouped by their words, longest first (PHRASES is in that order),
  // so a phrase two templates share counts for both before it is used up.
  const groups = new Map<string, typeof PHRASES>()
  for (const p of PHRASES) groups.set(p.words, [...(groups.get(p.words) ?? []), p])
  for (const [words, group] of groups) {
    if (!t.includes(` ${words} `)) continue
    t = t.split(` ${words} `).join(' | ')
    const credited = new Set<string>()
    for (const p of group) {
      // "self-employed" and "self employed" are the same words: count once.
      if (credited.has(p.template)) continue
      credited.add(p.template)
      score.set(p.template, (score.get(p.template) ?? 0) + p.weight)
      const set = found.get(p.template) ?? new Set<string>()
      set.add(p.keyword)
      found.set(p.template, set)
    }
  }
  let best: Suggestion | null = null
  for (const tpl of TEMPLATES) {
    const sc = score.get(tpl.key) ?? 0
    if (sc === 0 || (best && sc <= best.score)) continue
    const got = found.get(tpl.key)!
    best = { key: tpl.key, score: sc, matched: [...tpl.keywords, ...tpl.hints].filter((k) => got.has(k)) }
  }
  return best
}

/** The module switches a template starts with, as a set of keys that are on. */
export function modulesFor(key: string | null | undefined): string[] {
  return [...(templateByKey(key) ?? templateByKey(DEFAULT_TEMPLATE)!).modules]
}

/** What a template sets besides the module switches (ONB-10): where each
 *  module shows (every module gets the template's switches, so starting
 *  again leaves nothing of the old layout behind) and the cards pinned to
 *  Today, of the modules actually switched on. `on` is the modules the person
 *  kept, which may differ from the template's own list. */
export function templateLayout(key: string | null | undefined, on: string[], allKeys: string[]):
  { module_views: Record<string, Partial<ModuleView>>; today_cards: TodayCard[] } {
  const tpl = templateByKey(key) ?? templateByKey(DEFAULT_TEMPLATE)!
  return {
    module_views: templateViews(allKeys, tpl.views ?? {}),
    today_cards: (tpl.cards ?? []).filter((c) => c.kind !== 'module' || on.includes(c.key)).map((c) => ({ ...c })),
  }
}
