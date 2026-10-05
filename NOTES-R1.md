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
