# Checks

## Rule checks — `npm run check`

Types, then every check that needs nothing but Node. CI runs the same command.

- `calc` — BMR, maintenance, goal adjustments, protein, macros, packs, meal sizing.
- `formula` — the calculated-field parser, including that a formula cannot reach the page.
- `notify` — quiet hours across midnight, reminder wording.
- `body` — weigh-in parsing, the 7-day trend, when targets are recalculated.
- `series` — repeat rules (every N days and days picked by hand included), laying out days, "only this one" and
  "this and following", and the planned repeats shown past the eight weeks the fill turns into tasks. A series
  from the one repeat control (every kind a task takes, after N times, picked days' own bounds), whether its rule
  changed, and a rule changed for all days or from one day on (which days keep their task).
- `tracking` — habit schedules and streaks, supplement slots.
  "this and following", and the planned repeats shown past the eight weeks the fill turns into tasks.
- `tracking` — habit schedules and streaks, supplement slots; with version 16 any schedule's streak (days, weeks or
  times), the forgiving strength %, the month and year history grids, a pinned checklist ticked per day, count words,
  time of day, the person's own supplement slots and a schedule per supplement.
- `review` — which tasks the evening review offers, and what each action does.
- `import` — reading the Excel workbook, ingredient lines, matching foods.
- `allowlist` — the invite-list script.
- `templates` — the starting layouts, the keyword suggestion, activity levels, the country list.
- `work` — work hours and the commute as repeating series, night shifts included; which series are kept, stopped or started.
- `settings` — personal settings always come out whole and sane.
- `timeframe` — a task's length as minutes or as an end time, across midnight.
- `notes` — the note's checklists, bullets, headings and bold; ticking; the toolbar; moving items up, down or by
  drag with the items under them, indenting, ticked items drawn last, and the codes the editor keeps out of sight.
- `quickfood` — meals as plain numbers (per 100 g and other sizes), and which figures the food pages and Today show.
- `stock` — typing and showing amounts, the −/+ steps, what an eaten meal takes and gives back, what a trip puts in stock.
- `pages` — which pages the bar has for which modules, their order, hidden pages, where a swipe lands, which addresses go to Today, and how each bar style shares the pages out.
- `daytabs` — which tabs Today shows for a day (only what is on and has something that day), their order, the fallback to Today.
- `colours` — module colours: the palette at 3:1 or more on both the light and the dark page, defaults, a task's module, choosing and resetting.
- `moduledefs` — module definitions read from storage are checked and cleaned (names, types, formulas, options,
  sizes); a built-in module's changes survive the stored overlay; a record's day; the rule that turns dated
  records into tasks; the keyword suggestion; every builder preset is a valid module. What board, grid and
  chart views go by, their stored settings, and a view that cannot draw stopping a save. Every built-in rule
  says whether the app acts on it; only those have switches, and a switch stored off reads as off.
- `calendar` — how far every view reaches (three years back, five ahead, whole months), the week strip stopping
  at the ends, and how the scrolling month calendar lays out and finds its months (one column, or several
  side by side on a wide screen).
- `reorder` — moving tasks by hand: a drag on Today stays among its kind (timed or not), timed tasks swap
  times with the one they land on, untimed ones take new order numbers; the warnings asked first (locked,
  fixed, locked work hours, a new clash); swapping two days on Plan's week and moving one task to a day; push 15/30/60
  going past midnight onto the next day (never round the clock), flagging on the third push, and an untimed task
  asking for a time (with one offered: now plus the push, rounded up to five minutes).
- `holidays` — public holidays: the country list matches date-holidays, only public holidays come through
  (King's Day on 27 April 2026 in NL, Unity Day on 3 October in DE), several-day holidays, the years worked
  out, colours picked without clashing, adding and removing countries, several countries on one day, the names.
- `stats` — the Stats page's arithmetic: day, week, month and year ranges (weeks from Monday, month ends, leap
  years), the arrows' reach, totals and averages that never count days still to come, best day, the bars per day or
  month, shares done, habit and supplement due days, hours slept, record fields, the export rows; and the facts the
  builder reads: habits due by their own schedules (today not yet missed, times a week owed on the Sunday once it has
  passed, a habit put away keeping its ticks), chores done by whom and overdue (never a flexible one), bedtimes after
  midnight.
