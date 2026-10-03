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
- Step 4 (hub): no subtitle; tiles are glyph + name (+ "on the bar · on Today" only when set), three across at 360;
  the description moved into the tile's ⋮ sheet (and the tile's title attribute); menu hints cut to what matters; the
  footnote moved into the Hide confirm; the link is always "Settings"; empty "Add a module" section hidden.
- Step 5: NotesPage Export link → the note page's ⋮ (PageMenu + useExport).
- Step 6: helper text cut to one short line per row (CALM-11/12) in Looks, CalendarLinks, HouseholdShare (share text
  now names Settings → Shopping and household), Accounts, SignOut, Body (intro gone), Food (meals line), Hold (two
  paragraphs gone), Holidays (intro gone, credit in About), NoteTemplates (intro gone), Profiles, Reminders, Review,
  Data, Delete account (full text shows when opened). Comments say Settings → <page>.
- Step 7 (e2e, not run): e2e.mjs gains openSettings(p, page, find) and toPage(p, href) (both navigate in place with
  pushState + popstate, no reload). Settings tab clicks replaced in accounts, daytabs, features, food, holidays,
  landscape, modules, nav, onboarding, privacy, sharing, tour, tracking, transfer, views, widget; bar clicks to pages
  that may now live on the Modules page go through toPage (books, daytabs, features, food-units, food, holidays,
  products, sharing, stock, tour, units). nav.e2e: six styles, Sleep opened by address, grid ≤4 across, nothing
  scrolls, "Let GetIt pick" gives ≤5 with one marked; puts the person's style back.
