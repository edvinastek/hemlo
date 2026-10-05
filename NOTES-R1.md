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