- `pivot` — the stats pivot: days, weeks, months and weekdays as buckets (Monday first, year ends), groupings by section,
  item, tag and multi-choice field, filters (case and accents ignored, values, weekdays, days); each summary worked out by
  hand (total, average over days that happened only, lowest, highest, latest, change, streak with today still open, best
  streak, a share skipping days with nothing to do, % of days on target with a floor, a ceiling or the person's own
  targets); unknown days left out and never 0, a week still to come with no figure; rows by columns with totals from the
  facts, sorting by value, a measure no module gives reported; the facts behind a cell; days with against days without
  (and "too few days" below three each side); the heat grid (calendar or year in pixels, unknown days apart from 0, no 30
  February); export rows.
- `statsviews` — saved stats views read strictly (bad ids, names, measures, groupings, colours, ranges dropped; old views
  still read; at most 50 views and 10 measures), the measure catalogue for every module (built modules' number, yes/no
  and choice fields), the ready-made views and which modules they need, making, duplicating, moving and deleting views,
  ranges (last n days, this week, month and year, custom; shifted back and on), the chart picked automatically, series
  colours checked for contrast on the page, the text summary, the widget shape, and Today's cards.
- `ics` — calendar files (RFC 5545): tasks as floating local time or whole days, agenda events in UTC,
  repeats as RRULE/RDATE/EXDATE with changed copies; folding at 75 bytes, escaping, CRLF, stable UIDs. A file
  shaped like a Google Calendar export read back in the reader's zone (TZID, UTC, whole days, DURATION,
  moved and cancelled repeats); every app rule written as RRULE lands on the same days both ways.
- `transfer` — import and export: CSV per RFC 4180 with Excel's byte-order mark and no formula injection,
  semicolon CSV, JSON; columns matched by name, label or Google Calendar's headers; dates, times and
  numbers as spreadsheets write them; each row's problems, required columns, server limits, duplicates by
  natural key; the dataset catalogue, ranges, file names, figures for charts.
- `views` — a module's board, grid and chart: columns by option (and one for none), where a card can move;
  the grid's last 7/14/30 days, its rows, cells ticked or counted, what a tap does, runs of days; the chart's
  sums per day, week (from Monday) and month (leap years), the future left out, calculated fields, the axis.
- `books` — recipe and food books: read strictly (at most 50, 60-character names, 500 rows, swatch colours),
  a book filtering its tab, rows that have gone pruned, making, renaming, colouring and deleting books, adding
  and removing rows; only one's own rows deleted with a note for catalogue ones; ingredients of several recipes
  added up by food and unit for one batch each, rounded, as plain text.
