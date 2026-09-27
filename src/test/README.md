# Checks

## Rule checks — `npm run check`

Types, then every check that needs nothing but Node. CI runs the same command.

- `calc` — BMR, maintenance, goal adjustments, protein, macros, packs, meal sizing.
- `formula` — the calculated-field parser, including that a formula cannot reach the page.
- `notify` — quiet hours across midnight, reminder wording.
- `body` — weigh-in parsing, the 7-day trend, when targets are recalculated.
- `series` — repeat rules (every N days and days picked by hand included), laying out days, "only this one" and
  "this and following", and the planned repeats shown past the eight weeks the fill turns into tasks.
- `tracking` — habit schedules and streaks, supplement slots.
- `review` — which tasks the evening review offers, and what each action does.
- `import` — reading the Excel workbook, ingredient lines, matching foods.
- `allowlist` — the invite-list script.
- `templates` — the starting layouts, the keyword suggestion, activity levels, the country list.
- `work` — work hours and the commute as repeating series, night shifts included; which series are kept, stopped or started.
- `settings` — personal settings always come out whole and sane.
- `timeframe` — a task's length as minutes or as an end time, across midnight.
- `notes` — the note's checklists, bullets, headings and bold; ticking; the toolbar.
- `quickfood` — meals as plain numbers (per 100 g and other sizes), and which figures the food pages and Today show.
- `stock` — typing and showing amounts, the −/+ steps, what an eaten meal takes and gives back, what a trip puts in stock.
- `pages` — which pages the bar has for which modules, their order, hidden pages, where a swipe lands, which addresses go to Today, and how each bar style shares the pages out.
- `daytabs` — which tabs Today shows for a day (only what is on and has something that day), their order, the fallback to Today.
- `colours` — module colours: the palette at 3:1 or more on both the light and the dark page, defaults, a task's module, choosing and resetting.
- `moduledefs` — module definitions read from storage are checked and cleaned (names, types, formulas, options,
  sizes); a built-in module's changes survive the stored overlay; a record's day; the rule that turns dated
  records into tasks; the keyword suggestion; every builder preset is a valid module.
- `calendar` — how far every view reaches (three years back, five ahead, whole months), the week strip stopping
  at the ends, and how the scrolling month calendar lays out and finds its months.

## Browser checks

They need the app built and served (`npm run build`, then
`npx vite preview --port 4173 --host 127.0.0.1`), and accounts to sign in as.
Make throwaway ones, run, and delete them afterwards:

```sh
export SB=<Supabase access token>  TEST_PASSWORD=<random>
export TEST_EMAIL=e2e-a@example.invalid TEST_NEW_EMAIL=e2e-b@example.invalid TEST_FEAT_EMAIL=e2e-c@example.invalid
export TEST_ONBOARD_EMAIL=e2e-d@example.invalid TEST_MODULES_EMAIL=e2e-e@example.invalid
node scripts/test-accounts.mjs create $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL $TEST_ONBOARD_EMAIL $TEST_MODULES_EMAIL
for t in onboarding features offline privacy tracking widget tasksheet repeat food stock daytabs modules nav layout tour; do node src/test/$t.e2e.mjs || break; done
node scripts/test-accounts.mjs delete $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL $TEST_ONBOARD_EMAIL $TEST_MODULES_EMAIL
```

Never commit the password or the token. Every query in these checks is scoped
to the test accounts, because they run against the live project.

- `onboarding` — the first-run wizard as a planner: where you are, work and commute, a template
  suggested from typed words, no body targets; then work hours changed and turned off in More.
- `features` — a tester's first ten minutes: tasks, meals, shopping, reminders, the policy.
- `food` — meals without preset times, a time added on the day, a meal as plain numbers reaching
  food_log, the figure chosen for Today (and none), all at 360 px.
- `offline` — works with the network cut, survives a reload offline, catches up after.
- `privacy` — the first-run wizard, sign-out leaves nothing on the device, account deletion.
- `tracking` — weigh-in, habits and supplements, the same tick from two offline phones,
  a repeating task, the evening review, the Excel import, an export read into another account.
- `tour` — walks every screen and reports what rendered.
- `widget` — the app’s side of the Android widget, with a stand-in for the native bridge:
  what it is sent, ticks applied while open and after a restart, cleared on sign-out.
- `tasksheet` — a task with a time range, a checklist note ticked on its page, the chip on Today.
- `repeat` — a task repeating on days picked in the sheet's calendar (Clear, the count, one day past the eight
  weeks the series fills), what Postgres holds, "every few days", Plan's Year as scrolling months with the
  far day marked as a planned repeat and opening its week, and the header's calendar reaching three years
  back and five ahead.
- `stock` — the cupboard: add by search, adjust, remove; the trip less stock; ingredients
  taken out when a meal is eaten and put back when it is unticked.
- `daytabs` — Today's tabs follow the day: none on a Minimal planner, Habits once a habit is due, no
  Work on a day without it; the rail's colour marker on and off, and a colour reaching profile.settings.
- `modules` — a module built from the Expenses preset, a dated record in Postgres, the rule that puts it on
  Today as a task, a field added in the editor, a night on the Sleep page, a built-in field renamed.
- `layout` — opens every screen and tab at 360 px wide and fails if anything runs off the side
  or sits under the floating add button.

## Database — `supabase/test.sh`

Runs `supabase/tests/security.sql`: 30 attacks on the database — reading another
account's data, taking over a household, writing to shared catalogue rows,
signing up uninvited, deleting an account and what it leaves behind. It runs in
a transaction that rolls back, so it is safe against the live project.
