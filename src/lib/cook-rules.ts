/** Cook mode (REC-12), with no database and no React (checked in
 *  src/test/cook.check.mjs): a recipe's steps one by one, and the timers
 *  read from each step's text ("simmer 20 min", "bake for 1 hour",
 *  "10-12 minutes" takes the upper bound, Dutch "20 minuten"), and a running
 *  timer kept as the moment it ends, so it keeps time whatever the screen
 *  does in between. */

// ---- the steps ------------------------------------------------------------------------------

/** The steps of a recipe as separate steps: one a line, with numbering and
 *  bullets taken off ("1.", "2)", "Step 3:", "Stap 3:", "-", "•"). A single
 *  line that numbers its steps inline ("1. Boil. 2. Drain.") is split at
 *  the numbers. Empty lines are dropped. */
export function splitSteps(text: string | null | undefined): string[] {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').trim()
  if (!raw) return []
  let lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 1 && /(^|\s)1[.)]\s/.test(lines[0]) && /\s2[.)]\s/.test(lines[0])) {
    lines = lines[0].split(/\s+(?=\d{1,2}[.)]\s)/)
  }
  return lines
    .map((l) => l.replace(/^(?:(?:step|stap)\s*\d+\s*[:.)-]?|\d{1,2}\s*[.)]|[-•*–])\s*/i, '').trim())
    .filter(Boolean)
}

// ---- timers in a step's text ------------------------------------------------------------------

export interface StepTimer {
  /** The words it was read from, as written ("10-12 minutes"). */
  text: string
  seconds: number
  /** Where in the step the words start. */
  at: number
}

/** Numbers written as words, English and Dutch. */
const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60,
  een: 1, 'één': 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  elf: 11, twaalf: 12, vijftien: 15, twintig: 20, dertig: 30, veertig: 40, vijfenveertig: 45, vijftig: 50, zestig: 60,
  half: 0.5, anderhalf: 1.5,
}
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

const WORD = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')
/** A number: 20, 1.5, 1,5, 1½, 1 1/2, ½, or a word. */
const NUM = `(?:\\d+(?:[.,]\\d+)?(?:\\s*[½¼¾⅓⅔]|\\s+\\d/\\d)?|[½¼¾⅓⅔]|\\d/\\d|(?:${WORD}))`
const HOURS = '(?:hours?|hrs?|h|uur|uren)'
const MINUTES = '(?:minutes?|mins?|minuten|minuut|min)'
const SECONDS = '(?:seconds?|secs?|seconden|seconde|sec)'
const QUARTER = '(?:kwartier)'
const UNIT = `(${HOURS}|${MINUTES}|${SECONDS}|${QUARTER})`
/** "10-12", "10 to 12", "10 tot 12", "10 à 12", "10 or 12": a range. */
const RANGE = '\\s*(?:-|–|—|to|tot|à|a|or|of)\\s*'
const ONE = `(${NUM})(?:${RANGE}(${NUM}))?\\s*${UNIT}`
/** "1 hour 30 minutes", "1 uur en 15 minuten", "1h30". */
const PATTERN = new RegExp(`(?<![\\w.,])${ONE}(?![\\w])(?:\\s*(?:and|en|,)?\\s*(${NUM})\\s*(${MINUTES})(?![\\w]))?|(?<![\\w])(\\d{1,2})\\s*h\\s*(\\d{2})(?![\\w])`, 'gi')

/** A number as written, or null. */
export function readNumber(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (t in WORDS) return WORDS[t]
  if (t in FRACTIONS) return FRACTIONS[t]
  let m = /^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔])$/.exec(t)
  if (m) return Number(m[1].replace(',', '.')) + FRACTIONS[m[2]]
  m = /^(\d+)\s+(\d)\/(\d)$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d)\/(\d)$/.exec(t)
  if (m) return Number(m[1]) / Number(m[2])
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'))
  return null
}

const unitSeconds = (unit: string): number => {
  const u = unit.toLowerCase()
  if (new RegExp(`^${QUARTER}$`).test(u)) return 15 * 60
  if (new RegExp(`^${HOURS}$`).test(u)) return 3600
  if (new RegExp(`^${SECONDS}$`).test(u)) return 1
  return 60
}

/** The longest a timer runs: a day. */
export const MAX_TIMER = 24 * 3600