- `sharing` — recipes kept private or proposed to everyone: the status chips (Private, Waiting for review,
  Shared with everyone, Not accepted with the reviewer's note), what saving does (a changed approved recipe goes
  back for review; the owner can never reach "shared" or "not accepted" by choosing), foods only the author can
  see, which recipes a device keeps (never someone else's proposal, even for a reviewer), the reviewer's note,
  the author's name (never an address), and the recipe editor's form and what a save changes.
- `calendarlinks` — calendar links: the three months back to twelve ahead both directions keep (month ends, leap
  years); what the feed link Google Calendar reads holds (timed and whole-day tasks, a repeating series once with its
  RRULE and skipped days, own agenda events, a calendar called just GetIt) and leaves out (dropped, deleted and undated
  tasks, events from a followed calendar, notes unless turned on, and anything about health: a planned meal with its
  kcal, training, a weigh-in, sleep, habits, supplements, by source, module or section, and series of those; the health
  lists checked against the app's modules and sections); repeats cut to the window (a daily repeat from 2020, every
  3 days, fortnightly, the 31st, a count of 400 and of 10, an end date, picked days: read back, their days are exactly
  the app's own in the window; no RRULE without an end; a repeat moved out of or into the window); the address of a
  calendar to follow (https only, webcal read as https, no name
  and password, no other port, no local names); the check that the server fetches only from the public internet
  (every private, loopback, link-local, metadata, documentation and multicast range in IPv4 and IPv6, and IPv6 that
  carries an IPv4 address); a followed calendar's events laid out in the window (a daily repeat from 2020, the clock
  change, several-day events, no UID); the plan that makes the device match the file (added, changed, gone, a second
  copy); when to fetch again (a calendar that failed waits an hour, unless Refresh now); what may go in a log (the
  server's name and the kind of error, never the secret address); and that the server functions' copies in
  `supabase/functions/_shared` are up to date.

- `accounts` — several accounts on one device: the saved list (added, brought up to date, renamed, removed, most
  recently used first, at most five with the open one counted), addresses masked as `e•••@gmail.com`, what storage
  gives back cleaned (no tokens in a browser), the screens never given a token, and what switching or adding needs
  (online, nothing waiting to be sent; the phone's unlock with a screen lock and a saved token, the password otherwise).
- `products` — supermarket products from Open Food Facts: barcodes (EAN-13, EAN-8, UPC-A and UPC-E, the check digit,
  one spelling per product), a product from a lookup or either search read into a food's figures per 100 g (kcal
  worked out from kJ when that is all there is, fibre's other spellings, unknown left unknown), the rest of the EU
  label (kJ, saturates, mono- and polyunsaturates, sugars, polyols, starch, salt or sodium × 2.5, alcohol from % vol),
  the table in the label's order, per 100 ml for drinks, Nutri-Score, the v3 lookup and the app's User-Agent,
  the pack size from grams, millilitres or "6 x 50 g", shop names tidied ("Ah" is Albert Heijn), the food row it
  becomes and finding one already kept (or deleted) with that barcode, packs into grams for stock, shared prices
  (the latest per shop, per kilo, the day, offers), and the limiter and cache that keep under Open Food Facts' limits.
- `sync` — name-based ids (UUID version 5) against the standard's own examples; a scanned product's fixed id (the same
  person and barcode give the same id on every phone, however the barcode was typed); natural keys (a food's barcode
  counts only while the food is live); a food folded into its twin taking its stock, ingredients, food log, records,
  books and waiting edits along; fetching page by page in updated_at and key order, so rows sharing one time are never
  skipped at a page's edge or fetched twice, and the next sync starts exactly after the last row; settings merged key by
  key between two devices (one's theme, the other's note template), what 026 added (shopping list, chores) synced like
  the rest, and the light pull every two minutes and on coming back.
- `units` — food counted in units as well as grams (022): a food's units read strictly (at most eight, a name of up to
  24 characters that is not a weight, 0.1 to 5000 g each, each name once), plurals ("2 eggs", "0.5 cup", "2 tbsp"),
  numbers as typed (a comma, ½, 3/4, 1 1/2, 1½ and the fraction slash), an amount in a unit and the grams it comes to,
  the saved grams standing when a unit's weight changes later (a count shown only while it is within 5% of the grams,
  so one an older version left stale reads as grams), stock of a food not on this device keeping its unit, which
  columns a write carries (none for plain grams, so a server before 022 still takes
  it), counts added up only when every line used the same unit, stock kept in a unit and its −/+ by one, Open Food
  Facts' serving sizes ("1 egg (50 g)", "2 biscuits (25 g)", "30g"), the units cell of an export, and a workbook's
  "1 large (50g)" or "2 slices". `books`, `quickfood`, `import`, `products` and `sharing` check their parts too.
- `schedule` — the one repeat engine (schedule-rules.ts): every rule kind (daily, weekdays, weekends, weekly, every
  N weeks, monthly, the nth or last weekday of a month, yearly with 29 February, dates, times a week), start and end
  dates, a habit's day (due, done, met for the week, off), chores (fixed, a set time after last done, flexible),
  who a chore goes to (rotation each time, each week, least recent), and the plain-words description of each.
- `search` — the one search: accents and case ignored, every word in any order, starts-with first, own things first,
  plainer names first, extra text searched, nothing typed A to Z.
- `afterdone` — "ask after done" templates: the marker line in a note, what Fill in, Skip and Later leave behind.
- `repeat` — the one repeat control's choices: the rule each stands for from a first day (the 2nd or last Wednesday,
  the 14th, 14 October), numbers kept and capped, picked days, and every choice reading back as itself.
