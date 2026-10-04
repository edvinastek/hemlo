/** Natural-language quick add (TSK-07): one line such as "Gym tomorrow
 *  18:00-19:30 every Mon Wed #Training" read into a day, a time, a length,
 *  a repeat and a section, each shown as a chip while it is typed. Tapping a
 *  chip takes that reading away and its words go back into the title.
 *
 *  English and Dutch (the owner lives in the Netherlands). It never eats a
 *  word it is not sure of: "sat" and "sun" alone, "may", a bare number,
 *  "5-6 reps", "Weekly review" as the first word, a section nobody made and
 *  the short Dutch day names (ma, di, wo, do, vr, za, zo, which are also
 *  words) all stay in the title. Only the first reading of each kind is
 *  taken; a second time or day stays as typed.
 *
 *  Pure: no database, no React, no clock (today is passed in). Checked in
 *  src/test/quickadd.check.mjs. Repeats come out in the one repeat engine's
 *  shape, made by the same function the repeat control uses (ruleFor), so
 *  a repeat read here is exactly the one the control would make. */
import { addDays, describeSchedule, isDay, weekdayOf, type RuleConfig, type RuleKind } from './schedule-rules.ts'
import { ruleFor } from './repeat-choice-rules.ts'

export type ReadingKind = 'day' | 'time' | 'length' | 'repeat' | 'section'
export const READING_KINDS: ReadingKind[] = ['day', 'time', 'length', 'repeat', 'section']

export interface Chip { kind: ReadingKind; label: string }

export interface QuickRepeat { rule: RuleKind; rule_config: RuleConfig }

export interface QuickAddResult {
  /** What is left once the readings are taken out. */
  title: string
  /** Null where nothing of that kind was read. */
  day: string | null
  time: string | null
  minutes: number | null
  repeat: QuickRepeat | null
  section: string | null
  /** One per reading, in the order the kinds are listed above. */
  chips: Chip[]
}

export interface QuickAddContext {
  /** The person's today, 'yyyy-MM-dd'. */
  today: string
  /** The day the task has without a reading (the day in view, or none for
   *  the Inbox): where a repeat starts when no day is typed. */
  base?: string | null
  /** The section names the person can choose (built-in ones that are on,
   *  and their own). A #word that is none of them stays in the title. */
  sections: string[]
  /** Readings the person took away: their words stay in the title. */
  off?: readonly ReadingKind[]
}

/* ---------- words ---------------------------------------------------------- */

// Letters or digits on either side mean the match is part of a longer word.
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'

/** Day names, each with its weekday (0 Sunday) and whether it is safe alone. */
const DAY_WORDS: [string, number, boolean][] = [
  ['sunday', 0, true], ['monday', 1, true], ['tuesday', 2, true], ['wednesday', 3, true],
  ['thursday', 4, true], ['friday', 5, true], ['saturday', 6, true],
  ['zondag', 0, true], ['maandag', 1, true], ['dinsdag', 2, true], ['woensdag', 3, true],
  ['donderdag', 4, true], ['vrijdag', 5, true], ['zaterdag', 6, true],
  ['mon', 1, true], ['tues', 2, true], ['tue', 2, true], ['wed', 3, true], ['thurs', 4, true],
  ['thur', 4, true], ['thu', 4, true], ['fri', 5, true],
  // "Sun cream", "sat down": only after on, next, this or every.
  ['sun', 0, false], ['sat', 6, false],
]
/** "Mondays", "maandags": every week on that day. */
const PLURAL_DAYS: [string, number][] = [
  ['sundays', 0], ['mondays', 1], ['tuesdays', 2], ['wednesdays', 3], ['thursdays', 4], ['fridays', 5], ['saturdays', 6],
  ['zondags', 0], ['maandags', 1], ['dinsdags', 2], ['woensdags', 3], ['donderdags', 4], ['vrijdags', 5], ['zaterdags', 6],
]
const byLength = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join('|')
const WD = byLength(DAY_WORDS.map(([w]) => w))
const WD_SAFE = byLength(DAY_WORDS.filter(([, , safe]) => safe).map(([w]) => w))
const PL = byLength(PLURAL_DAYS.map(([w]) => w))
const weekdayOfWord = (w: string) => DAY_WORDS.find(([x]) => x === w.toLowerCase())?.[1] ?? PLURAL_DAYS.find(([x]) => x === w.toLowerCase())?.[1] ?? null

