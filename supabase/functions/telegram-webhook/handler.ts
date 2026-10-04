// What the telegram-webhook function does with one request from Telegram,
// apart from the database and the network, which are passed in: index.ts
// passes Supabase and the real fetch, src/test/telegram.check.mjs passes
// stand-ins (no Deno, no Telegram).
import { REPLIES, botSend, parseUpdate, sameSecret } from '../_shared/telegram-rules.ts'

export interface WebhookStore {
  /** telegram_link_finish: use the code up and link the chat. */
  linkChat(code: string, chat: string): Promise<boolean>
  /** telegram_stop: unlink every profile on that chat; how many. */
  stopChat(chat: string): Promise<number>
}

export interface WebhookDeps {
  store: WebhookStore
  fetch: typeof fetch
  /** TELEGRAM_BOT_TOKEN */
  token: string | undefined
  /** TELEGRAM_WEBHOOK_SECRET: the secret_token given to setWebhook. */
  secret: string | undefined
}

const plain = (status: number, text = 'ok') =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** Telegram signs nothing, so the secret header set with setWebhook is the
 *  only proof a request came from Telegram: without it, or with it wrong,
 *  nothing is read. Then "/start <code>" links the chat, "/stop" (or
 *  blocking the bot) unlinks it, and everything else is ignored. Any other
 *  answer than 2xx makes Telegram send the update again later, which is
 *  wanted only when the database could not be reached. */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return plain(405, 'Method not allowed')
  if (!deps.secret || !deps.token) return plain(503, 'Not set up')
  if (!sameSecret(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), deps.secret)) return plain(401, 'Unauthorised')

  let update: unknown = null
  try { update = await req.json() } catch { return plain(200) }
  const cmd = parseUpdate(update)
  if (cmd.kind === 'ignore') return plain(200)

  let reply: string | null = null
  try {
    if (cmd.kind === 'start') {
      reply = !cmd.code ? REPLIES.noCode : (await deps.store.linkChat(cmd.code, cmd.chat)) ? REPLIES.linked : REPLIES.expired
    } else {
      const n = await deps.store.stopChat(cmd.chat)
      reply = cmd.reply ? (n > 0 ? REPLIES.stopped : REPLIES.notLinked) : null
    }
  } catch {
    console.error('telegram-webhook: the database could not be reached')
    return plain(500, 'Try again later')
  }
  // The answer is a courtesy: the link is made either way.
  if (reply) await botSend(deps.fetch, deps.token, cmd.chat, reply)
  return plain(200)
}