- `visibility` — only what is switched on appears: the one rule for which modules are on (a built module must still
  exist), the five switches per module (Today, Plan, widget, Stats, reminders) and how one is saved, what each template
  sets (every module's switches, Today's cards only for modules kept on), and which built-in rules the editor shows.
- `settingsui` — the rules behind Settings: search in settings, profiles (which one opens, names, which can go),
  signing out with changes waiting, the merges list in words (refused, never "[object Object]"), the time zone
  following the phone or a chosen one, height emptied as not known, tips shown once and "Make GetIt yours" after
  three days, what moved where (once, only to people from before), and the Modules page's search.
- `restore` — a backup brings the profile back whole: body fields, country and city, and the settings (note
  templates, stats views, looks, Today's cards, where each module shows), with a built module's settings following
  it to its new key; a restore never sends the person back through setup.
- `copy` — Copy to… (copy-rules.ts): the remembered choices read back sanely; the shortcuts (Tomorrow or the day
  after, every weekday left this week, the same day next week, the next week or four); days picked, cleaned and
  toggled (never a day or week onto itself, weeks as Mondays, at most a year); what a copy holds (same notes,
  ticks cleared, none, a note template filled in or left as its ask-after-done marker; same, new or no time;
  section, length and lock kept or not; always a fresh one-off); what a day or week copy brings (not meal or
  shopping tasks, repeats only when asked and never onto a day their series fills, meals with food, after what
  the day holds); the words after a copy.
- `plan` — Plan's views (plan-view-rules.ts): the view and day in the address; the week of 1 to 14 days (whole
  weeks from Monday, other lengths from the day), its arrows and words; the waking day, minutes planned, heat
  and busy-ness in words; the Inbox's hand-sorted order; task sections only from modules that are on, plus the
  person's own; the Plan choices kept in the core module's settings. Day and week templates
  (plan-templates-rules.ts): made from a day or week (ticks cleared, meals with their task's title, repeats only
  when asked), stored and read back strictly, dropped onto a day or that day's week.
- `tasksheet` — the task sheet's pure parts (task-sheet-rules.ts): Duplicate keeps what was set and starts fresh;
  Save as template keeps title, length, section, lock, note and repeat; a new task from a template, its note
  template filled for the day.
- `dayitems` — one day's items from every module: switched-off modules and the person's "Show on Today" respected,
  own and followed events in local time (an event at 00:30 on the right day), all-day and long events at the top, a
  count habit's count and a checklist habit's ticks from the newest log, supplement slots as one item in slot order;
  the timeline and the morning / afternoon / evening layout (slots in their part); where the "now" line goes; "Mark it
  done?" only after the last tick; a slot's one tick; carry-over and the Inbox.
- `todayprefs` — Today's own choices kept in the core module's settings, read back clean (layout, the + menu's counts,
  hidden entries and own order); the + menu: six at most, most used first, the person's own order winning, hidden
  entries listed apart and never lost, counts halved now and then.
- `hold` — the two-stage hold: a tap opens, moving before the short hold is a scroll (never a drag), the short hold
  arms the drag and a move then drags, holding still to the long hold expands, letting go in between does nothing,
  rows that cannot be dragged only expand; when the clock next matters; the hold times kept sane.
- `notetemplates` — note templates: fill-ins ({date}, {weekday}, {time}, {title}, {day count}), the plain-word chips,
  putting a template in a note or asking for it after the task, keeping the list (add, edit, order, remove and undo);
  recipes in notes: the block found again, "Update from recipe" only when the recipe changed (ticks kept), several
  recipes' ingredients added up.
- `household` — chores as a person reads them: calm words that never say overdue, the due-ness bar, the page's
  sections and rooms, a holiday pause with dates, light days and a daily cap for flexible chores, members' names,
  the starter packs, old chore records brought over; and the day's items carrying the person's supplement slots and
  chore limits.
- `training` — Training: a first guess at an exercise's muscle group from its name (whole words where it matters, the
  person's choice winning), own exercise names (none twice, accents aside), a routine line's targets and limits, last
  time's sets for the Previous column and what a session's sets start from, the rest timer (worked out from when it
  started), the figures Stats reads (sessions, sets, reps, volume, best set as an estimated one-rep max, heaviest load,
  per exercise and muscle group), past sessions by day and routine, and a routine's planned sessions as a task series:
  when to make, update, replace (new days) or end it, and which routine a session task opens.
