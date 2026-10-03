/** Household chores as a person reads them (HSE-01 to HSE-11): the words
 *  for where a chore stands, its due-ness bar, the starter packs, light days
 *  and a daily cap for flexible chores, and members' names. Pure: the
 *  schedule itself is schedule-rules.ts (choreState, choreAssignee).
 *
 *  The wording is calm on purpose (Tody's lesson): a chore is never
 *  "overdue!" or "failed". It is due, or it has been waiting a few days. */
import { addDays, toDayNumber, weekdayOf, dayName, shortDate, isDay, describeChore, choreState, choreAssignee, type ChoreLike, type ChoreState, type RuleConfig, type RuleKind } from './schedule-rules.ts'

/* ---------- days in words -------------------------------------------------- */

/** A day near today in words: "today", "tomorrow", "in 3 days", "yesterday",
 *  "3 days ago"; further off, "Fri 9 Oct". */
export function nearDay(day: string, today: string): string {
  const diff = toDayNumber(day) - toDayNumber(today)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 1 && diff < 7) return `in ${diff} days`
  if (diff < -1 && diff > -14) return `${-diff} days ago`
  return `${dayName(weekdayOf(day))} ${shortDate(day).replace(/ \d{4}$/, '')}`
}

export type ChoreTone = 'done' | 'due' | 'waiting' | 'soon' | 'later' | 'paused' | 'none'

/** Where a chore stands, in one short phrase, and its tone (for the colour
 *  of the bar, never the only signal: the words say it too). */
export function choreStatus(c: ChoreLike, st: ChoreState, today: string): { text: string; tone: ChoreTone } {
  if (st.doneToday) return { text: 'Done today', tone: 'done' }
  if (st.paused) return { text: isDay(c.paused_until) && !c.paused ? `Paused until ${shortDate(c.paused_until).replace(/ \d{4}$/, '')}` : 'Paused', tone: 'paused' }
  if (c.mode === 'flexible') {
    // Flexible chores have no due day to miss: only how due they feel.
    if (st.dueness >= 1.5) return { text: 'Could do with doing', tone: 'waiting' }
    if (st.dueness >= 1) return { text: 'Due about now', tone: 'due' }
    if (st.dueness >= 0.7) return { text: 'Getting due', tone: 'soon' }
    return { text: st.lastDone ? 'Fresh' : 'Not done yet', tone: st.lastDone ? 'later' : 'soon' }
  }
  if (st.shows && st.overdueDays > 0) {
    return { text: `Waiting ${st.overdueDays} ${st.overdueDays === 1 ? 'day' : 'days'}`, tone: 'waiting' }
  }
  if (st.shows) return { text: 'Due today', tone: 'due' }
  if (!st.next) return { text: 'Nothing planned', tone: 'none' }
  const when = nearDay(st.next, today)
  return { text: `Due ${when}`, tone: toDayNumber(st.next) - toDayNumber(today) <= 2 ? 'soon' : 'later' }
}

/** How full the due-ness bar is, 0 to 1. Flexible and "after" chores fill
 *  as the days pass since they were last done; a fixed chore is full on
 *  its day and empty otherwise. */
export function duenessFill(c: ChoreLike, st: ChoreState): number {
  if (st.doneToday || st.paused) return 0
  if (c.mode === 'fixed') return st.shows ? 1 : 0
  return Math.max(0, Math.min(1, st.dueness))
}

/** "Last done 3 days ago by Sam", or "Not done yet". */
export function lastDoneText(lastDone: string | null, by: string | null, today: string): string {
  if (!lastDone) return 'Not done yet'
  const when = nearDay(lastDone, today)
  return `Last done ${when}${by ? ` by ${by}` : ''}`
}

/** A chore's schedule in words, its pause with dates included. */
export function choreScheduleText(c: ChoreLike, today: string): string {
  if (!c.paused && isDay(c.paused_until) && c.paused_until >= today) {
    return `${describeChore({ ...c, paused: false })} · paused ${isDay(c.paused_from) && c.paused_from > today ? `from ${nearDay(c.paused_from, today)} ` : ''}until ${shortDate(c.paused_until).replace(/ \d{4}$/, '')}`
  }
  return describeChore(c)
}

/* ---------- the list ---------------------------------------------------------- */

export interface ChoreEntry<C> { chore: C; state: ChoreState }

