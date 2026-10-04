// What the telegram-send function does on each run, apart from the database
// and the network, which are passed in (see telegram-webhook/handler.ts).
import { SEND_WINDOW_MIN, botSend, chooseDue, groupByChat, sameSecret, sendOutcome, type DueRow } from '../_shared/telegram-rules.ts'

export interface SendStore {
  /** telegram_claim_due: the reminders due now, each marked sent as it is handed out. */
  claimDue(windowMin: number): Promise<DueRow[]>
  /** Give claims back (Telegram did not take the message), so the next run tries again. */
  release(rows: DueRow[]): Promise<void>
  /** telegram_stop: the person blocked the bot or the chat is gone. */
  stopChat(chat: string): Promise<number>
}

export interface SendDeps {
  store: SendStore
  fetch: typeof fetch
  /** TELEGRAM_BOT_TOKEN */
  token: string | undefined
  /** TELEGRAM_CRON_SECRET: the header the every-minute job sends (038). */
  cronSecret: string | undefined
  now?: () => Date
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** One run: take what fell due (claimed first, so a second run at the same
 *  time, or a retry, gets nothing twice), send one message per chat, and give
 *  back only what Telegram plainly refused for now. */
export async function handleSend(req: Request, deps: SendDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!deps.cronSecret || !deps.token) return json(503, { error: 'Not set up' })
  if (!sameSecret(req.headers.get('x-getit-cron'), deps.cronSecret)) return json(401, { error: 'Unauthorised' })

  let claimed: DueRow[]
  try { claimed = await deps.store.claimDue(SEND_WINDOW_MIN) } catch {
    console.error('telegram-send: the database could not be reached')
    return json(500, { error: 'Try again later' })
  }
  const rows = chooseDue(claimed, (deps.now ?? (() => new Date()))())
  const tally = { sent: 0, retry: 0, gone: 0, unsure: 0 }
  for (const group of groupByChat(rows)) {
    const res = await botSend(deps.fetch, deps.token, group.chat, group.text)
    const outcome = sendOutcome(res.status, res.description)
    tally[outcome] += group.rows.length
    try {
      if (outcome === 'retry') await deps.store.release(group.rows)
      if (outcome === 'gone') await deps.store.stopChat(group.chat)
    } catch {
      console.error(`telegram-send: could not record a ${outcome}`)
    }
  }
  // Counts only: never a chat id or a reminder's text in a log.
  if (tally.retry || tally.gone || tally.unsure) console.log(`telegram-send: ${JSON.stringify(tally)}`)
  return json(200, tally)
}
