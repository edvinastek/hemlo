/** Nights from Health Connect (SLP-05), with no database and no React
 *  (checked in src/test/sleepimport.check.mjs). Health Connect hands over
 *  sleep sessions as instants with the phone's zone offset at the time; Sleep
 *  keeps one night per day, on the morning it ended, as bed and wake clock
 *  times plus the hours slept. This turns the one into the other:
 *
 *  - sessions that overlap or follow each other closely (a watch and a phone
 *    recording the same night, or a night split by getting up) are one night;
 *  - a night belongs to the day it ended, in the zone it ended in, so a
 *    session from 23:10 to 06:40 is the next morning's;
 *  - the longest sleep ending on a day is that day's night; naps and other
 *    shorter sleeps are left out, and so is anything under three hours;
 *  - stages, when the session has them, give the hours actually asleep
 *    (awake and out-of-bed stages are not counted); without them the hours
 *    are from falling asleep to waking;
 *  - a day that already has a night keeps it (the person's own entry wins),
 *    and a session imported before is never imported again, even when the
 *    night made from it was deleted since (the person deleted it on purpose). */

/** One sleep session as the Android plugin passes it (SleepSessionRecord). */
export interface HcSession {
  /** Health Connect's own id for the record. */
  id: string
  /** Start and end, in milliseconds since 1970 (UTC). */
  start: number
  end: number
  /** The phone's offset from UTC at the start and end, in seconds; null when
   *  the app that wrote the session did not say. */
  startOffset: number | null
  endOffset: number | null
  /** Sleep stages, when the app that wrote it recorded them. */
  stages?: HcStage[]
}

export interface HcStage { start: number; end: number; stage: number }

/** Health Connect's stage types that are not sleep: awake, out of bed, and
 *  awake in bed. Everything else (sleeping, light, deep, REM, unknown) is. */
const NOT_ASLEEP = new Set([1, 3, 7])

/** A night already on the device, enough to know what to leave alone. */
export interface KnownNight {
  id: string
  log_date: string
  deleted_at: string | null
  import_id?: string | null
}

/** A night to save: a new row, or a deleted row on that day taken back (the
 *  server keeps one row per day, deleted or not). */
export interface ImportedNight {
  log_date: string
  went_to_bed: string
  woke_at: string
  hours: number
  import_id: string
  /** The id of the deleted row on that day to reuse, if there is one. */
  reuse: string | null
}

export interface ImportPlan {
  add: ImportedNight[]
  /** Days that already had a night, which stays as it is. */
  kept: number
  /** Nights imported before (still there, or deleted since). */
  before: number
  /** Naps and other shorter sleeps left out. */
  naps: number
}

/** Sessions closer than this are one night. */
const JOIN_MS = 60 * 60 * 1000
/** A sleep shorter than this, from first falling asleep to last waking, is a nap. */
const NIGHT_MS = 3 * 60 * 60 * 1000
/** Longer than a day is not a night's sleep; something went wrong upstream. */
const LONGEST_MS = 24 * 60 * 60 * 1000
/** How many session ids one night records; a night is rarely more than two. */
const MAX_IDS = 8

const PREFIX = 'hc:'

/** The Health Connect ids a night was imported from ('hc:a,b' → ['a', 'b']). */
export function importIds(importId: string | null | undefined): string[] {
  if (!importId || !importId.startsWith(PREFIX)) return []
  return importId.slice(PREFIX.length).split(',').filter(Boolean)
}

/** Seconds east of UTC on this device at an instant: the fallback when a
 *  session carries no offset of its own. */
export const deviceOffset = (ms: number) => -new Date(ms).getTimezoneOffset() * 60

const pad = (n: number) => String(n).padStart(2, '0')
/** The local date and clock time of an instant at an offset. */
export function localAt(ms: number, offsetSeconds: number): { day: string; time: string } {
  const d = new Date(ms + offsetSeconds * 1000)
  return {
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}

/** Milliseconds covered by a set of intervals, overlaps counted once. */
function covered(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0
  let from = -Infinity
  let to = -Infinity
  for (const [a, b] of sorted) {
    if (a > to) {
      if (to > from) total += to - from
      from = a
      to = b
    } else if (b > to) to = b
  }
  if (to > from) total += to - from
  return total
}

/** The stretches of a session spent asleep: its sleep stages, kept inside the
 *  session, or the whole session when it has no stages. */
function asleepParts(s: HcSession): [number, number][] {
  if (!s.stages || s.stages.length === 0) return [[s.start, s.end]]
  return s.stages
    .filter((st) => Number.isFinite(st.start) && Number.isFinite(st.end) && !NOT_ASLEEP.has(st.stage))
    .map((st): [number, number] => [Math.max(st.start, s.start), Math.min(st.end, s.end)])
}

interface Block { sessions: HcSession[]; start: number; end: number; asleep: number }

/** Sessions that overlap or nearly touch, joined into one sleep each. */
export function joinSessions(sessions: HcSession[]): Block[] {
  const seen = new Set<string>()
  const clean = sessions.filter((s) => {
    if (!s || typeof s.id !== 'string' || !s.id || seen.has(s.id)) return false
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start || s.end - s.start > LONGEST_MS) return false
    seen.add(s.id)
    return true
  }).sort((a, b) => a.start - b.start || a.end - b.end)
  const blocks: Block[] = []
  for (const s of clean) {
    const last = blocks[blocks.length - 1]
    if (last && s.start <= last.end + JOIN_MS) {
      last.sessions.push(s)
      last.end = Math.max(last.end, s.end)
    } else {
      blocks.push({ sessions: [s], start: s.start, end: s.end, asleep: 0 })
    }
  }
  for (const b of blocks) b.asleep = covered(b.sessions.flatMap(asleepParts))
  return blocks
}