/** The chores page in the order a person works through it: what is due now
 *  (most waiting first), then the coming week, then later, then paused. */
export function choreSections<C extends ChoreLike & { name: string; sort_order: number }>(entries: ChoreEntry<C>[], today: string): { key: string; label: string; entries: ChoreEntry<C>[] }[] {
  const weekOut = addDays(today, 7)
  const byOrder = (a: ChoreEntry<C>, b: ChoreEntry<C>) => a.chore.sort_order - b.chore.sort_order || a.chore.name.localeCompare(b.chore.name)
  const now: ChoreEntry<C>[] = []
  const soon: ChoreEntry<C>[] = []
  const later: ChoreEntry<C>[] = []
  const paused: ChoreEntry<C>[] = []
  for (const e of entries) {
    const { state: st, chore: c } = e
    if (st.paused) paused.push(e)
    else if (st.doneToday || st.shows || (c.mode === 'flexible' && st.dueness >= 1)) now.push(e)
    else if (st.next && st.next <= weekOut) soon.push(e)
    else later.push(e)
  }
  // Done ones sink to the bottom of "Now"; the rest by how long they waited.
  now.sort((a, b) => Number(a.state.doneToday) - Number(b.state.doneToday)
    || b.state.overdueDays - a.state.overdueDays || b.state.dueness - a.state.dueness || byOrder(a, b))
  soon.sort((a, b) => (a.state.next ?? '').localeCompare(b.state.next ?? '') || b.state.dueness - a.state.dueness || byOrder(a, b))
  later.sort((a, b) => (a.state.next ?? '9999').localeCompare(b.state.next ?? '9999') || byOrder(a, b))
  paused.sort(byOrder)
  return [
    { key: 'now', label: 'Now', entries: now },
    { key: 'soon', label: 'This week', entries: soon },
    { key: 'later', label: 'Later', entries: later },
    { key: 'paused', label: 'Paused', entries: paused },
  ].filter((s) => s.entries.length > 0)
}

/** The same chores by room, rooms A to Z and chores without one last. */
export function choreRooms<C extends { room: string | null; name: string; sort_order: number }>(chores: C[]): { room: string | null; chores: C[] }[] {
  const map = new Map<string | null, C[]>()
  for (const c of chores) {
    const room = c.room?.trim() || null
    map.set(room, [...(map.get(room) ?? []), c])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([room, list]) => ({ room, chores: list.sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name)) }))
}

/** Every room in use, A to Z, for the room field's suggestions. */
export function roomsIn(chores: { room: string | null }[]): string[] {
  return [...new Set(chores.map((c) => c.room?.trim()).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b))
}

/* ---------- light days and a daily cap (HSE-09, GEN-25) -------------------- */

export interface ChorePrefs {
  /** Weekdays (0 Sunday to 6 Saturday) with no flexible chores. */
  light_days: number[]
  /** At most this many flexible chores on one day; null for no limit. */
  cap: number | null
}

export const NO_PREFS: ChorePrefs = { light_days: [], cap: null }