- `sleep` — Sleep: the stored target read safely (the server's 8 hours and 22:00 by default), hours across midnight,
  bed and wake times from each other, late and early the short way round the clock, each night against the target,
  sleep debt over seven days (nights not logged are unknown, never zero), how regular bed and wake times are (around
  midnight too), and the bedtime block: when it starts, how long, locked or not, and none when it is off.
- `mealrules` — meals with no fixed slots: the person's meal names (and the old four), a typed name finding its meal,
  keys for new meals, default and own times, what each item is (a food, a recipe or ready meal, numbers) and comes to
  (unknown never 0), a day grouped into meals (cards for the person's meals, by time, "Any time" last, skipped and
  eaten meals), the meal's task title, id and status, copying meals to other days, the add sheet's first step (which
  meal, when, eaten already), recent foods, go-tos at this hour and the last amount, the plate's amounts in a unit or
  grams, and sizing the main meal.
- `savedmeals` — saved meals read strictly from the Nutrition module's settings, made from a meal, logged back as
  items, added, renamed (no two with one name), removed and sorted.
- `readymeal` — ready meals: a portion as the whole pack or the stated serving, the recipe of one line it is kept as,
  and the one already made for the same food found again.

- `trend` — trend weight: a moving average that weighs each weigh-in by the days since the last (10% a day), deleted
  and empty weigh-ins left out; the weekly rate from a straight line through the trend (none with too few weigh-ins or
  less than a week of them); the estimated date to reach a goal weight, and why there is none; the chart's scaling.
- `projects` — Projects and goals: a project's progress (dropped and deleted tasks left out), its next task, the order of
  its tasks and milestones; a goal's progress from a number kept by hand, from the tasks, projects and milestones linked
  to it, or from the body weight (losing or gaining); days left; what a goal may not be; and what the Year view lists
  (goals touching the year, open ones, dated projects while Projects is on).
- `finance` — Finance: the stored list read strictly (one level of categories, unique names, euros unless chosen),
  amounts as people type them (12,50 · 1.234,56 · 1,234.56), money written the British way, income and expense (old
  entries by their sign), a month's totals per category and per top-level one, budgets (a month's own winning, a
  top-level one counting what is under it, over marked), the fast entry's categories (most recent first), renaming,
  adding and dropping categories, planned payments (due days, one-offs, paused, the entry marking one paid makes), and
  their place on the day list: "Rent due" on its day, ticked once paid without its entry shown twice, nowhere while
  Finance is off or not shown there.
- `learning` — Learning and reading: the task a dated study block keeps on its day (at its start, as long as the block;
  none without a day or with the rule off; a done one left as it happened), the reading list read safely (statuses,
  pages, a rating of 1 to 5), progress and pages in words, what starting and finishing a book set, the list's order,
  books finished in a year, a reading task that asks for the "Reading reflection" once done, and minutes studied per
  day and per subject.
## Browser checks

They need the app built and served (`npm run build`, then
`npx vite preview --port 4173 --host 127.0.0.1`), and accounts to sign in as.
Make throwaway ones, run, and delete them afterwards:

```sh
export SB=<Supabase access token>  TEST_PASSWORD=<random>
export TEST_EMAIL=e2e-a@example.invalid TEST_NEW_EMAIL=e2e-b@example.invalid TEST_FEAT_EMAIL=e2e-c@example.invalid
export TEST_ONBOARD_EMAIL=e2e-d@example.invalid TEST_MODULES_EMAIL=e2e-e@example.invalid
node scripts/test-accounts.mjs create $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL $TEST_ONBOARD_EMAIL $TEST_MODULES_EMAIL
for t in onboarding features offline privacy tracking widget tasksheet repeat plan reorder food stock daytabs modules views nav holidays stats transfer books sharing accounts calendarlinks products units landscape layout tour; do node src/test/$t.e2e.mjs || break; done
node scripts/test-accounts.mjs delete $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL $TEST_ONBOARD_EMAIL $TEST_MODULES_EMAIL
```

