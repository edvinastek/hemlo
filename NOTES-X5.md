# NOTES-X5 — Android: launcher shortcuts (NAV-24), quick-add widget (WID-11), Health Connect sleep import (SLP-05)

Running log, newest at the bottom. Branch v19/x5, worktree /home/claude/wt19/x5.

## Plan (decided after reading the code)

- Deep links: the app already routes `app.getit.planner://open/<path>` (src/lib/widget.ts `openWidgetLink`, rule
  `widgetPath` in widget-rules.ts). Shortcuts and the quick-add widget use the same shape:
  `app.getit.planner://open/?add=<entry key>` (entry keys are the + menu's own: `task`, `inbox`, `food`, `event`,
  `m:<module>`). Today's + (AddFab) reads `?add=`, opens that entry's sheet, and drops the parameter.
- The + menu's top items are the person's own arrangement (`arrangeAdd`: most used first or their own order,
  hidden ones left out, off modules never there). The app sends the first four to the phone whenever they change;
  the phone keeps them for the quick-add widget and publishes them as dynamic launcher shortcuts.
- Health Connect: no maintained Capacitor 8 plugin fits (see below), so a small local plugin in Kotlin against
  androidx.health.connect:connect-client.
- Sleep rows have no `data` column, and a row is inserted whole on sync, so the Health Connect id needs a column:
  migration 039 adds `sleep_log.import_id`.

## What was built (all committed on v19/x5)

### NAV-24 launcher shortcuts — dynamic, not static (decision)
- `android/…/quickadd/QuickAdd.java`: keeps the + menu's first four (sent by the app), publishes them with
  `ShortcutManagerCompat.setDynamicShortcuts`, ranked in the menu's order, icons `ic_qa_*` (adaptive, paper + accent).
- Why not `res/xml/shortcuts.xml`: a declared shortcut can never be removed, reordered or hidden at runtime, so it
  would keep offering Food to someone who switched Food off and would show twice next to the person's own order.
  Dynamic shortcuts are cheap (one call when the order changes) and follow the person's order, hidden entries and
  modules. The cost: none before the first sign-in (they all need a signed-in profile anyway). Sign-out removes them.
- Shortcuts start `QuickAddActivity`, an invisible trampoline in its own task: a launcher starts shortcut intents
  with NEW_TASK|CLEAR_TASK, which pointed at PlannerActivity would restart the running app. It forwards only
  `?add=<key>` links to PlannerActivity (singleTask → onNewIntent → appUrlOpen).
- Shortcuts are tied to the launcher entry: `AppIcons.launcher()` gives the current icon alias, and LooksPlugin
  republishes them right after an icon switch.
- Web: `AddFab` (src/ui/AddMenu.tsx, small additive edit) sends `quickAddItems(shown)` through `sendQuickAdd`
  (src/lib/widget.ts, debounced 800 ms, only on change) and opens `?add=<key>` (any entry, also hidden or under
  More; one not on just clears the parameter). Rules in `src/lib/widget-quickadd-rules.ts`, check `quickadd`.
- Link shape: `app.getit.planner://open/?add=<entry key>` → the existing router (`widgetPath`, `openWidgetLink`)
  → Today with `?add=`. No new route needed.

