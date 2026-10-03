import type { FieldDef, ModuleDef } from './types.ts'
import { RULE_REMIND, firstDateField, mainField } from './def-rules.ts'
import { cleanRule, type RuleConfig } from '../lib/schedule-rules.ts'

/** What a record's repeat becomes (MOD-14): the series of tasks it makes,
 *  worked out from the record and the rule chosen. Pure. */

/** Where a record keeps the id of its series. It starts with an underscore,
 *  which no field name can, so it never shows up as a field or a column. */
export const REPEAT_KEY = '_series'

/** The rule kinds a record can repeat by: every kind a task has. "N times a
 *  week" has no days of its own, so it cannot make tasks. */
export const RECORD_REPEAT_KINDS = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates'] as const

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface RepeatPlan {
  title: string
  rule: (typeof RECORD_REPEAT_KINDS)[number]
  rule_config: RuleConfig
  start_date: string
  end_date: string | null
  time: string | null
}

/** The series a record should have: named by its main field (or the
 *  module), from the record's first date (or today), at its time if it has
 *  one, else the reminder rule's time when that rule is on, else any time. */
export function repeatPlan(
  def: Pick<ModuleDef, 'name' | 'rules'>, fields: FieldDef[], data: Record<string, unknown>,
  value: { rule: string | null; rule_config?: object; end_date?: string | null }, today: string,
): RepeatPlan | null {
  const { rule, rule_config } = cleanRule(value.rule, value.rule_config ?? {})
  if (!rule || !(RECORD_REPEAT_KINDS as readonly string[]).includes(rule)) return null
  const main = mainField(fields)
  const mv = main ? data[main.name] : null
  const title = (typeof mv === 'string' && mv.trim() ? mv.trim() : def.name).slice(0, 200)
  const df = firstDateField(fields)
  const dv = df ? data[df.name] : null
  const start = typeof dv === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dv) ? dv.slice(0, 10) : today
  let time: string | null = null
  const dt = fields.find((f) => f.type === 'datetime' && typeof data[f.name] === 'string')
  const own = dt ? String(data[dt.name]).slice(11, 16) : ''
  const tf = fields.find((f) => f.type === 'time' && typeof data[f.name] === 'string' && TIME.test(String(data[f.name])))
  if (TIME.test(own)) time = own
  else if (tf) time = String(data[tf.name])
  else {
    const remind = def.rules.find((r) => r.name === RULE_REMIND && !r.off)
    if (remind) time = remind.time ?? '09:00'
  }
  const end = typeof value.end_date === 'string' && value.end_date >= start ? value.end_date : null
  return { title, rule: rule as RepeatPlan['rule'], rule_config, start_date: start, end_date: end, time }
}

/** Whether a series already is what the plan asks, so saving a record
 *  without touching its repeat changes nothing. */
export function sameRepeat(
  s: { title: string; rule: string; rule_config: unknown; start_date: string; end_date: string | null; time_of_day: string | null },
  p: RepeatPlan,
): boolean {
  return s.title === p.title && s.rule === p.rule && JSON.stringify(s.rule_config ?? {}) === JSON.stringify(p.rule_config)
    && s.start_date === p.start_date && (s.end_date ?? null) === p.end_date && (s.time_of_day?.slice(0, 5) ?? null) === p.time
}