Never commit the password or the token. Every query in these checks is scoped
to the test accounts, because they run against the live project.

- `onboarding` — the first-run wizard as a planner: where you are, work and commute, a template
  suggested from typed words, no body targets; then work hours changed and turned off in More.
- `features` — a tester's first ten minutes: tasks, meals, shopping, reminders, the policy.
- `food` — food logging with no fixed meals: the add-food sheet's two steps, a recipe planned under a meal named
  on the spot, a time given on the day, plain numbers eaten under another meal reaching food_log, unticking and
  ticking again, the meal's task on Today ticking the meal eaten (GEN-31), one's own meals as cards from a starting
  set, the figure chosen for Today (and none), all at 360 px. Needs migrations up to 027.
- `offline` — works with the network cut, survives a reload offline, catches up after.
- `privacy` — the first-run wizard, sign-out leaves nothing on the device, account deletion.
- `tracking` — weigh-in, habits and supplements, the same tick from two offline phones,
  a repeating task, the evening review, the Excel import, an export read into another account.
- `tour` — walks every screen and reports what rendered.
- `widget` — the app’s side of the Android widget, with a stand-in for the native bridge:
  what it is sent, ticks applied while open and after a restart, cleared on sign-out.
- `tasksheet` — a task with a time range (added through the round + menu's "Task"), a checklist note ticked on its
  page, the chip on Today.
- `repeat` — a task repeating on days picked in the sheet's calendar (Clear, the count, one day past the eight
  weeks the series fills), what Postgres holds, "every few days", Plan's Year as scrolling months with the
  far day marked as a planned repeat and opening its week, and the header's calendar reaching three years
  back and five ahead.
- `plan` — at 360 px: the Inbox from its address, a task captured with no day, "Plan for…" Tomorrow and Undo
  sending it back; a task on the Week view opened, copied to the next day with ticks cleared (Postgres holds
  two independent tasks), Back closing the sheet, and a three-day week.
- `reorder` — at 360 px: hold and drag on Today (timed tasks swap times, untimed ones slide into place), the sheet
  that asks before a clash, Move up and Move down among the row's actions in the ⋮ menu, taps still tick and open,
  the two-stage hold (held still for the long time the row opens in place with its actions and nothing moves; let go
  between the stages nothing happens), Undo after a drag putting the order back, a held drag never swipes the page; on Plan's week, two days swapped (a locked task stays) and one task dragged onto a day.
- `stock` — the cupboard: add by search, adjust, remove; the trip less stock; ingredients
  taken out when a meal is eaten and put back when it is unticked.
- `daytabs` — Today's tabs follow the day: none on a Minimal planner, Habits once a habit is due, no
  Work on a day without it; the rail's colour marker on and off, and a colour reaching profile.settings.
- `modules` — a module built from the Expenses preset, a dated record in Postgres, the rule that puts it on
  Today as a task, a field added in the editor, a night on the Sleep page, a built-in field renamed.
- `views` (uses `TEST_MODULES_EMAIL`, after `modules`) — at 360 px: a module built with Board, Grid and Chart
  views; a card moved by holding and dragging and by its Move menu, both reaching Postgres; a grid cell ticked
  (a record for that day); the chart's bars and a value read out on tap; no overflow. Then Habits' "appears on
  every day" rule switched off: its Habits tab leaves Today, and comes back when switched on.
- `holidays` — public holidays: the profile's country offered with one tap, Germany added by search,
  both in profile.settings in different colours; the next Dutch or German holiday marked in Plan's
  Month (colours, names, legend, 3:1 contrast) and Week; a chip on Today only on a holiday; removing one.
- `stats` — the Stats page at 360 px in light and dark: today's tasks and a habit tick on the Day tab, a chart
  and no overflow on Week, Month and Year, the arrows stopping three years back, and "Show switched-off modules"
  bringing a switched-off card and reaching profile.settings; every measure on the Tasks card; the builder at 360 px
  saving a view of tasks done to profile.settings.stats_views with its card on Today (today_cards); /stats?view=<id>
  opening it; its table; Delete and Undo.
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
- `books` (uses `TEST_FEAT_EMAIL`) — at 360 px: a recipe book made, two own recipes added by long-press and
  Select, the book filtering the table, their ingredients copied (read back from the clipboard), one own recipe
  deleted after the confirm sheet (deleted_at in Postgres), a catalogue recipe refused with a note.