/** Month names and short forms, English and Dutch, to their number. "May"
 *  and "mar" are words too, so they count only next to a day number. */
const MONTH_WORDS: [string, number][] = [
  ['january', 1], ['januari', 1], ['jan', 1], ['february', 2], ['februari', 2], ['feb', 2],
  ['march', 3], ['maart', 3], ['mar', 3], ['mrt', 3], ['april', 4], ['apr', 4], ['may', 5], ['mei', 5],
  ['june', 6], ['juni', 6], ['jun', 6], ['july', 7], ['juli', 7], ['jul', 7], ['august', 8], ['augustus', 8], ['aug', 8],
  ['september', 9], ['sept', 9], ['sep', 9], ['october', 10], ['oktober', 10], ['oct', 10], ['okt', 10],
  ['november', 11], ['nov', 11], ['december', 12], ['dec', 12],
]
const MON = byLength(MONTH_WORDS.map(([w]) => w))
const monthOf = (w: string) => MONTH_WORDS.find(([x]) => x === w.toLowerCase())?.[1] ?? 0

const EVERY = '(?:every|each|elke|iedere|ieder|elk)'
const LIST_SEP = '(?:\\s*(?:,|&|\\+|/|and|en)\\s*|\\s+)'

/* ---------- days and clocks ------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0')
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A real day from its parts, or null ("31/2" is not one). */
function dayFrom(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
  return isDay(s) ? s : null
}

/** A day and month without a year: this year, or next year once it has gone. */
function nextDate(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4))
  const here = dayFrom(y, m, d)
  if (here && here >= today) return here
  return dayFrom(y + 1, m, d) ?? here
}

/** The first day on or after `from` that falls on one of the weekdays. */
function firstOn(from: string, weekdays: number[]): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    if (weekdays.includes(weekdayOf(d))) return d
  }
  return from
}

const mondayOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

/** "Today", "Tomorrow", "Fri 9 Oct", "Fri 9 Oct 2027". */
export function dayWords(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  const label = `${DAY_SHORT[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]}`
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`
}

/** A clock from an hour, minutes and am or pm, or null when it is not one. */
function clock(h: number, m: number, mer: string | undefined): string | null {
  if (!Number.isInteger(h) || !Number.isInteger(m) || m > 59) return null
  if (mer) {
    if (h < 1 || h > 12) return null
    const pm = mer.toLowerCase().startsWith('p')
    h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h
  } else if (h > 23) return null
  return `${pad(h)}:${pad(m)}`
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** "45 min", "1 h", "1 h 30". */
export function lengthWords(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`
}

/* ---------- the readers ------------------------------------------------------ */

interface Hit {
  kind: ReadingKind
  start: number
  end: number
  day?: string
  time?: string
  minutes?: number
  /** A repeat before its start day is known. */
  repeat?: { choice: Parameters<typeof ruleFor>[0]; was: RuleConfig }
  /** A weekly repeat whose days decide the first day when none is typed. */
  weekdays?: number[]
  section?: string
}

type Reader = (text: string, ctx: QuickAddContext) => Hit[]

function each(text: string, source: string, make: (m: RegExpMatchArray) => Omit<Hit, 'start' | 'end'> | null): Hit[] {
  const out: Hit[] = []
  for (const m of text.matchAll(new RegExp(source, 'giu'))) {
    const hit = make(m)
    if (hit && m.index !== undefined) out.push({ ...hit, start: m.index, end: m.index + m[0].length })
  }
  return out
}

