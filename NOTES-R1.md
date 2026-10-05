# NOTES-R1 — GetIt becomes Visuma (app.visuma.planner)

Task: tasks21/r1.md. Branch v21/r1 from main (0.20.0).

## Log

- Started: read the task and house rules; counted every case-insensitive
  "getit" / "get it" hit (237 files, most in docs and store texts).
- App ID app.getit.planner → app.visuma.planner: Capacitor, Android
  (applicationId, namespace, packages moved to app/visuma/planner in main and
  test, manifest, strings), iOS (pbxproj, Info.plist URL type and quick
  action types, SceneDelegate), Tauri identifier, the deep links in src/lib,
  docs and store texts. Native plugin bridge names GetItWidget/GetItLooks/
  GetItHealth → VisumaWidget/VisumaLooks/VisumaHealth (both sides); widget
  intent scheme getit-widget → visuma-widget; notification icon
  ic_stat_getit → ic_stat_visuma; Android SharedPreferences files
  getit_* → visuma_* (a new app id starts empty anyway, nothing published);
  Gradle env vars GETIT_* → VISUMA_* (the GitHub secret names are unchanged);
  workflow artifacts getit-* → visuma-*; Tauri crate name visuma. Debug APK
  builds: package app.visuma.planner, label Visuma.
- App texts: every "GetIt" a person can read in src/ is "Visuma" (UI,
  notifications, reminder titles, Telegram replies, the calendar feed's name,
  error messages, the privacy policy). User agents to Open Food Facts and Open
  Prices say Visuma. index.html title plus application-name,
  apple-mobile-web-app-title and description metas; the PWA manifest; the
  site pages; the feature graphic (regenerated; the icon, splash and
  notification icon are the glyph only, no letters).
- File formats: src/lib/file-format-rules.ts. Written as visuma.bundle,
  visuma.dataset, visuma.module, visuma-recipes and file names visuma-…;
  read with either name (isFormat). Calendar files: X-VISUMA-KIND and
  X-VISUMA-REPEAT written, X-GETIT-… read too. Node checks for each old tag
  (ics, moduledefs, transfer, recipeio).
- POLICY_VERSION 2026-10-08, and one line in the policy: "Visuma was called
  GetIt until October 2026…".