/** Stored preferences, checked: anything odd is left out. */
export function readChorePrefs(v: unknown): ChorePrefs {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const light = Array.isArray(r.light_days)
    ? [...new Set(r.light_days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
    : []
  const cap = Number(r.cap)
  return { light_days: light.length === 7 ? [] : light, cap: r.cap != null && Number.isInteger(cap) && cap >= 1 && cap <= 20 ? cap : null }
}

/** Which flexible chores wait for another day: none on a light day, and
 *  past the cap only the most due are kept. Fixed and "after" chores are
 *  never held back (they were given a day on purpose), and a chore already
 *  done that day always shows. */
export function heldBack(items: { id: string; mode: ChoreLike['mode']; dueness: number; doneToday: boolean }[], day: string, prefs: ChorePrefs): Set<string> {
  const flexible = items.filter((i) => i.mode === 'flexible' && !i.doneToday)
  if (prefs.light_days.includes(weekdayOf(day))) return new Set(flexible.map((i) => i.id))
  if (prefs.cap == null) return new Set()
  const doneFlexible = items.filter((i) => i.mode === 'flexible' && i.doneToday).length
  const room = Math.max(0, prefs.cap - doneFlexible)
  const ranked = [...flexible].sort((a, b) => b.dueness - a.dueness || a.id.localeCompare(b.id))
  return new Set(ranked.slice(room).map((i) => i.id))
}

/* ---------- members ------------------------------------------------------------ */

export interface Member { user_id: string; display_name: string | null; role?: string | null }

/** A member's name as the household sees it. Someone who has not given one
 *  is "Me" to themselves and "Member 2" (by their place) to the others. */
export function memberName(members: Member[], userId: string | null | undefined, me: string | null | undefined): string {
  if (!userId) return ''
  const i = members.findIndex((m) => m.user_id === userId)
  const named = i >= 0 ? members[i].display_name?.trim() : ''
  if (named) return named
  if (userId === me) return 'Me'
  return i >= 0 ? `Member ${i + 1}` : 'A former member'
}

/** A name typed for the household, tidied; null when empty or too long. */
export function cleanMemberName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length >= 1 && name.length <= 40 ? name : null
}

/* ---------- starter packs (HSE-10) ------------------------------------------ */

export interface PackChore {
  name: string
  room: string
  mode: ChoreLike['mode']
  rule?: RuleKind
  rule_config?: RuleConfig
  every_days?: number
  minutes?: number
}

export interface StarterPack { key: string; name: string; about: string; chores: PackChore[] }

const weekly = (wd: number): Pick<PackChore, 'mode' | 'rule' | 'rule_config'> => ({ mode: 'fixed', rule: 'weekly', rule_config: { weekdays: [wd] } })

/** Two starting points. The person ticks off what they do not need before
 *  anything is added, and can change or delete every chore afterwards. */
export const STARTER_PACKS: StarterPack[] = [
  {
    key: 'studio', name: 'Studio flat', about: 'One or two people, one main room, a kitchen corner and a bathroom.',
    chores: [
      { name: 'Wash up', room: 'Kitchen', mode: 'fixed', rule: 'daily', rule_config: {}, minutes: 15 },
      { name: 'Wipe kitchen surfaces', room: 'Kitchen', mode: 'flexible', every_days: 3, minutes: 5 },
      { name: 'Take the bins out', room: 'Kitchen', ...weekly(1), minutes: 5 },
      { name: 'Clean the fridge', room: 'Kitchen', mode: 'flexible', every_days: 30, minutes: 20 },
      { name: 'Clean the bathroom', room: 'Bathroom', ...weekly(6), minutes: 30 },
      { name: 'Hoover and mop', room: 'Living room', mode: 'flexible', every_days: 7, minutes: 30 },
      { name: 'Dust', room: 'Living room', mode: 'flexible', every_days: 14, minutes: 15 },
      { name: 'Change the bed sheets', room: 'Bedroom', mode: 'after', every_days: 14, minutes: 15 },
      { name: 'Laundry', room: 'Bathroom', mode: 'flexible', every_days: 5, minutes: 20 },
    ],
  },
  {
    key: 'family', name: 'Family house', about: 'Several people and rooms, a garden, and more laundry.',
    chores: [
      { name: 'Empty the dishwasher', room: 'Kitchen', mode: 'fixed', rule: 'daily', rule_config: {}, minutes: 10 },
      { name: 'Wipe kitchen surfaces', room: 'Kitchen', mode: 'fixed', rule: 'daily', rule_config: {}, minutes: 5 },
      { name: 'Take the bins out', room: 'Kitchen', ...weekly(1), minutes: 5 },
      { name: 'Clean the oven', room: 'Kitchen', mode: 'flexible', every_days: 60, minutes: 45 },
      { name: 'Clean the fridge', room: 'Kitchen', mode: 'flexible', every_days: 30, minutes: 20 },
      { name: 'Clean the bathroom', room: 'Bathroom', ...weekly(6), minutes: 40 },
      { name: 'Clean the toilet', room: 'Bathroom', mode: 'flexible', every_days: 3, minutes: 5 },
      { name: 'Hoover downstairs', room: 'Living room', mode: 'flexible', every_days: 4, minutes: 25 },
      { name: 'Hoover upstairs', room: 'Bedrooms', mode: 'flexible', every_days: 7, minutes: 25 },
      { name: 'Mop the floors', room: 'Living room', mode: 'flexible', every_days: 10, minutes: 30 },
      { name: 'Change the bed sheets', room: 'Bedrooms', mode: 'after', every_days: 14, minutes: 30 },
      { name: 'Laundry', room: 'Utility', mode: 'flexible', every_days: 2, minutes: 20 },
      { name: 'Iron and fold', room: 'Utility', mode: 'flexible', every_days: 7, minutes: 40 },
      { name: 'Mow the lawn', room: 'Garden', mode: 'flexible', every_days: 10, minutes: 40 },
      { name: 'Water the plants', room: 'Garden', mode: 'flexible', every_days: 3, minutes: 10 },
      { name: 'Clean the windows', room: 'Outside', mode: 'flexible', every_days: 60, minutes: 60 },
    ],
  },
]

/** The pack's chores that are not in the household already (by name and
 *  room), so adding a pack twice never makes doubles. */
export function packChoresToAdd(pack: StarterPack, existing: { name: string; room: string | null; deleted_at?: string | null }[]): PackChore[] {
  const have = new Set(existing.filter((c) => !c.deleted_at).map((c) => `${c.name.trim().toLowerCase()}|${(c.room ?? '').trim().toLowerCase()}`))
  return pack.chores.filter((c) => !have.has(`${c.name.toLowerCase()}|${c.room.toLowerCase()}`))
}

/* ---------- chores kept as records before version 16 ---------------------- */

/** A chore written in the old Household table (a name, "daily", "weekly"
 *  or "monthly", and a free-text who) as a chore of the new kind. The who
 *  goes into the note, since it was not a member. Null for a record with no
 *  name. Monthly keeps the day it is moved on; weekly, the weekday. */
export function choreFromRecord(data: Record<string, unknown>, today: string): Omit<PackChore, 'room'> & { room: string | null; note: string | null } | null {
  const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  if (!name) return null
  const who = typeof data.who === 'string' && data.who.trim() ? `Who: ${data.who.trim().slice(0, 100)}` : null
  const schedule = data.schedule
  if (schedule === 'daily') return { name, room: null, mode: 'fixed', rule: 'daily', rule_config: {}, note: who }
  if (schedule === 'monthly') return { name, room: null, mode: 'fixed', rule: 'monthly', rule_config: { day_of_month: Number(today.slice(8, 10)) }, note: who }
  return { name, room: null, mode: 'fixed', rule: 'weekly', rule_config: { weekdays: [weekdayOf(today)] }, note: who }
}

/* ---------- exporting (the household page's Export) ------------------------------ */

type ExportChore = ChoreLike & { id: string; name: string; room: string | null; note: string | null; sort_order: number; deleted_at?: string | null }
type ExportLog = { chore_id: string; done_on: string; done_by: string | null; deleted_at?: string | null }

/** The household's chores as rows to save: name, room, how often in words,
 *  who does it next, when it is next due, when it was last done, how many
 *  times, its note, paused or not. In the page's order (room, then the
 *  person's order). `nameOf` turns a member's id into the household's name
 *  for them. */
export function choreExportRows(chores: ExportChore[], logs: ExportLog[], nameOf: (userId: string) => string, today: string): Record<string, unknown>[] {
  const live = chores.filter((c) => !c.deleted_at)
  return choreRooms(live).flatMap((g) => g.chores).map((c) => {
    const own = logs.filter((l) => l.chore_id === c.id && !l.deleted_at)
    const st = choreState(c, today, own)
    return {
      name: c.name, room: c.room, schedule: choreScheduleText(c, today),
      who: choreAssignee(c, today, own).map(nameOf).filter(Boolean).join(', ') || null,
      next: st.doneToday || st.shows ? today : st.next, last_done: st.lastDone, times_done: own.length,
      note: c.note, paused: !!c.paused,
    }
  })
}

/** Every time a chore was done, newest first: the day, the chore, its room
 *  and who did it. A chore since deleted keeps its history, named as it was. */
export function choreHistoryRows(chores: ExportChore[], logs: ExportLog[], nameOf: (userId: string) => string): Record<string, unknown>[] {
  const byId = new Map(chores.map((c) => [c.id, c]))
  return logs.filter((l) => !l.deleted_at && byId.has(l.chore_id))
    .sort((a, b) => b.done_on.localeCompare(a.done_on) || byId.get(a.chore_id)!.name.localeCompare(byId.get(b.chore_id)!.name))
    .map((l) => ({ done_on: l.done_on, chore: byId.get(l.chore_id)!.name, room: byId.get(l.chore_id)!.room, done_by: l.done_by ? nameOf(l.done_by) || null : null }))
}
