---
title: "GetIt — Requirements and Specification"
subtitle: "Every requirement, the app as built in version 15, and what the next version must change"
author: "Prepared for Edvinas Straigis"
date: "5 October 2026 (statuses updated for version 19, the final development version)"
---

# Part A. About this document

## A1. What it is for

This is the single reference for GetIt. It holds:

- **every requirement** the owner has given, from the first brief to the feedback of 1 October 2026, each with an ID, a priority and its status in version 15;
- **the specification of the app as it is built today** (version 15), read from the code, including its rough edges;
- **the gaps** between the two;
- **the reference data** the next version needs: EU food labelling rules, unit weights for food sold per piece, activity levels for the calorie budget, and a review of the shared food catalogue.

The competitor comparison and the usability plan are in the second document ("GetIt — Competitors and Usability"). The colour themes and app icons are on the design page ("GetIt — Looks").

## A2. How to read it

| Part | What it holds |
|--------|------------------------------------------------------------------------------------------------------|
| A | This introduction |
| B | Vision, product principles and the decisions already made |
| C | Analysis of the feedback of 1 October 2026, item by item |
| D | The requirements register: every requirement, by area |
| E | Specification of the planner core as built (v15) |
| F | Specification of the modules as built (v15) |
| G | Known gaps and defects, mapped to requirements |
| H | Reference data: EU labelling, unit weights, activity levels, catalogue review |
| I | Glossary |

**Requirement IDs** are an area code and a number, for example `HAB-04`. The area codes are listed at the start of Part D.

**Priority:**

- **Must**: needed in the next version (16) for the closed test to feel finished.
- **Should**: next after that (version 17).
- **Could**: later, or when there is demand.

**Status (updated for version 18, 4 October 2026):**

- **Done (v19)**: built in version 19 (the remaining Could requirements and the release tooling) and checked the same way: rule checks, the security suite on a local database with every migration, and every new screen at 360 px in light and dark. Version 19's database changes (migrations 033 to 039) and its server functions go live together when the owner runs the release (docs/release.md); the parts that need a phone are listed in store/phone-tests.md.
- **Done (v18)**: built in version 18 (the gaps a code audit of every requirement and competitor recommendation found) and checked the same way.
- **Done (v17)**: built in version 17 (calm by default, prices) and checked the same way.
- **Done (v16)**: built in version 16 and checked (rule checks, the security suite, and every screen at 360 px in light and dark); the end-to-end tests against the live project still to run.
- **Done**: built and tested in an earlier version.
- **Partly**: built, but missing something the requirement asks for (the cell says what).
- **Open**: not built.

**Source** says which round of feedback asked for it:

| Code | Round | When |
|--------|----------------------------------------------------------------------------------|--------------------|
| R1 | First brief and planning conversations | 21–26 Sep 2026 |
| R2 | First test on the phone (batch 1) | 27 Sep 2026 |
| R3 | Batches 2–5: modular app, planning power, data, food and people | 27 Sep 2026 |
| R4 | Release decisions: calendar links, products, units, email, AI | 28 Sep 2026 |
| R5 | Feedback of 1 Oct 2026 | 1 Oct 2026 |
| R6 | Feedback after testing version 16: clutter, prices | 3 Oct 2026 |
| R7 | Owner request: iPhone app | 5 Oct 2026 |
| SR | Found by the specification and research work (not asked for, but needed for the asked-for result) | 1 Oct 2026 |

Parts E and F describe the app **as it is**. Where they say something is missing, Part D says what it should become.

## A3. Corrections to the specification since it was read from the code

The specification in Parts E and F was read from commit `02c9d7f`. Three statements in it were already out of date and are corrected here:

1. **Migration 025 (household members can read foods in the shared cupboard) is applied** to the live database. Part F section 2.3 says "Not applied yet"; that is no longer true.
2. **Email confirmation on sign-up is off** (accounts are confirmed automatically and stay password-protected). The "check your email" note appears only if confirmation is ever switched back on.
3. **The public pages (privacy policy, account deletion) will be hosted on Netlify Drop**, not Cloudflare. The privacy policy text that names Cloudflare must change when the pages are published (requirement `PLAT-07`).

# Part B. Vision, principles and decisions

## B1. Vision

GetIt ("get it together") is a **planner first and a life tracker second**. A person sets it up for their own life and uses only what they need. Most people will switch on a handful of modules; a few will switch on all of them. Either way:

- what is switched off is **invisible everywhere** (pages, tabs, lists, sections, settings, stats, widget), and nothing is lost by switching it off;
- what is switched on is **finished**: every module works end to end, links to the others where that saves effort, and can be shaped by the person (fields, views, schedules, names, colours);
- the person has **spreadsheet-like freedom** (any field, any view, copy anything anywhere, templates, stats built the way they want) without the spreadsheet's work: dates, repeats, reminders, a daily view and a home-screen widget come with it.

Positioning (from the research): *Notion-level freedom and spreadsheet-level stats, with the speed of Google Keep and Structured, on an Android home screen.*

## B2. Product principles

These apply to every requirement. Where a requirement seems to break one, the principle wins and the requirement is re-read.

| # | Principle | What it means in practice |
|-------|--------------------------|-----------------------------------------------------------------------------|
| P1 | **Only what is switched on appears** | A module that is off shows nowhere: not in the page bar, Today, Plan, task sections, add menus, search, Stats, the widget, the export list or the colour list. One function decides "is this on", and every screen uses it. |
| P2 | **Nothing is lost** | Switching off, hiding, moving or restructuring never deletes data. Every change to the layout keeps every function reachable. |
| P3 | **Today is for doing, Plan is for arranging** | Today answers "what do I do now?". Plan answers "when will I do it?". They never do the same job twice (Part C, item F28). |
| P4 | **One way to do each kind of thing** | One search, one repeat sheet, one add sheet, one amount-and-unit field, one copy dialog, one template system, one long-press rule. A person who learns it once can use it everywhere. |
| P5 | **Linked, not siloed** | Modules feed each other where it saves typing: recipes into task notes and the shopping list, the shopping list into stock and the agenda, meals into Today, everything into Stats. |
| P6 | **The person decides** | Freedom is the point: every module, field, view, schedule, chart, colour and layout can be shaped by the person, and nothing has to be. Every module works out of the box with sensible defaults, and every default can be changed. |
| P7 | **Local-first** | Everything works offline. Changes are written on the device first and synced when there is a connection. |
| P8 | **Honest numbers** | Unknown is never shown as zero. Every calculated figure can show its working. Food figures follow the EU labelling rules. |
| P9 | **Calm and accessible** | Usable at 360 px wide, light and dark, 48 dp touch targets, colour never the only signal, every gesture also reachable from a visible button. |
| P10 | **Plain English** | English only, British spelling, short plain sentences, no emoji in the interface. |
| P11 | **Private by default** | Health data stays with the person. Nothing is shared or sent anywhere they did not choose. |

## B3. Decisions already made by the owner

These are settled. Requirements in Part D follow them.

| Area | Decision | When |
|---------------|-------------------------------------------------------------------------------------|---------|
| Product | GetIt is a planner first; body tracking, targets, work hours, commute and protein display are all optional | R1–R2 |
| Product | All modules exist at launch: nutrition, shopping, training, habits, supplements, health, learning, agenda, sleep, projects, finance, household, stats, custom | R1, R3 |
| Product | GetIt stays a planner: no built-in diet or training strategies; the person's own plan lives in their profile, not in the app | R1 |
| Product | The owner's personal data (bedtime, protein plan, girlfriend's profile, own schedule) stays out of the app's defaults | R1 |
| Product | Setup templates now; AI-built setups maybe later | R2 |
| Language | English only | R1 |
| Platforms | One React/TypeScript codebase: Android (Capacitor) first, Windows (Tauri) and web kept up to date; iPhone later | R1 |
| Platforms | Android package `app.visuma.planner` | R1 |
| Accounts | Log in from anywhere, data synced (Supabase, EU region) | R1 |
| Accounts | Several accounts on one phone; switching asks for the phone's own unlock | R3 |
| Accounts | Email confirmation on sign-up is off; accounts stay password-protected | R4 |
| Reminders | Local notifications, off by default, within a few minutes of the time (no exact-alarm permission) | R1 |
| Reminders | Reminders should feel like a person reminding you; the name is the person's choice | R1 |
| Review | Unfinished tasks are offered for review after a set time (default 21:00) and flagged after being moved 3 times | R1 |
| Views | Year (overview) → month → week (headers) → day (full detail) | R1 |
| Look | Today between a notebook page and a time rail (paper page with a vertical time rail) | R1 |
| Recipes | Importable and exportable, starting from the owner's Excel files | R1 |
| Recipes | Community recipes are approved one by one by the owner before anyone else sees them | R3 |
| Shopping | Shops by the person's location; later, supermarkets' weekly online catalogues | R1 |
| Shopping | Products from Open Food Facts, with barcode scanning | R4 |
| Calendar | Google Calendar through calendar links (a feed out, iCal subscriptions in), not the Google API | R4 |
| AI | Everything AI is hidden for now. If it comes, it edits and adjusts the planner when asked; it does not plan by itself | R4 |
| Food | Food entries can be counted in units (eggs, slices) as well as grams | R4 |
| Release | Google Play closed test first; the upload key is made by the owner on his own computer | R4 |
| Legal | Data controller named "Edvinas Straigis"; contact through a new GetIt address (to be created); public pages on Netlify Drop | R4 |

# Part C. Analysis of the feedback of 1 October 2026

## C1. The big picture

The 32 points in this round come down to **seven root causes**. Fixing the root cause fixes several points at once, which is why the requirements in Part D are grouped this way.

| # | Root cause | Points it explains |
|-----|--------------------------------------------------------------------------------------|-------------------|
| 1 | **Each module has its own scheduling**, and only tasks have a real one. Habits know daily/weekdays/weekly, chores only a label, supplements none. | F19, F21, F27, F22 |
| 2 | **Only tasks reach Today and Plan.** Habits, chores, training, supplements, own agenda events and module records stay in tabs or module pages. | F21, F22, F28 |
| 3 | **Today and Plan both browse days**, and neither is clearly the place to arrange or the place to act. Plan cannot even add or open a task. | F28, F4, F5 |
| 4 | **There is no shared "copy" and "template" system.** Tasks, notes, meals and days cannot be copied, and notes cannot start from a template. | F1, F2, F3 |
| 5 | **Food data is a US generic list with US naming**, few units, and no EU label fields. | F7, F8, F9, F12 |
| 6 | **Adding food follows a fixed four-slot form** instead of one add flow with many sources. | F10, F13, F14, F6 |
| 7 | **Several parts are thinner than their summary promises**: Stats has fixed cards, the shopping list cannot take manual items, Stores is a placeholder, the module builder takes one preset. | F15–F18, F23–F26 |

## C2. Point by point

Each point gives what was said (lightly tidied), what happens now (from Parts E and F), why, and the requirements that answer it.

### Tasks, notes and Today

**F1. Copy tasks to other days.** *"Tasks must be able to be copied to other days, at the same or a different time, with the same notes, no notes or a notes template … leave freedom of choosing to the user."*

