# NOTES-X4 — Telegram reminders (REM-05), release tooling, store screenshots (PLAT-04)

Running log. Newest at the bottom of each section.

## Plan
1. Migration 038 (Telegram link codes, queue, sent log, RPCs, cron schedule if pg_cron/pg_net) + security.sql block + localdb.
2. src/lib/telegram-rules.ts (pure; copied to supabase/functions/_shared by copy-shared.mjs) + node check.
3. Edge functions telegram-webhook and telegram-send: handler.ts (pure-ish, deps injected, node-testable) + index.ts (Deno).
4. App: notify.ts pushes the Telegram queue; Settings → Reminders → Telegram.
5. scripts/release.mjs (+ sentinels, adapters) + node checks (fake runner always; local DB on request).
6. .github/workflows/deploy.yml, docs/release.md, docs/telegram.md, privacy docs (Telegram, Health Connect).
7. scripts/store-shots.mjs, run, commit store/screenshots.
8. Requirements status, verification.

## Log
- 038 written and applied twice on the local DB; cron block tried with stub cron/net/vault schemas (one job, right URL, secret read from Vault). security.sql: 30 Telegram rows + 1 deletion row; 284 ok, 0 FAIL.
- telegram-rules.ts (src/lib, copied to _shared), telegram-webhook and telegram-send (handler.ts node-testable, index.ts Deno). telegram.check.mjs passes; handlers type-checked ad hoc with tsc (no Deno here).
- App: src/lib/telegram.ts, notify.ts hands the list over (same upcoming() list as the phone, worked out once), Settings → Reminders → Telegram (src/settings/TelegramReminders.tsx), hidden without VITE_TELEGRAM_BOT.
- release.mjs + release.check.mjs (stand-in DB, in npm run check) + release-db.check.mjs (real Postgres: all 14 ok, 25 s).
- Functions deploy: Supabase CLI 2.119.0 `--use-api` tried against a fake project ref with a fake token: it collects index.ts, handler.ts and ../_shared/telegram-rules.ts itself and posts multipart to /v1/projects/{ref}/functions/deploy. The API's multipart layout for relative imports is undocumented, so release.mjs runs the CLI rather than posting itself, and prints the commands if that fails.
- Privacy: policy.ts (the source of site/privacy.html) gets "Reminders through Telegram" and Health Connect; POLICY_VERSION 2026-10-06. processors, records, retention updated.
- docs/telegram.md, docs/release.md, .github/workflows/deploy.yml.

## Decisions (why)
- The server does not recompute reminders: the app already works them out (notify.ts upcoming(), every module, repeats, quiet hours, switches) and hands the next 3 days' lines to telegram_set_reminders. One set of rules, no timezone guessing on the server, and only lines (not the data behind them) reach the queue. The shared logic in telegram-rules.ts is what both sides need: the line for Telegram (telegramBody), the list (queueItems), parsing updates, choosing and grouping due rows, the send outcome.
- Health: tasks GetIt writes from meal plans/workouts and Nutrition/Health/Training/Sleep rules stay off Telegram; refill without the count; payment without the amount. What the person typed goes (habits, supplements by the names they gave).
- Idempotency: telegram_claim_due inserts into telegram_sent in the same statement that selects (on conflict do nothing), so concurrent runs cannot both send. Window 10 min (missed runs caught up). Telegram refusing (429/5xx) gives the claim back; no answer at all leaves it as sent (twice is worse than missed); 403/chat not found unlinks.
- Chat id written only by telegram_link_finish (service role); a trigger refuses authenticated writes of a non-null chat id; clearing it (Unlink) is allowed and clears the queue (security definer trigger).
- telegram-send authenticated by its own secret header (TELEGRAM_CRON_SECRET, read by the job from Vault), deployed without JWT check; webhook by Telegram's secret_token header.
- Sources: Supabase Management API deploy (supabase.com/docs/reference/api/v1-deploy-a-function, github.com/orgs/supabase/discussions/33720, supabase.com/docs/guides/integrations/supabase-for-platforms); CLI 2.119.0 help (--use-api, --no-verify-jwt); telegram.org/privacy (controller Telegram Messenger Inc., EDPO as EU representative, bots independent); Telegram Bot API (setWebhook secret_token, X-Telegram-Bot-Api-Secret-Token, deep links).

## Final verification (16:10)
- npx tsc -b, npm run check (0 FAIL; telegram and release checks in the loop), npx vite build, copy-shared --check: pass.
- Local DB: security suite 284 ok, 0 FAIL; release-db.check.mjs 14 ok. Local DB stopped.
- store-shots.mjs run end to end twice: the seven images are byte-identical (fixed clock, seeded ids).
- Screenshots of the Telegram setting (off, link shown, linked; light and dark) in scratchpad/shots19/x4. Throwaway harness deleted.

## For the lead at merge
- Shared files touched (small, additive): package.json (check loop: telegram, release), src/test/README.md, src/screens/More.tsx (one import + <TelegramReminders />), src/lib/notify.ts (Due.telegram, list worked out once, handToTelegram), src/lib/settings-index-rules.ts (Telegram entry), src/legal/policy.ts (Telegram section, Health Connect line, POLICY_VERSION 2026-10-06: set it to the release day), .env.example (VITE_TELEGRAM_BOT), .gitignore.
- build.yml left alone: add `VITE_TELEGRAM_BOT: ${{ vars.VITE_TELEGRAM_BOT }}` to its env if CI builds should offer Telegram.
- release.mjs SENTINELS: add probes for 036/037/039 only if they might be applied by hand before the release (otherwise they are simply pending and run).
- store/play-console-answers.md (not mine): its Screenshots section still describes owner-made shots; Data safety may want a note on Telegram. scripts/screenshots.mjs (live demo account) is superseded by store-shots.mjs.
- Health Connect: ANDROID_PERMISSIONS in policy.ts must list X5's Health Connect permission.