const readRepeat: Reader = (text) => [
  // "every Mon Wed", "every monday and friday", "elke maandag en woensdag"
  ...each(text, `${B}${EVERY}\\s+((?:${WD})(?:${LIST_SEP}(?:${WD}))*)${E}`, (m) => {
    const days = [...m[1].matchAll(new RegExp(`${B}(${WD})${E}`, 'giu'))].map((x) => weekdayOfWord(x[1])).filter((x): x is number => x !== null)
    const weekdays = [...new Set(days)].sort()
    return { kind: 'repeat', repeat: { choice: 'weekly', was: { weekdays } }, weekdays }
  }),
  // "on Mondays", "maandags", "mondays and thursdays"
  ...each(text, `${B}(?:(?:on|op)\\s+)?((?:${PL})(?:${LIST_SEP}(?:${PL}))*)${E}`, (m) => {
    const days = [...m[1].matchAll(new RegExp(`${B}(${PL})${E}`, 'giu'))].map((x) => weekdayOfWord(x[1])).filter((x): x is number => x !== null)
    const weekdays = [...new Set(days)].sort()
    return { kind: 'repeat', repeat: { choice: 'weekly', was: { weekdays } }, weekdays }
  }),
  // "every 2 days", "every 3 weeks", "elke 2 maanden"
  ...each(text, `${B}${EVERY}\\s+(\\d{1,3})\\s+(days?|dagen|weeks?|weken|months?|maanden)${E}`, (m) => {
    const n = Number(m[1])
    const unit = m[2].toLowerCase()
    if (n < 1) return null
    if (unit.startsWith('d')) return n === 1 ? { kind: 'repeat', repeat: { choice: 'daily', was: {} } } : n <= 365 ? { kind: 'repeat', repeat: { choice: 'every_n_days', was: { n } } } : null
    if (unit.startsWith('w')) return n === 1 ? { kind: 'repeat', repeat: { choice: 'weekly', was: {} } } : n <= 52 ? { kind: 'repeat', repeat: { choice: 'every_n_weeks', was: { n } } } : null
    return n <= 24 ? { kind: 'repeat', repeat: { choice: 'monthly', was: n > 1 ? { n } : {} } } : null
  }),
  // "every other week", "om de week"
  ...each(text, `${B}(?:${EVERY}\\s+other|om\\s+de)\\s+(day|dag|week|month|maand)${E}`, (m) => {
    const unit = m[1].toLowerCase()
    if (unit === 'day' || unit === 'dag') return { kind: 'repeat', repeat: { choice: 'every_n_days', was: { n: 2 } } }
    if (unit === 'week') return { kind: 'repeat', repeat: { choice: 'every_n_weeks', was: { n: 2 } } }
    return { kind: 'repeat', repeat: { choice: 'monthly', was: { n: 2 } } }
  }),
  // "every day", "every weekday", "every week", "elke maand"…
  ...each(text, `${B}${EVERY}\\s+(day|dag|weekday|workday|working day|werkdag|weekend|week|month|maand|year|jaar)${E}`, (m) => {
    const w = m[1].toLowerCase()
    const choice = w === 'day' || w === 'dag' ? 'daily'
      : w === 'weekday' || w === 'workday' || w === 'working day' || w === 'werkdag' ? 'weekdays'
        : w === 'weekend' ? 'weekends' : w === 'week' ? 'weekly' : w === 'year' || w === 'jaar' ? 'yearly' : 'monthly'
    return { kind: 'repeat', repeat: { choice, was: {} } }
  }),
  // "daily", "weekdays", "dagelijks"… but not as the first word ("Weekly review").
  ...each(text, `${B}(daily|dagelijks|weekdays|werkdagen|weekly|wekelijks|monthly|maandelijks|yearly|annually|jaarlijks)${E}`, (m) => {
    if (!text.slice(0, m.index).trim()) return null
    const w = m[1].toLowerCase()
    const choice = w === 'daily' || w === 'dagelijks' ? 'daily' : w === 'weekdays' || w === 'werkdagen' ? 'weekdays'
      : w === 'weekly' || w === 'wekelijks' ? 'weekly' : w === 'monthly' || w === 'maandelijks' ? 'monthly' : 'yearly'
    return { kind: 'repeat', repeat: { choice, was: {} } }
  }),
]

/** Days written as numbers: ISO, 23/10, 23/10/2026, 23-10-2026. */
const readNumericDay: Reader = (text, ctx) => [
  ...each(text, `${B}(?:(?:on|op)\\s+)?(\\d{4})-(\\d{2})-(\\d{2})${E}`, (m) => {
    const day = dayFrom(Number(m[1]), Number(m[2]), Number(m[3]))
    return day ? { kind: 'day', day } : null
  }),
  ...each(text, `${B}(?:(?:on|op)\\s+)?(\\d{1,2})([/-])(\\d{1,2})(?:\\2(\\d{4}|\\d{2}))?${E}`, (m) => {
    // A dash needs the year: "18-19" is far more often hours than a date.
    if (m[2] === '-' && !m[4]) return null
    const d = Number(m[1])
    const mo = Number(m[3])
    // "1/2 cup", "3/4": a fraction, not the 1st of February.
    if (!m[4] && mo <= 4 && d < mo) return null
    const y = m[4] ? Number(m[4].length === 2 ? `20${m[4]}` : m[4]) : null
    const day = y ? dayFrom(y, mo, d) : nextDate(ctx.today, mo, d)
    return day ? { kind: 'day', day } : null
  }),
]

