/** Reminders through Telegram (REM-05): the rules the app and the two server
 *  functions share. Pure, with no imports, so scripts/copy-shared.mjs copies
 *  this file as it is into supabase/functions/_shared/ and the functions run
 *  exactly what src/test/telegram.check.mjs tests.
 *
 *  The app works out the reminders (notify.ts, the same rules as the phone's
 *  own notifications) and hands the next three days to the server; the server
 *  only sends what falls due. Only the reminder's line goes: what the person
 *  wrote and its time. What Visuma itself writes from food, training, body and
 *  sleep plans (a meal with its calories, a weigh-in) stays on the phone, and
 *  so do amounts and pill counts. */

/** How long a link code works, in minutes (038 keeps it as long). */
export const LINK_MINUTES = 10
/** How late a reminder may still go, in minutes: a missed run is caught up,
 *  but a reminder an hour late helps no one (telegram_claim_due's window). */
export const SEND_WINDOW_MIN = 10
/** At most this many reminders are handed over at once (038 refuses more). */
export const MAX_ITEMS = 300
/** Telegram's limit for one message. */
export const MAX_MESSAGE = 4096
const MAX_BODY = 500

/* ---------- linking ------------------------------------------------------------- */

/** A bot's username as BotFather gives it: 5 to 32 letters, digits and
 *  underscores, ending in "bot". Accepts "@VisumaBot" and "t.me/VisumaBot" too. */
export function cleanBotName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim().replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '')
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) && /bot$/i.test(name) ? name : null
}

/** A code from telegram_link_start: base64url, as Telegram's start parameter allows. */
export const isLinkCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(code)

/** The one-time address that opens the bot with the code: tapping Start in
 *  Telegram sends "/start <code>" to the webhook. */
export function linkAddress(bot: string | null | undefined, code: string): string | null {
  const name = cleanBotName(bot)
  return name && isLinkCode(code) ? `https://t.me/${name}?start=${code}` : null
}

/* ---------- what Telegram sends the webhook ----------------------------------------- */

export type TelegramCommand =
  | { kind: 'start'; chat: string; code: string | null }
  | { kind: 'stop'; chat: string; reply: boolean }
  | { kind: 'ignore' }

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const chatId = (v: unknown): string | null =>
  (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[0-9]{1,20}$/.test(v)) ? String(v) : null

/** One update from Telegram, read as one of the two things Visuma answers:
 *  "/start" (with the code from the link, or without one) and "/stop", in a
 *  private chat only. Blocking the bot counts as /stop (with no reply: a
 *  blocked bot cannot send one). Everything else is ignored: Visuma reads no
 *  messages, and a group chat is never linked. */
export function parseUpdate(update: unknown): TelegramCommand {
  const u = obj(update)
  if (!u) return { kind: 'ignore' }
  const member = obj(u.my_chat_member)
  if (member) {
    const chat = obj(member.chat)
    const status = obj(member.new_chat_member)?.status
    const id = chat?.type === 'private' ? chatId(chat.id) : null
    return id && status === 'kicked' ? { kind: 'stop', chat: id, reply: false } : { kind: 'ignore' }
  }
  const msg = obj(u.message)
  const chat = obj(msg?.chat)
  if (!msg || !chat || chat.type !== 'private') return { kind: 'ignore' }
  const id = chatId(chat.id)
  const text = typeof msg.text === 'string' ? msg.text.trim() : ''
  if (!id || !text.startsWith('/')) return { kind: 'ignore' }
  // "/start CODE", or "/start@SomeBot CODE" as some clients write it.
  const m = /^\/(start|stop)(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/.exec(text)
  if (!m) return { kind: 'ignore' }
  if (m[1] === 'stop') return { kind: 'stop', chat: id, reply: true }
  return { kind: 'start', chat: id, code: m[2] && isLinkCode(m[2]) ? m[2] : null }
}

/** What the bot answers. Plain text, no formatting. */
export const REPLIES = {
  linked: 'Linked to Visuma. Your reminders will come here. Send /stop to unlink.',
  expired: 'This link has expired or was used already. Make a new one in Visuma: Settings, Reminders, Telegram.',
  noCode: 'To link this chat, open Visuma: Settings, Reminders, Telegram.',
  stopped: 'Unlinked. Visuma sends nothing more here.',
  notLinked: 'This chat is not linked to Visuma.',
} as const

/* ---------- what goes to Telegram ---------------------------------------------------- */

/** Tasks Visuma writes from a meal plan or a training routine: their titles
 *  carry calories and plans the person did not type. */
const GENERATED_HEALTH_SOURCES = new Set(['meal', 'workout'])
/** Modules whose rules write tasks about the body (a weigh-in, a bedtime). */
const HEALTH_RULE_MODULES = new Set(['nutrition', 'health', 'training', 'sleep'])

export interface ReminderLine {
  kind: string
  /** The phone's text for it (reminder-text.ts). */
  body: string
  /** The item's own title: a supplement's name for a refill, a payment's name. */
  title?: string
  task?: { source?: string | null; module_key?: string | null } | null
  refill?: boolean
}

/** The line Telegram gets for a reminder, or null when it stays on the phone. */
export function telegramBody(r: ReminderLine): string | null {
  if (r.kind === 'task' && r.task) {
    const source = (r.task.source ?? '').toLowerCase()
    if (GENERATED_HEALTH_SOURCES.has(source)) return null
    if (source === 'module' && HEALTH_RULE_MODULES.has((r.task.module_key ?? '').toLowerCase())) return null
  }
  // A refill without the count; a payment without the amount.
  if (r.refill) return r.title ? `${r.title}: time to get more.` : null
  if (r.kind === 'payment') return r.title ? `${r.title} today.` : null
  const body = r.body.trim()
  return body || null
}

export interface QueueItem { key: string; due_at: string; body: string }

/** The list handed to telegram_set_reminders: the ones Telegram gets, from
 *  now on, once per key (the earliest), soonest first, at most MAX_ITEMS. */
export function queueItems(due: { key: string; at: Date; telegram: string | null }[], now: Date): QueueItem[] {
  const byKey = new Map<string, { key: string; at: Date; body: string }>()
  for (const d of due) {
    const body = d.telegram?.trim()
    if (!body || !d.key || d.key.length > 200 || !(d.at instanceof Date) || Number.isNaN(d.at.getTime()) || d.at <= now) continue
    const had = byKey.get(d.key)
    if (!had || d.at < had.at) byKey.set(d.key, { key: d.key, at: d.at, body: body.slice(0, MAX_BODY) })
  }
  return [...byKey.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key))
    .slice(0, MAX_ITEMS)
    .map((d) => ({ key: d.key, due_at: d.at.toISOString(), body: d.body }))
}