- Now: no copy anywhere. A task can only be moved (drag, review, Plan's hold-and-tap), or made to repeat.
- Why: there is no copy dialog and no template object.
- Answer: one **Copy to…** dialog for tasks (and later meals, days and weeks): pick one or many days, keep or change the time, and choose what the notes become: the same notes, the notes with ticks cleared, no notes, or a notes template. `TSK-20` to `TSK-25`, `NOT-10`.

**F2. Note templates.** *"Notes template, i.e. cooking recipe ingredients … reading, to write what you remember after the reading task is done … improvise creatively."*

- Now: a note is free text with a toolbar; no templates.
- Answer: **note templates** as a first-class thing: saved by the person, picked when making or copying a task, with fill-in fields such as `{date}`, `{weekday}`, `{title}`. Shipped starter templates: Recipe ingredients and steps, Meal prep checklist, Reading reflection ("What I remember", "Questions", "Quote"), Study session (goal, done, next), Workout plan, Packing list, Meeting notes, Weekly review, Cleaning checklist, Shopping run. A template can also be **"ask after done"**: a reading task whose reflection prompt opens when the task is ticked. `NOT-10` to `NOT-17`.

**F3. Recipes into task notes.** *"Import recipes to notes of a task from the recipes part must be possible."*

- Now: recipes and tasks never meet, except meal tasks, which carry only a title.
- Answer: in the note toolbar, **Insert → Recipe**: pick a recipe with the shared search, choose portions, and choose what to insert (ingredients as a checklist, scaled to the portions; steps; macros per portion). The note keeps a link back to the recipe. From a recipe, **Add to a task** does the same the other way round. `NOT-20` to `NOT-23`, `REC-20`.

**F4. Expand tasks with a long press on Today.**

- Now: a long press (350 ms) starts a drag to reorder; tapping the name opens the full sheet; nothing expands in place.
- Why it matters: the person wants to see and use a task's note without opening the editor.
- Conflict to resolve: long press is already "drag". Research (NN/g, Apple HIG, Android) recommends one consistent rule and a visible alternative for every gesture.
- Answer (decided 2 Oct): **a two-stage hold**. A short hold and a move drags the task; holding still longer expands it in place (the note, the checklist, quick actions). A tap still opens it. Both times are adjustable. `TOD-10` to `TOD-14`.

**F5. Tick note checkboxes from Today.** *"In case it is a meal-preparation task or similar, where the checkboxes can help, checkboxes in notes can be checked after long-pressing the task."*

- Now: checklist items can only be ticked on the full note page ("Open as page"); Today shows a "2/5" chip.
- Answer: the expanded row shows the checklist with **tickable boxes**, saved at once, offline. Ticking the last item offers "Mark the task done?" (never silently). `TOD-12`, `TOD-13`.

### Recipes and food data

**F6. "Add ingredient" in the recipe editor.**

- Now: the ingredient picker lists only existing foods. There is no way to create a food by hand anywhere in the app.
- Answer: when the search finds nothing (and always at the end of the list), offer **"Add '<what was typed>' as a new food"**, which opens a short food form (name, figures per 100 g with the EU fields, units) and returns to the recipe with the new food on the line. Also offered: **Scan barcode** and **Find in stores**. `REC-10`, `FOOD-01`.

**F7. Onion is still counted in grams.**

- Now: only the food called exactly "Onion" has a unit (110 g, a US medium). Shallot, spring onion, sweet onion and Welsh onion are grams only. The picker starts in the first unit only when one exists.
- Answer: units for every food sold or used per piece, with **small, medium and large** where sizes differ, from RIVM Portie-online (the Dutch reference). For onion: small 57 g, medium 95 g, large 142 g (edible), plus "tbsp chopped" 20 g. See Part H3. `UNIT-10` to `UNIT-16`.

**F8. Thorough review of the food database, to EU standards, and many more foods.**

- Now: 807 shared foods, all from a US generic list (USDA SR Legacy style), with US names ("Chicken Broiler/Fryer Breast Meat", "Squash Winter Zucchini"), five figures only (kcal, carbs, fibre, fat, protein), and **carbohydrate counted the US way, with fibre included**. No salt, sugars or saturates, which the EU label requires. Three foods have a broken fat value (Grapeseed Oil is stored with 0 g fat; Chicken Fat and Quinoa have none), so their calories cannot be checked. Everyday European staples are missing (flour, dry pasta, noodles, tortilla wraps, quark, skyr, muesli, coffee, chocolate, jam, mayonnaise, ketchup, and Dutch staples such as hagelslag and roggebrood), while exotic and irrelevant items are present (emu, ostrich, turtle, "Milk Human").
- Answer: rebuild the shared catalogue on **NEVO 2025** (RIVM, 2,328 Dutch foods, free to include unchanged with attribution) with **Portie-online** unit weights, keep USDA only as a fallback, store every food per 100 g with the **EU 1169/2011 fields**, and run the review in Part H4 on what stays. `FOOD-01` to `FOOD-20`.

**F9. Review which items are sold in units.**

- Answer: Part H3 lists every food in the catalogue that is bought or used per piece, with its proposed units and weights, and where the current weights are wrong. Shopping uses the as-bought weight, nutrition the edible weight. `UNIT-10` to `UNIT-16`.

**F10. Add meals and recipes by barcode when a whole meal is bought.**

- Now: scanning exists only on the Foods tab and in Stock. A meal slot or recipe cannot scan.
- Answer: **Scan** is one of the sources in the add-food sheet (F14), so a ready meal is scanned straight into a meal; a scanned product can also be saved as a **ready meal** (a recipe of one product, one portion = the pack or the stated serving). `MEAL-14`, `PROD-10`.

**F11. Activity levels are wrong.** *"First example starting from 1.2 as office worker; most simple people don't go to the gym regularly; make the examples more detailed for correct calorie calculation."*

- Now: ten levels from 1.2 ("desk job, little walking") to 1.9, default 1.375. In More the factor is a free text box with a hint that does not match the list. Changing it does not recalculate targets.
- Why it is wrong: 1.2 is below every official floor. FAO/WHO/UNU puts sedentary or light lifestyles at 1.40–1.69 (an office worker with an hour's walking is 1.53); EFSA plans with 1.4 for the least active adults. For a BMR of 1,700 kcal, 1.2 gives 2,040 kcal where 1.45–1.55 gives 2,465–2,635: **400–600 kcal a day too low**, which turns a mild cut into a harsh one.
- Answer: two short questions (**what your work is like**, **how much you train**) mapped to nine lifestyle presets from 1.3 to 2.2, each shown with an example day and a step range, default 1.4–1.5, never 1.2 unless chosen as "mostly resting". Part H5. `BODY-10` to `BODY-16`.

**F12. Units are called " eggs" everywhere, even on ingredients.**

- Now: the food sheet of every food (onion included) shows the example words "egg" and "eggs" as placeholders, and "Add a unit to count it as eggs, slices or spoons"; the plural is drawn as " · eggs" after the unit; the unit buttons always show the singular. To someone looking at an onion this reads as "the unit is eggs".
- Answer: unit wording is **always the food's own**: placeholders use the food's name ("onion", "slice"), the plural follows the number everywhere ("1 onion", "2 onions"), and no example word from another food appears. Checked on a phone on every screen with units. `UNIT-20` to `UNIT-23`.

### Meals and food logging

**F13. A + to add food to a list (today's food, or another day).**

- Now: Food → Day shows four meal cards; each takes one recipe or one set of numbers. There is no "add" button on Today for food, and no way to add several foods to one meal.
- Answer: a **+ Add food** button on Food → Day (and in Today's add menu when Nutrition is on) that opens the add-food sheet for the day shown. A meal holds **any number of items** (foods, recipes, ready meals, quick numbers). `MEAL-10` to `MEAL-13`.

**F14. No fixed breakfast, lunch, snack and dinner unless set in settings; + asks which meal and when, then offers sources, including scanning again.**

- Now: four slots are hard-coded (`SLOTS` in the code). The server's `meal_slots` setting is never read.
- Answer: **meals are labels on timed entries**. By default there are no fixed slots: + asks "Which meal?" (the person's own meal names, or a new one, or none) and "When?" (now, a time, or untimed), then shows the sources: **Recent · Saved meals · Recipes · Foods (search) · Scan · Just numbers · Copy from another day**. Settings → Food → Meals lets a person define fixed meals with optional default times; only then do meal cards appear on the Day tab. `MEAL-01` to `MEAL-09`, `MEAL-14`.

**F15. Recipes need the same search as Foods; the Foods search is the template for every search.**

- Now: the Foods tab filters its whole table instantly as you type (plain "contains" matching, up to 200 rows). The pickers elsewhere use a different, ranked search that shows only 8 results. Recipes has no search at all.
- Answer: **one search** everywhere: instant as you type, the whole list filtered (no 8-result cap in page lists), every typed word must appear in any order, accents and case ignored, ranked so names that start with the first word come first and plainer (shorter) names before variants, tags and meta shown. Used on Foods, Recipes, Stock, the shopping list, every picker, module records, settings lists and the Modules hub. `GEN-10` to `GEN-13`, `REC-01`.

### Shopping

**F16. A manual way to add items to the shopping list.**

- Now: the list is built only from recipe meals in a fixed four-day window; nothing can be added by hand. The database column for it (`manual_name`) is unused.
- Answer: **+ Add item** with free text and amount parsing ("2 kg apples", "6 eggs", "toilet paper"), recently-bought tiles for one-tap re-adding, and scan. Manual items sync and are shared with the household. `SHOP-10` to `SHOP-14`.

**F17. A setting to put shopping into the day's agenda when the list has items waiting.**

- Answer: Settings → Shopping: **"Plan a shopping trip when the list has items"**, with chosen shopping days (or "the next day") and a time, as a task "Shopping (12 items)" that opens the list; the server's unused `trip_days` default becomes this setting. `SHOP-20` to `SHOP-23`.

**F18. Shopping does not show stores, although ingredients do.**

- Now: scanned products carry their shops, but the trip never shows them; the Stores tab is a paragraph of text; store sections only sort the list.
- Answer: the trip shows **sections as headings** and a **shop filter** ("Albert Heijn", "Lidl", "Any shop"); each item shows where it is sold when known; the Stores tab lets the person keep their shops, the aisle order per shop, and prices they notice. Supermarkets' weekly online catalogues stay a later item, because no open source exists for them (`SHOP-40`). `SHOP-30` to `SHOP-36`.

### Habits

**F19. Habits are missing "custom dates" and weekends.**

- Now: daily, weekdays or weekly; the schedule cannot be changed after creation.
- Answer: habits use the **shared repeat sheet**: every day, weekdays, weekends, chosen days, every N days, N times a week, monthly, picked dates; and the schedule can be edited. `HAB-01` to `HAB-05`, `GEN-20`.

**F20. Pin a note to a habit** (mobility → the exercises).

- Answer: a habit has a **pinned note** (the same note editor, checklist and templates as tasks), shown when the habit is expanded on Today and on the habit page. `HAB-10`, `HAB-11`.

**F21. Habits do not appear on Plan or on Today's overview, even though they are selected to appear.**

- Now: habits live only in a conditional Body/Habits tab on Today, never on the main list, never on Plan. The switch "A daily habit appears on every day" only governs that tab and the widget.
- Answer: each module gets **"Show on Today"** and **"Show on Plan"** switches. With them on, habits due that day appear on Today's list (at their time if they have one, or in an "Any time" group) and as small marks on Plan. `HAB-20` to `HAB-23`, `GEN-01` to `GEN-04`.

**F22. Training and everything else should appear only if selected to appear.**

- Now: several leaks. The server switches nine modules on at sign-up, and onboarding switches them off only once its changes reach the server; the task sheet always offers the sections Training, Meal, Body, Learning, Home and Night, which then raise module colours and tabs; the Work tab follows a section.
- Answer: one rule for every module (principle P1), the sign-up default changed to "only core on", and task sections drawn only from modules that are on. `GEN-01` to `GEN-06`.

### Stats

**F23. Each module expandable in Stats, with many more selectable figures.**

**F24. A home-screen stats widget showing whatever the person wants** (future).

**F25. Stats like a pivot table: as many stats templates as wanted, to compare things.**

- Now: fixed cards per module with 2–4 figures and one chart; built modules count only fields marked "Count in Stats".
- Answer: a **stats builder** with four choices on one screen: **Measure** (any number, tick or duration any module keeps), **Summary** (sum, average, count, min, max, streak, % of days on target), **Group by** (day, week, month, weekday, module, category, tag, field value) and **Range**, plus **Compare with** (a second measure, or "days when X happened" shaded behind). Each result can be saved as a **stats template**, as many as wanted, pinned to Stats, to Today, or to a **home-screen widget**. Every module card expands to list all its measures. `STA-01` to `STA-30`, `WID-10` to `WID-14`.

### Custom modules and household

**F26. When building a module, "what you track" should allow several choices.**

- Now: the presets are single choice; picking another replaces all fields. The Choice field holds one value.
- Answer: presets become **combinable building blocks** (pick several; fields merge, duplicates are named apart), plus a **multi-choice field** type (tags). `MOD-10` to `MOD-14`.

**F27. Household is missing normal scheduling days** (only daily, weekly, monthly).

- Now: the schedule is only a label; chores have no date and never reach Today or Plan.
- Answer: chores use the **shared repeat sheet** (chosen days, every N days/weeks, monthly on a date or the nth weekday, after completion, flexible "about every N days"), become items on Today and Plan when due, can be assigned and rotated between household members, and support "light days" and a pause. `HSE-01` to `HSE-12`.

### Overall

**F28. Plan and Today overlap.**

- Now: both have the same date header, the same week strip and the same reach (3 years back to 5 ahead), so both are "browse any day". Today is where tasks are added and edited for any day; Plan is read-only except moves and swaps.
- Answer: **Today = do, Plan = arrange** (principle P3).
  - **Today** shows today only (with a one-tap peek at tomorrow): the timeline of today's items from every module that is set to show there, the carry-over from earlier days, and pinned cards. Actions: tick, log, expand, start, push, skip, move to tomorrow.
  - **Plan** gets **Day · Week · Month · Year · Inbox**: the Day view is where any other day is opened, added to and edited (the full rail that Today has now), Week can show 1–14 days with drag and copy, and Inbox holds undated tasks.
  - **Nothing is lost**: every function on Today now is kept, either on Today (for today) or on Plan's Day view (for any day). The full map is in the second document, section 6. `TOD-01` to `TOD-06`, `PLN-01` to `PLN-12`.

**F29. Missing links and freedom.** Answered across Part D: copy and templates (`TSK`, `NOT`), linking (`GEN-30` to `GEN-41`), schedules (`GEN-20`), stats (`STA`), fields and views (`MOD`).

**F30. Every existing module finished to perfection.** Part G lists each module's gaps; each has requirements in Part D.

**F31. The app feels overloaded and clunky.** Answered by the information architecture and interaction rules in the second document, and here by `NAV-20` to `NAV-26` (Modules hub, pinned page), `TOD-20` to `TOD-24` (pinned cards), `GEN-50` to `GEN-56` (one add flow, one long-press rule) and `ONB-10` to `ONB-14` (lighter start).

**F32. Colour flows and app icons the person can pick.** Answered by `LOOK-01` to `LOOK-20` and the design page.



# Part D. Requirements register

## D0. Area codes

| Code | Area | Code | Area |
|---------|---------------------------------------------|---------|-----------------------------------------------|
| GEN | Across the whole app | HAB | Habits |
| TOD | Today | SUP | Supplements |
| PLN | Plan | HLT | Health and body log |
| TSK | Tasks, repeats, copy | TRN | Training |
| NOT | Notes and note templates | SLP | Sleep |
| FOOD | Food catalogue and EU data | LRN | Learning and reading |
| UNIT | Units for food | AGN | Agenda and calendar links |
| REC | Recipes | PRJ | Projects and goals |
| MEAL | Meals and food logging | FIN | Finance |
| BODY | Calorie budget and activity | HSE | Household |
| SHOP | Shopping list and stores | STA | Stats |
| STK | Stock (cupboard) | MOD | Modules you build, module editor |
| PROD | Products and barcodes | ONB | Onboarding and templates |
| NAV | Pages and navigation | LOOK | Colours, themes, app icon |
| SET | Settings, profiles, accounts | REM | Reminders |
| WID | Home-screen widgets | DATA | Import, export, backup |
| SYNC | Sync | SEC | Security and privacy |
| PLAT | Platforms and release | AI | Assistant (hidden) |

Columns: **ID**, **Requirement** (with "Done when" where a test is needed), **Pri** (Must / Should / Could), **Status** in version 15 (Done / Partly / Open), **Src** (round, see A2).

## D1. Across the whole app (GEN)

### Visibility: only what is switched on appears

| ID | Requirement | Pri | Status | Src |
|----------|-----------------------------------------------------|--------|-------------------------------|-------|
| GEN-01 | One function decides whether a module is on for the profile; every screen, list, menu, tab, section picker, add menu, search source, Stats card, widget row, export list and colour list uses it. Done when: switching a module off removes every trace of it from the interface within one second, on every page, without a reload. | Must | Done (v16) | R3, R5 |
| GEN-02 | A new account starts with only the core switched on; the template chosen in onboarding switches modules on. The server sign-up trigger stops switching nine modules on. Done when: a new account that picks "Minimal planner" never shows Food, Shop, Training or Habits, even if onboarding is interrupted or offline. | Must | Done (v16) | R5 |
| GEN-03 | Each module has display switches, set per template and editable in its settings: **Show on Today**, **Show on Plan**, **Show on the widget**, **Count in Stats**, **Send reminders**. A module that is on but has "Show on Today" off still has its page. | Must | Done (v16) | R5 |
| GEN-04 | Items of every module that has "Show on Today" on (tasks, habits, chores, supplements, planned training, study reviews, planned payments, own agenda events, dated records) appear on Today's list on the days they are due, at their time or in an "Any time" group. | Must | Done (v16) | R5 |
| GEN-05 | Task sections offered in the task sheet come only from modules that are on, plus the person's own sections. A section never makes a switched-off module's colour, tab or page appear. | Must | Done (v16) | R5 |
| GEN-06 | Switching a module off never deletes its data; switching it back on restores everything. The confirmation says so. | Must | Done (v18) | R3 |

### One search

| ID | Requirement | Pri | Status | Src |
|-----------|--------------------------------------------------------------|--------|---------------------|--------|
| GEN-10 | One search behaviour for the whole app, modelled on the Foods tab: results update instantly as each letter is typed, over the whole list (no cap of 8 in page lists; pickers show the best 20 and "Show all"). | Must | Done (v18) | R2, R5 |
| GEN-11 | Matching: every typed word must appear somewhere in the name (or in tags, brand, aisle or note where shown), in any order; case, accents and punctuation ignored; "1/2" style fractions and numbers allowed. | Must | Done (v16) | R5 |
| GEN-12 | Ranking: names that start with the first word first, then names with a word starting with it, then the rest; within each, own and recently used items first, then shorter (plainer) names, then alphabetical. | Must | Done (v16) | R5 |
| GEN-13 | Used on: Foods, Recipes, Stock, the shopping list, every picker, module record lists, the Modules hub, settings lists (countries, modules, colours), Plan's Inbox and the note template list. | Must | Done (v16) | R5 |

### One scheduling engine

| ID | Requirement | Pri | Status | Src |
|----------|-------------------------------------------------|----------|------------------------|----------------|
| GEN-20 | One **Repeat** sheet, used by tasks, habits, chores, supplements, training sessions, study blocks, planned payments and built modules. Options: never; every day; every N days; weekdays; weekends; chosen days of the week; every N weeks on chosen days; N times a week (any days); monthly on a date; monthly on the nth weekday (e.g. second Tuesday, last Friday); every N months; yearly; picked dates. | Must | Done (v16) | R3, R5 |
| GEN-21 | Ends: never, on a date, or after N times (the data model already supports a count). | Must | Done (v16) | SR |
| GEN-22 | Extra kinds of repeat: **after completion** ("7 days after it was last done") and **flexible** ("about every 7 days", shown with a due-ness bar that never turns into "failed"). | Should | Done (v18) | SR (research) |
| GEN-23 | A repeating item's rule can be edited after creation, for "this and following" or "all", without stopping and re-creating it. | Must | Done (v16) | SR |
| GEN-24 | Optional **assign and rotate** for household items: me, a named member, or rotate (each time, each week, whoever did it least recently). | Should | Done (v16) | R5 (household) |
| GEN-25 | Optional **light days** and a **cap per day** for flexible items (e.g. no chores on Friday, at most 3 a day). | Could | Done (v16) | SR |
| GEN-26 | Repeats are stored in a form that maps one-to-one onto iCalendar (RRULE, RDATE, EXDATE) so calendar export and import keep them. | Must | Done (v18) | R3 |

### Linking between modules

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------|-----------|----------------------|--------|
| GEN-30 | Recipe → task note (insert ingredients as a checklist, steps, macros), keeping a link back (see NOT-20). | Must | Done (v16) | R5 |
| GEN-31 | Meal task ↔ meal: ticking a meal task on Today marks the meal eaten, and the other way round. | Must | Done (v18) | SR |
| GEN-32 | Shopping list → agenda: a trip task when items are waiting (SHOP-20). | Must | Done (v16) | R5 |
| GEN-33 | Shopping → stock → recipes: what is bought goes into stock, what is cooked or eaten leaves it, what is in stock is not put on the list. | Must | Done for recipe meals; manual items and quick meals not yet | R2 |
| GEN-34 | Habits, chores, supplements, training and study items reach Today and Plan through GEN-03/GEN-04. | Must | Done (v16) | R5 |
| GEN-35 | Projects hold tasks: a task can belong to a project; the project shows its tasks and progress; dated projects show as goals on the Year view. | Should | Done (v16) | SR |
| GEN-36 | Goals: a goal page; tasks, projects and habits can be linked to a goal; the Year view's "Goals and phases" lists them. | Should | Done (v16) | R1, SR |
| GEN-37 | Sleep target → bedtime: an optional locked "Wind down / Bed" block on Plan at target bedtime. | Should | Done (v16) | SR |
| GEN-38 | Training plan → tasks: a planned session (routine) becomes a task at its time; ticking it opens the log for that routine. | Should | Done (v16) | SR |
| GEN-39 | Supplements → Today: with "Show on Today" on, each time slot appears as one item "Morning supplements (3)" that ticks all at once, with per-item ticks when expanded. | Should | Done (v16) | SR |
| GEN-40 | Finance planned payments → Today and Plan ("Rent due — mark paid"). | Could | Done (v16) | SR |
| GEN-41 | Every module's numbers → Stats (STA). | Must | Done (v16) | R3, R5 |

### One add flow, one long-press rule, copy everywhere

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------|----------|----------------------|--------|
| GEN-50 | The round + button is context-aware: on a module page it adds that module's main thing; on Today and Plan it opens a short menu (2–6 entries) of the add types the person uses most (Task, Food, Habit tick, Note, Expense…), ordered by use and editable. | Must | Done (v16) | SR |
| GEN-51 | Every add sheet has at most two steps, never stacks a second sheet on top, and offers **Recent · Saved · Search · Scan** where they make sense. | Must | Done (v16) | SR |
| GEN-52 | One long-press rule in every list: **long press expands** an item in place (TOD-10) or, in tables and module lists, **enters multi-select**; the same actions are always also in a visible ⋮ menu. | Must | Done (v18: built modules' lists and tables, Finance entries) | R5, SR |
| GEN-53 | Multi-select (where offered) shows an action bar: Select all, Copy to day…, Move to day…, Duplicate, Change repeat, Add to book, Export, Delete (last, with confirm). | Should | Done (v18) | R3, SR |
| GEN-54 | **Undo** for 8 seconds after delete, drag, swap, move, copy and bulk actions, as a bar at the bottom. | Must | Done (v16) | SR |
| GEN-55 | **Copy to…** works the same for tasks, meals, whole days and whole weeks (TSK-20). | Must | Done (v18: one copy dialog for tasks, days, weeks and meals) | R5 |
| GEN-56 | Haptic feedback on long press (where the phone allows), and every gesture also has a visible button for accessibility. | Must | Done (v16) | SR |

### General quality

| ID | Requirement | Pri | Status | Src |
|-----------|-------------------------------------------------------------|-----------|-------------------|--------|
| GEN-60 | Works fully offline; every change is written locally first and synced later. | Must | Done | R1 |
| GEN-61 | Usable at 360 px wide; nothing runs off the screen; nothing tappable sits under the + button. | Must | Done | R2 |
| GEN-62 | Light and dark themes, following the phone; plus a manual choice (LOOK-03). | Must | Done (v16) | R1, R5 |
| GEN-63 | Landscape phones and wide screens use a side rail; sheets are centred and keep Save visible. | Must | Done | R3 |
| GEN-64 | Compact dropdowns everywhere instead of the phone's full-screen pickers. | Must | Done | R2 |
| GEN-65 | Unknown is never shown as zero; calculated figures can show their working. | Must | Done | R2 |
| GEN-66 | British English, plain words, no emoji in the interface. | Must | Done | R1 |
| GEN-67 | Every empty page or list says what it is for and offers the first action (and an import or template where one exists). | Must | Done (v16) | SR |
| GEN-68 | Settings that hold user data are validated on read, so an old or broken value never breaks a screen. | Must | Done | R1 |
| GEN-69 | Time zone follows the phone, or a time zone chosen in settings; it is no longer fixed to Europe/Amsterdam. | Should | Done (v16) | SR |
| GEN-70 | Day start and day end (stored but unused) set the edges of the Today timeline and the "after midnight still counts as yesterday" boundary. | Could | Done (v19) | SR |

## D2. Today (TOD)

| ID | Requirement | Pri | Status | Src |
|----------|---------------------------------------------------------------|----------|-------------------|-------|
| TOD-01 | Today shows **today**, with a one-tap peek at tomorrow. Browsing other days moves to Plan's Day view (PLN-02); the week strip leaves Today. Done when: no function that Today has now is lost (each is on Today for today, or on Plan's Day view for any day). | Must | Done (v16) | R5 |
| TOD-02 | Today's list merges every module set to show there (GEN-04): timed items on the time rail, untimed ones in "Any time", grouped by morning / afternoon / evening if the person picks that layout. | Must | Done (v16) | R1, R5 |
| TOD-03 | **Carry-over**: unfinished items from earlier days in one collapsible row at the top, with Tomorrow, Pick a day, Done, Drop (the review actions). The evening review stays, at the person's review time. | Must | Done (v16) | R1 |
| TOD-04 | Followed-calendar events and the person's own agenda events sit at the top of the timeline. | Must | Done (v16) | R4, SR |
| TOD-05 | Tabs (Body, Work, Training, module tabs, Evening, Sleep) appear only when that module is on and the day has something for it; with only one tab, no tab row. | Must | Done | R3 |
| TOD-06 | The figure under the date (e.g. kcal eaten / target) is the person's choice, or nothing; and a pinned stats card can replace it (TOD-20). | Must | Done (v17: the figure, or a pinned stats card) | R2, R5 |
| TOD-10 | **Two-stage hold on a task** (decided 2 Oct): a tap opens it; a **short hold** (about 0.35 s) then moving the finger **drags** it; holding still for **longer** (about 0.8 s) **expands** it in place, showing its note, checklist, time, minutes, section and quick actions (Edit, Copy to…, Duplicate, Move to…, Skip, Delete, Open note as page). A light buzz marks each stage. A second long hold, a tap on the title or Back collapses it. Both times are adjustable in settings. | Must | Done (v16) | R5 |
| TOD-11 | An expanded row keeps the page usable: the header of the expanded row stays visible while scrolling its content; only one row is expanded at a time. | Must | Done (v16) | SR |
| TOD-12 | Checklist items in an expanded row can be ticked directly; each tick saves at once, offline. | Must | Done (v16) | R5 |
| TOD-13 | Ticking the last checklist item asks "Mark the task done?" (Yes / Not yet); it never ticks the task silently. | Must | Done (v16) | SR |
| TOD-14 | The same two-stage hold works on Plan's Day view. Move up / Move down stay in the ⋮ menu for anyone who cannot drag. | Must | Done (v16) | R5 |
| TOD-15 | Push buttons 15 / 30 / 60, tick, the ⋮ move menu and drag warnings (locked, fixed, locked work hours, clash) work as in v15. Fix: a push past midnight moves the task to the next day instead of wrapping on the same date; pushing an untimed task asks for a time instead of starting from 09:00. | Must | Done (v16) | R1, SR |
| TOD-20 | **Pinned cards**: the person can pin up to 6 cards to Today (a module summary such as "Protein 82/140 g", "3 chores due", "Sleep 7.2 h", or any saved stats template), add, remove and drag to reorder them, choose small or large, and choose "show on weekdays / weekends / always". Cards never come back after being removed. | Should | Done (v16) | R5, SR |
| TOD-21 | Each card shows one glanceable figure and one main action ("+ Add food", "Start"). | Should | Done (v16) | SR |
| TOD-22 | Optional **Plan my day** sheet on the first open of the day: yesterday's leftovers, suggestions (due soon, flexible chores, study reviews), and a workload bar (planned minutes against a daily capacity the person sets) that warns when over. | Could | Done (v19) | SR |
| TOD-23 | Optional **Close the day** sheet at review time: moves leftovers to tomorrow or the Inbox in one go. | Could | Done (v19) | R1 |
| TOD-24 | Completed repeating items stay visible (struck through) on Today, so the day's record is complete. | Should | Done for tasks | SR |

## D3. Plan (PLN)

| ID | Requirement | Pri | Status | Src |
|-----------|------------------------------------------------------------|----------|---------------------|--------|
| PLN-01 | Plan views: **Day · Week · Month · Year · Inbox**. | Must | Done (v16) | R1, R5 |
| PLN-02 | **Day view**: the full editable rail for any day (what Today offers now): add, open, edit, drag to reorder, push, tick, notes, and that day's items from every module set to "Show on Plan". | Must | Done (v16) | R5 |
| PLN-03 | Week view can show **1 to 14 days** (pinch or a setting), with a busy-ness bar per day. | Should | Done (v16) | SR |
| PLN-04 | Tapping an item on Week, Month or Year opens it; a + on each view adds on the selected day. | Must | Done (v16) | SR |
| PLN-05 | Hold a day to swap it with another; hold an item to move it; repeating items write a series exception; warnings as in v15. | Must | Done | R3 |
| PLN-06 | **Copy** a day or a week to one or many other days or weeks, choosing what to include (tasks, repeats, notes, meals). | Must | Done (v16) | R5 |
| PLN-07 | **Inbox**: one place for every task without a date (not a separate module): open from Plan and from Today, capture into it from the + menu, drag or "Plan for…" onto a day, and a cleared date sends a task there instead of making it vanish. | Must | Done (v16) | SR, R5 |
| PLN-08 | **Templates**: save a day or week as a template ("Sunday reset", "Meal prep Monday") and drop it onto any day. | Should | Done (v16) | R5, SR |
| PLN-09 | Month shows load heat, module dots, holidays and calendar marks; Year is a scrolling month list with heat and dots; both reach 3 years back and 5 ahead. | Must | Done | R1, R3 |
| PLN-10 | Planned repeats beyond the 8-week fill show everywhere (Plan, Today peek, load, exports). | Must | Done | R3 |
| PLN-11 | Items from every module set to "Show on Plan" show on Week, Month and Year, with their colour, and count in the load if they have a length. | Must | Done (v16) | R5 |
| PLN-12 | Goals and phases on the Year view list real goals (GEN-36). | Should | Done (v16) | R1 |
| PLN-13 | Public holidays by country, each in its own colour, on Today and every Plan view, offline. | Must | Done | R3 |

## D4. Tasks, repeats and copying (TSK)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------------|----------|------------------|--------|
| TSK-01 | Task fields: what, day (or none = Inbox), time, minutes or an end time ("Until"), section, repeat, ends, locked, note. | Must | Done (except Inbox) | R1, R2 |
| TSK-02 | "Until" end time in the same cell as minutes; an end before the start means the next morning; at most 24 h. | Must | Done | R2 |
| TSK-03 | Repeat options as GEN-20, in the task sheet. | Must | Done (v16) | R3, R5 |
| TSK-04 | Edits to a repeating task ask "Only this one / This and following"; date-only changes and ticks never ask. | Must | Done | R3 |
| TSK-05 | "Stop repeating" ends the series today and removes later undone days. | Must | Done | R3 |
| TSK-06 | A task can be marked **fixed** in the sheet (the flag exists and raises warnings, but nothing can set it). | Should | Done (v16) | SR |
| TSK-07 | Natural-language quick add: one line such as "Gym tomorrow 18:00-19:30 every Mon Wed #Training" is read into day, time, length, repeat and section, with chips shown as it is typed. | Could | Done (v19) | SR |
| TSK-08 | Missed tasks: the review at the review time (default 21:00), flagging after 3 moves or pushes, with the limit editable in settings (today device-only with no screen). | Must | Done (v16) | R1 |
| TSK-09 | The task sheet closes on Back and Escape. | Must | Done (v16) | SR |
| TSK-20 | **Copy to…** on a task (expanded row, ⋮ menu, multi-select): pick one or many days on a calendar, or shortcuts (Tomorrow, Every weekday this week, Same day next week). | Must | Done (v16) | R5 |
| TSK-21 | Time choice when copying: keep the same time, set a new time, or no time. | Must | Done (v16) | R5 |
| TSK-22 | Notes choice when copying: **same notes**, **same notes with ticks cleared**, **no notes**, or **a note template**. The last choice is remembered. | Must | Done (v16) | R5 |
| TSK-23 | Other choices when copying: keep the section, minutes and locked flag (default on); copy as a one-off even if the original repeats. | Must | Done (v16) | R5 |
| TSK-24 | **Duplicate** opens the task sheet pre-filled so anything can be changed before saving. | Must | Done (v16) | SR |
| TSK-25 | Copies are independent tasks; editing one never changes another. A copy of a repeating task's day is a one-off. | Must | Done (v16) | R5 |
| TSK-26 | **Save as template** on a task keeps title, minutes, section, note and repeat as a reusable "task template", offered in the add sheet's Saved tab. | Should | Done (v16) | R5 |

## D5. Notes and note templates (NOT)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------------------|----------|----------|-------|
| NOT-01 | Note toolbar: checklist item, bullet, bold, heading; Enter continues a list; plain text storage that syncs and exports as it is. | Must | Done | R2 |
| NOT-02 | "Open as page": a full-screen note with tickable checklist and a progress count; ticks save at once. | Must | Done | R2 |
| NOT-03 | Row marks: "done/total" chip for checklists, a page icon for other notes. | Must | Done | R2 |
| NOT-04 | Checklist items can be reordered by drag and indented; ticked items can be sent to the bottom (setting). | Should | Done (v16) | SR |
| NOT-10 | **Note templates**: named, reusable note bodies with fill-in fields `{date}`, `{weekday}`, `{time}`, `{title}`, `{day count}` filled when used. | Must | Done (v16) | R5 |
| NOT-11 | Templates can be made from any note ("Save as template"), edited, renamed, deleted, ordered and searched, and sync with the profile. | Must | Done (v16) | R5 |
| NOT-12 | Starter templates (editable, removable): Recipe ingredients and steps; Meal prep checklist; Reading reflection (What I remember, Questions, A line worth keeping); Study session (Goal, Done, Next); Workout plan; Packing list; Meeting notes; Weekly review; Cleaning checklist; Shopping run. | Must | Done (v16) | R5 |
| NOT-13 | A template is chosen when making a task, when copying one (TSK-22), and from the note toolbar ("Insert template"). | Must | Done (v16) | R5 |
| NOT-14 | **Prompt after done**: a template can be set to open when the task is ticked (e.g. the reading reflection after a reading task), with "Later" and "Skip". | Should | Done (v16) | R5 |
| NOT-15 | A task template (TSK-26) can carry a note template, so "Reading 30 min" always comes with its reflection. | Should | Done (v16) | R5 |
| NOT-16 | Habits, chores and module records use the same note editor and templates (HAB-10). | Must | Done (v16) | R5 |
| NOT-17 | Template variables and the "prompt after done" are shown in plain words in the editor, not as code. | Must | Done (v16) | SR |
| NOT-20 | **Insert → Recipe** in the note toolbar: pick a recipe with the shared search, choose portions, and insert any of: ingredients as a checklist (scaled, in the units used), steps, macros per portion. | Must | Done (v16) | R5 |
| NOT-21 | The inserted block keeps a link to the recipe ("From: Chicken curry, 4 portions · Open recipe"). | Must | Done (v16) | R5 |
| NOT-22 | If the recipe changes later, the note offers "Update from recipe" (never changes by itself). | Should | Done (v16) | SR |
| NOT-23 | Several recipes can be inserted into one note (meal prep for the week), with an optional combined shopping-style ingredient list. | Should | Done (v16) | R5 |



## D6. Food catalogue and EU data (FOOD)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------------|----------|-------------------|-------|
| FOOD-01 | A person can **create and edit their own foods** by hand: name, brand, figures per 100 g or 100 ml, units, pack size, aisle, shops. Shared foods stay read-only but can be copied to "my version". | Must | Done (v16) | R5 |
| FOOD-02 | Every food stores the **EU 1169/2011 declaration per 100 g or 100 ml**: energy (kJ and kcal), fat, of which saturates, carbohydrate, of which sugars, fibre, protein, salt. Optional: mono- and polyunsaturates, polyols, starch, alcohol. Unknown stays empty, never 0. | Must | Done (v16) | R5 |
| FOOD-03 | Carbohydrate follows the EU definition (fibre not included). The current catalogue's carbohydrate includes fibre (US method) and must be converted: EU carbs = carbs − fibre. | Must | Done (v16) | R5 |
| FOOD-04 | When only macros are known, energy is worked out with the Annex XIV factors (carbohydrate 4 kcal/17 kJ, protein 4/17, fat 9/37, fibre 2/8, alcohol 7/29, polyols 2.4/10, organic acid 3/13). A food whose stated energy differs from its macros by more than 15% is flagged for review. | Must | Done (v16) | R5 |
| FOOD-05 | Salt is stored; sodium = salt ÷ 2.5 when shown. | Must | Done (v16) | R5 |
| FOOD-06 | %RI (reference intake of an average adult: 2000 kcal, fat 70 g, saturates 20 g, carbohydrate 260 g, sugars 90 g, protein 50 g, salt 6 g) can be shown on a food and a day. | Should | Done (v18) | R5 |
| FOOD-07 | Each food knows whether it is per 100 g or per 100 ml, and its state (raw, cooked, canned, dried, frozen) with a cook yield where it changes weight. | Must | Done (v16) | R1, R5 |
| FOOD-08 | The shared catalogue is rebuilt on **NEVO-online 2025** (RIVM, 2,328 Dutch foods), used unchanged and attributed "Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven", and never sold to users. Where NEVO has no entry, USDA FoodData Central (public domain) or the Swedish Livsmedelsverket (CC BY 4.0) fill the gap, each marked with its source. | Must | Done (v16) | R5 |
| FOOD-09 | Food names are in plain British English with the Dutch name searchable as well ("Onion (ui)"); the US-style inverted names ("Squash Winter Zucchini") are replaced. | Must | Done (v16) | R5 |
| FOOD-10 | Everyday European staples are present: flours, dry and cooked pasta, rice, noodles, couscous, bulgur, buckwheat, oats, muesli, granola, breads (white, wholemeal, rye, sourdough, rolls, wraps, pita, bagel, croissant), dairy (milks, quark, skyr, Greek yoghurt, cottage cheese, cream cheese, common cheeses), spreads and sauces (peanut butter, chocolate sprinkles, jam, honey, mayonnaise, ketchup, mustard, soy sauce, pesto), drinks (coffee, tea, juices, soft drinks, beer, wine), common meats and fish as sold in the EU (chicken breast and thigh, minced beef, pork chop, bacon, ham, salmon, tuna in water, cod, herring), legumes (tinned chickpeas, kidney and black beans, lentils), frozen vegetables, and Dutch and Lithuanian staples the owner uses. | Must | Done (v18) | R5 |
| FOOD-11 | Irrelevant or inappropriate catalogue items are removed or hidden (e.g. "Milk Human", turtle, emu, mechanically separated poultry), and exact duplicates are merged ("Whole Wheat Bread" and "Whole-wheat bread"). Existing references (recipes, logs) are re-pointed, never broken. | Must | Done (v18) | R5 |
| FOOD-12 | Data errors found by the review are fixed (Part H4): Grapeseed Oil stored with 0 g fat, Chicken Fat and Quinoa with no fat value; plant foods with fibre 0 where a value is known; energy mismatches over 15%. | Must | Done (v16) | R5 |
| FOOD-13 | Each food carries its source and version (NEVO 2025, USDA, Open Food Facts, own, imported) and the attribution is shown on the food sheet and in About. | Must | Done (v16) | R5 |
| FOOD-14 | Foods list: sorted by name, filtered by the shared search (GEN-10), shows the tracked figures, no 200-row cap when searching. | Must | Done (v16) | R5 |
| FOOD-15 | Foods can be grouped into books and multi-selected (copy names, add to book, delete own, export). | Must | Done | R3 |
| FOOD-16 | Nutrients tracked and shown are the person's choice from the full EU list (not only kcal, protein, carbs, fat, fibre). | Should | Done (v16) | R2, R5 |
| FOOD-17 | Vitamins and minerals (Annex XIII NRVs) are optional fields, shown only if the person turns them on. | Could | Done (v19) | SR |
| FOOD-18 | Shops are shown on a food when known (from Open Food Facts or set by the person). | Must | Done for scanned products | R4 |
| FOOD-19 | Food data is reviewed by checks that run with the app's other checks (energy consistency, required fields, units within limits). | Must | Done (v16) | SR |
| FOOD-20 | Catalogue updates reach every device without disturbing the person's own foods, logs and recipes. | Must | Done (v16) | SR |

## D7. Units for food (UNIT)

| ID | Requirement | Pri | Status | Src |
|------------|----------------------------------------------------------|----------|----------------------|--------|
| UNIT-01 | A food can be counted in grams (or ml) and in its own units (egg, slice, clove, tbsp); up to 8 units, each with a weight. | Must | Done | R4 |
| UNIT-02 | One amount field (number + unit picker) everywhere an amount is typed: recipe lines, meals, quick entries from a food, stock, scanning, the shopping list. | Must | Done (v18) | R4, R5 |
| UNIT-03 | Amounts accept decimal commas, fractions (½, ¼, 1/2, 1 1/2) and spaces in thousands. | Must | Done | R4 |
| UNIT-04 | Volumes: ml, l, tsp (5 ml), tbsp (15 ml), cup (250 ml EU) for liquids and foods with a density. | Should | Done (v16) | R5 |
| UNIT-10 | Every food sold or used per piece has units, with **small / medium / large** where sizes differ, using RIVM Portie-online 2026 edible weights (Part H3). | Must | Partly (v18: units on 105 of 137 foods bought by the piece, from Portie-online and USDA FoodData Central; 32 have no published piece weight in either, e.g. celeriac, parsnip, pumpkin, kale, white asparagus, brown hard rolls) | R5 |
| UNIT-11 | Each unit has an **edible weight** (for nutrition) and an **as-bought weight** (for shopping and stock), e.g. banana medium 130 g edible, 186 g as bought. | Must | Done (v16) | R5 |
| UNIT-12 | The default unit for a counted food is "medium" when the person types "1 onion". | Must | Done (v16) | R5 |
| UNIT-13 | Part units: slice, segment, clove, leaf, stalk, floret, sprig, bunch, head, punnet, tin, jar, pack, bottle, as fits the food. | Must | Partly (v18: slice, segment, clove, leaf, stalk, floret, sprig, bunch, head, punnet and tin on shared foods; no jar or bottle unit, whose size is the product's: packs come from a food's pack size) | R5 |
| UNIT-14 | Eggs follow EU sizes: S, M, L, XL (shell-on grading XL ≥ 73 g, L 63–73, M 53–63, S < 53 g) with edible weights S 40, M 50, L 60 g. | Must | Done (v18) | R4, R5 |
| UNIT-15 | The current wrong weights are corrected (Part H3, table H3.2): e.g. onion 110 → 95 g, garlic clove 5 → 3 g, tomato 120 → 89 g, potato 170 → 70 g, carrot 60 → 243 g (winter carrot; bunch carrot 20 g), apple 180 → 135 g. Saved entries keep their grams. | Must | Done (v16) | R5 |
| UNIT-16 | A person can add, rename and remove units on their own foods, and add their own units to shared foods (kept as their overlay). | Must | Done (v16) | R4, R5 |
| UNIT-20 | Unit wording is always the food's own: the add-unit form uses the food's name as the example ("onion"), never "egg/eggs" on other foods; the hint "Add a unit to count it as eggs…" is replaced by one naming this food. | Must | Done (v16) | R5 |
| UNIT-21 | Plurals follow the number everywhere, including on the unit buttons ("1 onion", "2 onions", "0.5 onion"); no stray separators or leading spaces ("· eggs"). | Must | Done (v16) | R5 |
| UNIT-22 | Combined lists (shopping, copy ingredients) show a count when all lines used the same unit, else grams with the count in brackets where it helps ("3 onions (285 g)"). | Must | Done (v16) | R4 |
| UNIT-23 | Done when: on a phone, every screen that shows an amount (food sheet, recipe editor and view, meal day, quick entry, stock, scan, shopping, copy ingredients, exports) is checked for unit wording, and a check covers the plural and display rules. | Must | Done (v16) | R5 |

## D8. Recipes (REC)

| ID | Requirement | Pri | Status | Src |
|-----------|-------------------------------------------------------------|----------|--------------------|--------|
| REC-01 | The Recipes tab has the shared search (GEN-10) over names, ingredients and tags, and sorting (name, kcal, recent, most cooked). | Must | Done (v16) | R5 |
| REC-02 | Every recipe can be opened and read in full (shared ones included): ingredients with amounts and units, steps, figures per portion and per batch, time. | Must | Done (v16) | SR |
| REC-03 | Recipe editor: name, for (meal type), portions per batch, ingredient lines with amount and unit, minutes, steps, who can see it. | Must | Done | R1, R3 |
| REC-04 | Ingredient lines can be reordered, marked raw or cooked (so cook yields apply), carry a short note ("finely chopped"), and free-text lines without a food ("salt to taste"). | Must | Done (v16) | SR |
| REC-05 | Delete from inside the editor (with confirm), and Duplicate ("make a variation"). | Must | Done (v16) | SR |
| REC-06 | Scale a recipe by portions in the view; the scale carries into notes, meals and the shopping list. | Should | Done (v16) | SR |
| REC-07 | Import a recipe from a web address (schema.org Recipe data), and from text pasted in ("200 g oats, 2 eggs…") matched to foods. | Should | Done (v18) | R1, SR |
| REC-08 | Recipe books and multi-select (copy ingredients, add to shopping list, delete own, export). | Must | Done (except "add to shopping list") | R3 |
| REC-09 | Share with everyone: propose, owner approves, statuses, review queue. | Must | Done | R3 |
| REC-10 | **Add ingredient** when the food is not there: the ingredient search ends with "Add '<typed>' as a new food" (opens FOOD-01's form and returns to the line), plus Scan barcode and Find in stores. | Must | Done (v16) | R5 |
| REC-11 | A photo per recipe (kept on the device and synced within size limits). | Could | Done (v19) | SR |
| REC-12 | Cook mode: steps one by one, screen kept on, timers from step text ("simmer 20 min"). | Could | Done (v19) | SR |
| REC-20 | From a recipe: **Add to a task** (into a task's note, NOT-20), **Plan as a meal**, **Add ingredients to shopping list** (minus stock). | Must | Done (v16) | R5 |
| REC-21 | A recipe can be a **ready meal** made from one scanned product (PROD-10). | Must | Done (v16) | R5 |

## D9. Meals and food logging (MEAL)

| ID | Requirement | Pri | Status | Src |
|------------|-------------------------------------------------------------|----------|--------------------|-------|
| MEAL-01 | **No fixed meal slots by default.** Food entries are timed (or untimed) items on the day, with an optional meal label. | Must | Done (v16) | R5 |
| MEAL-02 | Settings → Food → Meals: the person may define their own meals (any names, any number, ordered), each with an optional default time. Only then do meal cards appear on the Day tab. Templates may suggest a set (e.g. Fitness: Breakfast, Lunch, Pre-workout, Dinner, Snack). | Must | Done (v16) | R5 |
| MEAL-03 | The server's unused `meal_slots` default is replaced by MEAL-02's setting. | Must | Done (v16) | SR |
| MEAL-04 | Which meal is the "main meal" for the size-to-target suggestion is the person's choice (any meal, or none). | Should | Done (v16) | SR |
| MEAL-05 | Meal times: none unless set; a time set on the day wins over the default; changing defaults moves future meals that followed them. | Must | Done | R2 |
| MEAL-06 | A meal can be marked skipped (the "skipped meal" rule), which removes its task and leaves it out of shopping. | Should | Done (v16) | SR |
| MEAL-07 | Meals and whole days can be copied to other days (Copy to…, "Copy yesterday's breakfast"). | Must | Done (v16) | R5 |
| MEAL-08 | A group of foods can be saved as a **saved meal** and logged in one tap; logging can "explode" it into its foods to edit one. | Should | Done (v16) | SR |
| MEAL-09 | Untimed food entries show in an "Any time" group; timed ones on the day's time line. | Must | Done (v16) | R5 |
| MEAL-10 | **+ Add food** on Food → Day and in Today's + menu (when Nutrition is on) opens the add-food sheet for the day shown. | Must | Done (v16) | R5 |
| MEAL-11 | Step 1 of the sheet: **Which meal?** (own meal names, a new name, or none) and **When?** (now, a time, untimed); both pre-filled from the time of day and last use. | Must | Done (v16) | R5 |
| MEAL-12 | Step 2: sources as tabs: **Recent · Saved meals · Recipes · Foods · Scan · Just numbers · Copy from another day**. Several items can be picked into a staging "plate" and added in one go, each with its amount and unit. | Must | Done (v16) | R5 |
| MEAL-13 | A meal holds any number of items (foods, recipes, ready meals, quick numbers); each can be edited or removed. | Must | Done (v16) | R5 |
| MEAL-14 | **Scan** in the add sheet: a found product goes straight in with its pack or serving as the amount; an unknown one opens Find in stores or a new-food form. "Scan again" stays on the sheet for the next item. | Must | Done (v16) | R5 |
| MEAL-15 | "Just numbers": label, calories as total or per 100 g / 50 g / 30 g / 25 g / portion with grams eaten, optional macros; unknown stays unknown. | Must | Done | R2 |
| MEAL-16 | "From a food" keeps the link to the food (today it saves only the numbers), so the food's later corrections and units carry through. | Should | Done (v16) | SR |
| MEAL-17 | Meal tasks on Today (rule "every planned meal becomes a task"), switchable; ticking either side marks both (GEN-31). | Must | Done (v16) | R1, SR |
| MEAL-18 | Day totals: planned and eaten, for the tracked nutrients, against targets where set. | Must | Done | R2 |
| MEAL-19 | The figure on Today is the person's choice or none. | Must | Done | R2 |
| MEAL-20 | Remembered last amount per food, and "hourly go-tos" (what is usually eaten at this time) at the top of Recent. | Should | Done (v16) | SR |

## D10. Calorie budget and activity levels (BODY)

| ID | Requirement | Pri | Status | Src |
|------------|-------------------------------------------------------------|----------|--------------------|-------|
| BODY-01 | Targets are optional; with them off, nothing about the body is saved. | Must | Done | R2 |
| BODY-02 | BMR by Mifflin-St Jeor; target = BMR × activity factor + goal adjustment (cut −500, recomp 0, bulk +300); protein 2.2 / 1.9 / 1.7 g per kg; fat 27% of energy; carbohydrate the rest; fibre 14 g per 1000 kcal; working shown. | Must | Done | R1 |
| BODY-03 | Goal adjustment, protein per kg and fat share are editable by the person (the defaults stay). | Should | Done (v16) | SR |
| BODY-04 | Targets are recalculated when goal, activity, height or date of birth change, not only on a weigh-in (with a note saying so). | Must | Done (v16) | SR |
| BODY-05 | No hidden fallbacks: without height or date of birth the targets are not worked out (today onboarding quietly assumes 175 cm and age 30). | Must | Done (v16) | SR |
| BODY-10 | Activity is chosen by two short questions: **Work** (mostly resting / sitting / standing / physical / very heavy) and **Training** (none / 1–2 / 3–4 / 5+ sessions a week, or 2+ hours a day), mapped to the lifestyle presets of Part H5. | Must | Done (v16) | R5 |
| BODY-11 | Each preset shows its factor, an example day and a step range, e.g. "1.6 · desk job plus 2–3 gym sessions a week, about 6,000–9,000 steps". | Must | Done (v16) | R5 |
| BODY-12 | Presets (Part H5): 1.3 mostly resting; 1.4 desk job, no exercise; 1.5 desk job with a daily walk or cycle commute; 1.6 desk job plus 2–3 workouts a week; 1.75 desk job plus daily training; 1.65 standing job; 1.8 standing job plus 3+ workouts; 1.9 physical job; 2.2 very heavy labour or endurance athlete. | Must | Done (v16) | R5 |
| BODY-13 | Default is 1.4–1.5 (desk job, no or light exercise), never 1.2. "Mostly resting" (1.3) is labelled as housebound or recovering. | Must | Done (v16) | R5 |
| BODY-14 | A custom factor can still be typed (1.2 to 2.4, two decimals), with a warning outside 1.3–2.2. | Must | Done (v16) | R2, R5 |
| BODY-15 | The same picker is used in onboarding and in More (today More is a free text box with a hint that does not match). | Must | Done (v16) | SR |
| BODY-16 | No double counting: the person chooses once whether training is inside the factor (default) or logged separately and added; the screen says which. | Must | Done (v18) | R5 |
| BODY-17 | After 2–3 weeks of food logs (6 of 7 days) and at least one weigh-in a week, offer an **adaptive estimate** of maintenance from intake and trend weight, which the person may accept. | Could | Done (v19) | SR |
| BODY-18 | Goal is not only about the body: the planner's goals (GEN-36) are separate from the calorie goal. | Must | Done (body goal is in its own section) | R2 |

## D11. Shopping list and stores (SHOP)

| ID | Requirement | Pri | Status | Src |
|------------|--------------------------------------------------------|----------|------------------------|--------|
| SHOP-01 | The list is built from planned meals (recipes **and** foods and ready meals), minus stock, in packs where a pack size is known. | Must | Done (v16) | R1, R2 |
| SHOP-02 | The window of meals the list covers is chosen: until the next shopping day (SHOP-21), or a number of days (default 4). | Must | Done (v16) | SR |
| SHOP-03 | Ticks sync across devices and the household, and are kept until the item is bought or removed (not reset at midnight). | Must | Done (v16) | SR |
| SHOP-04 | "Put ticked items in stock" adds what was bought. | Must | Done | R2 |
| SHOP-10 | **+ Add item**: free text with amount parsing ("2 kg apples", "6 eggs", "toilet paper"); matched to a food when one fits, else kept as a plain item. | Must | Done (v16) | R5 |
| SHOP-11 | **Recently bought** tiles: one tap re-adds an item; frequent items first. | Should | Done (v16) | SR |
| SHOP-12 | Scan to add an item to the list. | Should | Done (v16) | R4 |
| SHOP-13 | Manual items can be edited (amount, note, aisle, shop), reordered and removed, and sync with the household. | Must | Done (v16) | R5 |
| SHOP-14 | Recipes and multi-selected recipes can add their ingredients to the list (minus stock). | Must | Done (v16) | R3 |
| SHOP-15 | Minimum stock: a stock item with a minimum adds itself to the list when it falls below it. | Should | Done (v16) | SR |
| SHOP-20 | Setting **"Plan a shopping trip when the list has items"**: off by default; when on, a task "Shopping (N items)" is put on the next shopping day at the chosen time, updated as the count changes, and removed when the list is empty. | Must | Done (v16) | R5 |
| SHOP-21 | Shopping days are the person's choice (any weekdays, or "the next day"), with a time and a length; the trip task can be locked (the old `trip_days` rule). | Must | Done (v16) | R5 |
| SHOP-22 | Tapping the trip task opens the list; ticking the task when everything is ticked offers "Put bought items in stock". | Should | Done (v18) | R5 |
| SHOP-23 | The trip task follows the module's "Show on Today / Plan" switches. | Must | Done (v16) | R5 |
| SHOP-30 | The list shows **aisle sections as headings** (collapsible), in the person's aisle order. | Must | Done (v16) | R5 |
| SHOP-31 | A **shop filter**: "Any shop", or one of the person's shops; each item shows where it is sold when known. | Must | Done (v16) | R5 |
| SHOP-32 | **Stores tab**: the person's shops (from a list of chains in their country, or typed), each with its own aisle order and the prices the person types or scans. | Must | Done (v16) | R1, R5 |
| SHOP-33 | Prices: the latest price per shop (own, or shared Open Prices), price per kg or litre, and a running total for the trip. | Should | Done (v17: own prices first, then Open Prices, on the list; see PRICE) | R4 |
| SHOP-34 | Several lists (e.g. per shop, or "Household" and "Me"), with items movable between them. | Could | Done (v16) | SR |
| SHOP-35 | Custom aisles (rename, reorder, add). | Should | Done (v16) | SR |
| SHOP-36 | Shops near the person (country and city) are suggested first. | Should | Partly (v16: the country's chains first, then neighbours'; no open data to rank by city) | R1 |
| SHOP-40 | Supermarkets' weekly online offers ("catalogues"): kept as a later item. No open data source exists for Dutch chains; scraping their sites would break their terms. Revisit if a chain offers an open feed or partnership. | Could | Replaced by PRICE-06 (v17) | R1, R5 |

## D12. Stock (STK)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------------|-----------|------------------|-------|
| STK-01 | Stock per household: add by search or scan, amount in g, kg, packs or the food's units, note; adjust with − / +; remove with confirm; "out" stays listed. | Must | Done | R2 |
| STK-02 | Optional auto-deduct when a meal is eaten (recipe meals today; foods and ready meals too). | Must | Done (v16) | R2 |
| STK-03 | Storage place (fridge, freezer, cupboard) and best-before date, with an "expiring soon" list. | Should | Done (v16) | SR |
| STK-04 | Minimum amount per item feeding the shopping list (SHOP-15). | Should | Done (v16) | SR |
| STK-05 | Household members invited from the app (today only by a database change). | Should | Done (v16) | SR |
| STK-06 | Recipe suggestions by what is in stock. | Could | Done (v16) | SR |

## D13. Products and barcodes (PROD)

| ID | Requirement | Pri | Status | Src |
|------------|-------------------------------------------------------------|----------|-------------------|--------|
| PROD-01 | Find products from Open Food Facts by name, brand or barcode, in the person's country; scan with Google's code scanner (no camera permission); rate limits respected; attribution shown. | Must | Done | R4 |
| PROD-02 | Scanning is offered wherever food is added: meals, recipes (ingredients), stock, shopping list, Foods. | Must | Done (v16) | R4, R5 |
| PROD-03 | A product brings in all EU label fields it has (salt, sugars, saturates…), not only five. | Must | Done (v16) | R5 |
| PROD-04 | Use the current Open Food Facts API (v3) with an app identification; v2 is deprecated. | Should | Done (v16) | SR |
| PROD-05 | Unknown product: create the food from a photo of its nutrition table, or by hand with the EU fields; optionally contribute it to Open Food Facts. | Could | Partly (v19: the photo is kept beside the EU fields to type from, its text is read where the browser can (TextDetector) or when pasted, and Open Food Facts contribution is done; reading the photo by itself in the Android app needs an on-device text reader (ML Kit text recognition), a new native plugin) | SR |
| PROD-06 | Nutri-Score shown when Open Food Facts has it. | Could | Done (v16) | SR |
| PROD-10 | **Ready meals**: a scanned product can be saved as a ready meal (one portion = the pack or the stated serving) and logged or planned like a recipe. | Must | Done (v16) | R5 |



## D14. Habits (HAB)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------------|----------|-------------------|-------|
| HAB-01 | Habits use the shared Repeat sheet (GEN-20): every day, weekdays, **weekends**, chosen days, every N days, **N times a week**, monthly, **picked (custom) dates**. | Must | Done (v16) | R5 |
| HAB-02 | The schedule can be changed after the habit is made; past ticks keep their meaning. | Must | Done (v16) | R5 |
| HAB-03 | Optional time of day (or part of day: morning, afternoon, evening) and an optional reminder. | Should | Done (v16) | SR |
| HAB-04 | Optional start and end dates (a 30-day challenge). | Should | Done (v16) | SR |
| HAB-05 | Count habits ("8 glasses of water", "10 minutes"): a target number with a unit, ticked by adding to it. | Should | Done (v16) | SR |
| HAB-06 | Rename, archive, reorder, colour and mark per habit. | Must | Done (v16) | SR |
| HAB-07 | Streak plus a forgiving **strength %** (misses lower it gently instead of resetting to 0). | Should | Done (v16) | SR |
| HAB-08 | A habit's history as a calendar grid (year-in-pixels style), with ticks editable for past days. | Should | Done (v16) | SR |
| HAB-10 | **Pinned note** per habit (the same note editor, checklist and templates as tasks), e.g. Mobility → the list of exercises. | Must | Done (v16) | R5 |
| HAB-11 | The pinned note shows when the habit is expanded on Today (long press), on the Habits page and on the widget's tap-through; its checklist can be ticked for the day without changing the note itself (ticks reset each day). | Must | Done (v18) | R5 |
| HAB-20 | With Habits "Show on Today" on, habits due that day appear in Today's list (at their time, or in "Any time"), not only in a tab. | Must | Done (v16) | R5 |
| HAB-21 | With Habits "Show on Plan" on, habits appear on Plan's Day and Week views (and as a quiet count on Month). | Must | Done (v16) | R5 |
| HAB-22 | The first habit can be added from Today's + menu and from the Habits page; the Habits tab is no longer the only route. | Must | Done (v18) | R5 |
| HAB-23 | The rule switch "A daily habit appears on every day" is replaced by GEN-03's clear switches, so "selected to appear" means what it says. | Must | Done (v16) | R5 |
| HAB-24 | Widget: today's habits with ticks (as now), refreshed at once after a tick. | Must | Done | R3 |

## D15. Supplements (SUP)

| ID | Requirement | Pri | Status | Src |
|-----------|------------------------------------------------------------|-----------|---------------------|-------|
| SUP-01 | Add, **edit** (name, dose, slot), reorder and archive supplements. | Must | Done (v16) | SR |
| SUP-02 | Time slots are the person's (rename, add, remove; default Morning, Midday, Evening), each with an optional time. | Should | Done (v16) | SR |
| SUP-03 | Schedule per supplement with the shared Repeat sheet (e.g. vitamin D in winter only, creatine on training days). | Should | Done (v16) | SR |
| SUP-04 | One tick per slot ("take all"), with per-item ticks when expanded. | Should | Done (v16) | SR |
| SUP-05 | Optional stock count per supplement: each tick takes one dose off; a refill reminder at N days left. | Could | Done (v18) | SR |
| SUP-06 | With "Show on Today" on, each slot appears on Today's list as one item (GEN-39). | Should | Done (v16) | SR |
| SUP-07 | Doses can optionally count towards nutrients (e.g. vitamin D µg). | Could | Done (v19) | SR |

## D16. Health and body log (HLT)

| ID | Requirement | Pri | Status | Src |
|-----------|-------------------------------------------------------------------|-----------|--------------|-------|
| HLT-01 | Weigh-in per day (weight 30–300 kg, waist 40–250 cm), last 8 entries with change, a 7-day average line. | Must | Done | R1 |
| HLT-02 | Weigh-ins for any past day can be added and edited from the Health page (today the page always shows today). | Must | Done (v16) | SR |
| HLT-03 | **Trend weight** (time-weighted moving average) as the headline number, raw weights as dots; weekly rate and an estimated goal date. | Should | Done (v16) | SR |
| HLT-04 | More body measures as optional fields (hips, chest, arm, body fat %), added in the module editor. | Could | Done (v19: a Measure record in Health; Edit module offers hips, chest, arm, thigh and body fat; each on the Health page with its change and chart, and in Stats) | SR |
| HLT-05 | Weigh-in day and reminder (the server's unused `weigh_in_day`). | Could | Done (v19: Health ⋮ → Weigh-in day; Today offers the weigh-in on that day; a reminder at the chosen time; the reminder on a phone not yet tried) | SR |
| HLT-06 | Height emptied in More is saved as empty, never 0. | Must | Done (v16) | SR |

## D17. Training (TRN)

| ID | Requirement | Pri | Status | Src |
|-----------|----------------------------------------------------------------------|-----------|-----------|-------|
| TRN-01 | Log sets (exercise from the catalogue, set, reps, load, seconds, note) on any day. | Must | Done | R1 |
| TRN-02 | Add own exercises (name, muscle group, equipment). | Must | Done (v16) | SR |
| TRN-03 | **Routines** (named lists of exercises with target sets and reps) and a **session** view that logs a routine set by set. | Must | Done (v16) | SR |
| TRN-04 | Prefill from last time, a "Previous" column, and a rest timer that starts on ticking a set. | Should | Done (v16) | SR |
| TRN-05 | Planned sessions use the shared Repeat sheet and become tasks at their time (rule `session_task`, GEN-38); ticking opens the session. | Must | Done (v16) | SR |
| TRN-06 | Training appears on Today and Plan only when its "Show on" switches are on (GEN-03); logging sets never adds anything to Today by itself. | Must | Done (v16) | R5 |
| TRN-07 | Phases (e.g. 6-week blocks) on the Year view, from the unused `phase` table. | Could | Done (v19: Training ⋮ → Phases; bands on Training and Plan's Year view; 037) | SR |
| TRN-08 | Stats: sessions, sets, volume, per exercise and muscle group, best sets. | Should | Done (v16) | R5 |

## D18. Sleep (SLP)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------------|-----------|----------------|-------|
| SLP-01 | Log a night (to bed, woke, quality 1–5); the night belongs to the day it ended. | Must | Done | R1 |
| SLP-02 | **Target hours and bedtime** (the server's unused defaults), compared on every night and in Stats (sleep debt over 7 days, regularity of bed and wake times). | Must | Done (v18) | SR |
| SLP-03 | Optional bedtime block on Plan, locked if chosen (rule `bedtime`, GEN-37), and a bedtime reminder (target wake time minus target hours). | Should | Done (v16) | SR |
| SLP-04 | Past nights can be added and edited from the Sleep page. | Must | Done (v16) | SR |
| SLP-05 | Import from Health Connect (Android) when allowed. | Could | Partly (v19: built and checked off the phone — Sleep ⋮ → Import from Health Connect, READ_SLEEP only, 7/14/30 days, overlaps, naps, wake day and duplicates in sleepimport, migration 039 for the Health Connect id; still to do: the permission flow and a real import on a phone (store/phone-tests.md 18–29), apply 039, the Play Console Health Connect declaration and the policy's Health Connect section) | SR |

## D19. Learning and reading (LRN)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------|-----------|-------------------------|-------|
| LRN-01 | Study blocks (subject, date, minutes, source) on a page with table and month views. | Must | Done | R1 |
| LRN-02 | Dated study blocks can become tasks (the day-task rule built modules have), and follow "Show on Today / Plan". | Must | Done (v16) | SR |
| LRN-03 | A reading list (books: to read, reading, finished; pages; rating) as part of the module. | Should | Done (v16) | SR |
| LRN-04 | Reading tasks offer the "Reading reflection" template after done (NOT-14). | Should | Done (v16) | R5 |
| LRN-05 | Weekly target per subject with progress; optional review schedule (1–3–7–14–30 days) shown as "3 reviews due" on Today. | Could | Done (v19: targets and the review switch in Learning's ⋮; "Reviews due" card on Today; reviewsDue for Plan my day) | SR |
| LRN-06 | A focus timer that logs minutes to a subject. | Could | Done (v19: from the + or a subject's ⋮; 25, 50, other or count up; logs a study session; the end notification on a phone not yet tried) | SR |

## D20. Agenda and calendar links (AGN)

| ID | Requirement | Pri | Status | Src |
|-----------|----------------------------------------------------------------------|-----------|-----------|-------|
| AGN-01 | Own events (title, start, end, all day, place) with month and list views. | Must | Done | R1 |
| AGN-02 | **Own events show on Today and Plan** (today only followed calendars do). | Must | Done (v16) | SR |
| AGN-03 | Events can repeat (shared Repeat sheet) and have reminders. | Should | Done (v16) | SR |
| AGN-04 | Calendar links: a private feed of GetIt into Google Calendar (health items, built modules and notes kept out unless chosen); new link and off. | Must | Done | R4 |
| AGN-05 | Follow calendars by their iCal address: shown read-only on Today, Plan and Agenda, refreshed on open and every 3 hours, kept on the device. | Must | Done | R4 |
| AGN-06 | Calendar visibility chips on Plan (hide a followed calendar with one tap without unfollowing). | Should | Done (v16) | SR |
| AGN-07 | The "Nothing across an all-day event" rule: warn when planning across an all-day event that is marked busy. | Could | Done (v19: busy from followed calendars; own events cannot be marked busy) | SR |
| AGN-08 | Import and export of calendars as .ics, Google-style CSV; repeats kept. | Must | Done | R3 |

## D21. Projects and goals (PRJ)

| ID | Requirement | Pri | Status | Src |
|-----------|------------------------------------------------------------|-----------|---------------------|-------|
| PRJ-01 | Projects (name, status, due date) with table and card views. | Must | Done | R1 |
| PRJ-02 | A project holds **tasks** (a project field on tasks), shows progress (done / all) and its next task. | Must | Done (v16) | SR |
| PRJ-03 | Milestones (dated points in a project) on Plan and the Year view (unused `milestone` table). | Should | Done (v18) | SR |
| PRJ-04 | A board by status as a ready view. | Should | Done (v16) | SR |
| PRJ-05 | Project templates with dates relative to a start date ("Move house", "Exam prep"). | Could | Done (v19) | SR |
| PRJ-06 | **Goals** page: goals with a target date and a measure; projects, tasks and habits link to a goal; the Year view lists them (GEN-36, PLN-12). | Should | Done (v16) | R1 |

## D22. Finance (FIN)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------|-----------|-----------------------|-------|
| FIN-01 | Entries (date, category, amount, note) with table and month views; amount summed in Stats. | Must | Done | R1 |
| FIN-02 | Income or expense; categories as an editable list (top-level ones too); currency (EUR default). | Must | Done (v16) | SR |
| FIN-03 | **Budgets** per category per month, with spent against budget. | Must | Done (v16) | SR |
| FIN-04 | **Planned payments** (rent, subscriptions) with the shared Repeat sheet, shown on Today and Plan ("Rent due — mark paid"); marking paid creates the entry. | Should | Done (v16) | SR |
| FIN-05 | Fast entry: amount first, then a category grid (recent first). | Should | Done (v16) | SR |
| FIN-06 | Import bank CSV exports (ING, Rabobank, ABN AMRO, Revolut) with column mapping. | Could | Done (v19: the bank recognised from its file in the generic import; a second import skips rows already here) | SR |

## D23. Household (HSE)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------|-----------|----------------------|-------|
| HSE-01 | Chores use the shared Repeat sheet (GEN-20): chosen days of the week, weekends, every N days or weeks, monthly on a date or the nth weekday, picked dates. | Must | Done (v16) | R5 |
| HSE-02 | **After completion** ("every 7 days after last done") and **flexible** ("about every 7 days") chores, with a due-ness bar and friendly wording, never "failed". | Should | Done (v16) | SR |
| HSE-03 | Chores have a next-due date and a "last done", and appear on Today (when due or overdue) and Plan, following "Show on" switches. | Must | Done (v16) | R5 |
| HSE-04 | Rooms or areas to group chores. | Should | Done (v16) | SR |
| HSE-05 | **Shared with the household**: every member sees the same chores; who did it is recorded. | Must | Done (v16) | SR |
| HSE-06 | Assign to a member, or rotate (each time, each week, least recently done) (GEN-24). | Should | Done (v16) | R5 |
| HSE-07 | "Who" is a household member, not free text. | Must | Done (v16) | SR |
| HSE-08 | Pause (holiday) for the whole module or one chore. | Should | Done (v16) | SR |
| HSE-09 | Light days and a daily cap for flexible chores (GEN-25). | Could | Done (v16) | SR |
| HSE-10 | Starter packs (Studio flat, Family house) that seed rooms and chores; the person removes what they do not need. | Should | Done (v16) | SR |
| HSE-11 | Chores can carry a pinned note and checklist (NOT-16). | Should | Done (v16) | R5 |
| HSE-12 | Household members are invited from the app (shared with STK-05). | Should | Done (v16) | SR |

## D24. Stats (STA)

| ID | Requirement | Pri | Status | Src |
|----------|-------------------------------------------------------------------|----------|---------------|-------|
| STA-01 | Period Day / Week / Month / Year with previous and next, compared with the period before; "show switched-off modules". | Must | Done | R3 |
| STA-02 | **Every module card expands** to list every measure the module keeps, each selectable to show on the card. | Must | Done (v16) | R5 |
| STA-03 | Measures available (at least): tasks (done, planned, completion %, minutes, pushed, by section or module); habits (ticks, kept %, streak, strength, per habit); supplements (taken %, per item); nutrition (every tracked nutrient eaten and planned, per day and per meal, days on target, top foods); health (weight, trend, waist, change); sleep (hours, quality, debt, bed and wake times, regularity); training (sessions, sets, volume, per exercise and muscle group, best sets); learning (minutes per subject); agenda (events, hours); projects (tasks done, open); finance (spent, income, per category, against budget); household (chores done, per person, overdue); shopping (trips, items, money spent if prices are kept); built modules (every number, duration, yes/no and choice field). | Must | Done (v18) | R5 |
| STA-10 | **Stats builder** on one screen: **Measure** (any of STA-03) × **Summary** (sum, average, count, min, max, streak, % of days on target) × **Group by** (day, week, month, weekday, module, section, category, tag, habit, field value) × **Range** (7 / 30 / 90 days, this month, this year, custom). | Must | Done (v16) | R5 |
| STA-11 | **Compare with**: a second measure on the same chart (two axes when units differ), or "days when X happened" shaded behind the chart, with a note when there are too few days (at least 3 with and 3 without). | Should | Done (v16) | R5 |
| STA-12 | Chart chosen automatically (line over time, bars for categories), changeable; a **table toggle** shows the pivot (rows = groups, columns = a second grouping, cells = the summary), with tap-to-drill into the entries behind a cell. | Must | Done (v16) | R5 |
| STA-13 | **Save as stats template**: as many as the person wants, named, ordered, edited, deleted, synced. | Must | Done (v16) | R5 |
| STA-14 | A saved template can be pinned to the Stats page, to Today (TOD-20) and to a widget (WID-10). | Must | Done (v16) | R5 |
| STA-15 | Ready-made templates the person can use or delete: Protein vs target (week), Calories eaten vs planned, Training volume by muscle group, Study minutes by subject, Spending by category (month), Chores per person, Sleep vs training days, Habit kept % by habit. | Should | Done (v18) | R5 |
| STA-16 | Export any stats view (CSV, Excel, JSON). | Must | Done (figures on screen) | R3 |
| STA-17 | Year-in-pixels heat grid for any measure. | Could | Done (v16) | SR |
| STA-18 | **Pivot set-up by the person**: choose what goes in **rows**, **columns**, **values** (any number of measures, each with its own summary) and **filters** (module, section, tag, date range, field value), and reorder or remove any of them. | Must | Done (v16) | R5 |
| STA-19 | **Every chart is adjustable**: type (bar, stacked bar, line, area, dots, number, progress ring, table, heat grid), which series show, colours per series, axis range, sort, labels, a target line, and the period buckets. | Must | Done (v16) | R5 |
| STA-21 | Any saved stats view can become a **home-screen widget** (WID-10) or a pinned card, and keeps updating. | Must | Done (v16) | R5 |
| STA-20 | Days still to come never lower an average; unknown days are left out, not counted as 0. | Must | Done | R3 |
| STA-30 | Correlation cards ("On days you trained, sleep +0.4 h") only when there is enough data, with an honest caveat. | Could | Done (v16) | SR |

## D25. Modules you build, and the module editor (MOD)

| ID | Requirement | Pri | Status | Src |
|-----------|--------------------------------------------------------------------|-----------|--------------|-------|
| MOD-01 | Build a module in steps: name and mark, what you track, keywords, fields, links and rules; it opens its own page. | Must | Done | R3 |
| MOD-02 | Field kinds: text, number with unit, whole number, length of time, yes/no, date, time, date and time, choice, link (food, recipe, exercise, task, goal), calculated. | Must | Done | R3 |
| MOD-03 | Views: list, table (editable cells), calendar, board, grid, chart, form, with settings. | Must | Done | R3 |
| MOD-04 | Edit any module: rename, reorder, hide fields; add fields where records are module records; views; rules; settings; "back to the app's version". | Must | Done | R3 |
| MOD-05 | Rules for built modules: dated records become tasks; reminder at a time. | Must | Done | R3 |
| MOD-06 | Built-in rules that are shown must be carried out or hidden; the nine rules marked "later" are carried out by GEN-37 to GEN-40, SHOP-21, MEAL-06, HSE-05, LRN-02 and AGN-07, or removed. | Must | Done (v16) | R3 |
| MOD-07 | Keywords typed for a module really suggest it at setup (today they are stored but not used). | Should | Done (v18) | R3 |
| MOD-10 | **"What you track" allows several choices**: presets combine, their fields are merged (same-named fields kept once, clashes renamed), views from each are offered. | Must | Done (v16) | R5 |
| MOD-11 | A **multi-choice** (tags) field kind. | Must | Done (v16) | R5 |
| MOD-12 | More field kinds: rating (1–5 stars), percentage, money (with currency), photo, link to another built module, checklist, duration with start and end. | Should | Partly (v18: photo field built, bucket and policies proven on a Storage stand-in; to try on the live project and with a phone's camera) | SR |
| MOD-13 | More presets: Water intake, Mood and energy, Medication, Period and cycle (private by default), Pet care, Car fuel, Language practice, Running log, Gratitude journal, Subscriptions. | Should | Done (v16) | SR |
| MOD-14 | Records of built modules use the shared Repeat sheet for recurring records (e.g. plant watering) and follow the "Show on" switches. | Should | Done (v16) | SR |
| MOD-15 | Up to 4 entities per module (the definition allows it; the builder makes one) with links between them. | Could | Done (v19: kinds of record added in Edit module, up to four, linked with "Links to"; a tab each) | SR |
| MOD-16 | Share a module design (not its records) as a file, and import one. | Could | Done (v16) | SR |

## D26. Onboarding and starting layouts (ONB)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------------------|-----------|-----------|-------|
| ONB-01 | Four steps: who is planning (name, country, city); your day (work or school hours, lock, commute); start from (templates, keyword suggestion, adjust modules); body targets (optional). | Must | Done | R2 |
| ONB-02 | Templates: Minimal planner, Student, Office worker, Shift worker, Parent / household, Fitness and nutrition, Freelancer / projects, Everything on. | Must | Done | R2 |
| ONB-03 | "Start again from a template" in More. | Must | Done | R2 |
| ONB-10 | Templates also set each module's "Show on Today / Plan / widget" switches and pinned cards. | Must | Done (v16) | R5 |
| ONB-11 | A visible **Skip** that lands on a working default (Today, Plan, tasks). | Should | Done (v16) | SR |
| ONB-12 | No colour or icon choices during onboarding; a dismissible "Make GetIt yours" card a few days later opens Looks. | Should | Done (v16) | SR |
| ONB-13 | Just-in-time tips instead of a tour (first long press, first checklist, third manual meal: "Save as meal?"), each shown once, replayable in settings. | Should | Done (v16) | SR |
| ONB-14 | Every empty module page has a designed empty state with one main action and a template or import where one exists. | Must | Done (v16) | SR |

## D27. Pages and navigation (NAV)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------------------|-----------|-----------|-------|
| NAV-01 | Pages exist only for modules that are on; Today, Plan and More always. | Must | Done | R3 |
| NAV-02 | Bar styles: one row, two rows, three rows, drawer, fan; Today and Plan larger and in their own colour. | Must | Done | R3 |
| NAV-03 | Page order and hiding; swipe between pages, with swipes on day strips, tabs and wide tables left alone. | Must | Done | R3 |
| NAV-04 | Landscape rail and wide-screen sidebar. | Must | Done | R3 |
| NAV-20 | A **Modules hub** page (a grid of every module that is on, ordered by use), so the bar can stay short: Today · Plan · a pinned page · Stats · Modules. Offered as a sixth bar style ("Hub"), and recommended for 5+ modules. | Should | Done (v16) | R5 |
| NAV-21 | Long press on a module in the hub: Pin to bar, Pin a card to Today, Hide, Settings. | Should | Done (v16) | SR |
| NAV-22 | The hub has the shared search (GEN-13) over modules and their records. | Should | Done (v16) | SR |
| NAV-23 | More is renamed "Settings" in the hub style, with the same sections. | Could | Done (v16) | SR |
| NAV-24 | Android launcher shortcuts (up to 4) mirroring the + menu's top items (Add task, Add food…). | Could | Done (v19) | SR |
| NAV-25 | Each module page keeps at most two levels: the module's list, then an item. Deeper settings go in sheets. | Should | Done (v16) | SR |
| NAV-26 | Moving functions between screens comes with a one-time "What moved where" note, and a "Classic layout" switch for one or two versions. | Should | Done (v17: "What moved where"; the Classic layout switch was replaced by CALM-17, no global layout switch) | SR |

## D28. Settings, profiles and accounts (SET)

| ID | Requirement | Pri | Status | Src |
|-----------|----------------------------------------------------------|-----------|-----------------------|-------|
| SET-01 | Settings sections: Modules, Profile, Reminders, Data (as v15), plus Looks (LOOK). | Must | Done (v16) | R3 |
| SET-02 | Profiles inside an account: add, rename, switch (remembered), delete; each with its own modules and data. | Should | Done (v16) | R1 |
| SET-03 | Several accounts on one phone (up to 5), switching with the phone's unlock, never losing unsent changes. | Must | Done | R3 |
| SET-04 | Sign out sends waiting changes first, or warns and asks before discarding them. | Must | Done (v16) | SR |
| SET-05 | Delete account in the app and on a web page. | Must | Done | R1 |
| SET-06 | A backup restore brings back settings, country and city too. | Must | Done (v16) | SR |
| SET-07 | The conflicts list words refused changes as "refused by the server", not "kept", and never prints "[object Object]". | Must | Done (v16) | SR |
| SET-08 | The extension limit (moves before a task is flagged) is editable. | Should | Done (v16) | SR |

## D29. Colours, themes and app icon (LOOK)

| ID | Requirement | Pri | Status | Src |
|------------|---------------------------------------------------------------|-----------|------------------|-------|
| LOOK-01 | **Themes ("colour flows")**: a set of named themes, each with light and dark versions (paper, ink, accent, tint, lines, heat scale), chosen in Settings → Looks with a live preview. The design page ("GetIt — Looks") is the starting set. | Must | Done (v16) | R5 |
| LOOK-02 | **System colours** (Android 12+ Material You): the theme follows the phone's wallpaper colours, re-read when the app comes back. | Should | Done (v16) | SR |
| LOOK-03 | Mode: System, Light, Dark, and **Black** (AMOLED) for dark. | Must | Done (v16) | R5 |
| LOOK-04 | **Own colour**: pick one accent (wheel, hex or swatches) and the theme is generated from it. | Should | Done (v16) | R5 |
| LOOK-05 | Contrast guard on every theme: text at least 4.5:1, lines, markers and chart strokes at least 3:1 against their background; a colour that fails is adjusted and the person told "Adjusted for readability". | Must | Done (v16) | SR |
| LOOK-06 | Module colours per module (16 swatches or hex), checked against the chosen theme's paper. | Must | Done (v18) | R3 |
| LOOK-07 | Text size: Small, Default, Large, Larger (also follows the phone's font size). | Should | Done (v16) | SR |
| LOOK-08 | Density: Comfortable or Compact rows. | Could | Done (v19) | SR |
| LOOK-09 | The widget follows the app's theme and mode. | Should | Done (v16) | SR |
| LOOK-10 | **App icon choice**: 6–8 icons bundled in the app (see the design page), switched in Settings → Looks, with the warning that the launcher may take a few seconds and that pinned shortcuts may need re-adding. Exactly one icon is always enabled; the icon is never hidden. | Should | Done (v16) | R5 |
| LOOK-11 | The adaptive icon has a **monochrome layer** so Android 13+ themed icons work. | Must | Done (v16) | SR |
| LOOK-12 | The serif for what the person wrote and the sans for system text stay in every theme; a theme may offer an alternative pairing (e.g. all-sans). | Could | Done (v19: "All sans" offered by Harbour, Slate, Mono, High contrast, your colour and phone colours) | SR |
| LOOK-20 | Themes and icons are free; nothing about looks is behind a payment. | Should | n/a | SR |

## D30. Reminders (REM)

| ID | Requirement | Pri | Status | Src |
|-----------|-----------------------------------------------------------------------|-----------|-----------|-------|
| REM-01 | Reminders at each timed task's time, within a few minutes, for the next 3 days, off by default, quiet hours, text hidden on the lock screen, under the name the person chooses. | Must | Done | R1 |
| REM-02 | Reminders for habits, supplements, chores, events and built-module records follow the module's "Send reminders" switch (GEN-03). | Should | Done (v18) | SR |
| REM-03 | Tapping a reminder opens the item; "Done" and "In 15 min" actions on the notification. | Should | Done (v16) | SR |
| REM-04 | A reminder in quiet hours is delayed to the end of them (setting), instead of always dropped. | Could | Done (v16) | SR |
| REM-05 | Messaging-style reminders (Telegram) as an option. | Could | Done (v19: Settings → Reminders → Telegram, migration 038, telegram-webhook and telegram-send; live once the owner makes the bot and sets its secrets and webhook, docs/telegram.md) | R1 |

## D31. Home-screen widgets (WID)

| ID | Requirement | Pri | Status | Src |
|-----------|---------------------------------------------------------------------|-----------|-------------|-------|
| WID-01 | "GetIt · Today" widget: open tasks with ticks, today's habits, done tasks, resizable, ticks applied safely. | Must | Done | R1 |
| WID-02 | The Today widget shows items from every module set to "Show on the widget". | Should | Done (v16) | R5 |
| WID-10 | **Stats widgets**: the person places as many as they want, each showing a saved stats view of their choice (a figure, a small chart, a ring or a short table), in 2×2, 4×2 and 4×4 sizes, refreshed whenever the data changes. | Must | Done (v16) | R5 |
| WID-11 | **Quick add widget**: buttons for the + menu's top items. | Could | Done (v19) | SR |
| WID-12 | Widgets refresh at once after any change in the app or on the widget. | Must | Done for Today | R3 |
| WID-13 | Widgets follow the theme (LOOK-09) and have proper empty states. | Should | Done (v16) | SR |
| WID-14 | A widget's settings can be changed by a long press on it (Android's own widget settings). | Should | Done (v16) | SR |

## D32. Import, export and backup (DATA)

| ID | Requirement | Pri | Status | Src |
|------------|------------------------------------------------------------|----------|--------------------|-------|
| DATA-01 | "Export" link, small and bold, at the bottom right of every data page, with the formats that fit. | Must | Done | R3 |
| DATA-02 | Import and export centre: pick a module and fields, a format (CSV, Excel, JSON, .ics, text) and a range; import with column matching, a preview and per-row problems. | Must | Done | R3 |
| DATA-03 | Whole-account backup file, and restore into the open profile. | Must | Done (see SET-06) | R1 |
| DATA-04 | Excel workbook import of foods and recipes (the owner's original files); exercises saved too once TRN-02 exists. | Must | Done (v18) | R1 |
| DATA-05 | Recipes import and export in a common format (CSV, JSON, and schema.org Recipe from the web). | Should | Done (v16) | R1 |
| DATA-06 | Note templates, stats templates and themes are part of the backup and of the profile sync. | Must | Done (v16) | R5 |

## D33. Sync, security and privacy (SYNC, SEC)

| ID | Requirement | Pri | Status | Src |
|------------|---------------------------------------------------------------------|-----------|------------|-------|
| SYNC-01 | Local-first sync with a queue, field-level merge, folding of one-per-key rows, paging and parallel pulls. | Must | Done | R1 |
| SYNC-02 | A light periodic pull (e.g. every 2 minutes while open, and on focus) so changes from another device appear without a reload. | Should | Done (v16) | SR |
| SYNC-03 | New synced things (note templates, task templates, stats templates, meals list, manual shopping items, chores' schedules, themes) are synced with the same guarantees. | Must | Done (v16) | R5 |
| SEC-01 | Row-level security on every table, tested by the security suite (112 checks today) and extended for every new table. | Must | Done | R1 |
| SEC-02 | Health data never leaves the person's profile without their action; the calendar feed keeps health and built-module items out. | Must | Done | R4 |
| SEC-03 | Privacy policy and records of processing updated whenever data use changes (new food sources, household sharing of chores, themes). | Must | Done (v18; kept up with each change) | R4 |
| SEC-04 | Invite-only sign-ups are opened (or the closed-test testers' addresses added) before the Play closed test. | Must | Open | SR |

## D34. Platforms and release (PLAT)

| ID | Requirement | Pri | Status | Src |
|------------|---------------------------------------------------------------|---------|------------------|-------|
| PLAT-01 | Android app `app.visuma.planner`, Capacitor, targeting the current API level; INTERNET and USE_BIOMETRIC permissions only. | Must | Done | R1 |
| PLAT-02 | Windows app (Tauri) and web build kept up to date with every version. | Must | Done | R1 |
| PLAT-03 | Google Play closed test: 12 testers opted in for 14 continuous days, then production application. | Must | Open | R4 |
| PLAT-04 | Store listing texts and screenshots (made after version 16, so they show the new design). | Must | Done (v19: listing texts in store/listing.json; seven phone screenshots at 1080 × 1920 in store/screenshots/, made from an invented demo week by scripts/store-shots.mjs; the owner uploads them in Play Console) | R4 |
| PLAT-05 | Data safety answers, including Google's code scanner (ML Kit) and Open Food Facts requests. | Must | Partly (v18: answers ready in store/play-console-answers.md; the owner enters them in Play Console) | R4 |
| PLAT-06 | Public privacy and account-deletion pages with controller "Edvinas Straigis" and the new GetIt contact address; the deletion page's "What is deleted" lists shared recipes, scanned foods, calendar links and followed calendars. | Must | Partly (v18: pages ready, "What is deleted" complete; needs the owner's new contact address in VITE_CONTACT_EMAIL and the pages published on Netlify) | R4 |
| PLAT-07 | The privacy policy names Netlify (not Cloudflare) as the host of the public pages. | Must | Done (v18) | R4 |
| PLAT-08 | Upload key made by the owner on his own computer; signing keys never pass through anyone else. | Must | Open (owner action) | R4 |
| PLAT-09 | APK size kept in check (the barcode scanner adds about 25 MB per build of all processor types): ship an App Bundle so each phone downloads only its own. | Must | Done (v16: the App Bundle splits by processor type on Play) | SR |
| PLAT-10 | iPhone app later, from the same code. | Could | Partly (v20: iPhone project ios/ (bundle id app.visuma.planner, iOS 15.5, iPhone only) and the iPhone job in the Build workflow ready: a compile check on GitHub's Mac without Apple secrets, TestFlight upload with them; Android-only features hidden on the iPhone, reminders, scanner, text size, safe areas and quick actions made to work there; docs/ios-release.md, store/app-store-answers.md; left: the Apple Developer account, the four GitHub secrets, the first TestFlight build and a test on an iPhone) | R1 |
| PLAT-11 | iPhone home-screen widgets (WidgetKit): Today and stats, as on Android. | Could | Open (needs a widget extension, an App Group and a Mac to test) | R7 |
| PLAT-12 | Sleep from Apple Health on the iPhone, as Health Connect on Android (SLP-05). | Could | Open (needs a HealthKit plugin, the HealthKit entitlement and Apple's health data review) | R7 |

## D35. Assistant (AI)

| ID | Requirement | Pri | Status | Src |
|----------|------------------------------------------------------------------------|----------|-----------|--------|
| AI-01 | Everything AI is hidden. | Must | Done | R4 |
| AI-02 | If an assistant is added later, it edits and adjusts the planner when asked (move, add, copy, set up a module) and shows every change for approval; it never plans by itself. Its name and tone are the person's choice. | Could | Open (no assistant in GetIt for now, by the owner's decision; nothing in the app sends data to an AI) | R1, R4 |

## D36. Calm by default (CALM)

The owner after testing version 16: "the app feels really cluttery; keep most of the options accessible yet kinda hidden; clutter would scare new users." The rules and their research are in docs/calm.md.

| ID | Requirement | Pri | Status | Src |
|---|---|---|---|---|
| CALM-01 | One main action per screen: the round + (or, where typing is the action, the capture field); never a second add for the same thing on the same screen. | Must | Done (v18) | R6 |
| CALM-02 | Visibility follows use: at most 12 tappable things above the fold on a main screen at 360 px, list rows not counted; everything else one level down. | Must | Done (v17) | R6 |
| CALM-03 | One ⋮ per page, top right: views, sort, grouping, layout switches, select, export, edit module, about. No Export links, Edit module buttons or layout switches on pages. | Must | Done (v17) | R6 |
| CALM-04 | The page bar holds 3–5 places and never scrolls; past five pages it is Today, Plan, up to two pins and Modules; only the open page is highlighted; Plan shows the Inbox count. | Must | Done (v17) | R6 |
| CALM-05 | Tabs only for real destinations, at most four; a module's table, board, month and calendar views are under ⋮ → Views. | Must | Done (v17) | R6 |
| CALM-06 | A row is a title, at most one quiet line, a tick and a ⋮; metadata only when set; push, copy, duplicate, move and skip live in the opened row and the ⋮ (push buttons can be brought back from the page's ⋮). | Must | Done (v17) | R6 |
| CALM-07 | One way to say a thing on a row: a time, "All day" and a status each once. | Must | Done (v17) | R6 |
| CALM-08 | Forms stage their fields: what is needed to make the thing is visible; the rest sits in one "More options" that opens by itself when something inside is set and summarises it when closed. | Must | Done (v18) | R6 |
| CALM-09 | A sheet that can guess its first step skips it and shows the guess with "Change" (the add-food sheet opens on the food). | Must | Done (v17) | R6 |
| CALM-10 | Never a sheet on a sheet; every sheet closes on Back and Escape. | Must | Done (v18: every sheet and menu closes on Back and Escape, through one hook) | R6 |
| CALM-11 | No explanatory paragraphs or page subtitles on screens; empty states keep one sentence and one button; explanations live in About or a tip. | Must | Done (v18) | R6 |
| CALM-12 | Settings is a short list of pages with one search; each row has at most one helper line. | Must | Done (v17) | R6 |
| CALM-13 | Data credits and legal lines live in Settings → About and on the page where the data is shown in full (a food's page), not on lists. | Must | Done (v17) | R6 |
| CALM-14 | Tips are one slim line with ×, at most one per session, never repeated, and can be shown again from Settings. | Must | Done (v17) | R6 |
| CALM-15 | Empty sections are hidden and offered as a quiet line where they belong ("+ Set budgets"). | Must | Done (v17) | R6 |
| CALM-16 | Selecting many starts with a hold (or Select in the ⋮); no always-visible Select buttons. | Must | Done (v17) | R6 |
| CALM-17 | No global simple/advanced switch: disclosure is local, modules are opt-in, density choices live in the page's ⋮. | Must | Done (v17) | R6 |
| CALM-18 | Nothing is lost: every function of version 16 is at most two steps away, and "What moved where" lists every move, shown once to people who used an earlier version and never to a new account. | Must | Done (v17) | R6 |

## D37. Prices on the shopping list (PRICE)

The owner: "shopping prices do not seem to appear, yet catalogues online are available." No Dutch supermarket offers an open price feed; their terms forbid scraping and reverse engineering, and the EU database right (CV-Online, C-762/19) makes copying their catalogues a legal risk. Open Prices (ODbL) is the only reusable source; its Dutch coverage is small (about 260 prices in October 2026), so the person's own prices and a one-step "Add price" carry most of the list.

| ID | Requirement | Pri | Status | Src |
|---|---|---|---|---|
| PRICE-01 | Open Prices lookup for list items whose food has a barcode, from the device, naming the app, cached 7 days, never blocking the list; offline shows the cache. The person's chain in their country first, else the median of the country's last 90 days. Never a guess. | Must | Done (v17) | R6 |
| PRICE-02 | The household's own latest price at that shop wins over Open Prices. | Must | Done (v17) | R6 |
| PRICE-03 | A quiet price on each row ("€1.89" own, "≈ €1.89" shared, count and date on tap); unknown shows nothing and offers "Add price". Summary "5 to get · €12.40 + 2 unpriced". ODbL credit in the price detail and in About. | Must | Done (v17) | R6 |
| PRICE-04 | Adding a price takes one step from a row: the amount per pack or per kg/l; the shop is the list's shop filter or the last used; Undo. | Must | Done (v17) | R6 |
| PRICE-05 | Opt-in sharing of a price to Open Prices: an Open Food Facts account (token in secure storage), a photo of the price tag or receipt, the shop's OpenStreetMap location, date and currency; privacy policy updated first. | Should | Partly (v18: built and checked with mocked answers; left: one real share from the Android app with an Open Food Facts account, to confirm the camera app hands the photo over without the camera permission) | R6 |
| PRICE-06 | Each kept shop links to the chain's own official weekly offers page, opened in the browser; nothing is copied into the app. No scraping of supermarket sites or use of unofficial APIs or scraped datasets (their terms forbid it; EU database right). | Should | Done (v17) | R6 |



# Part E. Specification of the planner core as built (version 15)

Written from the code on branch `main` (latest commit 02c9d7f, "Nav check: the page swipe starts from a still page on a row's name"). It describes what the app does today, not what it is meant to do. Paths in square brackets are relative to the repository root, so each statement can be checked.

Words used throughout:
- **Device-only**: kept in the phone's or browser's own storage. It never goes to the server and never reaches the person's other devices.
- **Synced**: written on the device first, then sent to the server (Supabase) and to every other device signed in to the same account.
- **Profile**: one person's plan inside an account. A new account gets one profile. The data model allows more, but no screen can create another one (see 7.2).
- A day is always written `yyyy-MM-dd`, a time `HH:MM`. Weeks start on Monday everywhere.


## 0. App shell and start-up

- On start the app checks for Supabase credentials. Without them it shows a single line: "No Supabase credentials. Copy .env.example to .env and fill it in." [src/App.tsx]
- The order of screens:
  1. While another account is being opened: the "Switching to <name>…" screen (see 1.6).
  2. Not signed in: the sign-in screen.
  3. Signed in through a password-reset link: the "New password" screen. Nothing else can be reached until a new password is saved.
  4. While "Add another account" is in progress: the sign-in screen in "adding" mode.
  5. Until the profile has loaded: "Setting up your profile…", with nothing to tap.
  6. A profile that has not finished first-run setup: the onboarding wizard, with no page bar.
  7. Otherwise: the app, with these routes: `/` Today, `/plan` Plan, `/food` Food, `/shop` Shop, `/more` More, `/m/<key>` a module page. Any other address goes to Today.
- `/food`, `/shop` and `/m/<key>` open only while their module is switched on. If the module is off, or the page never existed, the address sends the person to Today. Nothing redirects until the module list has loaded, so a cold start does not bounce off a page that does exist. [src/App.tsx, src/lib/pages-rules.ts `pageAllowed`]
- When setup counts as done: the profile's `settings.onboarded` flag is true. Accounts made before the flag existed also count as done if they have a calorie target or a height. [src/App.tsx `needsSetup`]
- The theme follows the phone's or computer's light/dark setting, and the browser bar colour follows it (`#15141b` dark, `#f8f4ed` light). There is no in-app theme switch. [src/main.tsx]
- Fonts (Spectral, IBM Plex Sans) ship inside the app, so no request goes to Google. [src/main.tsx]
- On the web, a service worker is registered in production builds so the app opens with no connection. [src/main.tsx, public/sw.js]
- Each local copy belongs to one account. When a different account signs in on the same device, the local copy is wiped first. Signing out also wipes it. [src/App.tsx, src/lib/db.ts `resetLocal`]
- After sign-in the app: applies ticks made on the Android widget, syncs, turns repeating series into tasks, and schedules reminders. [src/App.tsx, src/lib/lifecycle.ts]


## 1. Sign-in, sign-up, invite list, onboarding, accounts

### 1.1 Sign-in screen (three modes)
- Title "GetIt". The line under it changes with the mode:
  - Sign in: "Sign in to your planner."
  - Create account: "Create an account. Passwords are at least 10 characters."
  - Reset: "Reset your password."
  - Adding an account: "Add another account. The one open now stays on this device."
- Fields: Email (required, type email). Password (required; at least 10 characters only when creating an account). Reset mode has no password field.
- Create account adds a required tick box: "I agree that GetIt stores the health and fitness details I enter — weight, food, training — to plan with them." with an inline "Read the privacy policy" link that opens the policy inside the app. "Create account" stays disabled until the box is ticked.
- When the account is created, the time of consent (`health_consent_at`) and the policy version (`privacy_version`, currently `2026-09-29`) are stored with the account.
- The main button reads "Sign in" / "Create account" / "Send reset link" / "Add account", and "Working…" while busy.
- "Continue with Google" appears only when the build sets `VITE_ENABLE_GOOGLE=true`. It is hidden in reset and adding modes.
- Links under the form:
  - In sign-in mode: "Forgot your password?" and "No account yet? Create one".
  - In the other modes: "Back to sign in".
  - In adding mode: "Cancel".
- Messages:
  - Reset always says "If that address has an account, a reset link is on its way. Open it on this device." The wording is the same either way, so the form cannot be used to find out who has an account.
  - Sign-up while email confirmation is on: "Check your email and open the link on this device to confirm the address." Email confirmation is now off on the server, so new accounts open straight away and this note does not appear.
  - An address not on the invite list: "GetIt is invite-only for now. Ask to have your address added."
  - Any other error shows the server's message as it is.
- Email links (confirm and reset) use PKCE. A link works only on the device that asked for it. Possible notes:
  - "That link has expired. Ask for a new one."
  - "That link could not be used. Ask for a new one."
  - "Open the link on the phone or browser where you asked for it, or ask for a new one."
  - "Your address is confirmed."
  - In a browser, the code is removed from the address bar so it cannot be used twice. On Android the link returns as `app.visuma.planner://auth-callback?...`.
- The "New password" screen: "New password" and "The same again", each at least 10 characters. Mismatch: "The two passwords do not match." Button "Save password" ("Saving…").
- When accounts are kept on this device (see 1.6), an "On this device" list appears above the sign-in form, with "Remove" and "Open" for each account.

[src/screens/Auth.tsx, src/lib/auth-links.ts, src/lib/supabase.ts, src/lib/native.ts `authRedirect`, src/settings/Accounts.tsx `SavedAccounts`]

### 1.2 Invite-only list (server)
- The database checks every new sign-up. The rule: if `private.settings.signups` is not `'open'`, the email (in lower case) must be in `private.signup_allowlist`. Otherwise the sign-up fails with "GetIt is invite-only for now". The setting starts as `'invite'`.
- To open sign-ups to everyone: `update private.settings set value='open' where key='signups'`.
- The list cannot be read or changed through the app's API, and there is no admin screen for it. There is a script for it (the `allowlist` check covers it).
- Deleting an account also removes its address from the invite list.
- What a new account gets (server function `handle_new_user`):
  - a household called "Home", with the person as its owner;
  - a default profile named after the part of the email before the "@", with time zone fixed at `Europe/Amsterdam`;
  - a module switch row for every module. These are on: core, nutrition, shopping, training, habits, supplements, health, learning, agenda. Onboarding then sets them to match the chosen template.

[supabase/migrations/012_security.sql §7, 009_modules_and_signup.sql, 014_retention.sql]

### 1.3 Onboarding wizard (first run, four steps, no page bar)
The header reads "Step N of 4" with the step's title. The buttons are "Back" (from step 2 on) and "Next", or "Start planning" on the last step. Only the name is required. "Next" on step 1 stays disabled while the name is empty.

**Step 1 — "Who is planning"**
- Name: starts with the profile's current name (the email's first part).
- Country (optional): a type-to-search picker over every ISO 3166-1 country and territory, about 250 of them, with English names. Placeholder: "Type to find your country". It can be cleared.
- City or town (optional): at most 80 characters. Spaces are tidied when saved.
- Note: "Country and city are used for nearby shops and public holidays. You can change them in More."

**Step 2 — "Your day"**
- Lead: "Only the fixed parts, if you have any. Everything else you plan as you go."
- Tick box "I have work or school hours" ("Added to your plan as a repeating block on those days."). Off by default.
- When it is ticked:
  - Start (default 09:00) and End (default 17:00).
  - Day buttons Mon to Sun. Mon–Fri are on by default.
  - A line underneath says one of: "Start and end are the same time, so nothing is added." / "Pick at least one day." / "8 h." (with "X h Y min" when needed, and ", ending the next morning" when the end is earlier than the start).
  - Tick box "Keep these hours free of other tasks" ("Locked: nothing else is planned across them."). Off by default.
  - Tick box "Plan my commute too" ("A travel block before and after, on the same days."). When ticked: "Before, min" and "After, min" (0–600, in steps of 5, each default 30) and "One way, km" (optional; text box that accepts a comma or a dot; between 0 and 2000, otherwise left empty).
- See 5.9 for what work hours do to the plan.

**Step 3 — "Start from"** (starting layout)
- Text box "Describe your days in a few words" (placeholder "e.g. student, exams, part-time job"). Typing suggests a template:
  - "Suggested: <Template>, from “word”, “word”." or "No match for those words. Pick the closest below."
  - The suggestion picks the card for the person only until they tap a card themselves. After that it is only highlighted with a "suggested" tag.
- Template cards (radio group "Starting layout"). Each shows its name, a description and the modules it switches on:

| Key | Name | Description | Modules on | Nutrients | Today figure | Targets step starts |
|---------------|----------------|----------------------|--------------------|---------------|----------|------------|
| minimal (default) | Minimal planner | Tasks and a calendar, nothing else. Add the rest when you want it. | agenda | kcal | none | off |
| student | Student | Lectures, study blocks, deadlines and enough sleep. | agenda, learning, projects, habits, sleep | kcal | none | off |
| office | Office worker | Set work hours, a commute, and the evenings and weekends around them. | agenda, projects, habits, shopping | kcal | none | off |
| shift | Shift worker | Changing hours and nights, with sleep and meals planned around the rota. | agenda, sleep, habits, shopping, nutrition | kcal | none | off |
| household | Parent / household | Family meals, shopping, chores and everyone’s appointments. | agenda, household, shopping, nutrition, habits | kcal | none | off |
| fitness | Fitness & nutrition | Training, a meal plan with macro targets, weigh-ins and supplements. | agenda, nutrition, shopping, training, habits, supplements, health | kcal, protein, carbs, fat, fibre | kcal | on |
| freelance | Freelancer / projects | Projects and deadlines, client work, and money in and out. | agenda, projects, finance, learning, habits | kcal | none | off |
| everything | Everything on | Every module switched on, to look around and turn off what you do not need. | all 13 (not Custom) | kcal, protein | kcal | on |

- How the suggestion scores words:
  - Every template has "keywords" worth 2 points and "hints" worth 1 point.
  - Words match only as whole words. Accents and punctuation are ignored.
  - Longer phrases are read first and use up their words, so "school run" counts for household and not also "school" for student.
  - On a tie, the template listed first wins.
  - The full word lists are in `src/lib/templates.ts`. For example, student keywords include student, study, school, university, uni, college, exam(s), lecture(s), homework, thesis, course(s), class(es), revision.
- Expander "Adjust modules · N on ▾/▴": one switch per module (Custom is not listed), each with its name and summary.

**Step 4 — "Body targets"**
- Switch "Set calorie and body targets" ("Optional. A calorie and protein budget for the meal plan. While this is off, nothing about your body is saved."). It starts on or off according to the template.
- When on, the fields are:
  - Sex: Female / Male.
  - Date of birth.
  - Height, cm.
  - Weight today, kg.
  - Activity: a dropdown of exactly these ten levels, shown as "value · label":
    - 1.2 · desk job, little walking
    - 1.3 · desk job, a daily walk
    - 1.375 · light exercise 1 to 3 days a week (the default when nothing is stored)
    - 1.45 · on your feet part of the day
    - 1.5 · desk job and hard training most days
    - 1.55 · moderate exercise 3 to 5 days a week
    - 1.65 · on your feet all day: shop, warehouse, care
    - 1.725 · hard exercise 6 or 7 days a week
    - 1.8 · physical job and regular training
    - 1.9 · heavy manual work, or training twice a day
  - Body goal (default "Maintain and recomp"):
    - Lose fat — "500 kcal under maintenance" (cut, −500)
    - Maintain and recomp — "at maintenance" (recomp, 0)
    - Build muscle — "300 kcal over maintenance" (bulk, +300)
- Targets appear only once a sex is chosen and the weight is above 0. They show kcal, protein, fat and carbs, plus the working, for example "from 82 kg · plan recomp · BMR 1780 × 1.375 = 2448". Before that the screen says: "Choose sex and put in a weight, and the targets appear with the arithmetic that produced them."
- How the targets are worked out:
  - Resting burn (BMR) uses the Mifflin-St Jeor formula, multiplied by the activity factor, plus the goal adjustment.
  - Protein: 2.2 g per kg (cut), 1.9 (recomp) or 1.7 (bulk).
  - Fat: 27% of the calories ÷ 9.
  - Carbs: whatever calories are left ÷ 4.
  - Fibre: 14 g per 1000 kcal.
  - **Caveat:** if height or date of birth is left blank, the sum quietly assumes 175 cm and age 30.
- When the switch is off: "Targets can be added later: height and date of birth in More, then a weigh-in on the Body tab."

**"Start planning" writes, in this order:**
1. The module switches.
2. If targets are on and could be worked out: a target row dated today, and a weigh-in for today.
3. The work and commute series.
4. The profile: name, country, city, settings (`onboarded: true`, template, work, commute, the template's nutrients and Today figure), and the body fields if the targets switch is on.

Writing the profile last is what swaps the wizard for the app.

[src/screens/Onboarding.tsx, src/lib/templates.ts, src/lib/activity.ts, src/lib/calc.ts, src/settings/WorkFields.tsx, src/lib/setup.ts, src/lib/countries.ts]

### 1.4 Sign-out
- Where: More → Data → Account → "Sign out" ("Also clears everything GetIt stored on this device.").
- What it does: signs out, then wipes the whole local database and the Android widget's copy.
- **Caveat:** it does not first send changes that are still waiting. Any offline edits still queued are lost. Switching accounts, by contrast, refuses until the queue is empty.
- The signed-out account is taken off the "kept on this device" list.

[src/screens/More.tsx, src/App.tsx, src/lib/accounts.ts]

### 1.5 Delete account
- Where: More → Data → "Delete account".
- Text: "Removes your account, your profiles, plan, logs, recipes and settings from the server and from this device. A household you share passes to the other member. This cannot be undone."
- Steps:
  1. "Delete" opens a box: "Type **delete** to confirm". The match is exact and case-sensitive.
  2. "Delete for good" is enabled only when the word is right and there is a connection. Offline it shows "Needs a connection."
  3. It calls the server function `delete_my_account`, which removes:
     - every household the person owns; a shared one passes to the other member, and only the person's own profiles are removed from it;
     - their place on the invite list;
     - audit-log rows.
  4. It then wipes the device and signs out.
- If the server refuses: "The account could not be deleted. Nothing was removed. <message>".
- There is also a public web page that deletes an account without the app (see 13.6). That page ignores letter case and spaces in "delete".

[src/screens/More.tsx `DeleteAccount`, supabase/migrations/012_security.sql §8, 014_retention.sql, site/delete.ts]

### 1.6 Several accounts on one device (More → Data → Account)
- At most 5 accounts per device. One account's data is on the device at a time.
- The list is stored differently by platform:
  - Android: in encrypted storage (Android Keystore), including each account's refresh token.
  - Browser and Windows: `localStorage` key `getit-accounts`, with no tokens.
- Email addresses are shown masked ("e•••@gmail.com"). The list is ordered by most recently used.
- The list only starts filling once a second account is added. After that, every account that signs in on the device joins it.
- Rows on the screen:
  - The open account: its name and the chip "Open now". This row shows only when other accounts exist.
  - Each other account: "Remove" and "Switch" ("Checking…" while busy). Both need a connection.
  - "Add another account": "Up to 5 accounts on this device, one open at a time. Switching asks for the phone’s fingerprint, face or PIN." (on Android) or "…asks for that account’s password." (elsewhere) "…Signing out takes the open account off the list." The button reads "Add".
  - Offline: "Adding or switching accounts needs a connection."
- **Switching:**
  1. The app first sends every queued change and any widget ticks.
  2. It refuses if offline ("Switching needs a connection, so that nothing waiting to be sent is lost. Try again when you are online.") or if anything is still queued ("N changes are still waiting to be sent. Switching waits until they have gone up, so nothing is lost.").
  3. On Android, with a screen lock and a saved token, it asks for the phone's unlock (biometric prompt "Switch account" / "Open <name> in GetIt"; PIN, pattern or password also work). Anywhere else, a password box appears under the row ("Password for e•••@…", buttons "Cancel" / "Open").
  4. The other account is opened "on the side" first, so a wrong password or a dead token changes nothing on the device. Possible messages: "Cancelled. Nothing changed." / "The phone was not unlocked. Nothing changed." / "This account was signed out on this device. Enter its password to open it." / "That password is not right for this account. Nothing changed." / "The server could not be reached. Nothing changed." / "That signed in to a different account. Nothing changed."
  5. Then the local copy is wiped and a full-screen "Switching to <name>…" appears ("Opening the account and downloading its plan. This device shows one account at a time."). After 20 seconds it adds: "This is taking longer than usual…" and a "Try again" button.
  6. In a browser, the account left behind is signed out on the server.
- **Add:** checks there is room (5, counting the open account), a connection and an empty queue, then shows the sign-in form in adding mode. If the address is already on the device: "That account is already on this device." If the list is full: "This device keeps up to 5 accounts. Remove one first."
- **Remove:** asks "Take <name> off this device? Its data stays in the account. Opening it here again needs its password." with "Cancel" / "Remove". On Android the stored token is also ended on the server.
- **Profiles inside an account:** More → Profile → "Profiles" lists the account's profiles with "Current" / "Switch". Switching here only changes the profile shown in this session; it is not saved. There is no button to add a profile.

[src/lib/accounts.ts, src/lib/accounts-rules.ts, src/settings/Accounts.tsx, src/screens/Switching.tsx, AndroidManifest (USE_BIOMETRIC)]


## 2. Navigation

### 2.1 Pages and the page bar
- Pages, in the app's default order:

| Page | Glyph | Route | Appears when |
|--------------------|-------------------------|---------------------|--------------------------------------------|
| Today | ◉ | / | always (primary: drawn larger, in the accent colour) |
| Plan | ▤ | /plan | always (primary) |
| Food | ◍ | /food | Nutrition is on |
| Shop | ⛬ | /shop | Shopping is on |
| Training | ▲ | /m/training | Training is on |
| Habits | ✓ | /m/habits | Habits is on |
| Supplements | ◇ | /m/supplements | Supplements is on |
| Health | ♡ | /m/health | Health is on |
| Learning | ◧ | /m/learning | Learning is on |
| Agenda | ▦ | /m/agenda | Agenda is on |
| Sleep | ☾ | /m/sleep | Sleep is on |
| Projects | ▣ | /m/projects | Projects is on |
| Finance | ¤ | /m/finance | Finance is on |
| Household | ⌂ | /m/household | Household is on |
| Stats | ◔ | /m/stats | Stats is on |
| (each built module) | its own mark, or the first letter of its name | /m/u_… | it exists, is not deleted, and is switched on; ordered by module order, then name |
| More | ⋯ | /more | always (last) |

- "core", "custom", "nutrition" and "shopping" never get a `/m/` page (nutrition and shopping use /food and /shop).
- Today and Plan always come first and More always comes last, whatever order is stored. These three can never be hidden or moved.
- Before the module list has loaded, the bar shows only Today, Plan and More.

[src/lib/pages-rules.ts, src/lib/pages.ts]

### 2.2 Page bar styles (More → Modules → "Page bar" → Style)
- Five styles, each with a small drawn preview: "One row", "Two rows", "Three rows", "Drawer", "Fan". The default is "One row".
- The styles apply only on a narrow screen, held upright (width 899 px or less):

  - **One row:** up to 5 pages share the row, with Today and Plan wider (1.25×). With more than 5, Today and Plan stay pinned on the left, More on the right, and the rest scroll sideways in between. The ends fade, and the open page scrolls into view.
  - **Two rows / Three rows:** Today and Plan are tall tiles on the left, spanning the rows. The other pages fill a grid row by row (columns at least 54 px). Fewer pages than rows means fewer rows. The grid scrolls sideways when it overflows.
  - **Drawer:**
    - The bar holds Today, Plan, the page open now (if it is another one) and a "☰ Modules" handle.
    - The handle, or swiping up on the bar, opens a bottom sheet titled "Pages" with every other page.
    - The sheet closes on: swiping down from its top, tapping the dimmed background, Escape, or choosing a page.
    - The sheet keeps focus inside it, and focus returns to the handle when it closes.
  - **Fan:**
    - The bar holds Today, Plan, a centre button and More. The centre button shows "✦ Modules", or the open page's glyph and name.
    - Tapping it fans the other pages out above it in rows that widen as they rise (2, 3, 4 … up to what fits, at most 5 per row), so they form a triangle.
    - The pages fly out with a short stagger. With "reduce motion" on, they simply appear.
    - It closes on: tapping the background, Escape, or choosing a page.
- **Wide screen** (900 px or wider and not short, e.g. desktop or the Windows app): always a sidebar listing every page on the bar, whatever the style.
- **Landscape phone** (sideways and at most 500 px tall, the "rail"): a slim rail down the left, with Today and Plan at the top, More at the foot, and the rest scrolling between. The Drawer style keeps its idea on the rail: Today, Plan, the open page and a "☰ Modules" button that opens a "Pages" box beside the rail. The add button (+) sits at the foot of the rail.
- The bar's height is published as `--nav-h`, so the floating + button sits above two- or three-row bars.

[src/ui/Nav.tsx, src/ui/useLayout.ts, src/ui/nav.css, src/styles/landscape.css, src/settings/NavSettings.tsx]

### 2.3 Page order and hiding (More → Modules → Page bar → "Pages")
- Text: "Each module that is on has a page. Move them to change the order; switch one off to keep it off the bar without turning its module off."
- Each row shows the glyph and the name. Today, Plan and More are marked "always there" and have no controls.
- The other rows have ↑/↓ buttons (labelled "Move X up/down") and a switch "Show X on the bar".
- A page hidden from the bar still opens by its address (for example from a module's "Open" button in More).
- "Back to the usual order" appears once anything has been reordered or hidden. It clears both lists.
- These settings are stored in `profile.settings.nav` (synced).

### 2.4 Swiping between pages
- Switch "Swipe between pages" (default on). Text: "Swipe sideways on a page to open the next one on the bar. Swipes on the days, the tabs and wide tables still move those."
- What counts as a page swipe:
  - It must be clearly sideways: more than 60 px, sideways movement at least 1.5 times the vertical movement, and either quick (above 0.35 px/ms) or longer than a quarter of the screen.
  - It moves to the next or previous page on the bar. It does not wrap: swiping past More does nothing.
- Swipes are left alone when they start on: the week strip, any tab row, the page bar, a sheet or dialog, a listbox, a slider, an input, a map or canvas, anything marked `data-no-swipe`, or anything that scrolls sideways itself (tables, the year grid). Swipes are also ignored while any sheet or dialog is open.
- While the finger moves, the page follows it by up to 40 px as a hint. The new page slides in from the side the finger came from. With "reduce motion" on, there is no movement.

[src/ui/useSwipe.ts, src/App.tsx]

### 2.5 Module pages `/m/<key>`
- Header: the module's mark, its name, and an "Edit module" button. The summary sits underneath, and one tab per visible view if there is more than one.
- If the module is switched off, a strip appears above: "This module is switched off, so it has no place on the page bar." with a "Switch on" button.
- What the page shows depends on the module:
  - **Habits, Supplements, Health and Stats:** their own section (habit grid, supplement checklist, weigh-in, Stats) plus an Export link.
  - **Nutrition and Shopping:** "This module has a screen of its own." with "Open Food" / "Open Shopping".
  - **Custom:** "Build a module of your own under More, Modules…" with "Go to Modules".
  - **Everything else** (Training, Learning, Agenda, Sleep, Projects, Finance, Household, built modules): the generic page with its views (see 9.4), a round + button labelled "Add <record name>", and an Export link.
- A module that cannot be found: "There is no module here. It may have been deleted. Modules are in More."

[src/modules/ModulePage.tsx]


## 3. Today

### 3.1 Header
- **Date heading**, for example "Thursday 1 October". The year is added only when it is not the current year.
  - The heading is a button ("Go to a day"). It opens a bottom sheet "Go to a day" with a vertically scrolling calendar of months, opened on the day shown.
  - Tapping a day goes there. The sheet's buttons are "Today" and "Close". Escape closes it.
- **Line under the date:** the chosen figure (More → Profile → Food → "On Today"). For calories this reads "1240 / 2448 kcal", for other nutrients "Protein 80 / 155 g", or just "1240 kcal" when there is no target.
  - It shows only when Nutrition is switched on and the figure is not "Nothing".
  - The target used is the newest one that had started by the day shown.
  - When there is a target, a thin progress bar appears (role progressbar, 0–100).
- **Public holiday chips** under the date, for example "King's Day (NL)". Countries sharing a holiday share a chip, with one colour bar per country.
- **Week strip:** seven days Monday to Sunday. Each shows the first letter of the weekday and the date in a disc.
  - Today is marked. The day shown is marked as current (`aria-current="date"`).
  - Tapping a day shows it.
  - Swiping the strip sideways (40 px or more, mainly sideways; works with touch or a mouse drag) moves a week. A drag never counts as a tap.
- **Range:** every way of moving stops 3 years back and 5 years ahead of today, in whole months (from the 1st of the month 36 months back to the end of the month 60 months ahead). Days outside are disabled in the strip and the picker.

[src/ui/PageHead.tsx, src/lib/calendar-rules.ts, src/ui/useDayRange.ts, src/screens/Today.tsx, src/lib/quick-food.ts `metricLine`]

### 3.2 Tabs (they change with the day)
- "Today" is always there. If it is the only tab, no tab row is drawn.
- Every other tab needs two things: its part of the app switched on, and something on that day for it.
- The tabs, in this order:
  1. **Today:** every task of the day.
  2. **Body:** combines three parts. The tab is called "Body", or after its one part when only one applies ("Habits", "Supplements"; the Health part alone is called "Body").
     - Health part: Health is on, and either a weigh-in is logged that day or the day is today.
     - Habits part: Habits is on, the rule "A daily habit appears on every day" is on, and at least one active habit is due that day.
     - Supplements part: Supplements is on and at least one supplement is active.
  3. **Work:** work hours are on and the weekday is a work day, or the day has a task in the Work section.
  4. **Training:** Training is on and the day has a task belonging to Training (module_key `training`, or the Training section).
  5. **Module tabs**, one per module: the module is on, and the day has records dated that day or tasks belonging to it. Order: Learning, Projects, Finance, Household, Custom, then built modules by name. These modules never get a tab: nutrition, shopping, health, habits, supplements, sleep, agenda, training (it has its own tab), work, evening, stats.
  6. **Evening:** the review has open tasks for the day (only on today or a past day), or the day has a task at 18:00 or later, or in the Night section.
  7. **Sleep:** Sleep is on, and a sleep log exists for the day or the day is today.
- Two tabs may not share a name (for example a built module called "Work"). The later one becomes "Work (2)".
- If the chosen tab does not exist on a newly picked day, the screen falls back to Today and stays there. It does not jump back later.
- What each tab shows:
  - Today, Work, Training, Evening and module tabs show the task list ("rail"), filtered: Work = Work section; Evening = 18:00 or later, or Night section; module = tasks of that module.
  - Body shows the weigh-in with targets and recent weigh-ins, the day's habits (tick, run of days, schedule) and the day's supplements.
  - Sleep shows that night's log ("To bed" / "Woke" / "Quality" 1–5, "Save", "Change", "Cancel").
  - Module tabs also list the day's records of that module, one line each (time and title), with an "Open <Module>" link. Records are not edited here.
  - Evening shows the full review (3.6).
  - Today also shows the compact review line, events from followed calendars, and "Repeats to come".
- On a landscape phone or a wide screen with room (720 px or more), the tasks and the tab's own section stand side by side.

[src/lib/day-tabs.ts, src/lib/day.ts, src/screens/Today.tsx, src/sections/BodySection.tsx, src/sections/ModuleDay.tsx, src/sections/SleepDay.tsx, src/styles/landscape.css]

### 3.3 Task rows
- **Order:** by time (tasks without a time go last), then by their order number.
- **Empty states:** on Today, "Nothing planned for this day yet. Add something with the + button."; on another tab, "Nothing in <Tab> for this day." A module tab with no tasks shows no list at all.
- **Layout from left to right:**
  - Time in the margin (HH:MM, or blank).
  - A dot on the rail, in the module colour when colours are on.
  - The name. Tapping the name opens the task sheet.
  - A line under the name with: "<n> min", then the section (or the module's name when there is no section but there is a colour), then "pushed N×" (only when the task is not flagged).
  - Note marks: a checklist in the note shows a chip "done/total" (with a "complete" style when all are ticked; it reads "N of M checklist items done"). Any other note shows a small page icon ("Has a note").
  - **Flagged** (status `stuck`, or `needs_review`): a warning style and a line "pushed N×, needs a new time".
- **Right side:**
  - **Push buttons "15", "30", "60"** (titles "Push 15 minutes" and so on). They are hidden on a locked task, which shows a lock icon instead ("Locked — nothing may move this").
  - A push adds the minutes to the task's time, sets the status to `pushed`, adds 1 to the push count, and flags the task once it has been pushed 3 times or more.
  - **Caveats:**
    - A task with no time is pushed from 09:00 (for example 09:15).
    - A push past midnight wraps the clock (23:30 + 60 becomes 00:30) but keeps the same date.
    - Pushing a task that is done makes it "pushed" again, which un-ticks it, but its completion time is kept.
  - **Tick** (round button, "Tick" / "Untick", `aria-pressed`). It sets done (with the completion time) or back to `todo`.
  - **⋮** ("Move <title>", a menu): "Move up", "Move down" and the hint "Or hold a task and drag it." It works with the keyboard: arrows move between items, Escape closes. The menu opens upwards near the bottom of the screen.

[src/ui/TaskRow.tsx, src/screens/Today.tsx `push`/`tick`, src/lib/notes.ts]

### 3.4 Dragging to reorder
- How to start: hold a row for 350 ms (finger or mouse). The phone buzzes 8 ms if allowed.
  - Moving more than 8 px before the hold is up counts as scrolling, not a drag.
  - While dragging, the page does not scroll and page swipes are blocked.
  - The page scrolls by itself near the top or bottom edge.
  - Escape, a phone call or leaving the app cancels the drag.
  - The click that follows letting go is swallowed, so a drag never ticks a task.
- A task stays among its own kind: tasks with a time move among tasks with a time, tasks without one among the rest.
  - **A task with a time swaps times with the task it is dropped on.** Nothing else on the day moves. If both have the same time, their order numbers swap.
  - **A task without a time** slides into its new place and the others close up. Order numbers are handed out again.
- **Ask first** (a sheet titled "Move “<title>”?", listing "“X” moves to HH:MM.", with "Cancel" and "Move" / "Move anyway"). It asks when:
  - the dragged task is locked ("is locked. Nothing is meant to move it.") or fixed ("is fixed in place.");
  - the task it swaps with is locked or fixed;
  - a new time would land in **locked** work hours, and the task was not already inside them ("would land in your locked work hours (09:00 to 17:00)."). A night shift from the evening before counts;
  - a new clash with another task is created ("“A” would overlap “B”."). A task with no length counts as one minute.
- After a move, a screen-reader line says "<title> moved to HH:MM".
- Moving a repeating task here changes only that one task. No series exception is written.

[src/ui/DragList.tsx, src/ui/useLongPress.ts, src/lib/reorder-rules.ts, src/ui/MoveSheet.tsx]

### 3.5 Other items on Today
- **Events from followed calendars** (Today tab only), under the heading "From your calendars". Each row shows the time (or "All day"), a coloured bar, the title, and the calendar's name and place. They are read-only; tapping one opens a sheet (11.2).
- **"Repeats to come"** (Today tab only): on a day more than 56 days ahead, the repeating tasks that will land there. Text: "Each becomes a task you can tick eight weeks before the day." Each line shows the time, a dot, the title and ↻. They cannot be ticked.
- **Export link:** small, bold and underlined at the bottom right, reading "Export". It exports the calendar for this day (see 10.2), offering ".ics" first.
- **Round + button** ("Add a task"): opens a new-task sheet for the day shown.

### 3.6 The evening review
- **What it lists:** every task on or before the day shown that is not done, not dropped, not deleted, not locked and not a meal task.
  - Order: flagged tasks first, then oldest day, then time, then order number, then title.
- **Compact line** (Today tab):
  - Shown only when there is something to review and the time has passed (default 21:00). A past day always shows it; a future day never does.
  - Text: "<Persona>: N tasks are left from today [and earlier]. Review them?", with a "Review"/"Hide" toggle that opens the list in place.
  - The clock behind it updates every 30 seconds.
- **Full review** (Evening tab): heading "Review". Either the list or "Nothing left to review.", then a **"Review time"** setting ("After this time, Today offers the review. For this device only.").
- **Each item:**
  - Title (tap to edit). A line with time · minutes · section · "left from <yesterday | Tue 22 Sep>".
  - A flag note, for example "moved 3 times — keep it, make it smaller, or drop it?" or "pushed 3 times — …".
  - Chips: "Tomorrow", "Pick a day", "Done", "Drop".
    - **Tomorrow:** moves the task to the day after its own day (or after the reviewed day, if it was carried in), but never to a day already gone. It adds 1 to the extension count, resets the status to `todo`, and flags the task when the count reaches the limit.
    - **Pick a day:** a date box (earliest = today) and "Move". The task moves, the count goes up, and the flag is cleared.
    - **Done:** marks it done and clears the flag.
    - **Drop:** sets the status to `dropped` and clears the flag. A dropped task disappears from the review and the widget, but stays on the Today list.
  - A double tap cannot move a task two days.
- **Limits and settings:**
  - The extension limit is 3, kept on the device (1–99 is accepted). There is no screen to change it.
  - The review time is device-only.
- Moving a repeating task here does not write a series exception.

[src/sections/ReviewCard.tsx, src/lib/review-rules.ts, src/lib/review.ts]


## 4. Plan

Tabs: "Week", "Month" and "Year". It uses the same date header, week strip and range as Today (3.1). An "Export" link at the bottom exports the calendar for the week, month or year shown.

### 4.1 Week
- **Seven columns**, Monday to Sunday. Today is highlighted.
  - The heading reads "Mon 28", with a holiday underline in each country's colour.
  - The heading's tooltip lists the holiday names and the hold hint.
- **Items in each column:**
  - Tasks by time: "HH:MM title", with a module dot.
  - Then "planned repeats" (quieter, with ↻; tooltip "Planned repeat. It becomes a task eight weeks before the day.").
  - Then events from followed calendars (a coloured bar; tapping one opens the read-only sheet).
  - An empty day shows "—".
- **Tapping a task in Week does nothing.** Tasks cannot be opened, edited or added from Plan. There is no + button.
- **Hint line:** "Hold a day to swap it with another, or hold a task to move it."
- **Swapping days:**
  1. Hold a day's heading, or focus it and press Enter or Space.
  2. A banner says "Swapping **Mon 28 Sep**. Tap the day to swap it with." with "Cancel".
  3. Tap another day, or drag onto it.
  4. A sheet asks "Swap Mon 28 Sep and Wed 30 Sep?" with lines "N tasks move to …", "N tasks move to …", "Each keeps its time.", "N done tasks stay where they were.". Buttons: "Swap" / "Swap anyway".
- **What stays put when days swap:** locked tasks ("is locked and stays where it is."), fixed tasks, and done tasks.
- **Warnings on a swap:**
  - Repeating tasks move for these days only ("“X” repeats. Only this day moves; the series keeps its days." or "N of these repeat…").
  - A task landing in locked work hours on its new day.
  - A task landing on top of a task that stays.
- "Nothing on these two days can move." shows only "Close".
- **Moving one task:**
  1. Hold a task.
  2. Banner: "Moving “X”. Tap the day to move it to."
  3. Tap or drag onto a day.
  4. If there are warnings (locked/fixed, repeats, locked work hours, clash), a sheet asks "Move “X” to Wed 30 Sep?" with "It keeps its time, 09:00." or "It has no time, and keeps none." Otherwise the task moves straight away.
- Escape lets go of what is held.
- **Moves of repeating tasks** are written as a series "move" exception, so the old day is not filled again. All moves go up in one push.
- **Under the grid:**
  - A note when any planned repeats are visible: "↻ Planned repeat: worked out from its series, it becomes a task you can tick eight weeks before the day."
  - A legend of module colours on the week.
  - A legend of holiday colours.
  - A legend of followed calendars.

[src/screens/Plan.tsx, src/ui/WeekSwap.tsx, src/lib/reorder-rules.ts `planDaySwap`, `singleMoveWarnings`, src/lib/series.ts `moveToDays`]

### 4.2 Month
- Navigation "‹ September 2026 ›". The arrows are disabled at the ends of the range.
- A load legend: "Load" with the steps "none / under 1 h / to 3 h / to 6 h / more".
- **Grid:** full weeks Monday to Sunday. Days from the neighbouring months are dimmed (40%).
- **Each cell shows:**
  - a holiday bar along the top;
  - the date number;
  - a "load" bar in the heat colour;
  - up to 4 module dots (most items first, only when colours are on);
  - up to 4 followed-calendar marks.
- **How load is counted:** the sum of the tasks' and planned repeats' minutes, with 15 minutes for a task with no length, plus the minutes of timed followed events. Whole-day events add nothing.
  - Heat steps: 0, under 60, under 180, under 360, 360 or more.
- The cell's tooltip lists holiday names and "N events from your calendars".
- Tapping a day opens that day's Week.
- Legends for modules (this month's days only), holidays and calendars follow.

### 4.3 Year
- The legend "Load … Tap a day for its week".
- **A vertical scroller of months** across the whole range (3 years back to 5 ahead). It opens on the month being looked at.
  - Only the months near the screen are drawn.
  - Upright phone: one column. Landscape or wide: up to 3 columns (each month at least 250 px wide).
- **Each day shows:** the heat colour (on the darkest step the number is drawn in the page colour), up to 3 dots (module colours and followed calendars), and a holiday mark.
- **Read-out text** for each day, for example "Tuesday 6 October 2026, 90 min, mostly Work, 2 planned repeats, 1 event from your calendars, King's Day (NL)".
- Tapping a day opens that day's Week.
- Legends for modules (whole range), holidays and calendars.

### 4.4 Goals section (Year tab)
- Heading "Goals and phases". It **always** says: "No goals yet. A goal gives the year something to measure against, and every task can hang off one."
- The code is a stub: its query returns an empty list without reading the database. No screen anywhere can create a goal, although a `goal` table exists, is synced and can be filled by a backup import.

[src/screens/Plan.tsx `Goals`]

### 4.5 Range limits and planned repeats in Plan
- Every view reaches 3 years back and 5 years ahead, in whole months.
- Planned repeats are worked out from today to the end of the range, for days after the 56-day fill (5.3).


## 5. Tasks

### 5.1 The task sheet (add / edit)
- **How it opens:** a bottom sheet titled "New task" or "Edit task". It opens from:
  - the + button or a row's name on Today;
  - a review item.
  It cannot be opened from Plan. Tapping the dimmed background cancels. There is no Escape key handler.
- **Fields, in order:**
  1. **What** (required; placeholder "Mobility").
     - Leading and trailing spaces are trimmed.
     - No length limit in the app or on the server.
     - Save does nothing while it is empty.
  2. **Day:** a date box. It can be cleared (see the caveat in 5.8).
  3. **Time:** a time box. Changing the start while an end time is showing keeps the end and changes the length.
  4. **Minutes:** a number box, at least 0, in steps of 5. It shares one cell with an **"Until"** tick box.
     - "Until" is disabled until a time is set (tooltip "Set a time first" / "Give an end time instead of minutes").
     - With "Until" ticked, the cell shows "Ends · 1 h 30" and an end-time box. The length is worked out from start to end. An end earlier than the start counts as the next morning; the same time means no length; the most is 24 h.
     - Only minutes are stored. Ticking or unticking never changes the length by itself.
  5. **Section:** a dropdown with "—", Work, Meal, Training, Learning, Home, Body, Night. A section set elsewhere (for example by a module) is added to the list so it shows.
     - A section implies a module for colours and tabs: Work→work, Meal→nutrition, Training→training, Learning→learning, Home→household, Body→health, Night→evening.
  6. **Repeat:** see 5.2. For a task that already belongs to a series, this shows the rule as a sentence and a "Stop repeating" button (while the series is still running).
  7. **"Locked — nothing may move it"** tick box. A locked task hides the push buttons, triggers warnings on moves, is left out of the review, and stays put when days are swapped.
  8. **Note** with a formatting toolbar and an "Open as page" button (see section 6).
- **No control for:** "fixed" (the field exists and triggers warnings, but nothing sets it), goal, module, due date, horizon or status (other than tick).
- **Buttons:**
  - "Delete" (only for an existing task). It turns into "Delete for good", or "Delete this day" for a series task. A series task also shows "Deleting removes this day only. The series goes on."
  - "Cancel".
  - "Save". It is disabled while saving, or while a repeat's end date is before its start, or while "Pick dates" has no dates.
- **What deleting does:** it is a soft delete. A deleted date is stored, so other devices learn of it.
- **What Save sends:** when editing, only the fields that changed. This lets a tick made on another device survive the merge.

[src/ui/TaskSheet.tsx, src/lib/tasks.ts, src/lib/timeframe.ts, src/lib/colours-rules.ts `CATEGORY_MODULE`]

### 5.2 Repeat options (a new task, or an existing one-off task)

| Option | Stored rule | Notes |
|-------------------|--------------------------|-----------------------------------------------------------------|
| Never | — | default |
| Every day | daily | |
| Every few days | daily, n | the "Every [N] days" box: a whole number from 2 to 365; blank means 2 |
| Weekdays | weekdays | Mon–Fri |
| Weekly on chosen days | weekly, weekdays | day buttons Mon…Sun; at least one stays picked; starts on the task's weekday |
| Every 2 weeks | every_n_weeks, n=2, weekdays | weeks counted from the Monday of the start week |
| Monthly, same day | monthly, day_of_month | a day past the end of a shorter month falls on its last day ("Monthly on the 31st, or the last day of a shorter month") |
| Pick dates | dates | a scrolling month calendar; past days disabled; tap to toggle; up to 366 days ("— the most there can be"); "Clear" button; "Tap the days it should be on." / "N days picked" |

- **"Ends"** (not for Pick dates): "Never" or "On a date", which adds a "Last day" box (at least the start day).
  - A picked-dates series runs from its first picked day to its last.
- **The preview line** says, for example, "Weekly on Mon, Wed until 3 Nov 2026. Starts 28 Sep." It warns: "The last day is before the first. Pick a later one to save."
- **For Pick dates, when the task's own day is not picked:**
  - a new task says "The day above is not picked, so nothing is added on it.";
  - an existing task says "…so this task stays there as a one-off."
- **Rule sentences** used across the app: "Every day", "Every N days", "Weekdays", "Weekly on Mon, Wed", "Every 2 weeks on …", "Monthly on the 15th", "On 12 Oct 2026", "On N picked days, A to B", plus " until <date>" or ", N times".
- **What saving a new repeat does:**
  1. It creates a series holding: the title, the time, and a template of section, minutes, locked and note.
  2. The task becomes the first day if the rule lands on its day. If not, a new task is not saved on that day, and an existing task stays there as a one-off.
  3. The next 56 days are filled in (5.3), and everything goes up in one push.
- **An existing series cannot change its rule** (for example from weekly to daily). The only ways are "Stop repeating", then making a new repeating task.

[src/lib/series-rules.ts, src/lib/series.ts `startSeries`, src/ui/TaskSheet.tsx]

### 5.3 How series become tasks, and their exceptions
- **The fill window:**
  - Each running series is turned into real tasks from today to 56 days ahead ("eight weeks").
  - The fill runs after every sync, after a series is saved, and when the app comes back to the front on Android.
  - One fill runs at a time.
- **A day's task has a fixed id**, worked out from the series and the day, so two offline devices filling the same day make one row.
- **The fill never:**
  - re-creates a day that already has a task of that series, including a deleted one (deleting is how a day is skipped);
  - re-fills a day this device has already filled.
- **Past the 56 days:** the days a series will land on are only worked out on the spot ("planned repeats"). They show in Plan, on Today ("Repeats to come"), in month and year load, and in calendar exports with a range.
- **Exceptions** (one per series and day):
  - `skip`: written when one day is deleted;
  - `move`: written when a day's date is changed in the task sheet, or the task is moved on Plan's week. Moving the same occurrence again updates the one record. Moving it back to its own day removes the exception.
  - `change`: a one-day title or time change, used by planned repeats. In practice, "Only this one" edits change the task row and do not write a `change` exception.
- **Editing a series task** whose title, time, section, minutes, locked or note changed asks: "<rule>. Change which days?"
  - **"Only this one"** — "The other days keep their title, time and note."
  - **"This and following"** — "The series changes, and so does every later day that is not done." Only the fields changed are carried to the later tasks; a note added to one later day by hand survives a new title.
  - **"Back"**.
  - A change of date only, or a tick, never asks. It applies to that day alone.
- **"Stop repeating"** shows: "The series ends today. N later days that are not done are removed. Today and anything already done stay." (or "There are no later days to remove."). Buttons "Back" / "Stop repeating".
- **A count limit** (`occurrence_count`) is supported by the rules and the .ics import, but cannot be set in the sheet.

[src/lib/series.ts, src/lib/series-rules.ts, src/lib/planned.ts, src/ui/PlannedDay.tsx]

### 5.4 Missed tasks and the review
See 3.6. In short:
- The review collects open tasks on or before the day.
- "Tomorrow" and "Pick a day" add to the **extension count**. At 3 (device-level, no screen to change it) a task is flagged.
- The Today **push** buttons add to the **push count**. At 3 or more a task is flagged too.
- A flagged task:
  - shows a warning on its row;
  - goes to the top of the review with a "keep it, make it smaller, or drop it?" note;
  - gets a reminder reading "<title> has moved N times. Want a new time for it?" instead of the usual text.
- Status `stuck` exists in the data and is drawn as flagged, but nothing in the app sets it.

### 5.5 Reminders (notifications) — More → Reminders
- **"Who reminds you" → Name**: the name reminders arrive under. Empty means "GetIt". It is stored on the profile (`ai_persona_name`), so it syncs. The same name prefixes the review line ("Ava: 3 tasks are left…").
- **"Reminders on this device" → "Remind me at each task’s time"** switch.
  - Default **off**. Device-only.
  - Text: "Within a few minutes of the time, for the next three days, even with GetIt closed. On a locked phone the text is hidden. This setting is for this device only."
  - Turning it on asks for notification permission. If refused: "Notifications are blocked for GetIt. Allow them in the phone’s settings, then turn this on again."
- **"Quiet hours"**: two time boxes ("to"), default 22:00 to 07:00, device-only. "Nothing arrives between these times." The window wraps past midnight. A reminder that falls in quiet hours is dropped, not delayed.
- **What gets a reminder:** every task in the next 3 days with a time, not done, not dropped, not deleted, and in the future.
  - Text: title = persona or "GetIt"; body = "<title> at HH:MM." (or "<title> has moved N times. Want a new time for it?" once pushed 3 or more times).
- **On Android:**
  - Reminders are scheduled with the phone's own scheduler. They are not exact (no exact-alarm permission), but they work while the phone is idle.
  - Channel "Reminders": high importance, private on the lock screen ("Contents hidden").
  - Every scheduled reminder is cancelled and rebuilt each time: at start-up, after a sync, after any task change (debounced 0.8 s) and when the app returns to the front.
- **In a browser and the Windows app:** only reminders due within 24 hours, and only while GetIt is open (timers).
- **Not supported:** tapping a notification has no special handling (it does not open the task), and there are no "done" or "snooze" actions. Reminders never fire for the review, meals without a time, or untimed tasks.

[src/lib/notify.ts, src/lib/reminder-text.ts, src/lib/lifecycle.ts, src/screens/More.tsx `RemindersPanel`]

### 5.6 Android home-screen widget
- **Name:** "GetIt · Today". Default size 4×3 cells, resizable (smallest 180×110 dp).
- **What it shows:**
  - Header: the date ("Thursday 1 October", or "Thu 1 Oct" when narrow) and a summary ("N left", "All done" or blank).
  - Rows (up to 8; each 34 dp, so the number depends on height), in this order:
    1. open tasks by time (untimed last), with tick circles;
    2. the label "Habits" and the day's habits (up to half the rows; at least 1 when there are habits and 3 or more rows);
    3. tasks already done (struck through), if there is room.
  - Messages: "Nothing planned today." / "Open GetIt and sign in to see your day here." / "Open GetIt to bring today up to date." (when the snapshot has no entry for today).
- **Where the data comes from:** the app writes a snapshot of today and tomorrow whenever the tasks or habits behind it change (0.4 s after the changes stop).
  - The snapshot holds up to 30 tasks and 12 habits a day, titles cut to 80 characters.
  - Only tasks of horizon "day" that are not dropped or deleted are included.
  - Habits are included only if Habits is on and its "daily" rule is on.
  - A weekly habit counts as done for the whole week.
- **Ticking on the widget:**
  - It goes to a receiver no other app can reach, and is queued on the phone.
  - The app applies the queue on start, on return to the front, or at once if it is open, through the same code as an in-app tick.
  - Each tick says the final state, so repeats are harmless.
- **Other behaviour:**
  - Tapping anywhere else opens the app.
  - It redraws every 30 minutes, which is what moves it to the next day after midnight.
  - Signing out, or another account signing in, clears it.

[src/lib/widget.ts, src/lib/widget-rules.ts, android/app/src/main/java/app/visuma/planner/widget/*, android/app/src/main/res/xml/widget_today_info.xml]

### 5.7 Counters and flags on a task (data model)
- **`push_count`**: Today push buttons. Shown as "pushed N×".
- **`extension_count`**: review moves.
- **`needs_review`**: the flag set by either counter. It is cleared by Done, Drop or Pick a day.
- **`status`**: todo / done / pushed / stuck / dropped.
- **`source`**: manual / meal / module / … . Meal tasks come from the meal plan; module tasks come from a built module's rule or the work series.
- **`horizon`**: always "day". Week, month, quarter and year exist in the schema but nothing uses them.
- **`goal_id`, `total_effort_min`, `daily_quota_min`, `start_date`, `due_date`**: present, with no screens. `due_date` and `start_date` are only filled by calendar import of a whole-day event spanning several days.

[src/lib/types.ts, supabase/migrations/002_planner.sql]

### 5.8 Caveats
- **A task whose Day is cleared** keeps no date and disappears from Today, Plan, the review, reminders and the widget. There is no inbox or backlog view.
- **Ticking a meal task on Today** does not mark the meal as eaten. The link runs only from the meal plan to the task.

### 5.9 Work hours and commute as repeating series
- **What gets made** when work is on, has at least one day, and start ≠ end:
  - A weekly series titled **"Work"**, section Work, at the start time, for the work length, locked if "Keep these hours free" is ticked.
  - With the commute on:
    - **"Commute"** before work: at start minus the "before" minutes. It moves to the previous weekday if that falls before midnight.
    - **"Commute"** after work: at start plus the work length. It moves to the next weekday for a shift ending after midnight.
    - Both are locked like work, and have a note "N km each way" when a distance is given.
- **How the app recognises them:** by a hidden marker in the series template (`managed: work:hours | work:commute-to | work:commute-from`).
- **Saving** (More → Profile → "Save work hours"):
  - A series that already matches is kept.
  - One that no longer matches is stopped like "Stop repeating" (today stays, later undone days go), and the replacement starts tomorrow. With nothing before it, it starts today.
  - Messages: "Saved. The new hours start tomorrow; today stays as it was planned." / "Saved. Added to the plan from today." / "Saved. Work is no longer added to the plan after today." / "Saved."
  - Changes are saved with a button rather than on every keystroke. "Undo changes" is offered while there are unsaved edits.
- A current summary reads, for example, "Mon to Fri, 09:00 to 17:00 (8 h)".

[src/lib/work.ts, src/lib/work-rules.ts, src/settings/PlanningSettings.tsx]


## 6. Notes

### 6.1 The note box (in the task sheet)
- A label "Note", a toolbar and a text area. The toolbar buttons are:
  - ☐ Checklist item
  - • Bullet
  - **B** Bold
  - **H** Heading
- The toolbar does not take the keyboard away from the text box. "Open as page" sits at the right end.
- Checklist, bullet and heading work on whole lines:
  - they swap whatever marker a line had for theirs;
  - they remove theirs again if every selected line already has it.
- Bold wraps the selection in `**`, removes them if already there, or puts `****` with the cursor in the middle. A trailing space from a phone's double-tap is skipped.
- Pressing Enter at the end of a list item starts the next one (unticked). Enter on an empty item ends the list.
- The note is stored as plain text, so it syncs and exports as it is.

### 6.2 What the note text understands
- `## ` (1 to 6 `#`, followed by a space or tab) starts a heading. Three levels are drawn. A `#` with nothing after it is not a heading.
- `- `, `* ` or `+ ` starts a bullet.
- `- [ ] ` is an open checklist item; `- [x] ` or `- [X] ` is a ticked one.
- Indenting by 2 spaces or a tab per step nests an item, up to 3 levels.
- `**words**` is bold. A lone `**` stays as typed.
- A blank line ends a paragraph or a list. Lines next to each other stay one paragraph with their line breaks. Windows line endings are handled.
- Nothing typed is ever turned into HTML; the page is drawn from plain elements.

### 6.3 The note page ("Open as page")
- A full-screen dialog. Header: "‹ Back", a progress count "N of M done" (when there is a checklist), and a "View"/"Edit" toggle.
- The task title is the heading, or "Untitled task".
- **View mode:**
  - Headings, paragraphs, bullets and tickable checkboxes.
  - Ticking changes only the one character between the brackets.
  - Empty: "Nothing written yet. Edit to add steps, a checklist or an explanation."
- An empty note opens straight into Edit mode.
- **When changes are saved:**
  - ticks save at once;
  - typed text saves when switching to View or going Back;
  - Escape goes back.
- For a task that already exists, the note is saved at once, even if the task sheet is then cancelled. Only the note is written. For a new task the note waits for Save.
- An Export link exports the note as a Markdown text file (`# title`, the day, the note).

### 6.4 Marks on the rows
- A checklist shows a "done/total" chip, highlighted when complete.
- Any other non-empty note shows a page icon.
- Neither adds a line to the row.

[src/lib/notes.ts, src/ui/NoteEditor.tsx, src/ui/NotesPage.tsx, src/ui/TaskRow.tsx, src/lib/transfer-rules.ts `noteText`]


## 7. Settings (More)

More's header reads "More — What the app is made of, and what it knows about you." Tabs: **Modules · Profile · Reminders · Data**. The address `?section=Profile` opens a tab directly.

### 7.1 Modules tab
1. **Page bar** panel (2.2–2.4): Style, Pages, Swipe between pages.
2. **"On"**: each module that is switched on, with its name, summary, a "light template" chip for light modules, an "Edit" button and an on/off switch ("Turn X off").
3. **"Available"**: the modules that are off, the same way. Switching on a module the profile has no row for creates the row.
4. "Modules arrive with your profile." when there are no rows.
5. **"Built by you"**: each built module, with "Open", "Edit" and a switch; then a "Build a module" button.
   - With none: "Anything the modules above do not cover — a reading list, the car, plants — can be a module of its own, with its own page."
- "Edit" opens the module editor in place (9.3).
- Switching a module off hides its pages, tabs and rules, and never deletes data.

**The modules** (name — summary — depth):

| Key | Name | Summary | Depth |
|------------------|------------------------|---------------------------------------------------------|----------|
| nutrition | Nutrition | Foods, recipes, a meal plan and macro targets. | full |
| shopping | Shopping | Trips by aisle, packs, stock and prices. | full |
| training | Training | Sessions, exercises, a log and phases. | full |
| habits | Habits | A habit grid and streaks. | full |
| supplements | Supplements | A checklist by time slot. | full |
| health | Health and body | Weight and waist log, and the calorie budget they drive. | full |
| learning | Learning and reading | Study blocks, a reading log and progress. | full |
| agenda | Agenda | Month, week and year calendar. | full |
| sleep | Sleep | A sleep log against a target. | light |
| projects | Projects | Projects, tasks and milestones. | light |
| finance | Finance | A budget and what was spent against it. | light |
| household | Household | Shared lists, chores and shared meals. | light |
| stats | Stats | Day, week, month and year figures from your other modules. | full |
| custom | Custom | Anything you build yourself. | light |

[src/screens/More.tsx `Modules`, src/modules/registry.ts, src/modules/ModuleBuilder.tsx `BuiltModules`]

### 7.2 Profile tab (in order)
1. **Profiles:** each profile, with goal · height · time zone, and "Current" / "Switch". Switching is not saved, and there is no way to add a profile.
2. **Where you are:**
   - Country: a search picker, which can be cleared; saved at once.
   - City or town: at most 80 characters; saved when the box is left.
   - "Used for nearby shops and public holidays. Both are optional."
3. **Work and commute:** the same fields as onboarding step 2. There is a summary line when work is on and nothing has changed, plus "Undo changes" and "Save work hours" (5.9).
4. **Starting layout:**
   - "Started from **<Template>**." or "No template chosen yet." — "Starting again switches modules to match a template. Nothing you entered is deleted."
   - A template dropdown and "Start again". The confirm box lists the modules turned on, says "Every other module goes off (Custom is left as it is) and keeps what it holds", and names the food figures and the Today figure. "Work hours, targets, tasks and logs stay as they are."
   - Buttons "Cancel" / "Start again from <Template>". Afterwards: "<Template> applied."
5. **Colours** (12.2).
6. **Public holidays** (12.1).
7. **Calendar links** (section 11).
8. **Body and goal:**
   - "Height" (cm) — a free text box, saved when left. **Caveat:** emptying it saves 0.
   - "Date of birth" — "Used for the calorie budget. Change it here if it was entered wrong."
   - "Activity factor" — **a free text box** ("1.2 desk job, 1.5 hard training twice a day, 1.9 very active"). This is unlike onboarding's fixed list of ten. There is no range check.
   - "Goal" — a dropdown: Lose fat / Maintain and recomp / Build muscle ("Cut takes 500 kcal off, bulk adds 300, recomp holds the line.").
9. **Food** (FoodSettings):
   - "What to count": tick boxes for Calories (always on, cannot be unticked), Protein, Carbs, Fat, Fibre.
   - "On Today": a dropdown with Nothing, Calories, and each tracked nutrient as "<Label> (g)". Unticking the nutrient that Today shows switches Today back to Calories.
   - "Default meal times": Breakfast, Lunch, Snack, Dinner, each with "Add time" or a time box and "Remove". Changing a default moves meals already planned from today on.
- **Not here:** sex (onboarding only), time zone, day start/end.

[src/screens/More.tsx `ProfilePanel`, src/settings/PlanningSettings.tsx, src/settings/FoodSettings.tsx]

### 7.3 Reminders tab
See 5.5. This tab has only the persona name, the reminders switch and quiet hours. The review time lives on Today's Evening tab. The extension limit has no screen.

### 7.4 Data tab (in order)
1. **Recipes to review (N):** shown only to a reviewer (an account in `app_admin`).
   - Needs a connection. Each card shows the recipe, its author, the macros per portion, the ingredients, the steps, a "Note to the author (optional)" box, and "Decline" / "Approve".
   - With nothing waiting: "Nothing waiting. Proposed recipes appear here."
2. **Sync → "Waiting to send":** "Changes made while offline sit here and go up the moment there is a connection.", with a chip "N queued".
3. **"Merges the app had to resolve":** the last 20 entries.
   - With none: "None. When two devices change the same field, what happened is listed here rather than decided silently."
   - Each entry: "<table> · <field>" and "kept this device's “X” over “Y” · <time>".
   - **Caveat:** the same wording is used for changes the server refused (`kept = 'rejected'`), where nothing was kept. A refused change prints its value as "[object Object]".
4. **Your data:**
   - "Export" — "Everything in one file: profile, plan, logs, recipes, settings." It saves a backup file (10.3).
   - "Import" ("Choose file", accepts .json and .xlsx) — "An export from another device, or your Excel workbook."
     - For .json: a backup import (10.3).
     - For .xlsx: the workbook preview and import (10.4).
5. **Import and export** centre (10.1).
6. **Privacy → "Privacy policy"**: "What GetIt stores, why, where, and how to get it back or delete it." The "Read" button opens the in-app policy with a "Back" button.
7. **Account:** the accounts on this device (1.6), "Sign out" (1.4), "Delete account" (1.5).

[src/screens/More.tsx `DataPanel`, src/settings/RecipeReview.tsx]

### 7.5 Every key in profile settings (`src/lib/settings.ts`)
These are stored in `profile.settings` and synced. Every key has a default and is checked when read, so a bad or old value can never break a screen.

| Key | Meaning | Default | Checks |
|-----------------------------|-------------------------------|--------------------|------------------------------|
| onboarded | first-run setup finished | false | true/false |
| template | starting layout picked | null | any text |
| work.on / start / end / locked / days | work or school hours | off, 09:00, 17:00, not locked, Mon–Fri [1..5] | times HH:MM; days 0–6 (0 = Sunday) |
| commute.on / before_min / after_min / km | commute blocks | off, 30, 30, none | minutes 0–600; km 0–2000, to 0.1 |
| nutrients | figures counted on the food pages | ["kcal"] | of kcal, protein_g, carbs_g, fat_g, fiber_g |
| today_metric | figure under Today's date | "kcal" | a nutrient, or "none" |
| meal_times | default time per meal | {} (no times) | breakfast, lunch, snack, dinner as HH:MM |
| stock_auto | take ingredients out of stock when a meal is ticked eaten (Shop → Stock tab switch) | false | true/false |
| nav.style | page bar style | "row" | row, two_rows, three_rows, drawer, fan |
| nav.order | page order | [] | today, plan, more, food, shop or m:<key> |
| nav.hidden | pages kept off the bar | [] | today, plan and more are always removed from this list |
| nav.swipe | swipe between pages | true | true/false |
| colours.on | colour by module | true | true/false |
| colours.modules | module key → #rrggbb | {} | valid keys and hex only |
| holidays.countries | countries whose holidays show | [] | two-letter codes, upper case, unique, at most 6 |
| holidays.colours | country → #rrggbb | {} | only for chosen countries |
| stats.show_disabled | Stats shows switched-off modules | false | true/false |
| calendar.feed_notes | put task notes in the Google Calendar feed | false | true/false |
| books | recipe and food books on the Food page | [] | at most 50, checked in books-rules.ts |

A change merges nested objects one level deep. Lists are replaced whole.

### 7.6 Settings kept only on this device (not synced)
- **Reminders** (`reminders`): `{on: false, quietFrom: '22:00', quietTo: '07:00'}`.
- **Review time** (`review_time`): '21:00'.
- **Extension limit** (`extension_limit`): 3.
- **Bookkeeping:**
  - `owner` — which account the local copy belongs to;
  - `cursor:<table>` — where the last fetch of each table stopped;
  - `series-through:<id>` — how far each series has been filled;
  - `catalogue:exercise` — the exercise list.
- **The accounts list:** encrypted storage on Android, `localStorage` `getit-accounts` elsewhere.

[src/lib/notify.ts, src/lib/review.ts, src/lib/db.ts, src/lib/accounts.ts]


## 8. Stats (module page /m/stats)

- **Period tabs:** Day, Week (default), Month, Year. Weeks run Monday to Sunday.
- **Navigation:** "‹ <title> ›", where the title is for example "Sun 27 September 2026", "21 – 27 Sep 2026", "September 2026" or "2026". A "Today" button appears when not on the current period. The arrows reach 3 years back and 5 years ahead.
- **Tick box "Show switched-off modules"**: saved in settings (`stats.show_disabled`). When off: "One switched-off module is left out. Tick "Show switched-off modules" to see it."
- For a future period: "This <period> has not started yet. Only what is planned for it counts so far."
- **Cards, one per module.** The first card is always **Tasks**; then each module that is on, in module order. Stats, Custom, Shopping and core never get a card. Each card shows a coloured dot, the name, a "switched off" chip when off, figures, and (except on Day) a small bar chart.

| Card | Figures | Chart | Empty text |
|-------------------------|-------------------------------|------------------|------------------------------------|
| Tasks | Done; Planned; Completed (%); Minutes done | — | No tasks planned in this period. Plan one on Today or in Plan and it counts here. |
| Habits | Ticks; Kept (%) | Habits kept % | No habits yet. Add one on the Habits page and tick it off each day. |
| Supplements | Taken (%); Doses ticked | Supplements taken % | No supplements yet. Add them on the Supplements page… |
| Nutrition | one per tracked nutrient (average per day logged); Days logged | first nutrient | Nothing eaten logged in this period. Tick a meal as eaten or add one on the Food page. |
| Health | Weight (the latest; change over the period); Waist (if logged); Weigh-ins | Weight | No weigh-ins in this period. Log your weight on the Health page. |
| Sleep | Hours a night; Quality (if logged); Nights logged | — | No nights logged in this period… |
| Training | Sessions; Sets; Volume (kg, reps × load) | Sets | No sets logged in this period. Log a set on the Training page. |
| Agenda | Events (own events only, not followed calendars) | Events | No events in this period. Add one on the Agenda page. |
| Record modules (Learning, Projects, Finance, Household, built) | a count of records, plus each field marked "Count in Stats" (sum, average or count) | | "…keeps nothing to count yet…" / "…records have no date…" / "Nothing in <name> for this period…" |

- **How figures are worked out:**
  - Each figure shows the value; for totals, an average "a day" or "a day logged"; and the change against the period before ("+12 a day vs the week before", "same as the week before", or "−0.4 kg over the week" for weight).
  - Days still to come never lower an average.
- **Charts:** one bar per day (Week, Month) or per month (Year). Negative values are drawn hollow. Tapping or pointing at a bar reads its value ("Wed 23 Sep: 2,216 kcal", "still to come"). With nothing picked, the chart shows "Highest: …". In Month only every 7th label is drawn.
- **Export link:** exports the figures on screen as rows (Period, Module, Figure, Value, Unit) as CSV, Excel or JSON. Separately, the "Stats" dataset in the import and export centre gives one figure per dated record (export only).

[src/sections/Stats.tsx, src/lib/stats.ts, src/lib/stats-rules.ts]


## 9. Modules you build, and editing built-in ones

### 9.1 "Build a module" (a sheet, 5 steps: "Step N of 5")
1. **Name:**
   - Name (required, at most 60 characters; placeholder "Reading, Car, Plants").
   - Mark (optional): a single letter or symbol, not an emoji. Shown as the glyph on the page bar.
   - Summary (optional, at most 160 characters).
2. **What you track:** preset cards.
   - **Blank** — "A name and a date. Add the rest yourself." (Name, Day; views List and Table)
   - **Reading list** — "Books to read, reading and read, with pages and a rating." (Title, Author, Status [to read, reading, finished, stopped], Pages (summed), Finished, Rating /5; views Books, Table)
   - **Workout log** — "Sets of an exercise with reps and load, and the volume worked out." (Day, Exercise (link), Sets, Reps, Load kg, Volume = sets × reps × load (summed); views Log, Month)
   - **Expenses** — "What was spent, on what, and the total." (What, Day, Category [food, transport, home, bills, fun, health, other], Amount (summed), Note; views Table, List, Month)
   - **Plant care** — "Watering, feeding and repotting, and when each is next due." (Plant, Care [water, feed, repot, prune, mist], Next due, Last done, Note; views Plants, Month)
   - **Car maintenance** — "Services and repairs with mileage and cost, and what is due next." (Job, Day, Mileage km, Cost (summed), Garage, Next due; views Jobs, Table)
   - **Study sessions** — "What was studied, for how long, and how well it went." (Subject, Day, Start, Length min (summed), Topic, Focus /5 (averaged); views Sessions, Month)
   - **Mood journal** — "A line a day with mood and energy out of five." (Day, Mood /5, Energy /5 (averaged), Note; views Entries, Month)
3. **Keywords:** comma-separated words, kept in lower case, unique, at most 20 words of 30 characters each.
   - The screen claims: "When someone describes their days at setup, these words suggest this module."
   - **This is not wired up.** Onboarding suggests templates only, and the module-suggestion functions are never used.
4. **Fields:**
   - "One record is a" (for example Book). Then the list of fields, each with "Change" and "×", and an "Add a field" button (up to 40 fields).
5. **Links and rules:**
   - Buttons "+ food / + recipe / + exercise / + task / + goal" add a link field.
   - View kinds to toggle on or off (at least one stays on). Board, grid and chart are disabled when the fields cannot support them, and their settings show under the toggles.
   - The two rule switches (9.5).
   - "Count in Stats" for each number field.
- **Buttons:** Back/Cancel, Next, Create.
- **Create** saves the module row (key `u_` + 12 random letters and digits), switches it on and opens its page.

### 9.2 Field types (the "Kind" dropdown)
- **The kinds:**
  - Text
  - Number ("With decimals, and a unit if you like")
  - Whole number
  - Length of time ("In minutes")
  - Yes or no
  - Date
  - Time
  - Date and time
  - Choice ("One of a list you write"; 1–50 options, each up to 60 characters, no duplicates)
  - Link to another module ("A food, recipe, exercise, task or goal")
  - Calculated ("Worked out from other fields")
- **Other parts of a field:**
  - A unit (up to 16 characters).
  - "In Stats": Not counted / Add up / Average / Count records.
  - A "needed" (required) tick box.
  - A label of up to 60 characters. The internal name is made from the label (for example "Cost (EUR)" becomes `cost_eur`).
- **Calculated fields:**
  - Formulas of up to 200 characters, using `+ - * / %`, brackets, and the functions `ceil`, `floor`, `round(x, places)`, `abs`, `min`, `max`, `hours_between(from, to)`.
  - A formula may use any field before it, and any stored field after it.
  - The result is never stored and is rounded to 2 places. It is blank when any input is blank.
- **Limits:** at most 4 entities per module (the builder makes 1), 12 views, a definition of 60 KB, a record of 15 KB, and text values of 2000 characters.

### 9.3 Edit module (from More, or the "Edit module" button on its page)
- Header: the name, and "Built by you" or "Comes with the app; your changes are kept on top". Button "Back".
- Tabs: **Fields · Views · Rules · Settings**.
- A save bar with "Discard" and "Save" (disabled while there is a problem; "Saved." for 2.5 s). Leaving with unsaved changes asks "Leave without saving these changes?" with "Stay" / "Leave".
- **Fields tab:**
  - Each field has an editable label, ↑/↓, a show switch (required fields cannot be hidden), "Change" (or "Label and Stats" for a built-in field) and "Remove".
  - Built-in modules with their own screens (nutrition, shopping, habits, supplements, health) and table-backed entities keep fixed fields: "These records are kept in a table of their own, so the fields are fixed; rename, reorder and hide them here."
  - Fields can be added only where records are kept as module records.
  - At least one field must stay visible.
- **Views tab:**
  - Each view has a name, ↑/↓, a show switch, a column picker for tables, kind-specific settings, and "Remove view" (at least one view stays).
  - "Add a view": Kind, Name, Of (which entity), then "Add view".
- **Rules tab:**
  - Built-in modules: each rule's sentence and a note on what switching it off does. Only rules the app acts on have a switch; the rest show "Always on" or "No switch yet". See 9.6.
  - Built modules: the two rule switches (9.5).
  - "Count in Stats" for each numeric field.
- **Settings tab:**
  - Name, Mark, Summary, Keywords (with the same unfulfilled promise as 9.1).
  - Built-in modules: "Go back to the app’s version" ("Undoes every change to this module once saved. Records are not touched.").
  - Built modules: a "Delete" section. "The module leaves your pages and is switched off, and tasks it made that are not done go. Its records are kept until you delete your account." Buttons "Delete module" → "Keep it" / "Delete <name>".
- **How changes are stored:**
  - For a built-in module, only the differences from the app's version are stored, as an "overlay" inside the profile's module switch row (synced). App updates still reach the module.
  - For a built module, the whole definition is stored in its `module` row (synced).

### 9.4 Views on the generic module page
- **Totals** strip above every view except Form, for the fields marked "Count in Stats".
- **List:** cards, newest first. Each shows the main field, then the other filled-in fields and the day. Tap a card to open the record.
  - Empty: "No <items> yet. Tap the round + button to add the first <item>; it shows here as soon as it is saved, with or without a connection."
- **Table:** a spreadsheet where every cell edits in place (calculated cells cannot be edited). An open button on each row. Columns are chosen per view.
- **Calendar:** a month grid with "‹ / Today / ›". Each day reads out how many records it has. Tapping a day lists its records with "Add on this day" ("Nothing on this day.").
  - Setting: which date field it goes by.
  - Without one: "This calendar has no date to go by…"
- **Board:**
  - Columns are the options of a choice field, plus one for "none". Each card shows its name and at most 2 more fields.
  - Hold a card and drag it to another column, or use its "Move" menu ("Move to…", arrow keys, Escape). The board scrolls sideways near its edges.
  - Hint: "Hold a card and drag it to another column, or use its Move button."
  - Without a choice field: "This board needs a choice field…"
- **Grid:**
  - Days across (the last 7, 14 or 30, chosen with buttons), one row per name, and a "Run" column for the days in a row.
  - Tapping a cell ticks a yes/no field, counts up a number, or (with "none") adds a record for that day.
  - Settings: the date field, the row field (text, choice or link), and the tick field.
- **Chart:**
  - A number over time, added up per Day (last 14), Week (last 12) or Month (last 12), drawn as bars or a line. The period can be changed on the page.
  - Each bucket is a button that reads out its value. A total line shows "Total X over N weeks", or "Nothing logged in this time yet".
- **Form:** an inline form to add one record after another. There is no + button on this view.
- **The record sheet** (+ or tap): fields by kind. Link fields pick from foods, recipes, exercises (downloaded once a day and kept for offline use), tasks or goals. There is a delete option.
  - Events from followed calendars that show on Agenda pages open the read-only sheet instead.
- Agenda, Sleep, Training and Goal records live in their own tables (calendar_event, sleep_log, workout_log, goal). Everything else lives in the shared `module_record` store.
- A Sleep record keeps one row per day; adding to a day that already has one updates it.

### 9.5 Rules for built modules
- **"Put records with a date on the day as a task."** Starts off. When on, each record with a date gets a task:
  - title = the main field, or the module's name;
  - day = the record's first date field;
  - module = this module; source "module".
  - The task is created, moved, renamed or removed whenever the record is saved or the rules change.
  - Editing the task by hand is overwritten the next time the record is saved.
- **"Remind me at the record’s time, or at a set time when it has none."** Starts off and needs the rule above.
  - It gives the task a time: the record's date-and-time, else its time field, else the set time (default 09:00, editable).
  - The actual reminder is the ordinary task reminder (5.5), so the device's reminder switch must be on.
- Turning the task rule off turns the reminder rule off too.

### 9.6 Built-in rules: which ones the app carries out

| Rule (module.name) | Sentence | Status |
|-----------------------------|----------------------------------------------|----------------------------------|
| nutrition.meal_tasks | Every planned meal becomes a task on the day it is eaten. | switch — carried out (meal tasks, section Meal, 20 min) |
| nutrition.size_main | Scale the rotating main meal so the day reaches its target. | switch — carried out (Food offers sizing) |
| nutrition.skipped_meal | If a meal is skipped, ask for a new time. | not carried out |
| shopping.from_plan | Each trip buys what the plan needs… | always on |
| shopping.trip_days | Shopping happens on the chosen days and those tasks are locked. | not carried out |
| training.session_task | A planned session becomes a task at its time. | not carried out |
| habits.daily | A daily habit appears on every day until it is turned off. | switch — carried out (Body tab and widget) |
| supplements.slot_task | Each slot becomes one task with all of its items. | not carried out |
| health.retarget | When the weight changes, recalculate the targets from it. | switch — carried out (on weigh-in save) |
| learning.soft | Learning moves when the day is full, unless it is locked. | not carried out |
| agenda.no_overlap | Nothing is scheduled across an all-day event. | not carried out |
| sleep.bedtime | Bedtime is locked and nothing is scheduled across it. | not carried out |
| projects.to_goal | A project with a date becomes a goal on the year view. | not carried out |
| household.shared | A household chore appears for everyone in the household. | not carried out |

Of the 14 rules, 4 can be switched and are carried out, 1 is always on, and 9 are shown but not carried out.

[src/modules/ModuleBuilder.tsx, src/modules/presets.ts, src/modules/FieldForm.tsx, src/modules/formula.ts, src/ui/ModuleEditor.tsx, src/modules/def-rules.ts, src/modules/defs.ts, src/modules/records.ts, src/modules/ModulePage.tsx, src/modules/views.tsx, src/modules/views/*, src/modules/view-rules.ts, src/modules/ViewSettings.tsx]


## 10. Import and export

### 10.1 The import and export centre (More → Data → "Import and export")
- **Step 1, "What":** a dropdown of every dataset. Switched-off modules are marked "(off)".
  - **Planner:**
    - **Tasks** (Task, Day, Time, Length, Status, Category, Module, Notes, Due)
    - **Calendar (tasks, repeats and events)** — columns named the way Google Calendar's CSV names them: Subject, Start Date, Start Time, End Date, End Time, All Day Event, Description, Location
    - **Notes** (Task, Day, Note)
    - **Stats (one figure per row, for charts)** — export only
  - **Modules:** each module's entities. For example "Nutrition · Food", "Finance", built modules. The meal plan is export only.
  - **Account:** "Whole account (backup file)" (JSON).
- **Step 2, "Fields · N of M":** a tick box per field, with All/None.
- **Step 3, "Format and range":**
  - Formats: **CSV** ("CSV (Excel, Google Sheets)"), **Excel workbook**, **JSON**, **Calendar file (.ics)** (only for datasets with a date), **Text (.md)** (Notes only).
  - Range (only for datasets with a date): Everything / One day / That week / That month / That year / From… to…, with date boxes. "The last day comes before the first." blocks Export.
- **Export** then saves the file:
  - **Android:** through the share sheet ("Save or send").
  - **Phone browser:** through the share sheet when possible.
  - **Elsewhere:** as a download.
  - Then a note: "Saved <file> · N rows.", "Shared …" or "Not saved."
  - File names read like `getit-<label>-<range>.<ext>`.
- **Export details:**
  - **CSV:** UTF-8 with Excel's byte-order mark and CRLF line ends. A cell starting with `= + - @`, a tab or a carriage return gets an apostrophe in front (protection against spreadsheet formulas).
  - **JSON:** `{format:'getit.dataset', version:1, dataset, label, exported_at, range, fields, rows}`.
  - **Calendar file:** tasks use the person's own clock time ("floating" time) with the profile's time zone named once. Events are in UTC. With no range, a repeating task goes out as one repeating event (RRULE/RDATE/EXDATE). With a range, every day in it goes out, including repeats not yet laid out as tasks.
  - Events from followed calendars are never exported.
- **Import into the chosen dataset:**
  - "Choose file" accepts: CSV/TSV/TXT, XLSX/XLS/ODS, JSON, ICS/ICAL, depending on the dataset.
  - Limits: 5 MB, 20,000 rows, 200 columns, 20,000 characters per cell.
  - **Columns are matched by name**, ignoring case, spaces, dashes and units in brackets. They can also match the field label or other common names, for example for tasks: summary, subject, name, what → Task; date, start date → Day; duration, minutes → Length; note, description → Notes.
  - **Reading values:** dates such as 03/04/2026 are read day-first unless the file itself shows month-first. Numbers such as "1,5" or "1.234,5" are read correctly. Spreadsheet date numbers are understood.
  - **The preview:**
    - "<file> · N rows · **M ready** · K already here · J with problems · R repeating"
    - the column mapping ("Header → Field", "not used: …")
    - missing required columns, for example "No column for Task, which every row needs…"
    - the first 20 rows with a check column ("ok", "already here", "ok, repeats", or the problems)
    - up to 8 problem lines
  - "Cancel" / "Import N rows" (with progress "Importing 25 of 100").
  - **Duplicates** are found by natural key: tasks by title + day + time; calendar by title + date + time; foods, recipes, habits and supplements by name; weigh-ins and sleep by date; events by title + start. Duplicates are skipped.
  - **Imported rows are new rows** (new ids). Nothing already there is changed.
  - **Calendar rows become tasks.** A location goes into the note as "Where: …". A whole-day event spanning several days keeps its first and last day as start and due dates. Repeating events (from .ics) become series, with removed days as skips.
  - Result: "N rows added, M of them repeating · K skipped · J could not be saved."
- **The ICS reader:**
  - It follows RRULE with FREQ, INTERVAL, BYDAY (including "2MO" and "-1FR"), BYMONTHDAY, BYSETPOS, COUNT and UNTIL. It also handles RDATE, EXDATE, changed copies of one repeat (RECURRENCE-ID) and cancelled ones.
  - It refuses BYYEARDAY, BYWEEKNO, BYHOUR, BYMINUTE, BYSECOND and HOURLY/MINUTELY/SECONDLY repeats: "…repeats in a way the app cannot follow (…); only its first day was imported."
  - It keeps at most 20,000 events per file and 1,000 repeats per event.
  - It looks 3 years back and 5 years ahead.

[src/settings/TransferSettings.tsx, src/lib/transfer-rules.ts, src/lib/transfer.ts, src/lib/ics-rules.ts]

### 10.2 The "Export" link on each page

| Page | What it exports | Formats offered |
|-------------------------------|----------------------------------|---------------------------------------------|
| Today | the calendar for that day | .ics first, then CSV, Excel, JSON |
| Plan | the calendar for the week, month or year shown | .ics first, then CSV, Excel, JSON |
| Module pages | that entity's records, all of them (no range) | CSV, Excel, JSON (plus .ics when the view is a calendar or the module is Agenda) |
| Section pages (Habits, Supplements, Health) | their dataset | |
| Stats | the figures on screen | CSV, Excel, JSON |
| Note page | the note | text (.md) |

- The Export sheet lists each format with a hint: "opens in Excel and Google Sheets" / "a workbook with one sheet" / "for other apps and scripts" / "Google Calendar, Outlook, Apple Calendar" / "plain text with headings".
- Buttons read "Saving…" while busy, and "Close" at the end.

[src/ui/ExportLink.tsx]

### 10.3 Backup file (whole account)
- **Two ways to make it:** More → Data → Your data → Export, or the "Whole account (backup file)" dataset.
- **File:** `getit-<yyyy-mm-dd>.getit.json`, shaped `{format:'getit.bundle', version:1, exported_at, profile_id, records}`.
- **What it holds:**
  - every profile row, including all settings;
  - the profile's tasks, targets, weigh-ins, food log, meal plan, module switches, series and their exceptions, habits and their ticks, supplements and their ticks, module records, own calendar events, goals, sleep, training log and followed-calendar subscriptions;
  - foods and recipes the person owns, with their ingredient lines;
  - modules they built;
  - the household's stock.
- **What it leaves out:** the shared catalogue, other people's recipes and foods, events of followed calendars, sign-in tokens.
- **Importing it** (More → Data → Import with a .json file, or through the centre):
  - It is read into the profile that is open.
  - **A file from this same profile:** rows keep their ids, so a restore updates rather than doubles.
  - **A file from another profile or account:** every row gets a new id and the references follow. Built modules get new `u_` keys.
  - **Rows with a natural key** (one weigh-in per day, one habit tick per day, a food per barcode, stock per food, and others) are merged into the existing row.
  - **Profile fields copied:** name, sex, date of birth, height, activity, goal, time zone, day start/end and persona name.
  - **Caveat:** settings, country and city are **not** restored, although the export holds them and says "settings".
  - Message: "N records from <file> added to <profile>. They go up to your account with the next sync."
  - Errors: "That file is not a GetIt export." / "That export comes from a newer GetIt. Update the app, then import it again."
  - Importing needs a signed-in session.

[src/lib/bundle.ts]

### 10.4 Excel workbook import (the original spreadsheet)
- What it is: More → Data → Import with an .xlsx file. It reads the D_Food, D_Exercises and D_Meals sheets.
- **The preview shows:**
  - "N new foods · M new recipes";
  - "X foods and Y recipes already there · A ingredient lines matched to a food, B not";
  - the exercise count: "Read, but not saved yet. Exercises have nowhere to go in the app so far.";
  - the sheets read, and duplicate rows skipped;
  - the first 5 foods;
  - "Lines with no food yet" and "Amounts that cannot be right".
- An empty cell is read as unknown, not zero.
- Buttons "Close" / "Import" ("Importing"). "Import" is disabled when there is nothing new.
- After import, a summary appears with "Close". It needs to be signed in.

[src/lib/excel.ts, src/lib/import.ts, src/lib/match-food.ts, src/screens/More.tsx]


## 11. Calendar links (More → Profile → Calendar links)

### 11.1 "Show GetIt in Google Calendar" (GetIt → Google)
- Text: "A private link to your tasks and events, from three months back to a year ahead. Meals, training, weigh-ins, other health details and modules you built stay out. Google Calendar reads it every few hours; it cannot change anything here."
- State line: "Needs a connection." / "Checking…" / "On · link made <date>" / "Off". The switch needs a connection because the link lives only on the server.
- **Make link:**
  - A server function makes 32 random bytes (a token). Only a hash of the token is stored.
  - The address is shown **once**: "Your link, shown only now. Keep it private: anyone who has it can read what it shows."
  - There is a "Copy" button. Where there is no clipboard, the field is selected instead.
  - Steps are shown for Google Calendar ("Other calendars → + → From URL").
  - "Google refreshes it every few hours, sometimes less often, so a change here shows there later."
- **When the feed is on, there are three more controls:**
  - **"Include task notes"** (default off): "Off unless you turn it on: a link passed on by mistake would show them." Stored in `calendar.feed_notes`.
  - **"Make a new link"**: "The old link stops working at once. Google Calendar will need the new one."
  - **"Turn off"**: "The link stops working at once, and Google Calendar will show nothing new from GetIt. Remove it there too."
- **What the feed includes:**
  - tasks with a day from 3 months back to 12 months ahead, not dropped and not deleted;
  - each repeating series as one repeating event, cut to that window;
  - the person's own Agenda events.
  - Shown: titles, times, sections and places. The calendar's name is just "GetIt", never the profile's name.
- **What the feed excludes:**
  - anything about health: source meal, workout or habit; module nutrition, health, training, sleep, habits or supplements; sections Meal, Training or Body; every day of a health series;
  - all tasks of modules the person built;
  - events from followed calendars;
  - notes, unless switched on.
  - The server applies these filters in its database queries and again in the rules.
- Times use the profile's time zone (see the caveat in 13.4).
- A wrong or unknown token gets a plain 404.

[src/settings/CalendarLinks.tsx, src/lib/calendar-links.ts, src/lib/calendar-links-rules.ts, supabase/functions/calendar-feed/index.ts, migrations 020/024]

### 11.2 "Calendars you follow" (Google → GetIt)
- Text: "Events from Google Calendar (or any calendar with an iCal address), on Today and in Plan. They are read-only here, fetched when GetIt opens and every three hours while it is open, and kept on this device."
- **"Add"** (at most 10 calendars; "That is 10 calendars. Remove one to follow another."):
  - Steps for finding Google's "Secret address in iCal format".
  - **Name:** required, at most 60 characters ("Work, Family…").
  - **Secret address:**
    - `webcal://` is read as `https://`.
    - Must be https, port 443, no user name or password, at most 2048 characters, a real domain, and not a private or local network.
    - Errors: "Paste the calendar’s address." / "An address has no spaces in it. Copy it again." / "That address is too long." / "That is not a web address. It starts with https://" / "Only secure addresses (https://) can be followed." / "An address with a name and password in it cannot be followed." / "Only addresses on the usual secure port can be followed." / "That address has no proper domain name." / the private-network message / "You already follow that calendar." / "Give the calendar a name, such as Work or Family."
  - Buttons "Cancel" / "Follow" (needs a connection). A new calendar gets the next unused swatch colour and is fetched at once.
- **Each followed calendar row:**
  - a colour swatch (tap to choose from the 16 swatches), the name, and "N events";
  - "Fetched <date time>" or "Not fetched yet", plus the last error;
  - after a refresh: "Up to date: N events (A new, C changed, R gone)." plus up to 2 notes from reading the file.
  - Buttons "Refresh now" ("Fetching…") and "Remove". Remove asks: "Stop following <name>? Its events leave GetIt on every device and its address is erased. The calendar itself is not touched."
- **How fetching works:**
  - The server function `calendar-fetch` fetches the calendar. It must be signed in and checks ownership.
  - Safety limits: https only, every redirect checked, at most 3 redirects, 10 s, 3 MB. The answer must start with BEGIN:VCALENDAR. The address is never logged.
  - The app reads the file itself and keeps events from 3 months back to 12 months ahead, at most 5,000 per calendar ("The calendar has more events than GetIt keeps; the first 5000 in the window are shown.").
  - Repeats are laid out one row per day.
  - Events are matched by UID and start time, so a refresh changes only what changed.
  - Due calendars are checked 5 s after opening, then every 15 minutes. Each calendar is fetched at most every 3 hours. A failed fetch waits 1 hour before retrying. Coming back online triggers a check. "Refresh now" always fetches.
- **What syncs:** the subscription (name, address, colour) syncs, so a new device follows the same calendars. The **events are device-only**: the app refuses to queue them and each device fetches them itself. Removing a calendar marks it deleted; the server erases its address.
- **Where the events appear:**
  - Today tab: "From your calendars".
  - Plan Week items.
  - Month and Year marks, and the load (timed events count by their length, up to 24 h; whole-day events count 0).
  - Agenda module pages.
  - Legends.
  - Tapping one opens a read-only sheet with the title, "From <calendar>", When, Where, and "Read-only here. Change it in its own calendar; GetIt picks the change up the next time it fetches that calendar." Buttons "Open subscription settings" (goes to More → Profile → Calendar links) and "Close".
  - Multi-day whole-day events show on each day, up to 31.
- **Excluded:** from backups, exports, the Google feed and Stats.

[src/settings/CalendarLinks.tsx, src/lib/calendar-links.ts, src/lib/calendar-links-rules.ts, src/ui/FollowedEvents.tsx, supabase/functions/calendar-fetch/*]


## 12. Public holidays, colours, templates, starting layouts

### 12.1 Public holidays (More → Profile → "Public holidays")
- Text: "Shown on Today and in Plan, each country in its own colour. Up to 6 countries; they work offline."
- Each chosen country has a colour swatch (tap to choose from the 16 swatches) and a "Remove" button. When two share a colour: "Same colour as …".
- With none chosen, the profile's own country (if it is supported) is offered as "Your country, from your profile." with an "Add" button.
- "Type to add a country" picker. It lists only countries the holiday library supports (about 200 codes). At 6 countries it says "That is six. Remove one to add another."
- Attribution line: "Holiday dates from the date-holidays project, CC BY-SA 3.0."
- **How the dates are worked out:**
  - On the device, with the date-holidays library, which loads only once a country is chosen.
  - Only official public holidays, in English names. Holidays lasting several days mark each day.
  - Each country's colour is picked once, when it is added, starting from a fixed place for that country and skipping colours already taken. After that it stays the same.
- **Where they show:**
  - Today: chips such as "King's Day (NL)".
  - Plan Week: a heading underline and tooltip.
  - Month: a top bar and tooltip.
  - Year: a small mark and the read-out text.
  - A "Holidays" legend under each Plan view.

[src/settings/HolidaySettings.tsx, src/lib/holidays.ts, src/lib/holidays-rules.ts, src/ui/HolidayMark.tsx]

### 12.2 Colours (More → Profile → "Colours")
- Switch **"Colour by module"** (default on): "Marks each task, and each day in Plan, with the colour of what it belongs to."
- **Rows:** Work, then each module that is on, in list order, then each built module that is on, then Evening.
  - Each row shows the swatch, the name, and the swatch name or hex with " · default" or " · automatic".
  - Tapping a row opens: 16 swatches, a hex box (accepts "#abc", "abc" or "#aabbcc"; error "A colour is six hex digits, like #3f6b4a."), "Use" and "Reset".
- **Swatches:** Brick #c43f3e, Rose #b84379, Plum #92508c, Violet #a262b6, Indigo #6a59bc, Blue #4777d2, Slate #6d7198, Steel #0a7ca6, Teal #14938d, Green #1e8347, Leaf #5d9850, Olive #7a8a12, Ochre #a4861e, Orange #ce710c, Brown #9b5e30, Stone #78716a. All of them keep at least 3:1 contrast on both the light and the dark page.
- **Defaults:**
  - training Brick, health Rose, evening Plum, supplements Violet, sleep Indigo, learning Blue, agenda Slate, work Steel, shopping Teal, habits Green, finance Olive, projects Ochre, nutrition Orange, household Brown, stats Leaf, custom Stone.
  - Built modules get a colour automatically: a fixed starting place for each module, skipping colours already in use. It is the same on every device.
- **Notes on a row:**
  - A hex colour hard to see: "Hard to see on the light page." / "…dark page." / "…both…".
  - Two modules sharing a colour: "Same colour as X." Allowed, but noted.
- **How a task's colour is chosen:** its module, else its section (Work→work, Meal→nutrition, Training→training, Learning→learning, Home→household, Body→health, Night→evening), else none.
- Colour is never the only sign: there are always names in legends and the row's meta line.

[src/settings/ColourSettings.tsx, src/lib/colours-rules.ts, src/lib/colours.ts]

### 12.3 Templates and starting layouts
- The 8 templates, their keyword suggestion and what they switch on are in 1.3.
- "Start again from a template" (7.2 item 4) changes the module switches, the nutrients and the Today figure only. It leaves work hours, targets and data alone, and leaves Custom alone.
- Switching a module off never deletes its data.

[src/lib/templates.ts, src/lib/setup.ts]


## 13. Cross-cutting

### 13.1 Sync model
- **Local-first:** every device holds a full copy of the account in its own database (IndexedDB "getit"). Every screen reads that copy. Every change is written locally first and added to a queue (`pending`). Nothing in the app writes to the server directly.
- **Synced tables:**
  - **Profile-scoped**, fetched by what changed since last time: task, target, body_log, food_log, meal_plan_slot, module_instance, series, habit, supplement, module_record, calendar_event (own events only), goal, sleep_log, workout_log, calendar_subscription. Profiles are fetched first.
  - **Children**, fetched by what changed (the database's access rules limit them to the account): habit_log, supplement_log, series_exception, stock (per household), module (built modules).
  - **Catalogue**, fetched whole and sent only for rows the person owns: food (the shared list, the person's own, and a housemate's food that is in the shared stock), recipe (the shared list, approved ones and the person's own), recipe_line.
- **Device-only:** pending, conflicts, meta, events of followed calendars, the widget snapshot. The feed token lives only on the server.
- **When the app syncs:**
  - **Push** (send the queue): after every change, when online; in one pass at a time.
  - **Full sync** (push then pull): at sign-in or start-up, when the connection comes back, and when the Android app returns to the front.
  - **Caveat:** there is no periodic or realtime pull. In a browser or the Windows app, changes made on another device appear only after a reload or a reconnect.
- **How a change is sent:**
  - Only the changed fields are sent, as an update.
  - If no row matches, the whole local row is inserted (a row created offline).
  - Parents go before children.
  - Up to 6 rows go in parallel per table; up to 6 tables are pulled in parallel.
  - Pages hold 1,000 rows. The cursor is the server's own time plus key, so the device's clock does not matter.
- **When a change fails:**
  - A missing parent waits in the queue and is retried.
  - A permanent refusal (permission, duplicate, failed check, bad value) is logged in the conflicts list as "rejected" and dropped from the queue. The local row keeps the refused value until the next pull.
- **Duplicates of "one per key" rows** are folded into the existing row instead of being refused, and every reference follows. These are: one switch per module per profile, one weigh-in per day, one target per start date, one habit or supplement tick per day, one exception per series day, one stock row per food per household, one sleep log per day, one live food per barcode per person.
- **Field-level merge:** while this device has unsent edits to a row, its edited fields win over what the server sends. Each field where the server's value differs is written to the conflicts list ("kept: local").
- **Deletes:** almost everything uses a "deleted" date rather than really deleting, so deletions reach every device. The one exception is a recipe ingredient line, which is really deleted.

[src/lib/sync.ts, src/lib/sync-rules.ts, src/lib/write.ts, src/lib/db.ts]

### 13.2 Security model (highlights)
- **Access rules (row-level security)** on every table: about 46 tables, rebuilt in migration 012.
  - A profile can be read only by its own user, or by the household owner for a managed profile (one with no login of its own). Being in the same household does **not** open another member's health data.
  - Household members share stock and shopping trips, and can read foods that are in the shared stock.
  - The anonymous role has no access.
  - Helper functions are not callable over the API.
- **Sign-ups** are by invitation (1.2).
- **Modules:** anyone may build one; nobody may mark their own as built-in. Keys must match `u_[a-z0-9]{6,24}`. A definition is at most 64 KB, a record at most 16 KB.
- **Recipe sharing:** private / proposed / public / rejected. Only a reviewer (`app_admin`) approves, through the `review_recipe` function.
- **Account deletion:** `delete_my_account()` removes everything, including the invite-list entry and audit rows.
- **Sign-in:** email links use PKCE (they work on the requesting device only). Passwords have at least 10 characters. Health consent is timestamped.
- **On the device:**
  - Android: no system backup or device-to-device transfer of app data. Account tokens are kept in the Keystore. No camera permission; barcodes are read by Google's scanner. The exact-alarm permissions are removed.
  - Reminder text is hidden on the lock screen.
  - Logs never contain tokens.
- **Data leaving the app:** CSV exports are protected against formula injection. Imports are size-capped and checked value by value. Built-module formulas run in a small language of their own, never `eval`.
- **Calendar links:** the feed token is stored only as a hash. Fetching followed calendars is protected against requests into private networks (SSRF) and keeps the secret address out of logs.

[supabase/migrations/004_rls.sql, 012_security.sql, 014, 017, 019, 020, 024, 025; supabase/tests/security.sql; android/app/src/main/AndroidManifest.xml]

### 13.3 Platforms
- **Android (Capacitor, package `app.visuma.planner`):**
  - the home-screen widget (5.6);
  - local notifications (5.5);
  - email links returning to the app;
  - unlock to switch accounts;
  - exports through the share sheet;
  - barcode scanning;
  - edge-to-edge drawing with safe areas;
  - on return to the front: apply widget ticks, sync, fill series, rebuild the widget.
  - Permissions: INTERNET and USE_BIOMETRIC only. CAMERA and the exact-alarm permissions are explicitly removed.
- **Windows (Tauri):**
  - Window 1280×860, at least 900×600, so it always uses the wide (sidebar) layout.
  - Per-user NSIS installer and MSI.
  - A strict content policy allowing only the Supabase project and Open Food Facts.
  - Reminders only while the app is open.
  - **Caveat:** email confirm and reset links point to the app's own address in a browser, so they cannot come back into the Windows app.
- **Web (Vite):** a service worker for offline opening; browser notifications only while open.
- **Layouts:** "bar" (phone upright), "rail" (phone sideways, at most 500 px tall), "wide" (900 px or wider). Bottom sheets on rail and wide are centred, at most 560 px wide, and keep Save visible.

[capacitor.config.ts, src-tauri/tauri.conf.json, src/lib/native.ts, src/lib/lifecycle.ts, src/ui/useLayout.ts]

### 13.4 Known caveats seen in the code
- **Time zone:** fixed at `Europe/Amsterdam` at sign-up and never changed. No screen sets it, and the device's zone is never used. The calendar feed and .ics exports use it.
- **Day start and end:** stored on the profile and in backups, but not used.
- **No undo** anywhere: deletes, drags and swaps all happen at once.

### 13.5 Privacy policy in the app
- Shown from sign-up ("Read the privacy policy") and from More → Data → Privacy → "Read". Version "Last changed 2026-09-29".
- Sections:
  - Who is responsible
  - What GetIt stores
  - Why, and on what basis
  - Where your data is kept (Supabase in Frankfurt; email service; device copy; Cloudflare-hosted pages; Open Food Facts for product search; Google's barcode scanner)
  - Who else can see it (household stock; proposed recipes; calendar links)
  - How long it is kept (until account deletion; deleted items kept marked as deleted; logs 1 day; no backups today)
  - Your rights (export, correct, delete, object, complain to the Autoriteit Persoonsgegevens)
  - If something goes wrong
  - Age ("GetIt is for adults. It is not for anyone under 18.")
  - Changes
- The controller's name and email come from build settings.
- The policy promises that changes are "announced in the app first". There is no mechanism for this in the code.

[src/legal/policy.ts, src/screens/Privacy.tsx]

### 13.6 Public website
- `site/index.html` (home), `site/privacy.html` (the same policy text), and `site/delete.html` ("Delete your GetIt account").
- The delete page: Email, Password, "Type **delete** to confirm", "Delete my account for good". It signs in and calls the same `delete_my_account` function.
  - Messages: "That email and password did not match. Nothing was deleted." / "The account could not be deleted…" / "Your account and everything in it has been deleted."
  - Fallback: write to the contact address; the account is deleted within 30 days.
- No cookies. The pages are to be hosted on Netlify Drop (PLAT-06, PLAT-07); the policy text still names Cloudflare.

[site/*.ts, site/*.html, docs/android-release.md]




# Part F. Specification of the modules as built (version 15)

Read from the code on branch `main` (latest commit 02c9d7f, "Nav check: the page swipe starts from a still page on a row's name"). Nothing was run or built. The document describes what the app does now, including its rough edges. It does not describe what it should do. File paths are in brackets at the end of each sub-section. "Synced" means the data is kept on the phone first (Dexie) and queued to Supabase.


## 0. Things every module shares

### 0.1 Module list, on/off switches, defaults

- There are 14 entries in the catalogue: **nutrition, shopping, training, habits, supplements, health, learning, agenda, sleep, projects, finance, household, stats, custom**. `custom` is only a placeholder; modules a person builds get keys like `u_xxxxxxxxxxxx`.
- Depth: "full" = nutrition, shopping, training, habits, supplements, health, learning, agenda, stats. "light" = sleep, projects, finance, household, custom. In More → Modules, light ones carry a "light template" chip.
- `defaultOn: true` in the registry for nutrition, shopping, training, habits, supplements, health, learning and agenda. This flag only matters as a label. What decides is the server.
- **Sign-up (server trigger `handle_new_user`)** creates a household called "Home", a default profile named after the part of the email before the @ (timezone Europe/Amsterdam), a "Notes" section, and one `module_instance` row per built-in module. These are switched ON: core, nutrition, shopping, training, habits, supplements, health, learning, agenda. The rest are switched OFF: sleep, projects, finance, household, custom, and stats (stats was added later, in migration 018).
- **Onboarding then calls `applyModules`** with the chosen template's list. It switches every built-in module (except custom) on or off to match. If the phone has not pulled the server's rows yet, it writes a fresh row. At sync time that row collides with the server row on (profile_id, module_key) and is "folded" into it. Module clashes are deliberately left out of the conflict list.
  - Caveat: until the phone's switch rows reach the server, the server's nine "on" rows exist. If onboarding is not finished, or the push fails, those nine stay on. A person who picked "Minimal planner" (agenda only) could then see Food, Shop, Training, Habits and others. This is a possible cause of the complaint "modules appearing when not selected".
- A module counts as **on** only when its `module_instance` row has `enabled = true`. A missing row means off. The page bar, Today's tabs, the Habits and Supplements sections and the widget all use this rule. One stale code comment in Today.tsx says the opposite ("Nutrition is on unless switched off; a profile without the row has it"), but the code checks `nutrition?.enabled`.
- Switching off never deletes data.
- A built module is on from creation, unless its row is switched off.
[src/modules/registry.ts, supabase/migrations/009_modules_and_signup.sql, 012_security.sql, src/lib/setup.ts, src/lib/day.ts, src/lib/sync.ts (foldIntoTwin), src/screens/Today.tsx]

### 0.2 Templates (Onboarding step 3, and More → Profile → "Starting layout")

| Template | Modules on | Food figures | Today figure | Body-targets step |
|----------------------|------------------------------------|---------------------|------------|-------------------|
| Minimal planner (default) | agenda | kcal | none | off |
| Student | agenda, learning, projects, habits, sleep | kcal | none | off |
| Office worker | agenda, projects, habits, shopping | kcal | none | off |
| Shift worker | agenda, sleep, habits, shopping, nutrition | kcal | none | off |
| Parent / household | agenda, household, shopping, nutrition, habits | kcal | none | off |
| Fitness & nutrition | agenda, nutrition, shopping, training, habits, supplements, health | kcal, protein, carbs, fat, fibre | kcal | on |
| Freelancer / projects | agenda, projects, finance, learning, habits | kcal | none | off |
| Everything on | all 13 (not custom) | kcal, protein | kcal | on |

- "Describe your days in a few words" suggests a template by keyword matching. Keywords count 2 and hints count 1. Only whole words match, longer phrases are matched first, and a tie goes to the template listed first. The suggestion takes over only until the person taps a card.
- "Adjust modules" opens a list of every module except custom, each with its own switch.
- "Start again" in More switches modules to match the template, sets nutrients and the Today figure, and keeps everything else.
[src/lib/templates.ts, src/screens/Onboarding.tsx, src/settings/PlanningSettings.tsx, src/lib/setup.ts]

### 0.3 Pages on the bottom bar

- Today and Plan are always there and always first. More is always last.
- In between: Food (if nutrition is on), Shop (if shopping is on), then built-in modules in this order: Training ▲, Habits ✓, Supplements ◇, Health ♡, Learning ◧, Agenda ▦, Sleep ☾, Projects ▣, Finance ¤, Household ⌂, Stats ◔. Built modules come next, by sort_order and then name, each with its own mark or its first letter.
- Nutrition and Shopping have no `/m/` page. Their screens are /food and /shop.
- Bar styles: row, two_rows, three_rows, drawer, fan. In "row", with more than 5 pages the middle ones scroll. Pages can be hidden or reordered in More → Modules → Nav settings. Swiping between pages is on by default.
[src/lib/pages-rules.ts, src/lib/settings.ts]

### 0.4 Module page (`/m/<key>`)

- Header: the module's mark, its name, an **Edit module** button, the summary, and view tabs when there is more than one view.
- If the module is switched off, a banner says so and offers "Switch on".
- **Section pages:** Habits, Supplements and Health (the weigh-in) show the same section as Today's Body tab, always for *today*. Stats shows the Stats screen.
- **Own screen:** Nutrition and Shopping show "This module has a screen of its own" with an Open Food / Open Shopping button.
- **Generic page:** every other module. It draws the views (list, table, calendar, board, grid, chart, form), shows totals, an Export link, and a round + button to add a record (the RecordSheet). Calendar views allow adding on a tapped day.
  - Records live either in a table of their own (calendar_event, sleep_log, workout_log, goal) or in the shared `module_record` store as JSON. Learning, Projects, Finance, Household and every built module use the shared store.
- Records are sorted newest day first. Records without a date come after, most recently changed first.
[src/modules/ModulePage.tsx, src/modules/records.ts, src/modules/views.tsx]

### 0.5 Edit module (from a module page or More → Modules → Edit)

Tabs: **Fields, Views, Rules, Settings**.

- **Fixed pages** (fields and views cannot be changed): nutrition, shopping, habits, supplements, health. A built-in module whose records have their own table (training, agenda, sleep) allows renaming, reordering and hiding fields only.
- For built-in modules that use the shared store (learning, projects, finance, household), fields can be added.
- Built-in changes are saved as an "overlay" in `module_instance.settings.overlay`. The overlay can hold: name, mark, summary, keywords, labels, hidden fields, order, extra fields, stats flags, view order, hidden views, names, columns, date fields, extra views, and rules switched off. "Go back to the app's version" clears it.
- **Rules tab:** a switch appears only for rules the app acts on (see BUILTIN_RULES below). Other rules show a line explaining why there is no switch.
- **Count in Stats:** each numeric field can be set to Not counted, Add up, Average or Count records.
- **Settings tab:** name, mark (one letter or symbol, not an emoji), summary (up to 160 characters), keywords. Built modules also get Delete. Deleting removes the module from the pages, switches it off and removes its unfinished tasks. Its records are kept.
- Limits: 40 fields, 50 options per choice field, 60 characters per option, label 60, unit 16, formula 200, 12 views, view name 40, 20 keywords of up to 30 characters, summary 160, module name 60, 4 entities, a definition of about 60 KB, a record of about 15 KB, text fields 2000 characters.
- Field kinds: Text, Number (decimals, optional unit), Whole number, Length of time (minutes), Yes or no, Date, Time, Date and time, **Choice** ("One of a list you write": one value only, no multi-select), Link to another module (food, recipe, exercise, task, goal), Calculated (formula).
[src/ui/ModuleEditor.tsx, src/modules/def-rules.ts, src/modules/FieldForm.tsx]

### 0.6 BUILTIN_RULES: what the app actually does with each registry rule

| Rule | Sentence | Support | What it means today |
|--------------------------|-----------------------------|------------|-------------------------------------------|
| nutrition.meal_tasks | Every planned meal becomes a task on the day it is eaten. | **switch** | Off: meals stay on Food and the shopping list but are no longer put on Today as tasks from today on. A meal already eaten keeps its ticked task. |
| nutrition.skipped_meal | If a meal is skipped, ask for a new time. | later | A meal cannot be marked skipped anywhere in the app. |
| nutrition.size_main | Scale the rotating main meal so the day reaches its target. | **switch** | Off: Food stops offering "N× reaches X kcal". |
| shopping.from_plan | Each trip buys what the plan needs up to the next trip, less stock. | always | This is how the trip is built. To stop it, switch Shopping off. |
| shopping.trip_days | Shopping happens on chosen days, tasks locked. | later | Shopping days are not put on the planner. The server default `trip_days:[3,6]` is never read. |
| training.session_task | A planned session becomes a task. | later | Sessions are logged, not planned. |
| habits.daily | A daily habit appears on every day until turned off. | **switch** | Off: habits leave Today's tabs and the widget. The Habits page still lists them. Note: it never creates tasks (see 4). |
| supplements.slot_task | Each slot becomes one task. | later | Supplements are ticked on the Body tab, not made into tasks. |
| health.retarget | When weight changes, recalculate targets. | **switch** | Off: a weigh-in is saved and the targets are left alone. |
| learning.soft | Learning moves when the day is full. | later | The planner never moves tasks by itself. |
| agenda.no_overlap | Nothing scheduled across an all-day event. | later | Same as above. |
| sleep.bedtime | Bedtime locked, nothing across it (locked). | later | Same as above. |
| projects.to_goal | A dated project becomes a goal on the year view. | later | Goals have no page. The year view's "Goals" list is hard-coded empty. |
| household.shared | A chore appears for everyone in the household. | later | Records are kept per person (per profile). |

- Built modules have two rules of their own, both off at the start:
  - "Put records with a date on the day as a task."
  - "Remind me at the record's time, or at a set time when it has none." This one needs the first rule. Its default time is 09:00.
- Built-in light modules (learning, projects, finance, household) **do not have** the day-task rule. Their dated records never become tasks. They only make a module tab appear on Today (see 0.7).
[src/modules/def-rules.ts, src/modules/rule-switch.ts, src/modules/records.ts]

### 0.7 Today's tabs: when each module shows on Today

- **Today** is always present. A row of tabs is shown only when there is more than one tab.
- Order of tabs: Today, Body, Work, Training, the other modules, Evening, Sleep.
- **Body tab** (labelled "Body". When only one part applies it is labelled "Habits" or "Supplements"; with only the health part it stays "Body"):
  - Health part: health is on AND (a weigh-in exists that day, or the day is today).
  - Habits part: habits is on AND the "habits.daily" rule is on AND at least one active habit is **due** that day. Daily and weekly habits are due every day. "Weekdays" habits are not due on Saturday or Sunday.
  - Supplements part: supplements is on AND at least one active supplement exists.
- **Work:** work hours are on and the weekday is a work day, or there are tasks in the "Work" section that day.
- **Training:** training is on AND there is a task belonging to training that day (module_key = training, or section "Training"). Logging sets does **not** create tasks, so this tab rarely appears.
- **Other module tabs** (learning, projects, finance, household, built modules): the module is on AND it has records dated that day or tasks belonging to it. The tab is named after the module. Nutrition, shopping, health, habits, supplements, sleep, agenda, training, work, evening and stats never get a module tab. Their tasks stay on the Today rail.
- **Evening:** today or an earlier day with something to review, or tasks from 18:00 onwards, or tasks in the "Night" section.
- **Sleep:** sleep is on AND (a sleep log exists for the day, or the day is today).
- What each tab shows:
  - Today: the review card (compact), followed-calendar events, the task rail, and planned repeats.
  - Body: weigh-in, habits and supplements sections.
  - Evening: the full review card.
  - Sleep: SleepDay.
  - Module tab: ModuleDay, a read-only list of that day's records with an "Open <module>" link, plus that module's tasks.
- A tab the new day does not have falls back to Today.
- The header can show one figure (the "Today metric", see 1.9) with a progress bar.
[src/lib/day-tabs.ts, src/lib/day.ts, src/screens/Today.tsx, src/sections/*]

### 0.8 Plan (Week / Month / Year)

- Plan shows **only tasks**, planned repeats of series (more than 8 weeks ahead), followed calendars (read-only) and public holidays.
- It does **not** show habits, supplements, weigh-ins, sleep, module records (learning blocks, project due dates, finance entries, chores) or the person's own Agenda events (calendar_event rows they made themselves).
- Load (heat) is the sum of task minutes, 15 minutes when a task has none, plus the minutes of timed followed events. Steps: none, under 1 h, up to 3 h, up to 6 h, more.
- Year view has a "Goals and phases" heading. Its `Goals()` function always returns an empty list, so it always says "No goals yet…".
- Holding a day lets you swap it with another day. Holding a task lets you move it.
[src/screens/Plan.tsx, src/ui/PlannedDay.tsx]

### 0.9 Tasks (for comparison with habits and chores)

- Task sheet fields: What, Day, Time, Minutes or "Until" an end time, Section (Work, Meal, Training, Learning, Home, Body, Night), Repeat, Ends (never or on a date), Locked, Notes (a note editor with "Open as page").
- **Repeat options:** Never, Every day, Every few days (2 to 365), Weekdays, Weekly on chosen days (pick weekdays), Every 2 weeks (pick weekdays), Monthly same day (the 31st means the last day in short months), Pick dates (up to 366 hand-picked days on a calendar).
- A series becomes real tasks 8 weeks ahead (WINDOW_DAYS = 56). Further out it shows as "planned repeats".
- Section to module colour: Work → work, Meal → nutrition, Training → training, Learning → learning, Home → household, Body → health, Night → evening.
- Habits and household chores have **none** of these scheduling options (see 4 and 13).
[src/ui/TaskSheet.tsx, src/lib/series-rules.ts, src/lib/colours-rules.ts]


## 1. Nutrition

### 1.1 Purpose and registry definition

- Summary: "Foods, recipes, a meal plan and macro targets."
- Keywords: food, meals, meal prep, diet, macros, calories, protein, recipes, cooking.
- **Entity food** (table `food`):
  - name (text, required)
  - kcal (number, "/100 g")
  - protein_g, carbs_g, fat_g, fiber_g (number, g)
  - state (choice: raw, cooked, canned, dried, frozen)
  - units (text, shown as "egg/eggs = 50 g; tray = 600 g")
- **Entity recipe** (table `recipe`):
  - name (required)
  - role (choice: breakfast, lunch, dinner, snack, shake, main)
  - portions_per_batch (number)
  - cook_minutes (duration, min)
- **Entity meal_plan_slot** (table `meal_plan_slot`):
  - slot (text), recipe_id (link to recipe), portion_multiplier (number), label ("What it was"), kcal, grams (g), unit (text), unit_qty ("How many").
- No field has a Stats flag. Nutrition Stats are worked out specially (see 14).
- Views (fixed, not editable): "Meal plan" (list of slots), "Recipes" (table: name, role, portions, cook), "Foods" (table: name, kcal, protein, carbs, fat, fibre, state).
- Rules: see 0.6. meal_tasks = switch, skipped_meal = later, size_main = switch.
- Server default setting `meal_slots: [breakfast, lunch, snack, dinner]` exists. The app never reads it; the slots are hard-coded (see 1.6).
[src/modules/registry.ts, supabase/migrations/009_modules_and_signup.sql]

### 1.2 Food screen (/food) layout

- Header: date picker (PageHead) and three tabs: **Day | Recipes | Foods**.
- Day tab: totals line and four meal cards (see 1.6).
- Recipes tab: "My recipes" block, then the recipe table with books (see 1.5).
- Foods tab: "Find in stores" and "Scan barcode" buttons (Open Food Facts), then the foods table with books and a search box (see 1.3).
- Export link at the bottom:
  - Day: that day's meal plan.
  - Recipes: all recipes.
  - Foods: all foods.
[src/screens/Food.tsx]

### 1.3 Foods table and the catalogue

**Columns kept per food** (server table `food`):

- Identity: id, owner_id (null = shared catalogue), name.
- Figures per 100 g: kcal, carbs_g, fiber_g, fat_g, protein_g (numeric 7,2).
- state: raw (default), cooked, canned, dried, frozen.
- cook_yield (cooked weight ÷ raw weight).
- Pack and shelf: pack_size_g, pack_label, store_section, shelf_days, freezer_ok.
- source: 'catalogue' (default), 'import' (Excel) or 'off' (Open Food Facts).
- created_at, updated_at, deleted_at.
- Since migration 021: barcode (8 to 14 digits), brand (up to 120), stores (text array, up to 20), source_ref (up to 64), image_url (https only, up to 500).
- Since migration 022: units (JSON list, up to 8).
- Name search on the server has a trigram index (`food_name_trgm`).

**No EU-label fields.** There is no salt, sugars or saturated fat column anywhere, either in the database or in the app. Open Food Facts reading deliberately keeps only the five figures. A code comment says: "Salt, sugar and the rest are left: there is nowhere to keep them, and a half-filled column misleads."

**Catalogue size** (seed 005):

- **807 foods**, inserted with only name, kcal, carbs, fibre, fat and protein per 100 g. No pack sizes, no store sections, no shelf data.
- 26 shared recipes.
- 259 exercises.
- 006 links three recipe lines whose names differed.
- 007 sets cook_yield for 19 foods. Examples: Brown Rice 3.0, White Rice 2.9, Quinoa 2.8, Oat 2.5, Chickpeas 2.4, Lentils 2.4, Fish Cod 0.75, Salmon 0.78, Tuna 0.75, Chicken breast 0.75, Turkey breast 0.75, Beef Sirloin Top 0.73, Tofu Firm 0.95, Broccoli 0.9, Cauliflower 0.9, Zucchini 0.8, Egg 1.0, Shrimp 0.75. It also adds the views `recipe_line_resolved` and `recipe_macros`.
- 008 sets the yield back to 1.0 for grains and legumes whose figures are already cooked (under 200 kcal), and marks Brown Rice, White Rice, Quinoa, Oat, Chickpeas, Lentils and Whole-wheat pasta (cooked) as state "cooked".

**What the table shows:**

- Columns: name, kcal /100 g, protein, carbs, fat, fibre, state, units. Nutrient columns the person does not track are removed.
- On a narrow phone only name plus the first two tracked nutrients are shown (usually name and kcal, or name, kcal and protein). State and units disappear.
- The table is **read-only**: no cell can be edited.
- Each row has an **Open** button that opens the food's sheet (see 1.4).
- At most **200 rows** are shown. The line under the table says "Showing 200 of N. Search to narrow it."
- Rows appear in local database order, which is effectively the id (UUID) order. The table is **not sorted by name**.
- Header line: "**N** foods in the catalogue", followed by the search box.

**Foods-tab search** (inside BookTable):

- The whole text typed is lower-cased and trimmed, and treated as one string.
- A row matches when its name *contains* that exact string. "chicken breast" does not match "Breast Chicken".
- There is no ranking and no re-sorting. Matches keep the table's own (unsorted) order. The 200-row cap applies.
- The search applies inside the chosen book.
- "Show in Foods" on a product page puts the product's name into this box.

**SearchPick search** (the picker used for recipes in meal slots, foods in "From a food", ingredients in the recipe editor, foods in Stock add, countries, lookups). This is the stronger behaviour:

- Typing filters on every key press. The list opens on focus.
- The query is split into words on spaces. **Every word must appear somewhere in the name**, case-insensitive, in any order.
- Ranking: score = (0 if the name *starts with* the first word; 1 if any word inside the name starts with the first word; otherwise 2) × 1000 + **length of the name**. Ties are broken alphabetically.
  - Effect: names starting with what was typed come first, and shorter names (the plain food) come before longer variants.
- With an empty query, everything is listed alphabetically.
- Shows at most `limit` results. The default is **8**; no caller changes it.
- Each result shows the name, an optional tag ("mine", "in stock", "recipe") and an optional meta line ("380 kcal / 100 g", "N kcal per portion", "egg · slice").
- Keyboard: ↑ and ↓ move, Enter picks, Esc closes. A pick happens on click, not on pointer-down. This avoids a tap "falling through" to the next meal's checkbox.
- When something is chosen, its name is shown as the placeholder, with a × Clear button.
- The code comment claims SearchPick is "the same quick search as the Foods page". That is not true: the Foods table uses plain substring matching. To use one search everywhere, SearchPick's `rank()` is the one to reuse.
- **The Recipes tab has no search box at all.**
[src/sections/BookTable.tsx, src/ui/DataTable.tsx, src/ui/SearchPick.tsx, src/screens/Food.tsx, supabase/migrations/003, 005–008, 021, 022]

### 1.4 A food's sheet (Open) and units

- The sheet shows the food's name and a line: "Per 100 g: X kcal · X g protein · X g carbs · X g fat · X g fibre".
- **Units** list: "1 egg = 50 g", followed by "· eggs" in a smaller grey span when the unit has its own plural.
- **Only the person's own foods can be changed**, and only their units:
  - Add-unit form: Unit (e.g. egg), "Plural, if odd" (e.g. eggs), "One weighs, g". Note: "A new weight only counts for what is typed from now on."
  - × removes a unit.
  - Shared catalogue foods show "Shared foods' units are set by GetIt." Someone else's food shows "Only the person who added this food can change it."
- **A food's name, macros, state, pack size or store section cannot be edited anywhere in the app.**
- **There is no "create a food by hand" button.** A food only comes from the catalogue, the Excel import, or an Open Food Facts product (search or scan).
- Unit rules:
  - At most 8 units per food. Name 1 to 24 characters, case kept. Names that mean a weight are reserved: g, gr, gram, grams, kg, kilo, kilos, kilogram, kilograms.
  - Weight 0.1 to 5000 g, kept to a tenth. Each name once, regardless of capitals.
  - A plural is kept only when it differs from the name.
- Automatic plural (`pluralOf`):
  - Words with no vowel, or containing ".", stay as they are (tbsp, tsp, ml).
  - leaf → leaves, loaf → loaves, half → halves, knife → knives.
  - Words ending in ss, x, z, ch or sh add "es".
  - Words already ending in "s" stay as they are.
  - Consonant + y becomes "ies".
  - Otherwise "s" is added.
  - Singular is used for quantities above 0 and up to 1 ("0.5 cup", "1 egg"). Plural is used for anything else.
- Counts are written with at most 2 decimals and no trailing zeros. Grams labels: "4.5 g" under 10 g, whole grams up to 999 g, then "1.25 kg".
- Amounts can be typed with a comma as the decimal point, with ½ ¼ ¾ ⅓ ⅔ ⅛, "1/2", "1 1/2" or "1½", and "2 000" with a space.
- A saved count is shown only while it agrees with the saved grams (within 5%). Otherwise the grams are shown.
[src/ui/FoodUnits.tsx, src/lib/units-rules.ts]

### 1.5 Catalogue default units (migration 022), and where units are offered

Default units were set only for shared catalogue foods with these **exact names**, and only where the food had no units yet:

- Eggs:
  - Egg Chicken: egg 50 g
  - Egg Duck: 70 g
  - Egg Goose: 144 g
  - Egg Quail: 9 g
  - Egg Turkey: 79 g
- Bread:
  - White Bread, Whole Wheat Bread, Whole-wheat bread, Sour Dough Bread: slice 35 g
  - Whole-wheat pita: pita 60 g
- Fruit:
  - Banana 120 g
  - Apple and Apple Granny Smith: apple 180 g
  - Pear 170 g
  - Orange and Orange Navel: orange 130 g
  - Clementine 75 g
  - Orange Tangerine: tangerine 75 g
  - Kiwifruit: kiwi 70 g
  - Peach Yellow: peach 150 g
  - Peach Nectarine: nectarine 140 g
  - Plum 65 g
  - Apricot 35 g
  - Avocado 150 g
  - Dates Medjool: date 24 g
  - Dates Deglet Noor: date 7 g
- Vegetables:
  - Garlic: clove 5 g
  - **Onion: onion 110 g**
  - Tomato Red: tomato 120 g
  - Carrot 60 g
  - Potato 170 g
  - Bell Peppers, Capsicum Red, Capsicum Green, Capsicum Yellow: pepper 150 g
  - Olive Black and Olive Green: olive 4 g
- Spreads and butters:
  - Butter: tbsp 14 g, tsp 5 g
  - Butter Peanut Smooth: tbsp 16 g, tsp 5 g
  - Butter Almond, Butter Cashew: tbsp 16 g
  - Butter Sesame Tahini: tbsp 15 g
  - Hummus: tbsp 15 g
- Sugar: tsp 4 g, tbsp 12.5 g
- Lemon Juice and Lime Juice: tbsp 15 g, tsp 5 g
- Chia Seed: tbsp 12 g. Flaxseed: tbsp 10 g.
- Whey protein powder: scoop 30 g.
- Mixed nuts: handful 30 g.
- Milks (Milk Cow, Milk Cow Lactose Free, Milk Almond, Milk Soy, Milk Goat, Milk Rice, Buttermilk, Kefir): glass 250 g, cup 240 g.
- Cheeses (Cheese Gouda, Cheese Edam, Cheese Cheddar, Cheese Swiss): slice 20 g.
- Every catalogue food whose name contains " Oil" (except Fish Oil): tbsp 13.5 g, tsp 4.5 g.
- Shared recipe lines with Egg Chicken in multiples of 25 g were converted to "egg" counts.

**Onion and other vegetables:** only the food called exactly "Onion" has a unit. These remain **grams only**: **Onion Shallot, Onion Spring, Onion Sweet, Onion Welsh**, every other tomato variety, all other vegetables (cucumber, zucchini, broccoli, lettuce and so on), all meats and fish, rice, pasta and similar.

Other ways a food gets units:

- An Open Food Facts product whose pack states a serving gets one unit from it. Examples: "1 bar (30 g)" becomes bar 30 g; "2 biscuits (25 g)" becomes biscuit 12.5 g; a bare "30 g" becomes "portion".
- Excel imports get none.

**Where an amount can be typed in units vs grams only:**

| Place | Units offered? |
|--------------------------------|------------------------------------------------------------------------------|
| Meal slot "From a food" | Yes: g plus the food's units. Starts in the food's first unit. |
| Recipe editor ingredient lines | Yes, when the food has units. Starts in the first unit. A unit the food no longer has stays on offer at its saved weight. |
| Stock add / edit | Yes: g, kg and the food's units. Starts in the pack size (g/kg) if the food has one, else the first unit. |
| Scan to stock | packs (if the pack size is known), g, kg, and the food's units or serving. |
| Meal "Just numbers" (quick entry) | No. Grams only, for "Grams eaten". |
| Shopping trip | Shown as a count ("6 eggs") only when every planned line used the same unit, otherwise grams. |
| Copy ingredients (recipes) | Same rule as the shopping trip. |
| Foods table | Units shown as text ("egg/eggs = 50 g"), on wide screens only. |

Unit picker (AmountInput):

- 1 choice: the word is shown with no button.
- 2 to 4 choices: buttons side by side.
- 5 or more: a dropdown, each entry with "N g each".
- The buttons always show the **singular** unit name ("egg") whatever number is typed. The plural appears only in the hint line ("2 eggs (100 g)").

**Leading-space check:** no code string was found that builds a unit name with a leading space. The plural helpers all trim. Places where a unit appears right after a space or a separator, and which may look like a stray leading space:

1. The food sheet's plural, rendered as `<span class="row-meta"> · eggs</span>` after "1 egg = 50 g".
2. DataTable column headers, which add the unit as `<span> {unit}</span>`, for example "kcal /100 g", "Needed g", "Pack g".
3. The Stats screen's units (` ${unit}`).

Needs checking on a device.
[supabase/migrations/022_food_units.sql, src/lib/units-rules.ts, src/ui/AmountInput.tsx, src/ui/FoodUnits.tsx, src/ui/DataTable.tsx, src/lib/products-rules.ts]

### 1.6 Recipes tab: My recipes, editor, sharing, books

**My recipes block:**

- Text: "Your own recipes stay private unless you propose one to everyone", with a **New recipe** button.
- A collapsible list "Your recipes · N". It opens by default when you have 5 or fewer, or when one is waiting for review or was not accepted.
- Each row shows the name, "X kcal a portion", the sharing chip, and Edit.
- Only your *own* recipes can be edited. Catalogue and approved public recipes cannot be opened or viewed in detail. Their ingredients can be read only through "Copy ingredients".

**Recipe editor (bottom sheet) fields:**

- Name: required, up to 120 characters.
- "For": Any meal, Breakfast, Lunch, Dinner, Snack, Shake, Main meal.
- "Portions a batch makes": above 0, up to 999. Default 1.
- **Ingredients, amount per portion**:
  - Add one with the SearchPick "Add an ingredient". It lists shared foods and your own foods. Foods a housemate added are not listed.
  - Each line shows the food name, a "mine" chip for your own foods, the amount, the unit picker when the food has units, and a hint ("2 eggs (100 g)").
  - × removes the line.
  - Limit: up to 10 kg per portion per ingredient. At least one ingredient is required.
- A running total: "One portion: X kcal · X g protein · X g carbs · X g fat · X g fibre".
- Minutes to make: optional, 0 to 10000.
- Steps: optional, up to 4000 characters.
- **Who can see it**: "Only me", or "Propose to everyone" ("The app's owner looks at it first… Your name is not shown with it.").

Not offered on lines:

- the raw/cooked state per line (new lines are saved with state null, so no cook-yield conversion happens),
- notes or free text per line,
- reordering,
- free-text lines without a food.

Also missing:

- no **delete** button inside the editor (delete is only in Select mode),
- no barcode scanning in the editor,
- no photo.

**Sharing states:**

- private
- proposed ("Waiting for review")
- public ("Shared with everyone")
- rejected ("Not accepted", with the reviewer's note, up to 280 characters)

Sharing rules:

- Changing an approved recipe sends it back for review.
- Proposing is blocked while the recipe uses any of your own foods. The editor names them and asks you to swap them for shared ones.
- Reviewers (accounts listed in `app_admin`) see a review queue in More → Data → RecipeReview, with approve and decline.

**Recipe table:**

- Columns: Recipe, Role, Items (line count), kcal, and each tracked nutrient. Macros are worked out live from the lines every time.
- Header: "N recipes · macros calculated from the ingredient lines".
- Narrow screens show the name plus the first two tracked nutrients.
- Empty: "No recipes yet — import them from your Excel file in More."
- No search, no open/view button, and no sorting (database order).

**Books (both Recipes and Foods):**

- A row of chips: "All", each book (optional swatch colour), "+ New book". Picking a book filters the table.
- A book can be renamed, recoloured or deleted. Deleting a book never deletes its rows.
- Limits: at most 50 books, at most 500 items per book, name up to 60 characters.
- Books are kept in `profile.settings.books`, so they sync with the profile.
- **Select mode:** tap "Select", or hold a row for 450 ms. Each row gets a tick box. The bottom bar offers:
  - Select all shown / clear
  - **Add to book…** (an existing book, or "Make and add" a new one)
  - Remove from this book (only inside a book)
  - **Copy ingredients** (recipes) or **Copy names** (foods)
  - Export (the selected rows)
  - **Delete…** (only your own rows; shared catalogue rows are left out and counted). Recipes deleted this way stay in meals already planned. Foods deleted this way keep their figures in recipes that use them.
  - Esc leaves select mode.
- **Copy ingredients:**
  - The chosen recipes are taken in name order and expanded for one whole batch (per-portion grams × portions per batch).
  - Cooked weights are turned back into raw grams when the food has a yield, and the cooking note is dropped from the name ("Brown rice (cooked)" becomes "Brown rice"). A cooked weight that cannot be converted is labelled "g cooked".
  - The same food in the same unit is added together. A count ("6 eggs") is kept only while every line was in that unit.
  - Rounding: tenths under 10, whole numbers up to 1000, nearest 10 above that.
  - Output is one line per ingredient: "Oats — 240 g".
  - Copied to the clipboard, with a fallback for old web views.
[src/ui/MyRecipes.tsx, src/ui/RecipeEditor.tsx, src/lib/sharing-rules.ts, src/ui/SharingChoice.tsx, src/settings/RecipeReview.tsx, src/sections/BookTable.tsx, src/lib/books-rules.ts, src/ui/BookBar.tsx, supabase/migrations/019_recipe_sharing.sql]

### 1.7 Meals: the Day tab

**Fixed slots.**

- Every day has exactly four meal cards, **hard-coded** in this order: **Breakfast, Lunch, Snack, Dinner** (`SLOTS` in meals.ts).
- They cannot be renamed, added to (no second snack, no pre-workout), removed or reordered.
- They do not exist as rows until something is planned. A `meal_plan_slot` row is created the first time a recipe, numbers or a time is given for that slot on that day.
- The server's `meal_slots` default and the `role` on recipes are not used to build slots. Any recipe can go in any slot.
- **Dinner is the "main meal"** (MAIN_SLOT). It is the one the size-to-target suggestion applies to.

**Totals line** at the top:

- For each shown nutrient: "Planned **X** / target kcal", then "Protein **X** / target g", and so on. The "/ target" part appears only when there is a target.
- Then "Eaten **X** kcal". Eaten shows kcal only.

**Each meal card:**

- Head: "Breakfast · 08:00" when there is a time. A link reads "Add time" or "Change time" and opens a time field, a × to clear a time of the meal's own, and Done.
- A time given on the day wins over the default meal time (More → Profile → Food → Default meal times). Without either, the meal has no time.
- **Recipe mode** (default):
  - SearchPick "Choose a recipe". It lists all non-deleted recipes; your own are tagged "mine", and each shows "N kcal per portion".
  - Picking keeps the current portions if a recipe was already there, otherwise 1. Clear removes it.
- **"Just numbers" checkbox** switches the card to quick entry:
  - "What it was (optional)", up to 120 characters.
  - "Calories are" dropdown with bases: **Total eaten; per 100 g; per 50 g; per 30 g; per 25 g; per portion of … g** (then "One portion, g"); and **From a food**.
  - kcal (required).
  - "Grams eaten" (required for every basis except Total; optional with Total).
  - Tracked macros are shown first. The rest sit behind "More" (or "Add macros"). All macros are optional, and an empty one stays unknown, never zero.
  - Live result: "Comes to X kcal · …". The Save button reads "Saved" when the stored values already match.
  - Limits: kcal up to 20000 per meal, grams up to 20000, each macro up to 2000 g. No negatives.
  - The basis is not kept. Only totals are stored, so reopening a meal shows totals.
- **"From a food"** (inside Just numbers):
  - SearchPick "Which food" lists all non-deleted foods. Your own are tagged "mine"; meta shows "N kcal / 100 g · first two units".
  - "How much" uses the amount and unit picker (g plus the food's units).
  - "Units" or "Add a unit" opens the food's sheet.
  - Result: "2 eggs (100 g) comes to X kcal…".
  - Saved as quick numbers, with label = the food name, grams, and the unit with how many. **The link to the food is not kept** (food_id is null).
  - Errors: "X has no calories listed; type the numbers instead." / "Say how much was eaten."
- **Foot, when planned:**
  - An amount line ("2 eggs (100 g) · 143 kcal…").
  - For a recipe, a **portions** number box (step 0.25, minimum 0.25).
  - An **eaten** checkbox.
- **Size-the-main-meal suggestion** (rule size_main):
  - Shown only on Dinner, when Dinner holds a recipe (not quick numbers), there is a calorie target, and the recipe has calories.
  - Portions = (target kcal − kcal of the other three planned meals) ÷ dinner kcal per portion, clamped to **0.5–3**, rounded to 0.1.
  - Shown when it differs from the current portions by 0.1 or more, as a button "**N× reaches TARGET kcal — use it**".
  - It uses calories only. The protein option exists in the code but is not used.
- Footer note: "Planned meals appear on Today, at their time if they have one, and fill the shopping list. A meal can be a recipe or just the numbers off a packet."

**Meal tasks on Today** (rule meal_tasks):

- Every planned slot with a recipe or quick numbers gets one Today task.
- Task details: category "Meal", module nutrition, duration 20 minutes, time = the meal's time.
- Title: "Breakfast: Oats with banana (1.5×)", or "Lunch: sandwich · 450 kcal", or "Breakfast: Eggs, 2 eggs · 143 kcal".
- Ticking the meal eaten marks the task done. Unticking sets it back to todo.
- Changing the meal's time moves the task. Ticking eaten does not undo a push made on Today.
- Changing the default meal times moves future meals that follow the default and still sit at the old time.
- Switching the rule off removes future meal tasks that are not done. Switching it back on recreates them from today on.
- Clearing a meal removes its task.
- **Today itself has no "add a meal" button.** The + there makes a generic task.

**Eaten logging:**

- Ticking eaten writes a `food_log` row:
  - Recipe meal: recipe_id plus portions.
  - Quick meal: the numbers, logged under the slot's own id so corrections reach it.
- Unticking soft-deletes the log.
- Swapping what a meal is after it was eaten un-eats it first.
- If "Take ingredients out of stock" is on, ticking eaten also deducts stock (see 2.2).
- The day's eaten totals are summed from food_log. Recipe logs are worked out live from the current lines.

**Nutrients tracked:**

- Calories (kcal), Protein, Carbs, Fat, Fibre. There are no others.
- Which are shown is set in More → Profile → Food → "What to count". Calories cannot be unticked.

**Today metric:**

- More → Profile → Food → "On Today": Nothing, Calories, or any tracked macro "(g)".
- Today's header shows "1200 / 2600 kcal", or "Protein 40 / 150 g", or the eaten amount alone when there is no target, with a progress bar when there is a target.
- Shown only while nutrition is on.
- If a tracked macro is unticked while it is the Today figure, the figure falls back to kcal.

**What syncs:** meal_plan_slot, food_log, target and profile settings sync. Recipes and foods sync as "catalogue" tables: pulled, and pushed only for your own rows.
[src/screens/Food.tsx, src/lib/meals.ts, src/lib/quick-food.ts, src/lib/nutrition.ts, src/lib/calc.ts, src/settings/FoodSettings.tsx, src/lib/settings.ts]

### 1.8 Settings that belong to Nutrition

All in More → Profile → Food, unless noted:

- "What to count" (checkboxes).
- "On Today" figure.
- "Default meal times": one per slot, each with Add time or Remove.
- "Take ingredients out of stock when a meal is eaten". This is on Shop → Stock, kept in `stock_auto`, default off.
- Edit module: rule switches for meal_tasks and size_main.
- Defaults: nutrients = kcal only, today_metric = kcal (but every template except Fitness and Everything sets it to "none"), meal_times empty.
[src/settings/FoodSettings.tsx, src/lib/settings.ts]


## 2. Shopping

### 2.1 Registry

- Summary: "Trips by aisle, packs, stock and prices."
- Entities:
  - shopping_trip: trip_date, store_id, status (planned, shopping, done, skipped).
  - shopping_item: food_id, needed_g, from_stock_g, packs_to_buy (formula `ceil((needed_g - from_stock_g)/pack_size_g)`), checked.
- Views: Trip (list), Stock (table food_id, grams_on_hand).
- Rules: from_plan = always; trip_days = later.
- **The app never writes shopping_trip or shopping_item rows.** The trip is worked out live, and the ticks are kept on the device only. The `store` and `store_product` tables (prices, pack sizes per shop) are never used.
[src/modules/registry.ts, supabase/migrations/003_domain.sql]

### 2.2 Shop screen (/shop)

Header: "Shopping" / "Everything the next four days of meals need, in the weights a shop sells." Tabs: **Trip | Stock | Stores**.

**Trip tab: how the list is built.**

- The window is fixed: **today plus the next 3 days**. It cannot be changed and is not tied to trip days.
- Only **meal-plan slots with a recipe** are used. Quick-number meals and "From a food" meals are **ignored**, because they have no recipe. Skipped slots are excluded, though nothing can mark a slot skipped.
- Each recipe line with a food: raw grams (cooked weights turned back with cook_yield) × the slot's portions, summed per food.
- The name is what the first recipe line called the food, with the cooking note removed and the first letter capitalised. Otherwise the food's name.
- Stock is taken off. Lines fully covered by stock drop out and are counted as "N covered by stock".
- Packs = ceil(to buy ÷ pack_size_g), when the food has a pack size. Catalogue foods have none; only Open Food Facts products do.
- Sorted by the food's store_section (missing = "Other"), then name. **The section is not shown** as a heading or column on the Trip list. It only affects the order.
- **There is no way to add a manual item** (toilet paper, a forgotten food). The `shopping_item.manual_name` column exists in the database but is unused.
- **Shops are not shown.** A product's `stores` (from Open Food Facts) is never shown on the trip. There is no per-store view or filter.

**Trip table columns:**

- Item.
- **Needed**: "6 eggs" when every planned line used the same unit and there is no pack size, else "N g".
- From stock g: only when something is in stock.
- Pack g and Packs (formula): only when some food has a pack size.
- **Got it** tick box.

Narrow screens show Item, Needed, From stock and Got it.

**Totals line:** "Covering d MMM to d MMM", "**N** of M left", "**N** covered by stock".

**Ticks:**

- Kept on this device per day (key `shop:checked:<today>`). They do not sync, and a new day starts fresh.
- **"Put ticked items in stock"** adds what was bought:
  - whole packs where the pack size is known,
  - whole units for counted food without a pack,
  - otherwise the grams needed.
  - Then it clears those ticks and says "N items put in stock."

**Empty states:**

- "No trip planned. Plan some meals first and the list fills itself."
- "Everything the plan needs is already in stock."

**Stores tab:** text only. "Stores hold pack sizes and prices. Start with the ones you actually use and type a price when you notice it; nothing here needs a shop's catalogue to work." Nothing can actually be done there.

**Export:** the trip (Item, Needed g, How many, Unit, From stock g, Pack g, Got it) or the stock.
[src/screens/Shop.tsx, src/lib/shopping.ts, src/lib/calc.ts]

### 2.3 Stock (the cupboard), on Shop → Stock

**Scope and sharing:**

- Stock belongs to the **household** (household_id), not to a profile. All profiles of the account share it.
- Other people's accounts can only share a household if they are added as members on the database. **There is no invite or join screen in the app.**
- Migration 025 lets household members read the foods that are in the shared cupboard, so another member's scanned food shows by name. (It is applied; an earlier note said otherwise.)

**Add form:**

- SearchPick "Add to stock: search foods". It lists all foods; meta shows the store section and "N g pack"; tags are "in stock" or "mine".
- Amount field with a unit picker: g, kg and the food's units.
  - A food with a pack size starts pre-filled with one pack, shown in g or kg.
  - A counted food starts in its first unit.
- Note: "opened, in the freezer", up to 200 characters.
- Add button.
- Hints: "2 eggs (100 g)", "N already here; this adds to it.", "That is not an amount."
- Status after adding: "Put 2 eggs of X in stock." or "Added … to what was there."

**Scan to add:** see 3.

**List:**

- A "Filter stock" box. Every word must appear in the name, the aisle or the note.
- Totals: "N items", "N out".
- Grouped under **aisle headings** (store_section, "Other" last), sorted by name.
- Each row: name, note, − / amount / +.
  - The amount reads "12 eggs" for stock kept in a unit, "450 g" or "1.25 kg" otherwise, or "out" at 0 g.
  - Items at 0 g stay listed as "out" until removed.

**− / + steps:**

- In a unit: one whole unit (11.4 eggs goes to 12 or 11).
- In grams the step depends on the amount: under 100 g → 10 g; under 1 kg → 50 g; under 5 kg → 100 g; otherwise 500 g. The amount snaps to the step.

**Edit (tap the amount):** amount and unit (g, kg, the food's units), note, Save, Remove (with confirmation), Cancel.

**Limits:** at most 1,000,000 g per row. Kept to 0.1 g. One row per household per food; a removed row is brought back rather than duplicated.

**Auto-deduct:**

- Switch: "Take ingredients out of stock when a meal is eaten". Default off. Per profile setting.
- Ticking a *recipe* meal eaten takes raw grams × portions out of stock, **only for foods already in stock**. It never goes below 0.
- What was taken is remembered on the device, so unticking puts exactly that back. Ticked on another phone, unticking puts back the recipe amounts.
- Quick-number meals change nothing.

**Conflicts:** the amount is stored, not the change. When two phones edit offline, the last one sent wins.

**Syncs:** the stock table syncs (as a child table).
[src/sections/Stock.tsx, src/lib/stock.ts, src/lib/stock-rules.ts, supabase/migrations/025_household_foods.sql]


## 3. Products (Open Food Facts) and barcode scanning

**Where available:**

- Food → **Foods** tab: "Find in stores" and "Scan barcode".
- Shop → **Stock**: "Scan to add".
- **Not available** in meal slots, the recipe editor, the Day tab or anywhere else.

**Search:**

- The product sheet has a "Product, brand or barcode" box and a **Search** button. Searching happens only on pressing Search, never while typing.
- Digits that form a valid barcode are looked up directly.
- At least 2 letters. Characters such as : " ( ) [ ] { } ^ ~ * ? \ / ! + & | < > = are removed. Up to 80 characters.
- Searches products sold in the profile's **country** (default Netherlands). Names come in the country's language, with nl and en as fallbacks.
- In the Android app the newer search.openfoodfacts.org is tried first, then the old search. In a browser only the old search is used. A busy answer is retried once after 2.5 s.
- Up to 20 results. Each shows a thumbnail, name, brand · quantity, up to 3 shops, kcal/100 g (or ml), and a "mine" tag if already kept.
- Credit line: "Product data: Open Food Facts (ODbL). Searches go from this device straight to Open Food Facts."

**Scanning:**

- Android: Google's code scanner, with no camera permission needed.
- Browser: the camera through BarcodeDetector when available (EAN-13, EAN-8, UPC-A, UPC-E).
- Otherwise: type the digits.
- The check digit is verified. UPC-E is expanded. 12-digit codes are stored as 13 with a leading 0.
- A code starting with "2" that is not found shows a note: shop-label codes are not listed.
- A barcode already in your foods opens it with "Already in your foods."

**Product page:**

- Name, brand · quantity (or pack), barcode.
- Facts table "Per 100 g" (or 100 ml): Energy kcal, Protein, Carbohydrate, Fat, Fibre. kcal is worked out from kJ ÷ 4.184 when needed.
- "Counted as": the food's units, or the pack's serving.
- "Sold at": the shops listed, tidied to proper chain names (Albert Heijn, Jumbo, Lidl, Aldi, Plus, Dirk, Maxima, Rimi and others).
- **Shared prices** (Open Prices): the latest price per shop, newest first, up to 10: shop and city, price, "(offer)", price per kg or l, date. Usually "No shared prices yet."
- Attribution links.
- Actions:
  - Foods tab: **Add to my foods**, or **Show in Foods** if already kept (fills the Foods search box).
  - Stock: **Put in stock…**, then the amount (packs, g, kg, serving units; defaults to 1 pack) and "Add to stock". This also adds the food if needed.

**Adding a product creates your own food:**

- owner = you, name, brand, the five figures.
- state: frozen or canned from the categories, else raw.
- pack_size_g from the product.
- store_section from the categories: Frozen, Drinks, Dairy, Bakery, Meat, Fish, Fruit and veg, Breakfast, Pasta and rice, Spreads, Tins and jars, Sauces, Snacks.
- stores, barcode, source 'off', image, and the serving as a unit.
- The id is fixed per account and barcode (a salted UUIDv5), so two phones scanning the same pack make one row. A deleted one is brought back.

**Rate limits and caching:**

- At most 8 searches, 12 product reads and 12 price reads per minute. Waits over 20 s produce "try again in N seconds".
- Answers are cached in memory only: search 15 min, product 6 h, not-found 30 min, prices 30 min.
- Offline: "You are offline. Searching the shops needs a connection; your own foods still work."
[src/ui/ProductSearch.tsx, src/ui/BarcodeScan.tsx, src/lib/products.ts, src/lib/products-rules.ts, supabase/migrations/021_food_products.sql]


## 4. Habits

**Registry:**

- Summary: "A habit grid and streaks."
- Entity habit: name (required), schedule (choice: **daily, weekdays, weekly**).
- View: Grid. It is never drawn, because Habits is a fixed page.
- Rule: daily (switch).

**Database:** habit has name, schedule (default daily), sort_order, active. habit_log has habit_id, log_date, done, with one log per habit per day. There is **no notes field** and no time.

**Schedules available** (shown as "Every day", "Weekdays", "Once a week"):

- daily: due every day.
- weekdays: due Monday to Friday. Not due on Saturday or Sunday (shown as "not due today").
- weekly: "due" every day of its Monday–Sunday week until ticked once. It then shows "done this week".
- **Not available:** chosen weekdays (for example Mon/Wed/Fri), weekends only, every N days, specific dates, monthly, a time of day, start/end dates, or a target count per week.
- **The schedule cannot be changed after the habit is created.** The edit form allows rename and archive only.

**Habit section** (Today's Body/Habits tab, and the Habits page /m/habits, which always shows today):

- Title "Habits".
- Empty state: "Add a habit below to tick it off each day."
- Each row: name (tap to rename or archive), a meta line "Every day · not due today · done this week · N days running", and a tick.
- Streaks:
  - daily: consecutive due days done. Today still open does not break it.
  - weekdays: weekends are skipped.
  - weekly: consecutive weeks with at least one tick.
  - Shown as "1 day running", "N days running", or "N weeks running". Nothing is shown at 0. Look-back is capped at about 10 years.
- **Add a habit**: a name (placeholder "Mobility") and "How often" (dropdown). The form stays open for the next one. Default schedule: Every day.
- Archive keeps the past ticks ("Archive it? Its past ticks are kept."). It sets inactive and deleted.
- No reorder, no notes, no pinned note, no colour, no reminder.

**Where habits appear:**

- **Today, only in the Body/Habits tab.** That tab appears only when: habits is on, the "daily" rule is on, and at least one active habit is due that day.
  - Habits are **never put on the main Today list** and never become tasks.
  - When habits are the only Body part, the tab is called "Habits".
  - When no habit exists yet, the tab does not appear at all, so the first habit must be added from the **Habits page** on the bar.
  - On weekends, if all habits are "weekdays", the tab disappears.
- **Plan: never.** Week, Month and Year show tasks only.
- **The Android widget** shows habits for today and tomorrow, with ticks (if habits is on and the rule is on).
- **Stats:** Ticks, Kept % (done ÷ due), and a "Habits kept" chart.

**Ticks:** one log per day, flipped in place. Double taps are queued so no duplicate is made. Logs sync, and a clash between two phones is folded, with the newest edit winning.
[src/sections/Habits.tsx, src/lib/tracking.ts, src/lib/tracking-rules.ts, src/lib/day-tabs.ts, src/lib/widget.ts, src/lib/stats.ts]


## 5. Supplements

**Registry:**

- Summary: "A checklist by time slot."
- Entity supplement: name (required), dose_text (text), time_slot (choice: **morning, midday, evening**).
- View: Today (list).
- Rule slot_task = later (no tasks are made).
- Server default `slots: [morning, evening]` is unused.

**Section** (Body tab, and the Supplements page, always today):

- Grouped under **Morning, Midday, Evening**, plus "Any time" for rows without a valid slot. Empty groups are hidden.
- Within a group: sort order, then name.
- Each row: name (tap for an Archive confirmation), dose under it, and a tick for the day.
- **Add a supplement**: name (placeholder "Vitamin D"), dose (placeholder "25 µg", free text), and "Time of day" (default Morning). The form stays open and keeps the slot.
- **It cannot be renamed and its dose or slot cannot be changed after adding.** The only option is Archive ("Archive it? Past ticks are kept.").
- No custom slot names, no times, no reminders, no stock or count of pills.

**When shown:** the Body tab includes Supplements when supplements is on and at least one active supplement exists. This holds **every day**, with no schedule per supplement.

**Stats:** Taken % (ticks ÷ active supplements × days) and doses ticked.
[src/sections/Supplements.tsx, src/lib/tracking.ts, src/lib/tracking-rules.ts]


## 6. Health and body (weigh-ins, waist, targets)

**Registry:**

- Summary: "Weight and waist log, and the calorie budget they drive."
- Entity body_log: log_date, weight_kg (kg), waist_cm (cm).
- View: "Weight" table.
- Rule retarget = switch.
- Server default `weigh_in_day: 1` is unused (weigh-ins can be logged any day).

**Weigh-in section** (Body tab, and the Health page, which always shows today):

- Title "Weigh-in · Mon 1 Oct". Future days show "This day has not happened yet…".
- **Weight, kg**: required, 30–300. A decimal comma is accepted. Kept to 2 decimals.
- **Waist, cm**: optional, 40–250, kept to 1 decimal.
- Save, or Update when the day already has an entry. There is one entry per day; saving again updates it.
- After saving:
  - with the retarget rule on: "Weight saved and targets recalculated.";
  - with the rule off: "…Targets are left as they are: recalculating is switched off in Edit module.";
  - when height or date of birth is missing: "Weight saved. Targets were not recalculated."
- **Targets** box: kcal, protein, fat, carbs, fibre, then "Targets from 82.4 kg · plan cut · BMR 1780 × 1.55 = 2759 · since Mon 1 Oct".
  - If height or date of birth is missing, an inline form asks for them. Height 100–250 cm. Date of birth must be a real day, not in the future, and not more than 120 years ago.
- **Last 8 weigh-ins**: date, weight, waist, and the change against the previous one ("+0.4 kg", "−0.3 kg", "no change", "first entry"). Above them is a small 7-day moving-average line, counted in calendar days.

**Targets maths** (calc.ts):

- **BMR (Mifflin-St Jeor):** 10 × weight kg + 6.25 × height cm − 5 × age, then **+5 for male** or **−161 for female**.
- **Maintenance** = BMR × activity factor.
- **Goal adjustment:** cut −500 kcal, recomp 0, bulk +300. Target kcal = maintenance + adjustment, rounded.
- **Protein** = weight × **2.2 g/kg (cut)**, **1.9 (recomp)**, **1.7 (bulk)**, rounded.
- **Fat** = 27% of target kcal ÷ 9.
- **Carbs** = (target kcal − protein × 4 − fat × 9) ÷ 4, never below 0.
- **Fibre** = 14 g per 1000 kcal.
- Fallbacks inside `targetsFor`: age 30, sex male, height 175. The weigh-in path refuses to calculate without height and date of birth. Onboarding refuses without sex and weight.
- Age is taken on the weigh-in's day.
- A target row starts on the weigh-in day (`from_date`). Every screen uses the newest target that has started by the day shown.
- **Changing goal, activity or height in More does NOT recalculate the targets.** Only a new weigh-in does, or filling in a missing height or date of birth on the weigh-in form.

**Activity levels** (exact list; onboarding dropdown, shown as "value · label"):

| Factor | Label |
|-------------|-------------------------------------------------------------------------------------------------|
| 1.2 | desk job, little walking |
| 1.3 | desk job, a daily walk |
| 1.375 | light exercise 1 to 3 days a week |
| 1.45 | on your feet part of the day |
| 1.5 | desk job and hard training most days |
| 1.55 | moderate exercise 3 to 5 days a week |
| 1.65 | on your feet all day: shop, warehouse, care |
| 1.725 | hard exercise 6 or 7 days a week |
| 1.8 | physical job and regular training |
| 1.9 | heavy manual work, or training twice a day |

- Default when unknown: 1.375.
- calc.ts also has a named table that is not used in the UI: sedentary 1.2, lightly_active 1.375, moderately_active 1.55, active 1.725, very_active 1.9.
- **More → Profile → Activity factor** is a free number field, not this dropdown. Its hint is: "1.2 desk job, 1.5 hard training twice a day, 1.9 very active". That hint does not match the list above.

**Goal options:**

- Lose fat ("500 kcal under maintenance").
- Maintain and recomp ("at maintenance"), the default.
- Build muscle ("300 kcal over maintenance").

The More hint reads "Cut takes 500 kcal off, bulk adds 300, recomp holds the line."

**Onboarding step 4 "Body targets"** (optional switch):

- Fields: Sex (Female / Male), Date of birth, Height cm, Weight today kg, Activity, Body goal.
- The targets preview appears once sex and weight are given.
- Finishing writes a target row and a weigh-in for today.
- With the switch off, nothing about the body is saved.

**Stats:** Weight (latest, with the change), Waist, Weigh-ins count, and a weight chart.

**Syncs:** body_log and target. One row per profile per day, and one target per profile per from_date.
[src/sections/WeighIn.tsx, src/lib/body.ts, src/lib/body-rules.ts, src/lib/calc.ts, src/lib/activity.ts, src/screens/Onboarding.tsx, src/screens/More.tsx]


## 7. Training

**Registry:**

- Summary: "Sessions, exercises, a log and phases."
- Entity workout_log (its own table):
  - log_date (required)
  - exercise_id (link to exercise)
  - set_number (whole number)
  - reps_achieved (whole number)
  - load_kg (kg)
  - seconds (s)
  - note
- Views: **Sessions** (list), **Log** (table: day, exercise, set, reps, load), **Month** (calendar on log_date).
- Rule session_task = later.

**Page** (/m/training, generic):

- Add a set with the + button: a form with all the fields. Exercise is chosen from the **exercise catalogue: 259 shared exercises** (seed 005, from "Air Squat" to "Zombie Squat" and "Walk (Avg.10km/h)").
- The catalogue is read from the server at most once a day when online, and kept on the device for offline use. It is not part of the normal sync.
- **Exercises cannot be added** in the app. The Excel import reads D_Exercises but says "Exercises have nowhere to go in the app so far".
- The `workout`, `workout_line` and `phase` tables (planned workouts, weekday patterns, phases) exist in the database but have **no screen**. There are no programmes, no planned sessions, no rest timer and no previous-set hint.
- Each logged set is a separate record. A "session" is just all sets on a date.

**Today:**

- The Training tab shows only when there are tasks with module training or section "Training".
- Logged sets do not show on Today and do not appear on Plan.

**Stats:** Sessions (days with a set), Sets, Volume (reps × load kg), and a Sets chart.

**Syncs:** workout_log.
[src/modules/registry.ts, src/modules/records.ts (refreshExercises, TABLES.workout_log), supabase/migrations/003_domain.sql, 005_seed.sql]


## 8. Sleep

**Registry:**

- Summary: "A sleep log against a target." (depth light, off by default)
- Entity sleep_log (its own table):
  - log_date (required)
  - went_to_bed (time)
  - woke_at (time)
  - hours (formula `hours_between(went_to_bed, woke_at)`, stored too)
  - quality (whole number)
- Views: Nights (table) and Month (calendar).
- Rule bedtime = later.

**Today's Sleep tab:**

- Shown when sleep is on and (a log exists for the day, or the day is today).
- Form: To bed (time), Woke (time), Quality buttons 1–5 (tap again to clear), the hours shown live, and Save.
- Once logged: "23:00 to 07:00 · 8.0 h · quality 4 of 5" with a Change button.
- The night belongs to the day it ended. Hours wrap across midnight.
- One log per profile per day. Adding again on a taken day edits that day.

**Missing:** there is **no target**. The summary promises one; the server default `target_hours: 8, bedtime: 22:00` is unused, and nothing compares sleep with a target. There are no bedtime reminders.

**Stats:** Hours a night (mean), Quality (mean), Nights logged.
[src/sections/SleepDay.tsx, src/modules/records.ts, src/lib/day-tabs.ts]


## 9. Learning and reading

**Registry:**

- Summary: "Study blocks, a reading log and progress."
- Entity study (kept in module_record):
  - subject (text, required)
  - block_date (date)
  - minutes (duration, **Stats: sum**)
  - source ("Book or course", text)
- Views: Blocks (table) and Month (calendar).
- Rule soft = later.

**Page:** generic. Records can be added, edited and deleted. Fields can be added in Edit module, because it uses the shared store.

**Today:**

- A "Learning" tab appears on days with a study record dated that day, or a task belonging to learning (section "Learning").
- The tab lists the records read-only (title = subject) with "Open Learning".
- **Records do not become tasks.** There is no day-task rule for built-in modules.

**Plan:** records are not shown.

**Stats:** records counted per day, and minutes summed.
[src/modules/registry.ts, src/modules/records.ts, src/sections/ModuleDay.tsx]


## 10. Agenda

**Registry:**

- Summary: "Month, week and year calendar."
- Entity calendar_event (its own table):
  - title (required)
  - starts_at (date-time, required)
  - ends_at
  - all_day (yes/no)
  - location ("Where")
- Views: Month (calendar on starts_at) and List.
- Rule no_overlap = later.

**Page:**

- Generic. Add and edit events. Events from **followed calendars** (calendar links, More → Profile) also appear here as read-only items; tapping one opens a read-only sheet.
- No repeat options for events, and no reminders for events.

**Today and Plan:**

- **Your own Agenda events are not shown on Today or Plan.** Only events from followed calendars (subscriptions) are shown there:
  - Today: above the tasks.
  - Plan: in the week list, as month marks, and in the load.
- Agenda never gets a Today tab.

**Stats:** Events count, which counts your own events only.

**Syncs:** calendar_event and calendar_subscription.
[src/modules/registry.ts, src/modules/records.ts, src/lib/calendar-links.ts, src/screens/Today.tsx, src/screens/Plan.tsx]


## 11. Projects

**Registry:**

- Summary: "Projects, tasks and milestones."
- Entity project (module_record):
  - name (required)
  - status (choice: active, paused, done)
  - due_date (date)
- Views: Projects (table) and Cards (list).
- Rule to_goal = later.

**Page:** generic.

**Missing:**

- **Projects cannot hold tasks or milestones.** Tasks have no project link. The `milestone` table is unused.
- No board by status. One can be added as an extra view in Edit module, because a board needs a choice field and status is one.

**Today:** a "Projects" tab appears on a project's **due date** (its first date field). It lists the project names. No task is created.

**Plan:** not shown. The Year view "Goals" list is hard-coded empty.
[src/modules/registry.ts, src/screens/Plan.tsx]


## 12. Finance

**Registry:**

- Summary: "A budget and what was spent against it."
- Entity entry (module_record):
  - entry_date (date)
  - category (free text)
  - amount (number, **Stats: sum**)
  - note
- Views: Entries (table) and Month (calendar).
- No rules.

**Missing:**

- **No budget** exists, despite the summary. There is nothing to compare spending against, no income/expense type, no currency, and the category is free text.
- No recurring bills (only through tasks).

**Today:** a "Finance" tab on days with an entry.

**Stats:** entries counted per day, and the amount summed.
[src/modules/registry.ts]


## 13. Household

**Registry:**

- Summary: "Shared lists, chores and shared meals."
- Entity chore (module_record):
  - name (required)
  - schedule (choice: **daily, weekly, monthly**)
  - who (free text)
- View: Chores (table).
- Rule shared = later.

**Behaviour today:**

- **The schedule is only a label.** Nothing repeats, and no task or reminder is created.
- **Chores have no date field**, so they never get a record date. As a result they **never appear on Today** (no Household tab from chores), never on Plan, and Stats says "records have no date…" until a date field is added in Edit module.
- **No custom scheduling:** no chosen weekdays, every N days, next-due date, rotation between people, or "last done".
- "Who" is free text, not linked to household members or profiles.
- **Not shared with the household.** Records are per profile, despite the summary and the rule. "Shared lists" and "shared meals" do not exist as features.
- A **task** in section "Home" does map to household (colour, and a Household tab on its day).
[src/modules/registry.ts, src/modules/records.ts, src/lib/day-tabs.ts]


## 14. Stats

**Registry:**

- Summary: "Day, week, month and year figures from your other modules."
- No entities or rules. Off by default (migration 018).

**Page:**

- Period: Day, Week (Monday–Sunday), Month or Year, with previous and next.
- Compared with the period before.
- One card per module that is on. A setting `stats.show_disabled` includes modules that are switched off.

**Cards:**

| Card | Figures |
|-----------------------------|---------------------------------------------------------------------------------|
| Tasks | Done, Planned, Completed %, Minutes done. Day tasks only, dropped tasks excluded. |
| Habits | Ticks, Kept %. |
| Supplements | Taken %, Doses ticked. |
| Nutrition | Each tracked nutrient as an average per logged day, and Days logged. A day with nothing logged is treated as unknown, not zero. |
| Health | Weight, Waist, Weigh-ins. |
| Sleep | Hours a night, Quality, Nights logged. |
| Training | Sessions, Sets, Volume kg. |
| Agenda | Events (your own). |
| Record-store and built modules | Records per day, plus every field marked Add up, Average or Count. These need a date field. |

Shopping has no card: its trips are not kept.

Export: rows of period, module, metric, value, unit.
[src/lib/stats.ts, src/lib/stats-rules.ts, src/sections/Stats.tsx]


## 15. Custom and built modules ("Build a module")

**Where:** More → Modules → "Built by you" → **Build a module**. It is a 5-step sheet: Name → **What you track** → Keywords → Fields → Links and rules.

**Step 1, Name:**

- Name: required, up to 60 characters.
- Mark: one letter or symbol, optional. Emoji are refused.
- Summary: optional, up to 160 characters.

**Step 2, "What you track":**

- A row of preset cards. **Exactly one can be chosen.** Picking another *replaces* all fields and views, so presets cannot be combined.
- The presets:

| Preset | Record | Fields | Views |
|-------------------|------------|------------------------------------------------------------|-------------------|
| Blank | Item | Name (text, required), Day (date) | List, Table |
| Reading list | Book | Title, Author, Status (to read / reading / finished / stopped), Pages (whole number, sum), Finished (date), Rating (/5) | Books, Table |
| Workout log | Set | Day (required), Exercise (link), Sets, Reps, Load kg, Volume (formula sets × reps × load, sum) | Log, Month |
| Expenses | Expense | What (required), Day (required), Category (food / transport / home / bills / fun / health / other), Amount (required, sum), Note | Table, List, Month |
| Plant care | Care | Plant (required), Care (water / feed / repot / prune / mist), Next due (date), Last done (date), Note | Plants, Month |
| Car maintenance | Job | Job (required), Day, Mileage km, Cost (sum), Garage, Next due | Jobs, Table |
| Study sessions | Session | Subject (required), Day, Start (time), Length (min, sum), Topic, Focus /5 (average) | Sessions, Month |
| Mood journal | Entry | Day (required), Mood /5 (average), Energy /5 (average), Note | Entries, Month |

**Step 3, Keywords:** comma-separated. They are used by the onboarding suggestion.

**Step 4, Fields:**

- "One record is a …" (the record's name).
- Each field can be changed or removed. "Add a field" adds one, up to 40.
- A **Choice** field holds a single value; there is no multi-select field type.

**Step 5, Links and rules:**

- "+ food / recipe / exercise / task / goal" adds link fields.
- **Views** (toggle buttons): list, table, calendar, board, grid, chart, form. At least one must stay on. Board needs a choice field. Grid and chart need a date. Board, grid and chart have their own settings.
- The two rules (task per dated record; reminder at the record's time or a set time, default 09:00).
- "Count in Stats" for numeric fields.

**After Create:** the app opens the new module's page. A built module has **one entity** (the builder makes "item"), even though the definition allows up to 4. It is synced as a `module` row; its records go in module_record.

**Today:** a tab with the module's name on days with dated records or tasks. With the day-task rule on, records become tasks on the rail.
[src/modules/ModuleBuilder.tsx, src/modules/presets.ts, src/modules/FieldForm.tsx, src/modules/def-rules.ts, src/modules/defs.ts]


## 16. Data import and other food sources

- **Excel import** (More → Data → Import, .xlsx):
  - Reads sheets D_Food (name in column B, kcal, carbs, fibre, fat, protein), D_Exercises (read but not saved) and D_Meals (name, macros, and an ingredients text that is matched to foods).
  - Shows a preview before saving: new foods and recipes, existing ones, matched and unmatched lines, impossible amounts.
  - Saved foods get source 'import' and belong to you.
- **Export and import of a backup:** a `.getit.json` bundle of the profile.
- Recipes have a `shared_with_partner` column that is not used.
[src/lib/excel.ts, src/lib/import.ts, src/lib/bundle.ts, src/screens/More.tsx]


## 17. Gaps and caveats collected from the code (cross-module)

1. **Habits are never on the main Today list or on Plan.** They live only in a conditional Body/Habits tab, which is hidden when no habit is due or none exists yet, and when the "daily" rule is off. They are added only from the Habits page.
2. **Habit schedules are only daily, weekdays or weekly.** No chosen days, weekends, every N days, dates or times. The schedule cannot be edited after creation. Habits have no notes or pinned notes.
3. **Household chores have no date and no real schedule.** The daily/weekly/monthly label does nothing, chores never reach Today or Plan, and nothing is shared with the household.
4. **Meals are four fixed slots** (Breakfast, Lunch, Snack, Dinner) with Dinner as the main meal. No custom slots, extra snacks, renaming or reordering.
5. **The shopping list is built only from recipe meals in a fixed 4-day window.** No manual items. Quick-number and "From a food" meals are ignored. Store sections are used only for ordering and never shown. Products' shops are never shown. The Stores tab is a placeholder. Ticks stay on the device.
6. **No way to create or edit a food by hand.** Name, macros, pack size and store section cannot be changed. Only units of your own foods can.
7. **Units:** only the exact catalogue names listed in 1.5 have units. "Onion Shallot/Spring/Sweet/Welsh" and most vegetables, meats, grains and similar are grams only. Quick "Just numbers" is grams only. Unit buttons show the singular name.
8. **Search is inconsistent.** SearchPick ranks by every word, starts-with and shortest name (8 results). The Foods table uses plain substring matching, unsorted, capped at 200. Recipes have no search. The Foods table is not sorted by name.
9. **No EU-label nutrients:** no salt, sugars or saturated fat.
10. **Scanning exists only on Foods and Stock.** It is not in meals or recipes.
11. **Targets are recalculated only by a weigh-in.** Changing goal, activity or height in More leaves them stale. The More activity field is free text with a hint that does not match the 10-level list.
12. **Own Agenda events are not on Today or Plan.** Only followed calendars are.
13. **Sleep has no target. Finance has no budget. Projects have no tasks or milestones. Training has no planned sessions or programmes and cannot add exercises.** Supplements cannot be edited after adding.
14. **Plan's "Goals and phases" is always empty** (hard-coded).
15. **Modules may appear "on" that were not chosen.** The sign-up trigger switches nine modules on server-side, and onboarding's switch-off depends on its rows reaching the server.
16. **A custom module's "What you track" is a single-choice preset**, and a Choice field is single-value.
17. **Household sharing:** no in-app invite (migration 025, reading housemates' cupboard foods, is applied).
18. **Recipe lines cannot be marked cooked or raw in the editor** (state is saved as null), so only imported or seeded lines use cook yields.
19. **Several server module defaults are never read:** meal_slots, trip_days, supplement slots, weigh_in_day, sleep target_hours and bedtime.
20. **Registry rules marked "later" are not acted on:** skipped meals, trip days, session tasks, supplement slot tasks, learning soft-move, agenda no-overlap, sleep bedtime, projects to goals, household sharing.




# Part G. Known gaps and defects (version 15), mapped to requirements

Collected from Parts E and F. Each line names the requirement that closes it.

## G1. Gaps a person meets

| # | Gap | Closed by |
|-----|--------------------------------------------------------------------------|-------------------------------|
| 1 | Habits never reach Today's main list or Plan; they live only in a tab that hides itself when no habit is due or none exists. | HAB-20, HAB-21, GEN-04 |
| 2 | Habit schedules are only daily, weekdays or weekly, cannot be edited, and habits have no notes. | HAB-01, HAB-02, HAB-10 |
| 3 | Household chores have no date and no real schedule; they never reach Today or Plan and are not shared. | HSE-01, HSE-03, HSE-05 |
| 4 | Meals are four fixed slots with Dinner as the main meal; one recipe or one set of numbers per slot. | MEAL-01, MEAL-02, MEAL-13 |
| 5 | The shopping list takes only recipe meals in a fixed four-day window; no manual items; aisles not shown; shops not shown; Stores tab is a placeholder; ticks stay on one device and reset each day. | SHOP-01, SHOP-02, SHOP-03, SHOP-10, SHOP-30 to SHOP-32 |
| 6 | Foods cannot be created or edited by hand. | FOOD-01 |
| 7 | Units only on exact catalogue names; several weights are US weights; "Just numbers" is grams only; unit wording shows "egg/eggs" on other foods. | UNIT-10, UNIT-15, UNIT-02, UNIT-20 |
| 8 | Two different searches; Recipes has none; Foods table unsorted. | GEN-10 to GEN-13, REC-01, FOOD-14 |
| 9 | No EU label fields (salt, sugars, saturates); carbohydrate includes fibre. | FOOD-02, FOOD-03 |
| 10 | Scanning only on Foods and Stock. | PROD-02, MEAL-14 |
| 11 | Targets recalculated only by a weigh-in; More's activity factor is free text with a mismatched hint; 1.2 shown as an office worker. | BODY-04, BODY-10 to BODY-15 |
| 12 | Own Agenda events are not on Today or Plan. | AGN-02 |
| 13 | Sleep has no target; Finance has no budget; Projects have no tasks or milestones; Training has no routines or planned sessions and cannot add exercises; Supplements cannot be edited. | SLP-02, FIN-03, PRJ-02, PRJ-03, TRN-02, TRN-03, TRN-05, SUP-01 |
| 14 | Plan's "Goals and phases" is always empty. | PLN-12, PRJ-06 |
| 15 | Modules may appear "on" that were not chosen (server switches nine on at sign-up). | GEN-02 |
| 16 | "What you track" is single-choice; Choice fields hold one value. | MOD-10, MOD-11 |
| 17 | No in-app household invite. | HSE-12, STK-05 |
| 18 | Recipe lines cannot be marked raw or cooked, reordered or annotated; shared recipes cannot be viewed. | REC-04, REC-02 |
| 19 | Plan cannot open or add tasks; no Day view; no Inbox; a task whose day is cleared disappears. | PLN-02, PLN-04, PLN-07 |
| 20 | No copy of tasks, meals, days or weeks; no templates. | TSK-20 to TSK-26, NOT-10 to NOT-17, PLN-06, PLN-08 |
| 21 | Ticking a meal task does not mark the meal eaten. | GEN-31 |
| 22 | No undo anywhere. | GEN-54 |

## G2. Defects and inconsistencies (to fix whatever else changes)

| # | Defect | Closed by |
|-----|------------------------------------------------------------------------------|---------------------------|
| 1 | Sign-out does not send waiting changes first; offline edits can be lost. | SET-04 |
| 2 | No periodic pull: on web and Windows, another device's changes appear only after a reload or reconnect. | SYNC-02 |
| 3 | The conflicts list says "kept" for refused changes and can print "[object Object]". | SET-07 |
| 4 | Push past midnight wraps the clock but keeps the date; pushing an untimed task starts from 09:00; pushing a done task un-ticks it. | TOD-15 |
| 5 | Time zone fixed to Europe/Amsterdam; day start and end unused. | GEN-69, GEN-70 |
| 6 | Emptying Height in More saves 0. | HLT-06 |
| 7 | Onboarding quietly assumes 175 cm and age 30 when height or date of birth are blank. | BODY-05 |
| 8 | Backup restore drops settings, country and city. | SET-06 |
| 9 | Nine built-in rules are shown but not carried out. | MOD-06 |
| 10 | Module keywords are stored but never used to suggest a module. | MOD-07 |
| 11 | Several server defaults are never read: meal_slots, trip_days, supplement slots, weigh_in_day, sleep target_hours and bedtime. | MEAL-03, SHOP-21, SUP-02, HLT-05, SLP-02 |
| 12 | The "fixed" flag on tasks cannot be set; status "stuck" is never set; horizon is always "day". | TSK-06 |
| 13 | Profile switching inside an account is not remembered; no way to add a profile. | SET-02 |
| 14 | The task sheet does not close on Escape. | TSK-09 |
| 15 | The extension limit has no screen. | SET-08 |
| 16 | The privacy policy promises changes are "announced in the app first", with no mechanism. | SEC-03 |
| 17 | A stale code comment in Today says nutrition is on unless switched off; the code does the opposite (harmless, but misleading). | GEN-01 |
| 18 | Catalogue data errors: Grapeseed Oil 0 g fat; Chicken Fat and Quinoa with no fat; a duplicate bread; inappropriate items. | FOOD-11, FOOD-12 |

# Part H. Reference data

## H1. EU food labelling: Regulation (EU) No 1169/2011

**What must be declared (Article 30)**, per 100 g or 100 ml (Article 32):

1. Energy, in kJ and kcal
2. Fat, of which saturates
3. Carbohydrate, of which sugars
4. Protein
5. Salt

Voluntary: mono-unsaturates, polyunsaturates, polyols, starch, **fibre**, and vitamins and minerals present in significant amounts (15% of the reference value per 100 g, or 7.5% per 100 ml for drinks). Per-portion values may be given **in addition**, when the portion and the number of portions are stated.

**Order on the label (Annex XV):** energy; fat, saturates, mono-unsaturates, polyunsaturates; carbohydrate, sugars, polyols, starch; fibre; protein; salt; vitamins and minerals.

**Definitions (Annex I):** salt = sodium × 2.5. Carbohydrate is everything metabolised by humans, including polyols; fibre is declared separately and is **not** part of carbohydrate.

**Energy conversion factors (Annex XIV):**

| Component | kJ per g | kcal per g |
|--------------------------------------------------------------------|--------------------|----------------------|
| Carbohydrate (except polyols) | 17 | 4 |
| Polyols | 10 | 2.4 |
| Protein | 17 | 4 |
| Fat | 37 | 9 |
| Salatrims | 25 | 6 |
| Alcohol (ethanol) | 29 | 7 |
| Organic acid | 13 | 3 |
| Fibre | 8 | 2 |
| Erythritol | 0 | 0 |

**Reference intakes of an average adult (Annex XIII Part B):**

| Energy | Fat | Saturates | Carbohydrate | Sugars | Protein | Salt |
|-----------------------------|---------|----------------|---------------------|------------|--------------|---------|
| 8,400 kJ / 2,000 kcal | 70 g | 20 g | 260 g | 90 g | 50 g | 6 g |

**Vitamin and mineral reference values (Annex XIII Part A, selection):** vitamin A 800 µg, D 5 µg, E 12 mg, K 75 µg, C 80 mg, thiamin 1.1 mg, riboflavin 1.4 mg, niacin 16 mg, B6 1.4 mg, folic acid 200 µg, B12 2.5 µg, biotin 50 µg, pantothenic acid 6 mg, potassium 2,000 mg, chloride 800 mg, calcium 800 mg, phosphorus 700 mg, magnesium 375 mg, iron 14 mg, zinc 10 mg, copper 1 mg, manganese 2 mg, fluoride 3.5 mg, selenium 55 µg, chromium 40 µg, molybdenum 50 µg, iodine 150 µg. (Taken from the regulation as adopted; whether later amendments changed the vitamin D value was not checked.)

**What GetIt stores (FOOD-02):** every food per 100 g or per 100 ml with exactly these fields; kcal and kJ both kept or derived; salt stored, sodium derived; unknown values left empty.

Sources: Regulation (EU) No 1169/2011, Articles 30, 32 and 33, Annexes I, XIII, XIV and XV (legislation.gov.uk "as adopted" and the EUR-Lex consolidated text of 1 January 2018).

## H2. Food data sources and their terms

| Source | Country | Size | Terms that matter | Use in GetIt |
|--------------------------|-----------|-------------------|------------------------------------|------------------|
| **NEVO-online 2025/9.0** (RIVM) | NL | 2,328 foods | Free; may be built into commercial software; **values used unchanged**; own additions clearly marked; attribution "Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven"; **no charge to users for the NEVO data itself** | Base of the shared catalogue |
| **Portie-online 2026/2.0** (RIVM and Wageningen University) | NL | Measures and weights per NEVO code | Use only unchanged, with source and version: "Portie-online versie 2026/2.0, RIVM, Bilthoven" | Unit weights (small, medium, large; edible and as bought) |
| **CIQUAL 2025** (ANSES) | FR | 3,484 foods, 74 components | Earlier versions under Licence Ouverte (attribution); the 2025 licence page could not be opened | Second EU source |
| **USDA FoodData Central** | US | Foundation, SR Legacy, branded | Public domain (CC0), attribution requested; API 1,000 requests an hour | Fallback, household measures |
| **Livsmedelsverket** (Swedish Food Agency) | SE | about 2,500 foods | CC BY 4.0, REST API | Open EU fallback |
| **Open Food Facts** | EU strong | about 4 million products | ODbL (database), DbCL (contents), CC BY-SA (images); attribution; share-alike for derived databases; v3 API; 15 product reads and 10 searches a minute per user | Branded products by barcode |
| EuroFIR FoodEXplorer | EU | Aggregator | Members or pay-per-view; republishing needs written approval | Not usable |

**Layering:** NEVO for generic foods, Portie-online for unit weights, Open Food Facts for barcodes, USDA (CC0) for anything missing, the person's own foods marked as theirs.

## H3. Units for food sold or used per piece

### H3.1 Reference weights (RIVM Portie-online 2026/2.0, read 1 October 2026)

"Edible" is the part eaten (use for nutrition, since NEVO values are per 100 g edible). "As bought" includes peel, core or waste (use for shopping and stock).

| Food | Small | **Medium** | Large | Edible share | Other units |
|---------------------|---------------|-------------|------------|----------------|---------------------------------|
| Onion (ui) | 57 g (60 as bought) | **95 g (100)** | 142 g (150) | 0.95 | Stuffing onion 238 g (260); 1 tbsp chopped 20 g; red onion as bought 60 / 100 / 150 g |
| Garlic clove | 2 g | **3 g** | 6 g | 0.85 | Bulb 50 g as bought; solo garlic 25 g |
| Egg, chicken (edible) | S 40 g | **M 50 g** | L 60 g | — | Bantam 35 g; double yolk 65 g; quail 25 g |
| Banana | 100 g (143) | **130 g (186)** | 165 g (236) | 0.70 | |
| Apple, with skin | 76 g (85) | **135 g (150)** | 162 g (180) | 0.9 (core removed) | |
| Tomato | 66 g (70) | **89 g (94)** | 138 g (145) | 0.95 | Cherry tomato 10 g; beef tomato 142 g (150); slice 15 g |
| Potato, raw | 50 g peeled (63) | **70 g (88)** | 100 g (125) | 0.8 | Baby potato 25 g |
| Carrot, winter carrot | 144 g (160) | **243 g (270)** | 338 g (375) | 0.9 | Bunch carrot 20 g each; bunch 455 g |
| Bell pepper | — | **136 g (170)** | — | 0.8 | Strip 3 g |
| Cucumber | 304 g (320) | **399 g (420)** | 522 g (550) | 0.95 | 10 g per cm; snack cucumber 36 g; a fifth 84 g |
| Avocado (without skin and stone) | 80 g | **180 g** | 300 g | 0.72 | |
| Lemon | — | **67 g (128)** | — | 0.52 | Slice 6 g (12 with peel) |
| Lime | 24 g (35) | — | 62 g (88) | 0.70 | Juice of 1 lime 10 g |
| Courgette (as bought) | 250 g | **400 g** | 550 g | 0.9 | 1 tbsp 30 g |
| Leek | 80 g (100) | **128 g (160)** | 220 g (275) | 0.8 | |
| Orange | 70 g (100) | **130 g (186)** | 170 g (243) | 0.70 | Segment 10 g |
| Mandarin | 30 g (40) | **60 g (80)** | 80 g (107) | 0.75 | |
| Pear, with skin | — | **214 g (225)** | — | 0.95 | |
| Kiwi | — | **75 g (90)** | — | 0.83 | |
| Mushroom | 9 g | **14 g** | 22 g | 0.9 | Punnet 230 g (250) |
| Broccoli, head | 198 g (360) | **236 g (430)** | 275 g (500) | 0.55 | |
| Aubergine (as bought) | 250 g | **400 g** | 600 g | 0.8 | |

**EU egg sizes** (shell on, Regulation (EC) No 589/2008, Article 4): XL 73 g and over; L 63–73 g; M 53–63 g; S under 53 g. Portie-online's 40 / 50 / 60 g are the edible content. (589/2008 has since been replaced by Delegated Regulation (EU) 2023/2465; the weight grades are believed unchanged, not checked.)

Cross-checks: USDA medium weights are larger for potatoes (213 g) and apples (182 g) and smaller for carrots (61 g) and courgettes (196 g); Belgium's NUBEL table gives onion 115 g, tomato 150 g, carrot 100 g. **For a Dutch user, Portie-online is the reference.**

### H3.2 Current catalogue units against the reference (to correct, UNIT-15)

| Catalogue food | v15 unit and weight | Proposed (edible, medium unless named) |
|-------------------------------------|------------------|-------------------------------------------------------|
| Onion | onion 110 g | onion S 57 / **M 95** / L 142 g; tbsp chopped 20 g |
| Garlic | clove 5 g | clove S 2 / **M 3** / L 6 g; bulb 50 g |
| Egg Chicken | egg 50 g | egg S 40 / **M 50** / L 60 g |
| Banana | banana 120 g | S 100 / **M 130** / L 165 g |
| Apple, Apple Granny Smith | apple 180 g | S 76 / **M 135** / L 162 g |
| Pear | pear 170 g | **pear 214 g** |
| Orange, Orange Navel | orange 130 g | S 70 / **M 130** / L 170 g; segment 10 g |
| Clementine, Orange Tangerine | 75 g | S 30 / **M 60** / L 80 g (mandarin values) |
| Kiwifruit | kiwi 70 g | **kiwi 75 g** |
| Avocado | avocado 150 g | S 80 / **M 180** / L 300 g |
| Tomato Red | tomato 120 g | S 66 / **M 89** / L 138 g; slice 15 g; cherry tomato 10 g (own food) |
| Carrot | carrot 60 g | S 144 / **M 243** / L 338 g (winter carrot); bunch carrot 20 g. Note: a carrot from a Dutch bag is usually nearer "small". |
| Potato | potato 170 g | S 50 / **M 70** / L 100 g; baby potato 25 g |
| Bell Peppers, Capsicum Red/Green/Yellow | pepper 150 g | **pepper 136 g**; strip 3 g |
| Peach, Nectarine, Plum, Apricot, Dates, Olives | as v15 | keep until checked against Portie-online |
| Breads, milks, cheeses, butters, oils, sugar, seeds, whey | as v15 | keep (portion conventions, not piece weights) |

### H3.3 Catalogue foods bought or used per piece that have no unit yet (UNIT-10)

Weights for these are taken from Portie-online when the catalogue is rebuilt on NEVO; where Portie-online has none, from USDA portions, marked as such.

| Group | Foods in the current catalogue | Units to give them |
|-----------------|-----------------------------------------------------|----------------------------------------|
| Onions | Onion Shallot, Onion Spring, Onion Sweet, Onion Welsh | shallot; spring onion (stalk), bunch; sweet onion S/M/L |
| Long vegetables | Leeks, Cucumber (with and without peel), Squash Winter Zucchini (courgette), Squash Winter Zucchini Baby, Eggplant (aubergine), Celery, Asparagus | leek S/M/L; cucumber S/M/L and per cm; courgette S/M/L; aubergine S/M/L; celery stalk; asparagus spear, bunch |
| Heads | Broccoli, Cauliflower, Cabbage (white, red, savoy, napa), Lettuce (iceberg, butterhead, romaine, leaf), Endive, Kohlrabi, Fennel (to add) | head S/M/L; floret (broccoli, cauliflower); leaf (lettuce, cabbage) |
| Roots and tubers | Carrot Baby, Sweet Potato, Beets, Parsnip, Turnip, Radish, Ginger, Taro | piece S/M/L; radish (each), bunch; ginger thumb (piece) |
| Mushrooms | Mushroom White, Cremini, Portobello, Shiitake, Oyster | mushroom S/M/L; portobello (each); punnet |
| Fruit | Lime, Mango, Pineapple, Melon (cantaloupe, honeydew), Watermelon (to add), Grapefruit, Pomegranate, Fig, Persimmon, Papaya, Passion fruit, Guava, Pear Asian and other pear varieties, other apple varieties | each, with S/M/L where sold so; slice or wedge for melon and pineapple; segment for citrus |
| Small fruit | Strawberry, Cherry (sweet, sour), Grapes, Raspberry, Blueberry | piece; handful; punnet |
| Herbs | Parsley, Basil, Coriander, Dill, Chives, Lemon Grass | bunch; sprig; tbsp chopped; stalk (lemon grass) |
| Corn and pods | Corn Yellow, Corn White, Artichoke | cob; artichoke (each) |
| Coconut | Coconut Meat | coconut (each, as bought) |

## H4. Review of the shared food catalogue (version 15)

Run on 1 October 2026 over the 807 shared foods seeded in migration 005 (the source file `seed/catalogue.json`).

### H4.1 Where the data comes from

The names, cuts and values match the USDA SR Legacy generic list (for example "Chicken Broiler/Fryer Breast Meat", "Beef Chuck Shoulder Clod, Top Blade, Steak", "Squash Winter Zucchini", "Fish Roughy Orange"). It is a US list:

- **Over-split for an EU shopper**: 85 fish, 57 pork, 47 beef, 45 chicken, 21 lamb, 20 veal, 19 turkey and 35 cheese entries, by US retail cuts that a Dutch supermarket does not sell under those names.
- **Irrelevant or inappropriate entries**: 19 game, 11 ostrich, 7 emu, 12 molluscs, 4 pheasant, 3 squab, 3 "Poultry MDM" (mechanically separated meat), turtle, frog legs, and "Milk Human".
- **Missing staples** (none found by name): flour, dry pasta, noodles, couscous, bulgur, buckwheat, barley, muesli, granola, tortilla wraps, bagels, croissants, baguette, quark, skyr, coffee, chocolate, cocoa powder, jam, honey, syrup, mayonnaise, ketchup, soy sauce, pesto, fennel, chilli, tempeh, seitan, black and white beans, tinned tomatoes, and Dutch staples (hagelslag, pindakaas under that name, ontbijtkoek, kwark, vla, rookworst, boerenkool, zuurkool, andijvie, witlof, beschuit, roggebrood, krentenbollen, appelstroop, speculaas, stroopwafels, haring as sold).

### H4.2 How the values hold up

**Energy check.** Each food's stated kcal was compared with the energy worked out from its macros in three ways:

| Method | Median difference | Foods more than 15% off |
|------------------------------------------------------------------|----------------------|-----------------------|
| US: 4 × carbohydrate (fibre included) + 4 × protein + 9 × fat | 4.3% | 87 |
| **EU: 4 × (carbohydrate − fibre) + 2 × fibre + 4 × protein + 9 × fat** | **3.8%** | **18** |
| EU, if carbohydrate already excluded fibre | 4.6% | 177 |

Conclusion: **the catalogue's carbohydrate includes fibre** (the US "by difference" figure). To meet the EU definition, carbohydrate must be stored as carbohydrate − fibre (FOOD-03). Until then, carbohydrate totals in the app are too high by the fibre amount (for example oats by about 10 g per 100 g).

**The 18 foods more than 15% off under the EU method**, to be checked by hand or replaced by NEVO values:

| Food | Stated kcal | From macros | Likely cause |
|------------------------------------------------|-------------|-------------|-------------------------------------|
| Grapeseed Oil | 884 | 0 | fat stored as 0 (should be about 100 g) |
| Chicken Fat | 900 | 0 | fat missing |
| Quinoa | 374 | 316 | fat missing |
| Lentils | 353 | 292 | values from different sources mixed |
| Soybean Lecithin Oil | 763 | 900 | not a pure fat; check |
| Lemon Juice, Lime Juice, Lime | 22–30 | 31–41 | organic acids not counted (EU factor 3 kcal/g) |
| Amaranth Leaves, Bitter Gourd Leafy Tips, Cowpea Leafy Tips, Moringa Leaves | 23–64 | 29–79 | low-energy leaves; small absolute differences |
| Mushroom White, Mushroom Cremini/Italian | 22 | 26–27 | small absolute differences |
| Seaweed Laver, Spirulina, Wakame | 26–45 | 36–53 | small absolute differences |
| Squash Winter Zucchini Baby | 21 | 25 | small absolute difference |

**Fibre.** 522 of 807 foods have fibre 0. Most are right (meat, fish, dairy, oils), but about 54 plant foods also show 0 where fibre is to be expected (for example Pineapple, Currant Black, Jujube, Physalis, Yardlong Beans, Spinach Vine, chestnuts, lotus seed, safflower seed). In the source data 0 here usually means "not measured"; it should be empty (unknown), not 0.

**Missing EU fields.** No food has saturates, sugars or salt.

**Duplicates.** "Whole Wheat Bread" and "Whole-wheat bread" are the same food entered twice, with different values (259 and 247 kcal per 100 g).

### H4.3 What to do (FOOD-08 to FOOD-12)

1. Load NEVO 2025 (2,328 foods) as the new base, with all EU fields, and Portie-online units; keep NEVO values unchanged and attributed.
2. Map each of the 807 current foods to a NEVO food (by name and values); re-point recipes, logs, stock and books to the mapped food; keep the old row hidden so nothing breaks.
3. Keep from the old list only what NEVO lacks and someone may use; fix or drop the 18 outliers; turn the 54 doubtful "fibre 0" into empty.
4. Add the missing staples (H4.1) from NEVO; where NEVO has no entry, from USDA or Livsmedelsverket, marked with the source.
5. Remove or hide the irrelevant entries; merge the duplicates.
6. Give every per-piece food its units (H3).
7. Add a check that runs with the app's other checks: energy within 15% of the macros (EU factors), required fields present, units within limits, no fibre 0 on plant foods without a source note.

## H5. Activity levels for the calorie budget

### H5.1 What the official sources say

PAL (physical activity level) = total energy used in 24 hours ÷ resting energy (BMR). An app's "activity factor" is the same thing.

| Source | Categories |
|-----------------------------|---------------------------------------------------------------------------------|
| FAO/WHO/UNU 2001 (published 2004) | Sedentary or light **1.40–1.69**; active or moderately active **1.70–1.99**; vigorous **2.00–2.40**. Above 2.40 is hard to keep up for long. |
| EFSA 2013 (energy reference values) | Plans with PAL **1.4, 1.6, 1.8 and 2.0** for low active, moderately active, active and very active adults. |
| US Institute of Medicine 2002/2005 | Sedentary 1.0–1.4; low active 1.4–1.6; active 1.6–1.9; very active 1.9–2.5. About two thirds of healthy-weight adults measured had PAL above 1.6. |
| US National Academies 2023 | Inactive 1.0–1.53; low active 1.53–1.69; active 1.69–1.85; very active 1.85–2.5. Notes that no tool classifies an individual's PAL reliably and steps are only weakly linked to PAL. |

**FAO's worked examples:** an office worker who sits 8 hours at work, walks 1 hour and does an hour of housework comes to **1.53**. A person with a standing job carrying light loads who also does an hour of aerobic exercise comes to **1.76**. FAO describes "people with sedentary jobs who exercise about 1 hour a day" as active (1.70–1.99).

### H5.2 Why "1.2 = office worker" is wrong

1. 1.2 is below every official floor: FAO's lowest band starts at 1.40 and FAO uses 1.40 even for emergency food planning; EFSA's lowest is 1.4.
2. At 1.2, everything above resting is 20% of BMR. Digesting food alone takes about 10% of intake (commonly cited figure, not checked against a primary source), which leaves about 10% for all standing, walking, chores and the commute: bed rest, not a working life.
3. For a BMR of 1,700 kcal, 1.2 gives 2,040 kcal and 1.45–1.55 gives 2,465–2,635 kcal: **400 to 600 kcal a day too low**, so a planned 500 kcal cut becomes a 900–1,100 kcal cut.
4. 1.2 is only defensible when exercise and daily steps are added separately (MyFitnessPal's approach), and even then it ignores ordinary movement.

### H5.3 GetIt's lifestyle presets (BODY-12)

Built from the FAO factorial method and activity values, the EFSA and FAO bands and the Tudor-Locke step zones. Step ranges are a guide, not an equivalence.

| Preset | Example day | Steps a day | Factor |
|--------------------------|----------------------------------------------------|----------------------|----------|
| **Mostly resting** | Housebound, recovering or ill; almost no walking | under 3,000 | **1.3** |
| **Desk job, no exercise** | 8 h sitting at work, about 30 min walking, car or public transport, evenings mostly sitting | 3,000–5,000 | **1.4** |
| **Desk job, active commute** | Walks or cycles to work, or a daily hour's walk; some housework | 5,000–7,500 | **1.5** |
| **Desk job + 2–3 workouts a week** | As above plus about 3 hours a week of gym or sport | 6,000–9,000 | **1.6** |
| **Standing job** | Shop, nurse, teacher, hairdresser, lab: 8 h on your feet, no gym | 8,000–12,000 | **1.65** |
| **Desk job + daily training** | About an hour of training most days (5–6 hard sessions a week) | 8,000–12,000 | **1.75** |
| **Standing job + 3+ workouts a week** | As "standing job" plus training | 10,000–14,000 | **1.8** |
| **Physical job** | Warehouse order picking, construction, courier on foot or bike, farm work: hours of carrying and walking | 12,500–20,000+ | **1.9** |
| **Very heavy work or endurance athlete** | 2+ hours of hard training a day, or heavy manual work all day | 15,000–25,000+ | **2.2** |

Step zones (Tudor-Locke 2008, adults): under 5,000 sedentary; 5,000–7,499 low active; 7,500–9,999 somewhat active; 10,000–12,499 active; 12,500 and over highly active. Thirty minutes of brisk walking adds about 3,000–4,000 steps.

### H5.4 How the picker works (BODY-10 to BODY-16)

1. Two questions: **"What is your work like?"** (mostly resting / mostly sitting / mostly standing / physical / very heavy) and **"How much do you train?"** (none / 1–2 times a week / 3–4 times / 5 or more / 2+ hours a day). The answer pair maps to a preset; the person can then pick any preset directly or type a factor.
2. Each option shows its factor, the example day and the step range.
3. Default: 1.4 (desk job, no exercise) or 1.5 when the person says they walk or cycle daily. Never 1.2.
4. One explicit choice about exercise: **included in the factor** (default) or **logged separately and added** (then the factor is the work-only preset). Never both.
5. After 2–3 weeks of logs and weigh-ins, offer the adaptive estimate (BODY-17).

Sources: FAO/WHO/UNU, *Human energy requirements*, chapter 5; EFSA NDA Panel 2013, DRVs for energy; Brooks et al., the IOM physical activity recommendation (AJCN); National Academies 2023, DRIs for Energy, chapter 7; Tudor-Locke et al. 2008 and 2013; Cronometer staff on activity multipliers; MacroFactor help on expenditure.

## H6. Targets arithmetic (as built, BODY-02)

| Step | Formula |
|-----------------------------------|---------------------------------------------------------------------------|
| Resting energy (Mifflin-St Jeor) | 10 × weight kg + 6.25 × height cm − 5 × age, then +5 (male) or −161 (female) |
| Maintenance | BMR × activity factor |
| Goal | cut −500 kcal, recomp 0, bulk +300 |
| Protein | weight × 2.2 g (cut), 1.9 g (recomp), 1.7 g (bulk) |
| Fat | 27% of target kcal ÷ 9 |
| Carbohydrate | (target kcal − protein × 4 − fat × 9) ÷ 4, never below 0 |
| Fibre | 14 g per 1,000 kcal |

# Part I. Glossary

| Word | Meaning |
|----------------------------|----------------------------------------------------------------------------------|
| Module | A part of the app that can be switched on or off (Nutrition, Habits, a module you built…). |
| Built module | A module a person made with "Build a module"; its key starts with `u_`. |
| Record | One entry in a module (a study block, an expense, a chore). |
| Series | A repeating task's rule; the app lays out real tasks 8 weeks ahead and shows later ones as "planned repeats". |
| Exception | A change to one day of a series (skipped, moved, changed). |
| Section | The label on a task (Work, Meal, Training…) that also gives it a colour. |
| Today | The page for doing today's things. |
| Plan | The page for arranging days, weeks, months and the year. |
| Inbox | Undated tasks waiting for a day (to be built, PLN-07). |
| Note template | A reusable note body (to be built, NOT-10). |
| Stats template | A saved stats view (to be built, STA-13). |
| Pinned card | A small summary placed on Today (to be built, TOD-20). |
| Overlay | Changes a person makes to a built-in module, kept on top of the app's version. |
| Followed calendar | A calendar (for example Google) whose iCal address GetIt reads; read-only. |
| Calendar feed | GetIt's private link that Google Calendar reads. |
| Stock | What is in the cupboard, shared by the household. |
| Edible weight / as bought | The weight of the part eaten / the weight including peel, core or waste. |
| PAL, activity factor | Total daily energy ÷ resting energy. |
| BMR | Basal (resting) metabolic rate. |
| NEVO | The Dutch food composition database (RIVM). |
| Portie-online | RIVM's database of portion sizes and unit weights. |
| Open Food Facts | The open database of branded products used for barcodes. |
| RI, NRV | Reference intake (energy and macros) and nutrient reference value (vitamins, minerals) on EU labels. |