/** Clocks: "18:00", "18.00", "6pm", "6:30 pm", "18u30", "om 18 uur",
 *  "at 18", "noon". A bare number is never a time. A price is not one
 *  either. */
const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?'
const NOT_MONEY = '(?<![€$£\\d.,:])'
const readRange: Reader = (text) => each(text,
  `${B}${NOT_MONEY}(?:(from|van)\\s+)?${T}\\s*(?:-|–|—|to|tot|till|until)\\s*${T}(?![\\p{L}\\p{N}:.])`, (m) => {
    const lead = !!m[1]
    const [h1, m1, r1, h2, m2, r2] = [m[2], m[3], m[4], m[5], m[6], m[7]]
    // "5-6 reps" is not a time: one side needs minutes or am/pm, or a lead word.
    if (!lead && !m1 && !m2 && !r1 && !r2) return null
    // "6-7pm": the first takes the second's am or pm when it fits.
    const mer1 = r1 ?? (r2 && Number(h1) <= Number(h2) ? r2 : undefined)
    const a = clock(Number(h1), Number(m1 ?? 0), mer1)
    const b = clock(Number(h2), Number(m2 ?? 0), r2)
    if (!a || !b || a === b) return null
    const minutes = (toMin(b) - toMin(a) + 1440) % 1440
    return { kind: 'time', time: a, minutes }
  })

const readTime: Reader = (text) => [
  // "6pm", "6:30 pm", "at 7am"
  ...each(text, `${B}${NOT_MONEY}(?:(?:at|om|@)\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![\\p{L}\\p{N}])`, (m) => {
    const t = clock(Number(m[1]), Number(m[2] ?? 0), m[3])
    return t ? { kind: 'time', time: t } : null
  }),
  // "18:00", "at 18.30"
  ...each(text, `${B}${NOT_MONEY}(?:(?:at|om|@)\\s*)?(\\d{1,2})[:.](\\d{2})(?![\\p{L}\\p{N}:.])`, (m) => {
    const t = clock(Number(m[1]), Number(m[2]), undefined)
    return t ? { kind: 'time', time: t } : null
  }),
  // "18u30"; "18u" and "18 uur" only after "om" (alone they can be a length)
  ...each(text, `${B}(?:om\\s+)?(\\d{1,2})u(\\d{2})${E}`, (m) => {
    const t = clock(Number(m[1]), Number(m[2]), undefined)
    return t ? { kind: 'time', time: t } : null
  }),
  ...each(text, `${B}om\\s+(\\d{1,2})(?:\\s*uur|u)?${E}`, (m) => {
    const t = clock(Number(m[1]), 0, undefined)
    return t ? { kind: 'time', time: t } : null
  }),
  // "at 18": only an hour that cannot be morning or evening.
  ...each(text, `${B}(?:at|@)\\s*(\\d{1,2})${E}(?![:.]\\d)`, (m) => {
    const h = Number(m[1])
    return h >= 13 && h <= 23 ? { kind: 'time', time: `${pad(h)}:00` } : null
  }),
  ...each(text, `${B}(?:at\\s+)?noon${E}`, () => ({ kind: 'time', time: '12:00' })),
]

/** Lengths: "for 45 min", "45 minutes", "1h30", "1 h", "2 hours", "1.5h",
 *  "voor 1 uur", "an hour", "half an hour", "anderhalf uur". */
const readLength: Reader = (text) => [
  ...each(text, `${B}(?:(?:for|voor)\\s+)?(\\d{1,3})\\s*(?:minutes|minute|mins|min|minuten|minuut)${E}`, (m) => {
    const n = Number(m[1])
    return n > 0 && n <= 1440 ? { kind: 'length', minutes: n } : null
  }),
  // Not after "om": "om 9 uur" is nine o'clock.
  ...each(text, `${B}(?<!om\\s{1,3})(?:(?:for|voor)\\s+)?(\\d{1,2})\\s*(?:hours|hour|hrs|hr|h|uur)(?:\\s*(\\d{1,2})\\s*(?:minutes|mins|min|m)?)?${E}`, (m) => {
    const h = Number(m[1])
    const min = Number(m[2] ?? 0)
    // "18 uur" is six o'clock, not a length.
    if (h > 12 || min > 59 || h * 60 + min === 0) return null
    return { kind: 'length', minutes: h * 60 + min }
  }),
  ...each(text, `${B}(?<!om\\s{1,3})(?:(?:for|voor)\\s+)?(\\d{1,2})[.,](\\d)\\s*(?:hours|hour|hrs|hr|h|uur)${E}`, (m) => {
    const minutes = Math.round((Number(m[1]) + Number(m[2]) / 10) * 60)
    return minutes > 0 && minutes <= 12 * 60 ? { kind: 'length', minutes } : null
  }),
  ...each(text, `${B}(?:(?:for|voor)\\s+)?(?:an hour and a half|anderhalf uur|half an hour|een half uur|half uur|an hour|one hour|een uur)${E}`, (m) => {
    const w = m[0].toLowerCase()
    const minutes = w.includes('anderhalf') || w.includes('and a half') ? 90 : w.includes('half') ? 30 : 60
    // "een uur" alone is also "one o'clock": only with "voor".
    if (w.endsWith('een uur') && !/^(?:for|voor)\s/.test(w)) return null
    return { kind: 'length', minutes }
  }),
]

