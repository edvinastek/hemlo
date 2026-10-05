// Visuma → Telegram: sends the reminders that fell due (REM-05).
//
// Called every minute by pg_cron through pg_net (038), with the header
// x-getit-cron set to TELEGRAM_CRON_SECRET from Supabase Vault. The reminders
// themselves were worked out by the app (src/lib/notify.ts) and handed over
// with telegram_set_reminders; this only sends the ones due. See handler.ts.
//
// Deploy with JWT verification off (the job sends the secret header instead):
//   npx supabase functions deploy telegram-send --no-verify-jwt --project-ref lphysuemxnmcuukzsoya
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CRON_SECRET (docs/telegram.md).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleSend, type SendStore } from './handler.ts'
import type { DueRow } from '../_shared/telegram-rules.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const store: SendStore = {
  async claimDue(windowMin) {
    const { data, error } = await db.rpc('telegram_claim_due', { window_minutes: windowMin })
    if (error) throw new Error('telegram_claim_due failed')
    return (data ?? []) as DueRow[]
  },
  async release(rows) {
    for (const r of rows) {
      await db.from('telegram_sent').delete().match({ profile_id: r.profile_id, key: r.key, due_at: r.due_at })
    }
  },
  async stopChat(chat) {
    const { data, error } = await db.rpc('telegram_stop', { chat })
    if (error) throw new Error('telegram_stop failed')
    return typeof data === 'number' ? data : 0
  },
}

Deno.serve((req) => handleSend(req, {
  store,
  fetch,
  token: Deno.env.get('TELEGRAM_BOT_TOKEN'),
  cronSecret: Deno.env.get('TELEGRAM_CRON_SECRET'),
}))