/** A short fingerprint of a list, so the app sends it again only when it
 *  changed (or once in a while, to be safe). */
export function queueSignature(items: QueueItem[]): string {
  let h = 0
  for (const i of items) {
    const s = `${i.key}|${i.due_at}|${i.body}\n`
    for (let k = 0; k < s.length; k++) h = (Math.imul(31, h) + s.charCodeAt(k)) | 0
  }
  return `${items.length}:${(h >>> 0).toString(36)}`
}

/* ---------- sending what fell due ------------------------------------------------------ */

export interface DueRow { profile_id: string; key: string; due_at: string; body: string; chat_id: string }

/** The rows to send now: due, not older than the window, with a private chat
 *  and something to say. (telegram_claim_due picks by the same rule; this is
 *  the function's own check of what it was handed.) */
export function chooseDue(rows: DueRow[], now: Date, windowMin = SEND_WINDOW_MIN): DueRow[] {
  const t = now.getTime()
  return rows
    .filter((r) => {
      const at = Date.parse(r.due_at)
      return Number.isFinite(at) && at <= t && at > t - windowMin * 60_000 && chatId(r.chat_id) !== null && r.body.trim() !== ''
    })
    .sort((a, b) => a.chat_id.localeCompare(b.chat_id) || Date.parse(a.due_at) - Date.parse(b.due_at) || a.key.localeCompare(b.key))
}

/** The message for a chat: one line per reminder, in time order, within
 *  Telegram's limit. */
export function buildMessage(bodies: string[]): string {
  const lines = bodies.map((b) => b.trim()).filter(Boolean)
  let out = ''
  for (const line of lines) {
    const next = out ? `${out}\n${line}` : line
    if (next.length > MAX_MESSAGE) return out || line.slice(0, MAX_MESSAGE - 1) + '…'
    out = next
  }
  return out
}

/** One message per chat for everything due at once, so five reminders at
 *  8:00 are one notification, not five. */
export function groupByChat(rows: DueRow[]): { chat: string; text: string; rows: DueRow[] }[] {
  const out = new Map<string, DueRow[]>()
  for (const r of rows) out.set(r.chat_id, [...(out.get(r.chat_id) ?? []), r])
  return [...out.entries()].map(([chat, rs]) => ({ chat, text: buildMessage(rs.map((r) => r.body)), rows: rs }))
}

/** What a Bot API answer means for a send: sent; not sent, so try again next
 *  run; the chat is gone (the person blocked the bot or deleted the chat), so
 *  unlink; or unsure (no answer came: the message may have arrived), which is
 *  left as sent, because a reminder twice is worse than one missed. */
export function sendOutcome(status: number, description = ''): 'sent' | 'retry' | 'gone' | 'unsure' {
  if (status >= 200 && status < 300) return 'sent'
  if (status === 0) return 'unsure'
  if (status === 403) return 'gone'
  if (status === 400 && /chat not found|user is deactivated/i.test(description)) return 'gone'
  return 'retry'
}

/** Send one message through the Bot API (the server functions only; fetch is
 *  passed in so the checks can stand in for Telegram). Never throws, and
 *  never lets the address out: it holds the bot's token, and a failed
 *  fetch's error names the address it tried. */
export async function botSend(fetchFn: typeof fetch, token: string, chat: string, text: string): Promise<{ status: number; description: string }> {
  try {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10_000),
    })
    let description = ''
    try { description = String(((await r.json()) as { description?: unknown })?.description ?? '') } catch { /* no body */ }
    return { status: r.status, description: description.slice(0, 200) }
  } catch {
    return { status: 0, description: 'no answer' }
  }
}

/** The secret header compared in constant time, so its length and content
 *  cannot be guessed from how long a refusal takes. An unset secret refuses
 *  everything. */
export function sameSecret(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || typeof given !== 'string') return false
  let diff = given.length ^ secret.length
  for (let i = 0; i < secret.length; i++) diff |= (given.charCodeAt(i % (given.length || 1)) || 0) ^ secret.charCodeAt(i)
  return diff === 0
}
