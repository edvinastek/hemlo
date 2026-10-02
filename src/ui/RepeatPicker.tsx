import { useMemo, useState } from 'react'
import {
  cleanDates, dayName, describeSchedule, MAX_PICKED_DATES, ordinal, weekdayOf, WEEK_ORDER,
  type RuleConfig, type RuleKind,
} from '../lib/schedule-rules'
import { choiceOf, ruleFor, LONG_DAYS, MONTHS, type Choice } from '../lib/repeat-choice-rules'
import { Dropdown, type Option } from './Dropdown'
import { MonthScroller } from './MonthScroller'
import { useDayRange } from './useDayRange'
import './tasksheet.css'
import './repeat.css'

export { NO_REPEAT, type RepeatValue } from '../lib/repeat-choice-rules'
import type { RepeatValue } from '../lib/repeat-choice-rules'

/** THE repeat control (P4: one repeat sheet): tasks, habits, chores,
 *  supplements and built modules all use it, so a person learns it once.
 *
 *  - `start` is the first day: it decides the defaults ("Monthly on the 14th").
 *  - `kinds` limits the list where a rule does not make sense (a task cannot
 *    be "3 times a week"; a habit can). By default every kind but
 *    times_per_week is offered.
 *  - `noneLabel` is what "does not repeat" is called here. */