/** What importing these sessions would do for wake days `from` to `to`
 *  (inclusive, 'YYYY-MM-DD'), given the nights already on the device. */
export function planSleepImport(
  sessions: HcSession[],
  known: KnownNight[],
  range: { from: string; to: string },
  fallbackOffset: (ms: number) => number = deviceOffset,
): ImportPlan {
  const plan: ImportPlan = { add: [], kept: 0, before: 0, naps: 0 }
  const importedIds = new Set(known.flatMap((n) => importIds(n.import_id)))

  // The longest sleep that ends on each day of the range.
  const byDay = new Map<string, { block: Block; bed: string; wake: string }[]>()
  for (const block of joinSessions(sessions)) {
    const first = block.sessions[0]
    const last = block.sessions.reduce((a, b) => (b.end > a.end ? b : a))
    const bed = localAt(block.start, first.startOffset ?? fallbackOffset(block.start))
    const wake = localAt(block.end, last.endOffset ?? fallbackOffset(block.end))
    if (wake.day < range.from || wake.day > range.to) continue
    const list = byDay.get(wake.day) ?? []
    list.push({ block, bed: bed.time, wake: wake.time })
    byDay.set(wake.day, list)
  }

  for (const [day, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nights = list.filter((x) => x.block.end - x.block.start >= NIGHT_MS && x.block.asleep > 0)
    plan.naps += list.length - nights.length
    if (nights.length === 0) continue
    const main = nights.reduce((a, b) => (b.block.asleep > a.block.asleep ? b : a))
    plan.naps += nights.length - 1

    const ids = main.block.sessions.map((s) => s.id)
    if (ids.some((id) => importedIds.has(id))) { plan.before++; continue }
    const onDay = known.filter((n) => n.log_date === day)
    if (onDay.some((n) => !n.deleted_at)) { plan.kept++; continue }
    plan.add.push({
      log_date: day,
      went_to_bed: main.bed,
      woke_at: main.wake,
      hours: Math.round((main.block.asleep / 3_600_000) * 100) / 100,
      import_id: PREFIX + ids.slice(0, MAX_IDS).join(','),
      reuse: onDay.find((n) => n.deleted_at)?.id ?? null,
    })
  }
  return plan
}

/** The wake days of "the last n days" ending today. */
export function importRange(today: string, days: number): { from: string; to: string } {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (Math.max(1, Math.round(days)) - 1))
  return { from: d.toISOString().slice(0, 10), to: today }
}

/** The instants to ask Health Connect for: from the evening before the first
 *  wake day (a night that ends on it starts the day before) to the end of
 *  the last, in this device's zone. */
export function queryWindow(range: { from: string; to: string }): { start: number; end: number } {
  const [fy, fm, fd] = range.from.split('-').map(Number)
  const [ty, tm, td] = range.to.split('-').map(Number)
  return { start: new Date(fy, fm - 1, fd - 1, 0, 0).getTime(), end: new Date(ty, tm - 1, td + 1, 0, 0).getTime() }
}

/** One short line on what the import did. */
export function describeImport(plan: Pick<ImportPlan, 'kept' | 'before' | 'naps'> & { added: number }): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const parts: string[] = []
  parts.push(plan.added ? `${n(plan.added, 'night', 'nights')} added.` : 'No new nights.')
  const rest: string[] = []
  if (plan.kept) rest.push(`${n(plan.kept, 'day', 'days')} already had a night`)
  if (plan.before) rest.push(`${n(plan.before, 'night was', 'nights were')} imported before`)
  if (plan.naps) rest.push(`${n(plan.naps, 'nap', 'naps')} left out`)
  if (rest.length) parts.push(`${rest.join(', ')}.`.replace(/^./, (c) => c.toUpperCase()))
  return parts.join(' ')
}
