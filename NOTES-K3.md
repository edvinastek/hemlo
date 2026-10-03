# NOTES-K3 (v17: calm shell — nav, Settings, Modules hub, tips)

Branch v17/k3, worktree /home/claude/wt17/k3. Harness: vite on 5303, script in scratchpad/k3h (throwaway).

## Log
- Step 1 (nav): nav.chosen added (settings.ts); pages-rules: effectiveStyle (row while ≤5 pages, hub beyond, unless chosen),
  fitBar (row never scrolls: Today, Plan, first two, Modules), grid capped at four across with Modules last, hubBar at most
  five (two pins; Stats only while a pin place is free), holderOf (Modules marked when the open page is off the bar).
  Nav.tsx: no sideways scrolling on the phone bar, equal columns, only the current page highlighted, long labels a size
  down / two lines, Inbox count badge on Plan (src/lib/inbox-count.ts useInboxCount). "More" is called Settings everywhere.
- Step 2 (Settings): home is the search plus a list of 11 pages (settings-index-rules SETTINGS_PAGES, pageForAddress for
  ?page=, old ?section=, ?find= and #calendar-links). PlanningSettings split into WhereYouAre / WorkSettings /
  StartingLayout. New src/settings/About.tsx (version, NEVO_ATTRIBUTION word for word, USDA, Open Food Facts and Open
  Prices ODbL, date-holidays CC BY-SA, privacy policy, delete account link). Evening review moved to Planning; Privacy
  policy moved from Data to About.
- Step 3 (tips): Tip is one slim line with ×; one per session app-wide (claimTip slot in tips.ts, FirstTip keeps its
  choice); a tip counts as seen as soon as it shows (never repeated). Tip texts shortened (TIP_MAX 80). What moved where:
  tips state keeps runs[version] = { at, met: {profileId: setUp} } in localStorage (survives sign-out); App notes the run
  at start-up and each profile met; movedShows needs met === true and created_at before the run and before MOVED_SINCE.
  RUNNING version comes from package.json: the sheet shows only once the lead bumps it to 0.17.x. WHAT_MOVED = v17 list.
