# Telegram reminders: setting up the bot

Reminders can arrive as Telegram messages (REM-05). It is off for everyone
until they link it in Settings → Reminders → Telegram. This page is the one-time
setup for the owner. Commands are for PowerShell.

## How it works

1. **Linking.** The app asks the database for a one-time code (migration 038,
   `telegram_link_start`) and shows `https://t.me/<bot>?start=<code>`. The
   person taps Start in Telegram; Telegram posts `/start <code>` to the
   `telegram-webhook` function, which checks Telegram's secret header, uses the
   code up (10 minutes, once) and stores the chat id on the profile. The bot
   answers "Linked to GetIt". `/stop`, blocking the bot, or Unlink in the app
   unlinks it.
2. **What is sent.** While linked, the app hands the next three days of
   reminders to the server each time it works out the phone's reminders (same
   rules, quiet hours and module switches). Only each reminder's line goes:
   the title the person wrote and its time. Planned meals and workouts, tasks
   written by the Nutrition, Health, Training and Sleep rules, refill counts and
   payment amounts stay on the phone.
3. **Sending.** pg_cron calls the `telegram-send` function every minute
   (through pg_net, with the header `x-getit-cron`). It claims what fell due in
   the last 10 minutes (a claimed reminder is never handed out again) and sends
   one message per chat with Telegram's `sendMessage`.

The reminders are worked out on the person's device, so a profile whose app
has not been opened for three days gets no more Telegram reminders until it is
opened again (the phone's own reminders work the same way). Reminders follow
the profile that is open in the app.

## 1. Make the bot (BotFather)

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Name: `GetIt`. Username: one that ends in `bot`, for example `GetItPlannerBot`
   (it must be free). BotFather answers with the **token** (`123456789:AA…`).
   Keep it secret: whoever has it controls the bot.
3. Send `/setjoingroups`, choose the bot, **Disable** (GetIt answers only in
   private chats anyway).
4. Send `/setcommands`, choose the bot, and paste:
   ```
   start - Link this chat to GetIt
   stop - Unlink this chat
   ```
5. Optional: `/setdescription` ("Reminders from your GetIt planner. Link it in
   GetIt: Settings, Reminders, Telegram.") and `/setuserpic` with
   `store/icon-512.png`.

## 2. Secrets

Make two long random secrets (letters and digits; Telegram allows A–Z, a–z,
0–9, `_` and `-`, up to 256 characters):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

Run it twice. In the repository folder, create `release.secrets.env` (Git
ignores it; never commit it):

```
TELEGRAM_BOT_TOKEN=123456789:AA...the token from BotFather
TELEGRAM_BOT_NAME=GetItPlannerBot
TELEGRAM_WEBHOOK_SECRET=<first random secret>
TELEGRAM_CRON_SECRET=<second random secret>
```

Then set them on Supabase and deploy the functions (docs/release.md, steps 5
and 6):

```powershell
$env:SB = "<Supabase personal access token>"
node scripts/release.mjs --secrets --functions
```

`--secrets` also puts `TELEGRAM_CRON_SECRET` into Supabase Vault as
`telegram_cron_secret`, where the every-minute job reads it. To do that by hand
instead (Supabase → SQL Editor):

```sql
select vault.create_secret('<second random secret>', 'telegram_cron_secret');
```

## 3. The every-minute job

Migration 038 switches on `pg_cron` and `pg_net` and schedules the job
`getit-telegram-send`. Check it in the SQL Editor:

```sql
select jobname, schedule, active from cron.job where jobname = 'getit-telegram-send';
```

If there is no row (the extensions could not be switched on by the migration),
switch on **pg_cron** and **pg_net** in Database → Extensions, then run the last
block of `supabase/migrations/038_v19_telegram_reminders.sql` (from `do $do$`
to the end) in the SQL Editor. After a few minutes:

```sql
select status_code, created from net._http_response order by created desc limit 5;
```

should show `200` answers.

## 4. Point Telegram at the webhook

```powershell
$token  = "<TELEGRAM_BOT_TOKEN>"
$secret = "<TELEGRAM_WEBHOOK_SECRET>"
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -Body @{
  url                  = "https://lphysuemxnmcuukzsoya.supabase.co/functions/v1/telegram-webhook"
  secret_token         = $secret
  allowed_updates      = '["message","my_chat_member"]'
  drop_pending_updates = "true"
}
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
```

The first answers `ok: True, result: True, description: Webhook was set`. The
second shows the address, `pending_update_count: 0`, and no `last_error_message`
once someone has sent the bot a message. Close PowerShell afterwards so the
token is not left in its history window (`Clear-History` also helps).

## 5. The app

The app offers the setting only when it knows the bot's username. Put it in
`.env` before building (the web build, Android and Windows):

```
VITE_TELEGRAM_BOT=GetItPlannerBot
```

For builds on GitHub Actions, add it as a repository variable
`VITE_TELEGRAM_BOT` (Settings → Secrets and variables → Actions → Variables).

## 6. Try it

1. In the app: Settings → Reminders → Telegram → Link → Open Telegram → Start.
   The bot answers "Linked to GetIt", and the app shows "Linked" within a few
   seconds.
2. Add a task three minutes from now. Within a minute of its time a message
   arrives.
3. Send `/stop` to the bot: it answers "Unlinked", and the app shows Link again
   the next time Settings opens.

## Turning it off for everyone

```powershell
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/deleteWebhook"
```

```sql
select cron.unschedule('getit-telegram-send');
```

Revoke the token in BotFather (`/revoke`) if it may have leaked.

## Privacy

Telegram is an independent controller of the messages it delivers, outside the
EU; GetIt sends it only the reminder lines and the chat id. See the policy
(`src/legal/policy.ts`, "Reminders through Telegram"), `docs/privacy/processors.md`,
`records-of-processing.md` and `retention.md`.

Sources: Telegram Bot API (`setWebhook` with `secret_token`, the
`X-Telegram-Bot-Api-Secret-Token` header, `sendMessage`, `my_chat_member`),
core.telegram.org/bots/api; deep links with `?start=`, core.telegram.org/bots/features#deep-linking;
Supabase scheduling functions with pg_cron and pg_net, supabase.com/docs/guides/functions/schedule-functions.