- `sharing` (uses `TEST_ONBOARD_EMAIL` as the author and `TEST_FEAT_EMAIL` as the other account; needs migration
  019) — a recipe written in the editor and proposed, which the other account cannot read; that account made a
  reviewer for the run (a row in `app_admin`, removed at the end), finding it in More → Data → Recipes to review
  and not among its own recipes, and approving it; then it can read it and has it locally, and the author sees
  "Shared with everyone". At 360 px.
- `calendarlinks` (uses `TEST_FEAT_EMAIL`, and `TEST_ONBOARD_EMAIL` as the other account; needs migrations 020 and 024
  and both calendar functions deployed) — at 360 px: a feed link made in More → Profile → Calendar links and copied,
  fetched as Google would (200, text/calendar, named just GetIt, a task as a VEVENT at its time, a planned meal never,
  its note only once notes are turned on, the other account's task never), a wrong or missing token getting 404; the
  other account's feed link followed as if it were Google's secret address, its task on Today at its time, from that
  calendar (the sheet waits for the name to load), opening read-only, with no copy of it in Postgres; removing the
  calendar taking its events off the device and its address off the server, and the link turned off answering 404.

- `accounts` (uses `TEST_EMAIL` and `TEST_ONBOARD_EMAIL`, in a browser, so switching asks for the password) — the
  second account added from More → Data → Account, switching back and forth with nothing waiting to be sent,
  each account's own task on Today and never the other's, a wrong password and going offline changing nothing,
  the second account removed, and no token ever written to the browser's storage.

- `products` (uses `TEST_FEAT_EMAIL`; needs migration 021; asks Open Food Facts for real, three searches and lookups
  at most) — at 360 px: "hagelslag" found through Find in stores with a Dutch shop listed, one added to the
  account's foods (in Postgres with its barcode and source 'off'); its barcode typed in the scan sheet opens the
  food already kept instead of adding a second; the product page's prices section shows prices or "No shared
  prices yet", with both attribution lines; nothing runs off the side.

- `units` (uses `TEST_FEAT_EMAIL`; needs migration 022) — at 360 px: an own food "E2E eggs" given the unit egg of 50 g on
  its page (Foods → Open), in Postgres; a recipe written as 2 eggs a portion, saved as unit egg, 2, 100 g, counting
  143 kcal a portion and reading 2 eggs when opened again; its copied ingredient list saying "E2E eggs — 2 eggs"; 12
  eggs put in stock reading "12 eggs" and held as 600 g with the unit in Postgres, and + adding one egg (650 g).

## Database — `supabase/test.sh`

Runs `supabase/tests/security.sql`: 112 checks on the database — reading another
account's data, taking over a household, writing to shared catalogue rows,
signing up uninvited, deleting an account and what it leaves behind, calendar
links (a feed link only its owner can make, whose hash no one can read back or
set, replaced by a new one; followed calendars and their events private, https
only, and an event unable to hang off someone else's calendar; a followed
calendar needing an address, a removed one losing it and unable to come back
without one, 024), and recipe
sharing: a proposal no one else can read, an owner who cannot approve their own
or call the review, a reviewer (one of the throwaway users, made one for the run)
who can, an approved recipe changed and sent back, the reviewer list readable
only for your own row; and scanned products (021): another account's cannot be read or changed, the same product
kept once per person, a barcode that is not 8 to 14 digits or a picture link that is not https refused; and food units (022): a food's
units only its owner can change (not a stranger, not the catalogue), a list that is not one, more than eight, a weight
of nothing or past 5 kg or written as text, no name, a long name, grams as a unit, extra keys, a name twice refused;
an ingredient's unit without how many refused, 2 eggs and 12 eggs of stock taken, and the catalogue's eggs of 50 g; and
household foods (025): a food one member scanned into the shared cupboard readable by another member but not changeable,
their other foods still private, nothing readable from outside the household, a stranger's food put in one's own
cupboard still unreadable, and the food private again once it leaves the cupboard. It runs in
a transaction that rolls back, so it is safe against the live project.
