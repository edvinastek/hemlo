# NOTES-F (looks, Android widgets and icons) — running log

Done (all committed):
- theme-rules.ts + looks.check.mjs: 11 themes x light/dark/black, contrast guard, own colour, phone colours,
  text zoom, icon data. colours-rules.ts checks module colours against the chosen theme's pages.
- looks.ts applier (watchLooks in App.tsx), pre-paint script in index.html, Settings → Looks panel (More, Profile tab).
- Android: LooksPlugin (text zoom, font scale, Material You accent, icon switch, haptics); 9 launcher icons as
  vector adaptive icons with monochrome layer; activity-alias per icon (.MainActivity = Classic); PlannerActivity.
- Widgets: theme-aware (WidgetColours, light/dark switch on Android 12+), Today widget from day items (WID-02,
  chores/supplement ticks), StatsWidget + StatsWidgetConfigure (WID-10, WID-14), Robolectric PNG renders.

Skipped (Could): LOOK-08 density, LOOK-12 font pairing (no settings key), WID-11 quick add, NAV-24 shortcuts.