/** Days in words: today, tomorrow, weekdays, next Friday, 23 Oct, in 3 days. */
const readWordDay: Reader = (text, ctx) => {
  const t = ctx.today
  return [
    ...each(text, `${B}(today|vandaag|tonight|vanavond|day after tomorrow|overmorgen|tomorrow|tmrw|tmr|morgen)${E}`, (m) => {
      const w = m[1].toLowerCase()
      const n = w === 'day after tomorrow' || w === 'overmorgen' ? 2 : ['tomorrow', 'tmrw', 'tmr', 'morgen'].includes(w) ? 1 : 0
      return { kind: 'day', day: addDays(t, n) }
    }),
    ...each(text, `${B}(?:(on|op|next|this|coming|volgende|deze|aanstaande)\\s+)?(${WD})${E}`, (m) => {
      const lead = m[1]?.toLowerCase()
      const wd = weekdayOfWord(m[2])
      if (wd === null) return null
      // "sun", "sat" alone are words.
      if (!lead && !new RegExp(`^(?:${WD_SAFE})$`, 'iu').test(m[2])) return null
      if (lead === 'next' || lead === 'volgende') return { kind: 'day', day: addDays(mondayOf(t), 7 + ((wd + 6) % 7)) }
      return { kind: 'day', day: firstOn(t, [wd]) }
    }),
    ...each(text, `${B}(next week|volgende week|this weekend|dit weekend)${E}`, (m) => {
      const w = m[1].toLowerCase()
      if (w.endsWith('week')) return { kind: 'day', day: addDays(mondayOf(t), 7) }
      return { kind: 'day', day: weekdayOf(t) === 0 ? t : firstOn(t, [6]) }
    }),
    ...each(text, `${B}(?:in|over)\\s+(\\d{1,3}|a|one|een)\\s+(days?|dagen|weeks?|weken)${E}`, (m) => {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
      const days = m[2].toLowerCase().startsWith('d') ? n : n * 7
      return days >= 1 && days <= 3650 ? { kind: 'day', day: addDays(t, days) } : null
    }),
    // "23 oct", "23rd October", "23 okt 2027"
    ...each(text, `${B}(?:(?:on|op)\\s+)?(\\d{1,2})(?:st|nd|rd|th|e)?\\s+(${MON})\\.?(?:\\s+(\\d{4}))?${E}`, (m) => {
      const d = Number(m[1])
      const mo = monthOf(m[2])
      const day = m[3] ? dayFrom(Number(m[3]), mo, d) : nextDate(t, mo, d)
      return day ? { kind: 'day', day } : null
    }),
    // "Oct 23", "October 23rd, 2027"; not "may" or "mar", which are words.
    ...each(text, `${B}(?:(?:on|op)\\s+)?(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, (m) => {
      if (/^(?:may|mar)$/i.test(m[1])) return null
      const d = Number(m[2])
      const mo = monthOf(m[1])
      const day = m[3] ? dayFrom(Number(m[3]), mo, d) : nextDate(t, mo, d)
      return day ? { kind: 'day', day } : null
    }),
  ]
}

/** "#Training": the person's section of that name, whatever its case; the
 *  longest name that fits wins ("#Deep work" over "#Deep"). */
const readSection: Reader = (text, ctx) => {
  const names = [...new Set(ctx.sections.filter((s) => s.trim()))].sort((a, b) => b.length - a.length)
  const out: Hit[] = []
  for (const m of text.matchAll(/#/g)) {
    const at = m.index ?? 0
    if (at > 0 && /[\p{L}\p{N}]/u.test(text[at - 1])) continue
    const rest = text.slice(at + 1)
    const name = names.find((n) => rest.slice(0, n.length).toLowerCase() === n.toLowerCase() && !/[\p{L}\p{N}]/u.test(rest[n.length] ?? ''))
    if (name) out.push({ kind: 'section', section: name, start: at, end: at + 1 + name.length })
  }
  return out
}

/** In this order: a repeat before the day names inside it, numeric days
 *  before hour ranges ("23-10-2026"), ranges before lengths and single
 *  times. */
const READERS: Reader[] = [readRepeat, readNumericDay, readRange, readLength, readTime, readWordDay, readSection]

/* ---------- reading a line -------------------------------------------------- */

/** Everything read from one line, with the title left over. */
export function readQuickAdd(text: string, ctx: QuickAddContext): QuickAddResult {
  const off = new Set(ctx.off ?? [])
  const taken: Hit[] = []
  // Words of a reading taken away stay as typed: nothing else reads them
  // either ("every Mon Wed" off does not become a Monday).
  const kept: Hit[] = []
  const overlaps = (h: Hit) => [...taken, ...kept].some((x) => h.start < x.end && x.start < h.end)
  for (const read of READERS) {
    const hits = read(text, ctx).sort((a, b) => a.start - b.start || b.end - a.end)
    for (const h of hits) {
      if (overlaps(h)) continue
      if (off.has(h.kind)) { kept.push(h); continue }
      // A range already gave a length: a second length is not read.
      if (h.kind === 'length' && taken.some((x) => x.kind === 'time' && x.minutes !== undefined)) continue
      if (taken.some((x) => x.kind === h.kind)) continue
      taken.push(h)
    }
  }
  const get = (k: ReadingKind) => taken.find((x) => x.kind === k)
  const dayHit = get('day')
  const timeHit = get('time')
  const lengthHit = get('length')
  const repeatHit = get('repeat')
  const sectionHit = get('section')

  // Where a weekly repeat starts when no day is typed: its first day on or
  // after the day the task would have. Said in the repeat's chip.
  const base = ctx.base ?? ctx.today
  let day = dayHit?.day ?? null
  let from: string | null = null
  if (repeatHit && !day && repeatHit.weekdays?.length && !repeatHit.weekdays.includes(weekdayOf(base))) {
    from = firstOn(base, repeatHit.weekdays)
  }
  const start = day ?? from ?? base
  let repeat: QuickRepeat | null = null
  if (repeatHit?.repeat) {
    const r = ruleFor(repeatHit.repeat.choice, start, repeatHit.repeat.was)
    if (r.rule) repeat = { rule: r.rule, rule_config: r.rule_config }
  }
  if (from && repeat) day = from

  const minutes = timeHit?.minutes ?? lengthHit?.minutes ?? null
  const chips: Chip[] = []
  if (dayHit?.day) chips.push({ kind: 'day', label: dayWords(dayHit.day, ctx.today) })
  if (timeHit?.time) {
    chips.push({ kind: 'time', label: timeHit.minutes !== undefined ? `${timeHit.time}–${addClock(timeHit.time, timeHit.minutes)}` : timeHit.time })
  }
  if (lengthHit?.minutes && timeHit?.minutes === undefined) chips.push({ kind: 'length', label: lengthWords(lengthHit.minutes) })
  if (repeat) {
    const words = describeSchedule({ rule: repeat.rule, rule_config: repeat.rule_config, start_date: start })
    chips.push({ kind: 'repeat', label: from ? `${words}, from ${dayWords(from, ctx.today)}` : words })
  }
  if (sectionHit?.section) chips.push({ kind: 'section', label: sectionHit.section })

  return {
    title: cleanTitle(text, taken.filter((h) => h.kind !== 'repeat' || repeat)),
    day,
    time: timeHit?.time ?? null,
    minutes,
    repeat,
    section: sectionHit?.section ?? null,
    chips,
  }
}

const addClock = (t: string, minutes: number) => {
  const m = (toMin(t) + minutes) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** The line with the read words taken out, spaces and stray commas tidied. */
function cleanTitle(text: string, hits: Hit[]): string {
  let out = ''
  let at = 0
  for (const h of [...hits].sort((a, b) => a.start - b.start)) {
    out += `${text.slice(at, h.start)} `
    at = h.end
  }
  out += text.slice(at)
  return out
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/([,;])(?=[,;])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
}
