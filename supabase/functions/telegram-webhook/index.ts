// Telegram → GetIt: the bot's webhook (REM-05).
//
// Telegram posts every update for the bot here. Only "/start <code>" (from
// the link Settings → Reminders → Telegram shows) and "/stop" are answered;
// see handler.ts. Messages are not read or kept.
//
// Deploy with JWT verification off (Telegram sends no sign-in); the secret
// header Telegram sends (setWebhook's secret_token) is checked instead and is
// mandatory: without TELEGRAM_WEBHOOK_SECRET every request is refused.
//   npx supabase functions deploy telegram-webhook --no-verify-jwt --project-ref lphysuemxnmcuukzsoya
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (docs/telegram.md).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase itself; the
// service role is used only for the two database calls below.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleWebhook, type WebhookStore } from './handler.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const store: WebhookStore = {
  async linkChat(code, chat) {
    const { data, error } = await db.rpc('telegram_link_finish', { code, chat })
    if (error) throw new Error('telegram_link_finish failed')
    return data === true
  },
  async stopChat(chat) {
    const { data, error } = await db.rpc('telegram_stop', { chat })
    if (error) throw new Error('telegram_stop failed')
    return typeof data === 'number' ? data : 0
  },
}

Deno.serve((req) => handleWebhook(req, {
  store,
  fetch,
  token: Deno.env.get('TELEGRAM_BOT_TOKEN'),
  secret: Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),
}))