export function RepeatPicker({
  value, onChange, start, today, kinds, noneLabel = 'Does not repeat', allowEnd = true,
}: {
  value: RepeatValue
  onChange: (v: RepeatValue) => void
  start: string
  today: string
  kinds?: RuleKind[]
  noneLabel?: string
  allowEnd?: boolean
}) {
  const { range } = useDayRange()
  const choice = choiceOf(value)
  const cfg = value.rule_config ?? {}
  const wd = weekdayOf(start)
  const dom = Number(start.slice(8, 10))
  const nth = Math.min(4, Math.ceil(dom / 7))
  // What is typed in a number box, kept as text so it can be cleared while typing.
  const [nText, setNText] = useState(String(cfg.n ?? (choice === 'monthly' ? 1 : 2)))
  const [timesText, setTimesText] = useState(String(cfg.times ?? 3))
  const allowed = new Set<RuleKind>(kinds ?? ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates'])
  const options: Option<Choice>[] = ([
    { value: 'never', label: noneLabel },
    allowed.has('daily') && { value: 'daily', label: 'Every day' },
    allowed.has('daily') && { value: 'every_n_days', label: 'Every few days' },
    allowed.has('weekdays') && { value: 'weekdays', label: 'Weekdays (Mon to Fri)' },
    allowed.has('weekends') && { value: 'weekends', label: 'Weekends' },
    allowed.has('weekly') && { value: 'weekly', label: 'Weekly on chosen days' },
    allowed.has('every_n_weeks') && { value: 'every_n_weeks', label: 'Every few weeks' },
    allowed.has('times_per_week') && { value: 'times_per_week', label: 'A number of times a week' },
    allowed.has('monthly') && { value: 'monthly', label: `Monthly on the ${ordinal(dom)}` },
    allowed.has('monthly_nth') && { value: 'monthly_nth', label: `Monthly on the ${ordinal(nth)} ${LONG_DAYS[wd]}` },
    allowed.has('monthly_nth') && { value: 'monthly_last', label: `Monthly on the last ${LONG_DAYS[wd]}` },
    allowed.has('yearly') && { value: 'yearly', label: `Every year on ${dom} ${MONTHS[Number(start.slice(5, 7)) - 1]}` },
    allowed.has('dates') && { value: 'dates', label: 'Days picked by hand' },
  ] as (Option<Choice> | false)[]).filter((o): o is Option<Choice> => !!o)

  const dates = useMemo(() => cleanDates(cfg.dates), [cfg.dates])
  const picked = useMemo(() => new Set(dates), [dates])
  const set = (rule_config: RuleConfig) => onChange({ ...value, rule_config })

  function choose(c: Choice) {
    const next = ruleFor(c, start, cfg, today)
    setNText(String(next.rule_config.n ?? (c === 'monthly' ? 1 : 2)))
    onChange({ ...next, end_date: c === 'never' || c === 'dates' ? null : value.end_date })
  }

  // At least one day stays picked: a weekly rule on no day is not a rule.
  function toggleDay(d: number) {
    const now = cfg.weekdays?.length ? cfg.weekdays : [wd]
    const next = now.includes(d) ? (now.length > 1 ? now.filter((x) => x !== d) : now) : [...now, d]
    set({ ...cfg, weekdays: [...next].sort((a, b) => a - b) })
  }

  function commitN(text: string, min: number, max: number) {
    const v = Math.min(max, Math.max(min, Math.floor(Number(text)) || min))
    setNText(String(v))
    set({ ...cfg, n: v })
  }

  function togglePicked(day: string) {
    const next = picked.has(day) ? dates.filter((d) => d !== day) : dates.length >= MAX_PICKED_DATES ? dates : [...dates, day].sort()
    set({ ...cfg, dates: next })
  }

  const endsEarly = !!value.end_date && value.end_date < start
  const sentence = value.rule ? describeSchedule({ rule: value.rule, rule_config: cfg, start_date: start, end_date: value.end_date }) : null

  return (
    <div className="rp" role="group" aria-label="Repeat">
      <div className="ts-field">
        <span className="ts-field-name">Repeat</span>
        <Dropdown label="Repeat" value={choice} options={options} onChange={choose} />
      </div>

      {(choice === 'weekly' || choice === 'every_n_weeks') && (
        <div className="ts-days" role="group" aria-label="Days">
          {WEEK_ORDER.map((d) => (
            <button key={d} type="button" className="ts-day" aria-pressed={(cfg.weekdays?.length ? cfg.weekdays : [wd]).includes(d)}
              onClick={() => toggleDay(d)}>{dayName(d)}</button>
          ))}
        </div>
      )}

      {(choice === 'every_n_days' || choice === 'every_n_weeks' || choice === 'monthly') && (
        <label className="ts-every">
          <span>Every</span>
          <input type="number" inputMode="numeric" step={1}
            min={choice === 'monthly' ? 1 : 2} max={choice === 'every_n_days' ? 365 : choice === 'every_n_weeks' ? 52 : 24}
            value={nText}
            aria-label={choice === 'every_n_days' ? 'Number of days between' : choice === 'every_n_weeks' ? 'Number of weeks between' : 'Number of months between'}
            onChange={(e) => setNText(e.target.value)}
            onBlur={(e) => commitN(e.target.value, choice === 'monthly' ? 1 : 2, choice === 'every_n_days' ? 365 : choice === 'every_n_weeks' ? 52 : 24)} />
          <span>{choice === 'every_n_days' ? 'days' : choice === 'every_n_weeks' ? 'weeks' : 'months'}</span>
        </label>
      )}

      {choice === 'times_per_week' && (
        <label className="ts-every">
          <input type="number" inputMode="numeric" min={1} max={7} step={1} value={timesText} aria-label="Times a week"
            onChange={(e) => setTimesText(e.target.value)}
            onBlur={(e) => {
              const v = Math.min(7, Math.max(1, Math.floor(Number(e.target.value)) || 1))
              setTimesText(String(v))
              set({ ...cfg, times: v })
            }} />
          <span>times a week, on any days</span>
        </label>
      )}

      {choice === 'dates' && (
        <div className="ts-dates">
          <div className="ts-dates-head">
            <span aria-live="polite">
              {dates.length === 0 ? 'Tap the days it should be on.' : `${dates.length} ${dates.length === 1 ? 'day' : 'days'} picked`}
              {dates.length >= MAX_PICKED_DATES ? ' — the most there can be' : ''}
            </span>
            <button type="button" className="btn ts-dates-clear" disabled={dates.length === 0} onClick={() => set({ ...cfg, dates: [] })}>Clear</button>
          </div>
          <MonthScroller first={range.first} last={range.last} openAt={start > today ? start : today}
            today={today} label="Days to repeat on" selected={picked}
            disabled={(d) => d < today} onDayClick={togglePicked} />
        </div>
      )}

      {allowEnd && choice !== 'never' && choice !== 'dates' && (
        <div className="two">
          <div className="ts-field">
            <span className="ts-field-name">Ends</span>
            <Dropdown label="Ends" value={value.end_date ? 'date' : 'never'}
              options={[{ value: 'never', label: 'Never' }, { value: 'date', label: 'On a date' }]}
              onChange={(v) => onChange({ ...value, end_date: v === 'date' ? (value.end_date ?? start) : null })} />
          </div>
          {value.end_date != null && (
            <label>Last day
              <input type="date" min={start} value={value.end_date} onChange={(e) => onChange({ ...value, end_date: e.target.value || null })} />
            </label>
          )}
        </div>
      )}

      {sentence && (
        <p className="ts-repeat-rule" aria-live="polite">
          {sentence}.{endsEarly ? ' The last day is before the first. Pick a later one.' : ''}
        </p>
      )}
    </div>
  )
}