- Docs, store texts (listing.json, play-console-answers.md,
  app-store-answers.md, phone-tests.md, testers/), README, docs/privacy/,
  docs/telegram.md, the server functions (calendar feed file visuma.ics, the
  fetcher's messages and user agent Visuma-calendar/1.0), scripts' prose.
  requirements.md: title already "Visuma — …" after the rename, the line
  "Visuma was called GetIt until version 20." in A1, the name's meaning in
  B1, decisions rows (Name, Platforms), R8 and BRAND-01 (Done (v21), R8).
- docs/release.md: "Once, for the name Visuma (version 21)": Supabase
  redirect URL, new contact address in .env and the GitHub secret, Netlify
  site again, Telegram bot, a new Play Console app, the App Store bundle id.
  docs/telegram.md: renaming an existing bot. docs/ios-release.md: the
  redirect is no longer "already allowed".
- package.json and package-lock.json name "visuma" (version stays 0.20.0).
- `npx cap sync android` and `npx cap sync ios`: both generated
  capacitor.config.json files say app.visuma.planner / Visuma; the path churn
  in android/capacitor.settings.gradle and ios/App/Podfile put back.
- Store screenshots regenerated (Android and --iphone, port 5521): byte-for-byte
  the same as before (no brand text on those screens), so nothing to commit.

## Decisions

- **One place for file tags** (src/lib/file-format-rules.ts, isFormat): the
  five readers all accept the new and the old tag, so a backup from GetIt
  imports for as long as people hold them. Error texts say "Visuma export";
  an old GetIt file is not refused, so they never show for it.
- **Calendar UIDs keep @getit.app**: a calendar that imported or subscribed
  to the events knows them by UID; a new domain would show each one twice.
  PRODID and the calendar name say Visuma.
- **Android storage files renamed** (visuma_widget, visuma_quickadd,
  visuma_looks): the new app id is a new app with empty storage anyway.
- **Plugin bridge names renamed** (VisumaWidget, VisumaLooks, VisumaHealth):
  both ends are in this repository; no data hangs on them.
- **"GetIt" as a data tag stays** where applied migrations (027, 035) hold it:
  unit source "GetIt" and "GetIt: EU grade × USDA shell share", source_version
  "USDA SR Legacy (GetIt version 15 catalogue)". Nothing shows these words
  (the app shows "worked out", "Visuma's first catalogue"); the scripts that
  build that data keep them so a rebuilt catalogue matches the live one.
- **Feature graphic** regenerated (store/feature-graphic.png says Visuma). The
  launcher icon, the alternative icons, the splash and the notification icon
  are the glyph only, no letters: nothing to tell the lead.
- **Policy**: POLICY_VERSION '2026-10-08' and one sentence in "Who is
  responsible": "Visuma was called GetIt until October 2026. Only the name
  changed: …". Controller name and VITE_CONTACT_EMAIL unchanged in code.

## Deliberate keeps (final case-insensitive grep)

Every remaining "getit" / "get it" outside this file:
- English, not the name: "get it back" (About, requirements), "get its body"
  (after-done-rules), 'get it.bot' (an invalid bot name in telegram.check).
- Storage that would be lost if renamed: Dexie database 'getit' (db.ts and the
  e2e tests that open it); localStorage/session keys getit-accounts,
  getit-profile, getit-tips, getit-page-uses, getit.looks (also index.html's
  first-paint script and store-shots seed), getit.focus, getit.openprices,
  getit:tab:*, getit:addfood:tab, getit:chores:group.
- An id seed: `getit-meal:` in meal-rules groupRef (meal tasks' ids).
- Calendar UID domain @getit.app (ics-rules, both copies, and its checks).
- Old file tags read for compatibility: file-format-rules OLD_FORMATS,
  X-GETIT-KIND / X-GETIT-REPEAT in ics-rules (both copies), and the checks
  that prove old files still read.
- Database and server names: _getit_migrations (release.mjs, its checks),
  cron job getit-telegram-send and header x-getit-cron (038, telegram-send,
  telegram.check, docs/telegram.md), migrations 001–039 (headers, 012's
  "GetIt is invite-only" — the app matches "invite-only" and shows its own
  Visuma text — and the 027/035 data tags).
- Catalogue data tags 'GetIt', 'GetIt: …', 'GetIt version 15 catalogue' in
  scripts/nevo-additions.mjs, units-usda.mjs, FoodUnits.tsx and the food
  checks; historical prose in those generators ("as GetIt used them in
  version 15").
- Paths and folders that exist on disk: /home/claude/getit (localdb.sh
  default, seed/*.py), the owner's C:\Users\edvin\Documents\GetIt16
  (docs/release.md), the GETIT upload folder (.gitignore, seed/extract.py).
- Statements of the old name: README, requirements A1/B3, policy line,
  site/index.ts, docs/release.md and telegram.md (renaming steps),
  capacitor.config.ts and WidgetStore comments, release-notes comments.

## Verification

- `npx tsc -b`, `npm run check` (all), `npx vite build`: pass.
- `node scripts/copy-shared.mjs --check`: up to date.
- Android `./gradlew -q --offline assembleDebug`: builds; `aapt2 dump
  badging`: package 'app.visuma.planner', application-label 'Visuma'; the
  manifest's scheme app.visuma.planner and every alias under the new package.
  `./gradlew -q --offline testDebugUnitTest`: 47 tests, 0 failures (widget
  previews say "Open Visuma…").
- Plists parse (Info.plist, PrivacyInfo.xcprivacy, ExportOptions.plist,
  IDEWorkspaceChecks.plist). actionlint 1.7.12: only the four shellcheck
  infos main already has (build.yml line 90).
- Local DB (pg21r1, 55461): all 39 migrations apply; security suite 325 rows,
  all ok; release-db check passes. Stopped afterwards.
- Screenshots (scratchpad shots21/r1/): sign-in, Today, Settings → About,
  light and dark, 360 px; page title "Visuma", "Visuma 0.20.0" in About,
  "Visuma" on sign-in. Harness deleted.

## Merge notes

- Big mechanical diff; S1's files (src/sections/Shop*, Stores.tsx,
  ShopList.tsx, src/lib/shops-rules.ts) have brand strings only (one comment
  in shops-rules.ts: "Visuma opens it in the browser"). On conflict, take S1's
  side and replace GetIt with Visuma in it.
- Anything merged after this that says GetIt, writes getit.* tags or
  app.getit.planner needs the same treatment; `git grep -i getit` against the
  keep list above is the check.
- After merge: `npx cap sync` and put back the Podfile/settings.gradle paths.
- A phone with the old GetIt app keeps it beside the new Visuma app (another
  app id); Windows too (another identifier, its own local copy). Signing in
  to Visuma brings the data back from the server; anything not yet synced on
  the old app should be synced first.
