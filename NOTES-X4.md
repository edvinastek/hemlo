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

## Decisions
- (filled in as made)

## Log