/** Every timer a step mentions, in order. A range counts as its upper
 *  bound ("10-12 minutes" is 12 minutes). "Half an hour" and "een half uur"
 *  are 30 minutes, "een kwartier" 15. Words that only look like a time
 *  ("a minute or two" counts as two minutes) are read the same way. */
export function stepTimers(step: string): StepTimer[] {
  const out: StepTimer[] = []
  const text = String(step ?? '')
  // Said as a phrase: half an hour, (een) half uur, an hour and a half.
  const phrases: [RegExp, number][] = [
    [/\b(?:an|one) hour and a half\b/gi, 5400], [/\b(?:half an hour|(?:een )?half uur|a half hour)\b/gi, 1800],
    [/\b(?:a|one) minute or two\b/gi, 120], [/\b(?:een )?paar minuten\b/gi, 3 * 60],
  ]
  const taken: [number, number][] = []
  for (const [re, seconds] of phrases) {
    for (const m of text.matchAll(re)) {
      out.push({ text: m[0], seconds, at: m.index! })
      taken.push([m.index!, m.index! + m[0].length])
    }
  }
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index!
    if (taken.some(([a, b]) => at < b && at + m[0].length > a)) continue
    let seconds: number | null = null
    if (m[6] !== undefined) {
      // "1h30"
      seconds = Number(m[6]) * 3600 + Number(m[7]) * 60
    } else {
      const first = readNumber(m[1])
      const upper = m[2] !== undefined ? readNumber(m[2]) : null
      const per = unitSeconds(m[3])
      // A word like "a" is only a number before a unit ("a minute"), and a
      // quarter ("kwartier") counts the number in front of it as quarters.
      const n = upper !== null && first !== null ? Math.max(first, upper) : first
      if (n === null) continue
      seconds = n * per
      if (m[4] !== undefined && per === 3600) {
        const extra = readNumber(m[4])
        if (extra !== null) seconds += extra * 60
      }
    }
    if (seconds === null || !(seconds >= 1) || seconds > MAX_TIMER) continue
    // Words alone ("a" in "a minute") are fine; a bare "a" without a unit
    // never reaches here.
    out.push({ text: m[0].trim(), seconds: Math.round(seconds), at })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** "20 min", "1 h 30 min", "45 s". */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts: string[] = []
  if (h) parts.push(`${h} h`)
  if (m) parts.push(`${m} min`)
  if (sec || !parts.length) parts.push(`${sec} s`)
  return parts.join(' ')
}

/** A countdown as a clock: "19:59", "1:05:00", "0:00". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

// ---- a running timer ----------------------------------------------------------------------------

/** A timer as kept: when it ends (milliseconds since 1970), or, paused, how
 *  much was left. Keeping the end rather than counting down means a phone
 *  that slept, a screen that changed or a tab in the background never loses
 *  time. */
export interface RunningTimer {
  id: string
  /** What it is for: the recipe and the step's words. */
  label: string
  seconds: number
  endsAt: number | null
  pausedLeft: number | null
  /** It reached zero and has rung. */
  rang: boolean
}

export function startTimer(id: string, label: string, seconds: number, now: number): RunningTimer {
  return { id, label, seconds, endsAt: now + seconds * 1000, pausedLeft: null, rang: false }
}

/** Seconds left (0 once it is over). */
export function timeLeft(t: RunningTimer, now: number): number {
  if (t.pausedLeft !== null) return t.pausedLeft
  if (t.endsAt === null) return t.seconds
  return Math.max(0, (t.endsAt - now) / 1000)
}

export const isDue = (t: RunningTimer, now: number) => t.pausedLeft === null && t.endsAt !== null && t.endsAt <= now

export function pauseTimer(t: RunningTimer, now: number): RunningTimer {
  if (t.pausedLeft !== null || isDue(t, now)) return t
  return { ...t, pausedLeft: timeLeft(t, now), endsAt: null }
}

export function resumeTimer(t: RunningTimer, now: number): RunningTimer {
  if (t.pausedLeft === null) return t
  return { ...t, endsAt: now + t.pausedLeft * 1000, pausedLeft: null }
}

/** Timers that have just reached zero and have not rung yet. */
export function toRing(timers: RunningTimer[], now: number): RunningTimer[] {
  return timers.filter((t) => !t.rang && isDue(t, now))
}
