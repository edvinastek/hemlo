/** The repeat control's list (RepeatPicker.tsx) and the rule each choice
 *  stands for, in the one repeat engine's shape (schedule-rules.ts). Pure. */
import { cleanDates, MAX_LOOSE_DAYS, weekdayOf, type RuleConfig, type RuleKind } from './schedule-rules.ts'

/** What the control gives back: a rule in the one repeat engine's shape
 *  (schedule-rules.ts), and the last day, if there is one. `null` rule means
 *  "does not repeat". */
export interface RepeatValue {
  rule: RuleKind | null
  rule_config: RuleConfig
  end_date: string | null
  /** Ends after this many times (GEN-21), where the row can keep a count. */
  count?: number | null
}

export const NO_REPEAT: RepeatValue = { rule: null, rule_config: {}, end_date: null }

/** The choices in the list. Several map to one rule kind with a setting
 *  ("Every few days" is daily with n). */
export type Choice = 'never' | 'daily' | 'every_n_days' | 'weekdays' | 'weekends' | 'weekly' | 'every_n_weeks'
  | 'monthly' | 'monthly_nth' | 'monthly_last' | 'yearly' | 'times_per_week' | 'dates'
  /** GEN-22: counted from the last time it was done, not from the calendar. */
  | 'after' | 'flexible'

export const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Which choice a stored rule shows as. */
export function choiceOf(v: Pick<RepeatValue, 'rule' | 'rule_config'>): Choice {
  const n = v.rule_config?.n ?? 1
  switch (v.rule) {
    case null: case undefined: return 'never'
    case 'daily': return v.rule_config?.mode === 'after' || v.rule_config?.mode === 'flexible' ? v.rule_config.mode : n > 1 ? 'every_n_days' : 'daily'
    case 'monthly_nth': return v.rule_config?.nth === -1 ? 'monthly_last' : 'monthly_nth'
    default: return v.rule
  }
}

/** The choices counted from the last time it was done (GEN-22). */
export const isLooseChoice = (c: Choice) => c === 'after' || c === 'flexible'

/** The days a loose choice's number box offers. */
export const LOOSE_DAYS = { min: 1, max: MAX_LOOSE_DAYS } as const

/** A choice turned into a rule, keeping what still applies from the old one
 *  and taking the rest from the first day ("monthly" starts on its date). */
export function ruleFor(choice: Choice, start: string, was: RuleConfig = {}, today?: string): Pick<RepeatValue, 'rule' | 'rule_config'> {
  const wd = weekdayOf(start)
  const dom = Number(start.slice(8, 10))
  const days = was.weekdays?.length ? was.weekdays : [wd]
  const n = (min: number, max: number, fallback: number) => Math.min(max, Math.max(min, Math.floor(was.n ?? fallback) || fallback))
  switch (choice) {
    case 'never': return { rule: null, rule_config: {} }
    case 'daily': return { rule: 'daily', rule_config: {} }
    case 'every_n_days': return { rule: 'daily', rule_config: { n: n(2, 365, 2) } }
    case 'weekdays': return { rule: 'weekdays', rule_config: {} }
    case 'weekends': return { rule: 'weekends', rule_config: {} }
    case 'weekly': return { rule: 'weekly', rule_config: { weekdays: days } }
    case 'every_n_weeks': return { rule: 'every_n_weeks', rule_config: { n: n(2, 52, 2), weekdays: days } }
    case 'monthly': return { rule: 'monthly', rule_config: { day_of_month: was.day_of_month ?? dom, ...(was.n && was.n > 1 ? { n: n(1, 24, 1) } : {}) } }
    case 'monthly_nth': return { rule: 'monthly_nth', rule_config: { nth: Math.min(4, Math.ceil(dom / 7)), weekday: wd } }
    case 'monthly_last': return { rule: 'monthly_nth', rule_config: { nth: -1, weekday: wd } }
    case 'yearly': return { rule: 'yearly', rule_config: { month: Number(start.slice(5, 7)), day: dom } }
    case 'times_per_week': return { rule: 'times_per_week', rule_config: { times: Math.min(7, Math.max(1, was.times ?? 3)) } }
    case 'dates': return { rule: 'dates', rule_config: { dates: cleanDates(was.dates).length ? cleanDates(was.dates) : (!today || start >= today ? [start] : []) } }
    // A week unless a number of days was already set.
    case 'after': case 'flexible': return { rule: 'daily', rule_config: { n: n(1, MAX_LOOSE_DAYS, 7), mode: choice } }
  }
}

