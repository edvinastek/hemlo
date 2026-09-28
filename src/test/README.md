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
  at the ends, and how the scrolling month calendar lays out and finds its months (one column, or several
  side by side on a wide screen).
- `reorder` — moving tasks by hand: a drag on Today stays among its kind (timed or not), timed tasks swap
  times with the one they land on, untimed ones take new order numbers; the warnings asked first (locked,
  fixed, locked work hours, a new clash); swapping two days on Plan's week and moving one task to a day.
- `holidays` — public holidays: the country list matches date-holidays, only public holidays come through
  (King's Day on 27 April 2026 in NL, Unity Day on 3 October in DE), several-day holidays, the years worked
  out, colours picked without clashing, adding and removing countries, several countries on one day, the names.
- `stats` — the Stats page's arithmetic: day, week, month and year ranges (weeks from Monday, month ends, leap
  years), the arrows' reach, totals and averages that never count days still to come, best day, the bars per day or
  month, shares done, habit and supplement due days, hours slept, record fields, the export rows.
- `ics` — calendar files (RFC 5545): tasks as floating local time or whole days, agenda events in UTC,
  repeats as RRULE/RDATE/EXDATE with changed copies; folding at 75 bytes, escaping, CRLF, stable UIDs. A file
  shaped like a Google Calendar export read back in the reader's zone (TZID, UTC, whole days, DURATION,
  moved and cancelled repeats); every app rule written as RRULE lands on the same days both ways.
- `transfer` — import and export: CSV per RFC 4180 with Excel's byte-order mark and no formula injection,
  semicolon CSV, JSON; columns matched by name, label or Google Calendar's headers; dates, times and
  numbers as spreadsheets write them; each row's problems, required columns, server limits, duplicates by
  natural key; the dataset catalogue, ranges, file names, figures for charts.

## Browser checks

They need the app built and served (`npm run build`, then
`npx vite preview --port 4173 --host 127.0.0.1`), and accounts to sign in as.
Make throwaway ones, run, and delete them afterwards:

```sh
export SB=<Supabase access token>  TEST_PASSWORD=<random>
export TEST_EMAIL=e2e-a@example.invalid TEST_NEW_EMAIL=e2e-b@example.invalid TEST_FEAT_EMAIL=e2e-c@example.invalid
export TEST_ONBOARD_EMAIL=e2e-d@example.invalid TEST_MODULES_EMAIL=e2e-e@example.invalid
node scripts/test-accounts.mjs create $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL $TEST_ONBOARD_EMAIL $TEST_MODULES_EMAIL
for t in onboarding features offline privacy tracking widget tasksheet repeat reorder food stock daytabs modules nav holidays stats transfer layout landscape tour; do node src/test/$t.e2e.mjs || break; done
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
- `reorder` — at 360 px: hold and drag on Today (timed tasks swap times, untimed ones slide into place), the sheet
  that asks before a clash, Move up and Move down in the ⋮ menu, taps still tick and open, a held drag never
  swipes the page; on Plan's week, two days swapped (a locked task stays) and one task dragged onto a day.
- `stock` — the cupboard: add by search, adjust, remove; the trip less stock; ingredients
  taken out when a meal is eaten and put back when it is unticked.
- `daytabs` — Today's tabs follow the day: none on a Minimal planner, Habits once a habit is due, no
  Work on a day without it; the rail's colour marker on and off, and a colour reaching profile.settings.
- `modules` — a module built from the Expenses preset, a dated record in Postgres, the rule that puts it on
  Today as a task, a field added in the editor, a night on the Sleep page, a built-in field renamed.
- `holidays` — public holidays: the profile's country offered with one tap, Germany added by search,
  both in profile.settings in different colours; the next Dutch or German holiday marked in Plan's
  Month (colours, names, legend, 3:1 contrast) and Week; a chip on Today only on a holiday; removing one.
- `stats` — the Stats page at 360 px in light and dark: today's tasks and a habit tick on the Day tab, a chart
  and no overflow on Week, Month and Year, the arrows stopping three years back, and "Show switched-off modules"
  bringing a switched-off card and reaching profile.settings.
- `layout` — opens every screen and tab at 360 px wide and fails if anything runs off the side
  or sits under the floating add button.
- `landscape` — the same walk through every screen and tab on a phone turned sideways (844 × 390 and 740 × 360)
  and a desktop window (1280 × 800): nothing runs off the side, the page bar is a column at the left (the rail
  on a phone), nothing in the page or the bar sits under the add button, the new task sheet and the "go to a
  day" calendar fit with Save or Close in view, and on the 740 px phone the drawer style's pages open beside
  the rail (the style is put back afterwards).
- `transfer` (uses `TEST_FEAT_EMAIL`) — a Finance entry exported as CSV from its page's Export link
  (clear of the add button), read back in through More → Data → Import and export and found in Postgres,
  the same file again adding nothing; a calendar file into Tasks, its weekly repeat kept as a series.

## Database — `supabase/test.sh`

Runs `supabase/tests/security.sql`: 30 attacks on the database — reading another
account's data, taking over a household, writing to shared catalogue rows,
signing up uninvited, deleting an account and what it leaves behind. It runs in
a transaction that rolls back, so it is safe against the live project.