### WID-11 quick-add widget
- `QuickAddWidget.java`, `layout/widget_quickadd.xml` (+ `_preview` for Android 12+ picker), `xml/widget_quickadd_info.xml`
  (4×1 default, 2×1–4×1 horizontal resize; 2/3/4 buttons by width), `drawable-nodpi/widget_quickadd_preview.png`
  (rendered by the Robolectric test, for Android 11 and older pickers), glyphs `glyph_qa_*`. Colours from
  WidgetColours (the app's theme, light/dark, follows the phone on 12+); default colours have values-night.
- Robolectric `QuickAddWidgetRenderTest` (9 tests): list read safely, buttons by width, links, the dynamic shortcuts,
  renders light/dark/black + shortcut icons into app/build/widget-previews.

### SLP-05 Health Connect sleep import
- Plugins checked on npm (4 Oct 2026): `capacitor-health-connect` 0.7.0 (peer Capacitor 5), `@kiwi-health/…` 0.0.43
  (Capacitor 7), `capacitor-health` 8.4.0 (Capacitor 8 but no sleep), `@capgo/capacitor-health` 8.11.4 (Capacitor 8,
  has sleep, but its manifest declares 47 Health Connect read/write permissions that Play would make us justify or
  that we would have to strip one by one). So: a small local plugin, `android/…/health/HealthPlugin.kt` (Kotlin, the
  client library is Kotlin-only) against `androidx.health.connect:connect-client:1.1.0` (stable; fetched online once
  from Google Maven, builds offline since). Kotlin Gradle plugin 2.2.20 added to the root buildscript (the version the
  Capacitor plugins already use; cached).
- connect-client's minSdk is 26, the app's 24: kept 24 with `tools:overrideLibrary` (main manifest and
  `app/src/test/AndroidManifest.xml` for the unit tests); the plugin answers "unsupported" below Android 9 before
  touching the library. Release APK ~1.6 MB larger (Guava, protobuf; R8 is off).
- Manifest: `health.READ_SLEEP` only; `<queries>` for com.google.android.apps.healthdata; `HealthPrivacyActivity`
  with `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`, and the Android 14 alias with VIEW_PERMISSION_USAGE +
  HEALTH_PERMISSIONS guarded by START_VIEW_PERMISSION_USAGE. The screen says what is read and leads to the privacy
  policy (public URL once `health_privacy_url` in res/values/health.xml is filled, the in-app policy until then).
- Web: `src/lib/native.ts` (additive: healthStatus, installHealthConnect, openHealthConnect, allowSleepReading,
  readHealthSleep), `src/lib/sleep-import.ts` (writes via edit(), Undo forgets the ids), `src/sections/SleepImport.tsx`
  (sheet: 7/14/30 days, default 14; install / refused / done / failed states, one line each), Sleep's ⋮ item only
  when Health Connect is available or installable (so never on web, Windows, iOS, or Android < 9).
- Rules `src/lib/sleep-import-rules.ts`, check `sleepimport`: wake day in the end's own offset, overlaps and gaps
  ≤ 60 min joined, stages summed (awake 1, out of bed 3, awake in bed 7 not counted), < 3 h = nap, longest per day,
  a day with a night keeps it, an id imported before never again (also after delete), deleted rows reused.
- Migration 039 (`sleep_log.import_id text`, check `^[a-z]+:` and ≤ 400): sleep_log had no `data` column, and a new
  row is inserted whole on sync, so a phone-only field would break the insert. Proved on the local DB
  (supabase/tests/039_sleep_import.sql) and the security suite: 254 ok. Dexie: no new version (new field, no index).
- Health Connect gives 30 days before the first grant without READ_HEALTH_DATA_HISTORY: the 30-day maximum fits that.

### Checked
- node checks `sleepimport`, `quickadd` (in the check loop and src/test/README.md).
- Harness (deleted) at 360 px light and dark, Capacitor stubbed as Android: Sleep ⋮ shows the item (not when Health
  Connect is unsupported), the sheet, import of a stub set (3 added, the typed night kept, a nap left out, rows queued
  with import_id), import again adds nothing, install and refused states, `?add=food|task|m:health` opens the sheet and
  clears the address, an entry that is not on opens nothing, the + menu sends its first four once.
- Android: assembleDebug and assembleRelease (lint vital) offline; all 47 unit tests (Robolectric) pass; aapt2 dump:
  READ_SLEEP the only new permission, QuickAddWidget receiver, QuickAddActivity, HealthPrivacyActivity + alias, the
  query, minSdk 24.
- Screenshots: scratchpad/shots19/x5 (sleep-*, today-add-*, widget-quickadd*, quickadd-*, shortcut-icons,
  health-privacy*).

### Needs a real phone (see store/phone-tests.md)
Shortcut launch (warm and cold, no restart), shortcuts following the order and the icon switch, pinning; placing,
resizing and tapping the widget, theme and TalkBack; the whole Health Connect flow (install, permission screen
asking for Sleep only, rationale links, refusal twice → settings, a real import with stages and zones).

## For X4 (privacy policy) and the lead — what the policy must say
Add a section to `src/legal/policy.ts` (and bump POLICY_VERSION), e.g. heading "Sleep from Health Connect (Android)":
> If you choose Import from Health Connect on the Sleep page, GetIt asks Health Connect for permission to read your
> sleep sessions, and only those: when you fell asleep and woke up, and the sleep stages if your tracker records
> them. It reads them only when you import, for the days you choose (up to 30). Each night becomes a night in Sleep,
> stored with the rest of your GetIt data in your account (with Health Connect's id for it, so it is not imported
> twice). GetIt never writes to Health Connect, never reads any other kind of data from it, never shares or sells
> what it reads and never uses it for advertising; no person reads it. You can take the permission back at any time
> in Health Connect; nights already imported stay until you delete them. GetIt's use of data from Health Connect
> follows the Health Connect Permissions policy, including its Limited Use requirements.
And in `ANDROID_PERMISSIONS`: `{ name: 'Health Connect: sleep (read)', why: 'only to import your nights when you
choose Import from Health Connect on the Sleep page' }`. docs/privacy/ should note the same.

## Sources
- Health Connect get started (manifest rationale activity, Android 14 alias, getSdkStatus, Play declaration,
  30-day history): https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
- connect-client versions and manifest (minSdk 26): https://dl.google.com/android/maven2/androidx/health/connect/connect-client/
- npm metadata for the plugins above (`npm view <name> version peerDependencies`), their packed manifests.
