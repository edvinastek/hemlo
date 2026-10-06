---
title: "Hemlo — Competitors and Usability"
subtitle: "Each module against the best and easiest app for that job, the whole app against its closest match, and how to make Hemlo calm without losing a function"
author: "Prepared for Edvinas Straigis"
date: "1 October 2026"
---

# Part 1. Summary

## 1.1 The best and easiest app for each module

One different app per module, chosen for being both the best at the job and the easiest to use on Android. Ratings and downloads were read from the Google Play listings on 1 October 2026.

| Hemlo module | Primary competitor | Why this one | Runner-up |
|--------------------|-------------------------|-------------------------------------------|----------------------|
| Today | **Structured** (4.6★, 1M+) | One visual timeline of tasks and events, an inbox to drag from | Tiimo |
| Plan | **Business Calendar 2** (4.6★, 10M+) | Real Year view, a week of 1–14 days, drag to move or copy, best widgets | Google Calendar |
| Tasks and repeats | **Todoist** (4.7★, 10M+) | Fastest quick add, the richest repeat grammar | TickTick |
| Notes | **Google Keep** (4.6★, 1B+) | Instant notes and checklists, nothing to file first | Obsidian (templates) |
| Habits | **HabitNow** (4.8★, 5M+) | Habits and tasks in one list, any schedule, one-time price | Loop Habit Tracker |
| Stats | **Exist.io** | Every source in one place, pinned figures, correlations | Daylio |
| Modules you build | **Memento Database** (4.6★, 1M+) | Typed fields, views, aggregation and chart widgets | Notion databases |
| Nutrition logging | **MacroFactor** (4.7★, 1M+) | No fixed meals (a timeline), a staging plate, multi-add, copy days | Cronometer |
| Recipes | **Paprika 3** (4.9★, 500K+) | Web import, scaling, list merges ingredients by aisle, pantry aware | Samsung Food |
| Shopping list | **Bring!** (4.4★) | Tiles, recently used strip, "2 kg apples", custom items, store order | OurGroceries |
| Stock (cupboard) | **KitchenPal** (4.5★, 100K+) | Barcode add, fridge/freezer/cupboard, expiry alerts | Grocy (data model) |
| Products and barcodes | **Open Food Facts** | Open EU product data, about 4 million products | Yuka (scan UX) |
| Training | **Hevy** (4.9★, 5M+) | Two taps to start, last time pre-filled, rest timer on tick | Strong |
| Supplements | **MyTherapy** (4.6★) | Free, EU-made, dose schedules, pill stock and refill alerts | Medisafe |
| Health and weight | **Libra** (4.3★) | Trend weight that smooths daily noise, a forecast | Happy Scale (iOS) |
| Sleep | **Sleep as Android** (4.6★, 10M+) | Sleep target, deficit and regularity, bedtime reminder | Sleep Cycle |
| Learning | **AnkiDroid** (4.8★, 10M+) | Review schedules, daily caps, "easy days" | Forest (focus timer) |
| Agenda | **Google Calendar** (4.6★, 10B+) | The system of record; repeats in the standard calendar format | Business Calendar 2 |
| Projects | **Trello** | One board per project, checklists in cards, the clearest kanban | Todoist projects |
| Finance | **Wallet by BudgetBakers** (4.7★, 10M+) | EU bank sync, budgets, planned payments, lifetime option | Monefy (fastest entry) |
| Household | **Sweepy** (4.5★, 1M+) | Rooms, per-member daily lists, fair share | Tody (flexible "due-ness") |

## 1.2 The whole app

**Closest single product: Notion, set up as a "Life OS".** People already build Hemlo's exact module set in it (tasks, projects, habits, journal, goals, finance, dashboards), with user-defined databases and views. Its weaknesses are Hemlo's openings: it is slow to set up ("customisation paralysis"), heavy on a phone, only partly offline, and has no live database or chart widgets on Android.

**The freedom benchmark is Excel / Google Sheets**, as the owner expected: any column, any formula, any pivot. But a spreadsheet has no planner: no dates as an agenda, no repeats, no reminders, no widget, and Google Sheets cannot even make or edit pivot tables on Android. Hemlo's aim is **the spreadsheet's freedom with the planner built in**. Part 4 maps every spreadsheet freedom to its Hemlo equivalent.

**Closest Android-native app: Memento Database.** It has the closest feature set (custom databases, views, aggregation and chart widgets) but no Today, no planning and a steep learning curve.

Positioning: **Notion-level freedom and spreadsheet-level stats, with the speed of Google Keep and Structured, on an Android home screen.**

## 1.3 The ten decisions that matter most

1. **Today is for doing, Plan is for arranging.** Today shows today; Plan gets a Day view, an Inbox and copying. Nothing that Today does now is lost (section 5.4).
2. **One scheduling engine** (one Repeat sheet) for tasks, habits, chores, supplements, training, study and payments, including weekends, chosen days, picked dates, nth weekday, "after done" and flexible repeats.
3. **Every module can show on Today and Plan**, by its own switches, so "selected to appear" means it appears.
4. **One add flow**: a context-aware + with a short menu, and one add sheet with Recent · Saved · Search · Scan.
5. **Copy and templates everywhere**: copy tasks, meals, days and weeks; note templates (recipes, reading reflections); day and week templates.
6. **One hold rule**: a short hold drags, a longer hold expands (Today, Plan) or selects (tables); every action is also in a visible ⋮ menu; undo after every change.
7. **One search**, the Foods-tab kind, everywhere.
8. **Food data rebuilt on EU sources** (NEVO, Portie-online, EU label fields), meals as labels on a timeline, scan anywhere food is added.
9. **A stats builder** (measure × summary × group by × range, compare, save as many templates as wanted, pin to Today or a widget).
10. **A calmer frame**: Today with pinned cards, a Modules hub so the bar stays short, designed empty states, just-in-time tips, and themes and icons the person chooses.

# Part 2. How the research was done

- Each module's competitor was chosen for two things at once: **best at the job** (features, ratings, reviews, expert lists) and **easiest** (how few steps the main action takes, what reviewers say about clutter). A different app was required for each module.
- Every fact comes from a page opened on 1 October 2026 (official sites, help centres, Google Play listings, the EU regulation text, RIVM, FAO, EFSA, Nielsen Norman Group, Android and Apple design guidance). Anything that could not be confirmed on a primary page is marked **[unverified]** in the appendices; comparison pages written by a rival app are marked **[competitor-authored]**.
- Hemlo's side of each comparison comes from the specification of version 15 in the first document (Parts E and F).
- The full research notes, with every source, are reproduced in Appendices A, B and C.

Legend in the comparison tables: **Yes** = Hemlo v15 has it; **Part** = partly; **No** = missing. "Next" names the requirement in the first document that closes the gap.



# Part 3. Module by module

## 3.1 Today vs Structured

**Why Structured:** one vertical timeline that merges tasks, calendar events and focus sessions, each with an icon, a colour and a block as long as its duration; an Inbox to capture undated tasks and drag them onto the day; widgets. Weak points: recurring tasks are paid, the Android version lags (no copy-day, no AI), and reviewers ask for bulk moves.

| Capability | Structured | Hemlo v15 | Next |
|--------------------------------------|---------------------|----------------------------------|-----------------|
| One timeline of the day's tasks and events | Yes | Part: tasks and followed calendars; own events, habits, chores missing | TOD-02, GEN-04, AGN-02 |
| Inbox of undated tasks, drag onto the day | Yes | No (a task with no day disappears) | PLN-07 |
| Duplicate a task into a pre-filled editor | Yes | No | TSK-24 |
| Copy a whole day to other days | iOS only | No | PLN-06 |
| Expand a task in place, tick its subtasks | Subtasks in the task | No (note page only) | TOD-10, TOD-12 |
| Morning / afternoon / evening groups (Tiimo) | Tiimo | No | TOD-02 |
| Time rail with push buttons, locked work hours, clash warnings | Partial (energy monitor) | Yes | — |
| Evening review of leftovers, flagging after 3 moves | Replan (paid) | Yes | — |
| Home-screen widget with ticks | Yes | Yes | — |
| Works offline, synced | Yes | Yes | — |

**Hemlo already wins on:** the review and flagging of moved tasks, locked hours and clash warnings, public holidays, module colours, free repeats.
**Take from Structured:** the single merged timeline, the Inbox, duplicate-to-editor, copy a day.

## 3.2 Plan vs Business Calendar 2

**Why Business Calendar 2:** six views including a real **Year** view (Google Calendar has none on Android), a week view that shows **1 to 14 days** with a pinch, drag and drop to move or copy, multi-select of events, templates suggested from what you create, 7 widgets and 22 themes. Weak points: dense, ads in the free version, moved to a subscription.

| Capability | Business Calendar 2 | Hemlo v15 | Next |
|---------------------------------------|-----------------------|---------------------------------|----------------|
| Day / week / month / year views | Yes, plus agenda and tasks | Part: no Day view in Plan | PLN-01, PLN-02 |
| Week of any length 1–14 days | Yes | No (7) | PLN-03 |
| Open, add and edit items from the calendar | Yes | No (Plan is read-only except moves) | PLN-04 |
| Drag to move an item to another day | Yes | Yes (hold and tap or drag) | — |
| Drag or menu to **copy** an item or day | Yes | No | PLN-06, TSK-20 |
| Swap two whole days with warnings | No | Yes | — |
| Heat of busy-ness per day | Yes | Yes (load heat) | — |
| Year view | Yes | Yes (scrolling months with heat and dots) | — |
| Templates from repeated events | Yes | No | PLN-08 |
| Hide a calendar with one tap | Yes | No | AGN-06 |
| Holidays per country in their own colours | Partial | Yes | — |

**Hemlo already wins on:** day swapping with warnings, planned repeats shown 5 years ahead, holidays in colours, module colour legends.
**Take from BC2:** a Day view you can edit, 1–14 day weeks, copy by drag or menu, templates, calendar visibility chips.

## 3.3 Tasks and repeats vs Todoist

**Why Todoist:** one-line quick add that reads dates, times, lengths and repeats as you type ("Gym every Mon, Fri at 18:00 for 90 min #Training"), the richest repeat language (every other week, every 2nd Tuesday, every last workday, "every!" = after completion, until a date, for 3 weeks), duplicate tasks, project templates, configurable swipes. Weak point: when copying, comments and completed subtasks are silently dropped.

| Capability | Todoist | Hemlo v15 | Next |
|-----------------------------------------------|--------------------------|--------------------------|-----------|
| Natural-language quick add | Yes | No | TSK-07 |
| Every day / weekdays / chosen days / every N | Yes | Yes | — |
| Weekends; nth weekday of the month; yearly | Yes | No | GEN-20 |
| Repeat after completion ("every!") | Yes | No | GEN-22 |
| Ends after N times | Yes | No (supported in data only) | GEN-21 |
| Change a repeating task's rule later | Yes | No (stop and re-make) | GEN-23 |
| Edit "only this one" / "this and following" | Yes | Yes | — |
| Start and end time ("9-10") | Yes | Yes ("Until") | — |
| Duplicate a task | Yes | No | TSK-24 |
| Copy with a clear choice about notes | No (drops comments silently) | No | TSK-22 |
| Task templates | Project templates | No | TSK-26 |
| Locked tasks, review, flags after 3 moves | No | Yes | — |

**Hemlo already wins on:** locked tasks, review and flagging, picked-dates repeats, planned repeats years ahead, calendar export with repeats kept.
**Take from Todoist:** quick add, the full repeat language, "after completion", rule editing, duplicate and templates — and do copying better by asking what happens to the notes.

## 3.4 Notes vs Google Keep

**Why Google Keep:** the fastest way to write something down (a widget opens a blank note instantly), checklists with drag-to-reorder and indent, ticked items drop to the bottom, colours and labels instead of folders. Weak point: no templates at all (people copy a pinned "template" note).

| Capability | Google Keep | Hemlo v15 | Next |
|-------------------------------------------------|---------------------|-----------------------|------------------|
| Checklists, bullets, headings, bold | Checklist and text | Yes | — |
| Drag to reorder and indent checklist items | Yes | No (typed indent only) | NOT-04 |
| Ticked items move to the bottom | Yes | No | NOT-04 |
| Tick items without opening an editor | Yes | No (note page only) | TOD-12 |
| Templates | No | No | NOT-10 to NOT-15 |
| Template fill-ins ({date}) (Obsidian) | Obsidian | No | NOT-10 |
| Insert a recipe into a note | No | No | NOT-20 |
| A note attached to a task with progress on the row | No | Yes ("2/5") | — |
| Export a note | Docs export | Yes (.md) | — |

**Hemlo already wins on:** notes living on the task they belong to, with progress shown on Today.
**Take from Keep and Obsidian:** instant ticking, drag to reorder, and real templates (which Keep lacks), plus recipe insertion that no note app has.

## 3.5 Habits vs HabitNow

**Why HabitNow:** quick to set up, any schedule (daily, chosen days, N times a week or month, custom), **habits and to-dos in the same daily list**, timers, charts, streaks, widgets, themes, and a one-time price. Weak points: no cloud sync, widgets that go stale. Runner-up Loop adds a forgiving "habit strength" score.

| Capability | HabitNow | Hemlo v15 | Next |
|-------------------------------------------------------|----------------|----------------------------|------------|
| Daily, chosen days, weekends, N times a week, custom dates | Yes | No (daily, weekdays, weekly) | HAB-01 |
| Change the schedule later | Yes | No | HAB-02 |
| Habits in the same daily list as tasks | Yes | No (a separate tab) | HAB-20 |
| Habits on the calendar | Yes | No | HAB-21 |
| A note with each habit | Yes | No | HAB-10 |
| Time of day and reminder | Yes | No | HAB-03 |
| Count habits (8 glasses) | Yes | No | HAB-05 |
| Streaks | Yes | Yes | — |
| Forgiving strength score (Loop) | Loop | No | HAB-07 |
| Widget with ticks, refreshed at once | Often stale | Yes | — |
| Cloud sync across devices | No | Yes | — |

**Hemlo already wins on:** sync, a reliable widget, habits next to the rest of life (food, training, stats).
**Take from HabitNow:** every schedule, habits in the main list, notes, times and counts.

## 3.6 Stats vs Exist.io (and the spreadsheet pivot)

**Why Exist.io:** it gathers every source into one place, lets you pin four figures to the top of Home, keeps a full history per figure, and finds correlations ("my mood is higher on days I go out"). Weak points: no charts of your own choosing and no pivots. No stats app offers pivot-style templates; only spreadsheets do, and Google Sheets cannot make pivots on Android.

| Capability | Exist.io | Spreadsheet | Hemlo v15 | Next |
|----------------------------------|----------------------|--------------------|-------------------|--------------|
| All modules' figures in one place | Yes (via integrations) | Manual | Yes (cards per module) | — |
| Many figures per module, chosen by the person | Some | Yes | No (2–4 fixed) | STA-02, STA-03 |
| Group by day / week / month / weekday / category | Fixed | Yes (pivot) | Part (periods only) | STA-10 |
| Sum / average / count / min / max / streak | Fixed | Yes | Part | STA-10 |
| Compare two measures | Correlations | Yes (chart) | No | STA-11 |
| Saved views, as many as wanted | No | Yes (sheets) | No | STA-13 |
| Pin a figure to the home page | 4 pinned | No | No | TOD-20, STA-14 |
| Home-screen stats widget | Unverified | No | No | WID-10 |
| Year-in-pixels grid (Daylio) | Daylio | Conditional formatting | No | STA-17 |
| Export | PDF | Yes | Yes (CSV, Excel, JSON) | — |

**Hemlo already wins on:** it owns the data (no integrations needed), it never counts unknown days as zero, it exports.
**Take:** Exist's pinned figures and history, and the spreadsheet's pivot, as a four-choice builder that a phone can handle.

## 3.7 Modules you build vs Memento Database

**Why Memento:** 20–30+ field types, list, card, table, map, calendar and gallery views, grouping and aggregation with charts, dashboards of aggregation and chart widgets, home-screen entry widgets, thousands of templates, offline. Weak points: a steep learning curve, it looks like a database rather than a planner, and dashboards do not sync.

| Capability | Memento | Hemlo v15 | Next |
|------------------------------------------------|----------------------|------------------------|---------------|
| Typed fields (text, number, date, time, yes/no, choice, link, formula) | Yes | Yes | — |
| Multi-choice (tags), rating, money, photo, checklist fields | Yes | No | MOD-11, MOD-12 |
| Combine several starting templates | n/a (one library each) | No (one preset) | MOD-10 |
| Views: list, table, calendar, board, grid, chart, form | Most (no board) | Yes | — |
| Aggregation and charts | Yes | Part (totals strip, chart view) | STA-10 |
| Home-screen widgets bound to a module | Yes | No | WID-10 |
| Records become tasks on the day, with reminders | Through scripts | Yes | — |
| Recurring records | Through automation | No | MOD-14 |
| Template gallery | Thousands | 8 presets | MOD-13 |
| Keywords suggest the module at setup | No | No (stored, not used) | MOD-07 |

**Hemlo already wins on:** modules that live inside a planner (tasks, Today, Stats), offline sync with no library limits, ease (no scripts).
**Take:** more field kinds, combinable presets, widgets per module, a bigger template gallery.

## 3.8 Nutrition logging vs MacroFactor

**Why MacroFactor:** the fastest logger. Search shows your usual foods for this hour before you type; one tap adds a food to a staging **plate**; you log the plate once. **No fixed meals**: food sits on a timeline by time, so a protein bar is never forced to be "breakfast" or "snack". Copy or move a food, an hour or a whole day to today or tomorrow, paste into several days. Saved meals can be "exploded" to edit one part. Barcode, label scan and quick add. Weak point: no free tier.

| Capability | MacroFactor | Hemlo v15 | Next |
|----------------------------------------------|----------------|-----------------------------|------------------|
| No fixed meal slots; time-based entries with optional labels | Yes | No (four fixed slots) | MEAL-01, MEAL-02 |
| + to add food, choosing meal and time | Yes | No | MEAL-10, MEAL-11 |
| Several items per meal | Yes | No (one recipe or one set of numbers) | MEAL-13 |
| Recent and usual foods before typing | Yes | No | MEAL-12, MEAL-20 |
| Staging plate, multi-add, one log action | Yes | No | MEAL-12 |
| Scan a barcode into a meal | Yes | No (Foods and Stock only) | MEAL-14 |
| Copy a meal or day to other days | Yes | No | MEAL-07 |
| Saved meals, explode to edit | Yes | No | MEAL-08 |
| Quick add calories and macros | Yes | Yes ("Just numbers", per 100 g etc.) | — |
| Household units (1 large egg) | Yes | Part (few foods) | UNIT-10 |
| Adaptive maintenance estimate from logs and weight | Yes | No | BODY-17 |
| Meal plan for future days, feeding a shopping list | No | Yes | — |
| Meals become tasks on Today | No | Yes | — |

**Hemlo already wins on:** planning meals ahead, the shopping list and stock that follow, meal tasks on the day, free.
**Take:** the timeline instead of slots, the + with sources, the plate, scan in meals, copying, saved meals.

## 3.9 Recipes vs Paprika 3

**Why Paprika:** save a recipe from any website in one tap, scale it and convert units, cook mode with timers, a grocery list that merges the same ingredient across recipes and sorts it by aisle, a pantry that is skipped when building the list, reusable menus. One-time purchase.

| Capability | Paprika 3 | Hemlo v15 | Next |
|--------------------------------------------|------------------|------------------------------|------------------|
| Search recipes | Yes | No | REC-01 |
| Open and read any recipe | Yes | Own only | REC-02 |
| Add an ingredient that does not exist yet | Free text lines | No | REC-10 |
| Free-text lines, notes per line, reorder | Yes | No | REC-04 |
| Import from a web page | Yes | No (Excel only) | REC-07 |
| Scale and convert | Yes | Portions only | REC-06 |
| Merge ingredients into the shopping list by aisle | Yes | Part (from planned meals; aisles not shown) | SHOP-14, SHOP-30 |
| Skip what is in the pantry | Yes | Yes (stock) | — |
| Recipe into a task's notes | No | No | NOT-20, REC-20 |
| Nutrition per portion from real food data | No | Yes | — |
| Books (collections) and multi-select | Categories | Yes | — |
| Share a recipe with everyone, reviewed | No | Yes | — |

**Hemlo already wins on:** nutrition from food data, units, books, stock deduction, community sharing.
**Take:** search, full reading view, web import, free-text and noted lines, scaling, and the "add ingredient" path.

## 3.10 Shopping list vs Bring!

**Why Bring!:** add items as icon tiles in one tap, type "2 kg apples" and the amount is understood, a **recently used** strip to re-add things, custom items, categories in your own store order (hide and reorder them), shared lists that sync live, recipes to the list in one click.

| Capability | Bring! | Hemlo v15 | Next |
|----------------------------------------------|--------------------|-------------------------|--------------------|
| Add items by hand | Yes | No | SHOP-10 |
| "2 kg apples" parsing | Yes | No | SHOP-10 |
| Recently used strip | Yes | No | SHOP-11 |
| Sections as headings, own order, collapsible | Yes | No (order only) | SHOP-30, SHOP-35 |
| Per-shop lists or filter | Several lists | No | SHOP-31, SHOP-34 |
| Ticks shared with the household | Yes | No (one device, reset daily) | SHOP-03 |
| List built from planned meals minus what is in stock | Recipes in one click | Yes (recipe meals) | SHOP-01 |
| Packs to buy from pack sizes | No | Yes | — |
| Put bought items into stock | No | Yes | — |
| Shopping trip on the agenda | No | No | SHOP-20 |
| Store offers | Partner offers | No | SHOP-40 (later) |

**Hemlo already wins on:** a list that comes from the meal plan, minus stock, in packs.
**Take:** manual items with amount parsing, the recent strip, sections and shop order, shared ticks — and add what Bring! lacks: the trip on the agenda.

## 3.11 Stock vs KitchenPal

**Why KitchenPal:** barcode lookup against millions of products, fridge, freezer and cupboard zones, expiry dates and alerts, recipe suggestions from what you have. Weak point: key features behind a subscription; it does not take ingredients out when you cook (per a rival's review).

| Capability | KitchenPal | Hemlo v15 | Next |
|--------------------------------------------------------|----------------|---------------------------|------------|
| Add by search or barcode, in units or packs | Yes | Yes | — |
| Fridge / freezer / cupboard | Yes | No (aisle only) | STK-03 |
| Best-before and "expiring soon" | Yes | No | STK-03 |
| Take ingredients out when cooking or eating | No | Yes (optional) | — |
| Minimum stock feeds the shopping list (Grocy) | Grocy | No | STK-04 |
| Shared with the household | Yes | Yes (no invite screen) | STK-05 |
| Recipe ideas from what is in stock | Yes | No | STK-06 |

**Hemlo already wins on:** automatic deduction when meals are eaten, the link to the meal plan and the list.
**Take:** places and expiry, minimum stock, in-app household invites.

## 3.12 Products and barcodes vs Open Food Facts (and Yuka)

Open Food Facts is both Hemlo's data source and the best open product app in Europe; Yuka is the reference for a fast scan-and-verdict screen.

| Capability | Open Food Facts / Yuka | Hemlo v15 | Next |
|-----------------------------------------|-----------------------|---------------------------|-------------------|
| Scan any EU barcode | Yes | Yes (no camera permission) | — |
| All label fields (salt, sugars, saturates) | Yes | No (five figures) | PROD-03 |
| Nutri-Score shown | Yes | No | PROD-06 |
| Unknown product: scan the label | Contribute flow | No | PROD-05 |
| Current API version (v3) | — | v2 (deprecated) | PROD-04 |
| Scan straight into a meal, recipe or list | No | No | PROD-02, MEAL-14 |
| Save a ready meal | No | No | PROD-10 |
| Shared prices (Open Prices) | Yes | Yes | — |

## 3.13 Training vs Hevy

**Why Hevy:** start a workout in two taps; adding an exercise pre-fills last time's sets, reps and weight, with a "Previous" column; ticking a set starts the rest timer; set types, supersets, routines; generous free tier.

| Capability | Hevy | Hemlo v15 | Next |
|--------------------------------------------------------|---------|---------------------------------|------------|
| Log sets, reps, load | Yes | Yes | — |
| Own exercises | Yes | No | TRN-02 |
| Routines and a session screen | Yes | No | TRN-03 |
| Last time pre-filled, Previous column | Yes | No | TRN-04 |
| Rest timer on tick | Yes | No | TRN-04 |
| Planned sessions on the calendar as tasks | No | No | TRN-05 |
| Charts per exercise and muscle group | Yes | Part (sessions, sets, volume) | TRN-08 |
| Training next to sleep and food | No | Yes (same app) | — |

## 3.14 Supplements vs MyTherapy

**Why MyTherapy:** free and EU-made; doses on a schedule, pill stock that counts down with each dose and a refill reminder. Weak point: a recent redesign added too many checkboxes and notifications, so "take all" per time slot matters.

| Capability | MyTherapy | Hemlo v15 | Next |
|------------------------------------------------|---------------|----------------------------------|-------------|
| Edit name, dose and time after adding | Yes | No | SUP-01 |
| Own time slots and times | Yes | No (Morning, Midday, Evening) | SUP-02 |
| A schedule per supplement | Yes | No (every day) | SUP-03 |
| One tick for the whole slot | No | No | SUP-04 |
| Stock count and refill reminder | Yes | No | SUP-05 |
| On the day's list | Reminders | No (Body tab) | SUP-06 |

## 3.15 Health and weight vs Libra

**Why Libra:** a trend weight (a time-aware moving average) as the headline, raw weights as dots, a forecast of the goal date from the trend, for about €1 a month.

| Capability | Libra | Hemlo v15 | Next |
|----------------------------------------------------|----------|-----------------------------------|-------------|
| Weigh-ins with change against last | Yes | Yes | — |
| Trend weight as headline | Yes | Part (7-day average line) | HLT-03 |
| Weekly rate and goal date | Yes | No | HLT-03 |
| Add or edit past days | Yes | No (today only on the page) | HLT-02 |
| Targets that follow the weight | No | Yes | — |
| Adaptive maintenance (MacroFactor) | No | No | BODY-17 |

## 3.16 Sleep vs Sleep as Android

**Why Sleep as Android:** a sleep target with a running deficit and a regularity score, a bedtime notification worked out from the alarm, wearables, a one-time unlock.

| Capability | Sleep as Android | Hemlo v15 | Next |
|------------------------------------------------------|-----------------------|--------------------|-------------|
| Log a night: bed, wake, quality | Automatic | Yes (by hand) | — |
| Target hours and bedtime | Yes | No | SLP-02 |
| Sleep debt and regularity | Yes | No | SLP-02 |
| Bedtime reminder | Yes | No | SLP-03 |
| Bedtime kept free on the planner | No | No | SLP-03 |
| Import from Health Connect | Yes | No | SLP-05 |

## 3.17 Learning vs AnkiDroid

**Why AnkiDroid:** the strongest review scheduler on Android, daily caps so a backlog never floods a day, "easy days" with less load, free. Runner-up Forest: a focus timer with tags and study stats.

| Capability | AnkiDroid / Forest | Hemlo v15 | Next |
|-------------------------------------------------|------------------------|-----------------|--------------------|
| Study blocks with subject and minutes | Forest (timer) | Yes | — |
| Blocks on Today and Plan | n/a | No (tab only) | LRN-02 |
| Review schedule (1-3-7-14-30 days) | Anki | No | LRN-05 |
| Daily cap and easy days | Anki | No | GEN-25 |
| Focus timer that logs minutes | Forest | No | LRN-06 |
| Reflection after reading | No | No | LRN-04, NOT-14 |

## 3.18 Agenda vs Google Calendar

**Why Google Calendar:** the calendar everyone already has; repeats follow the standard calendar format with one-off exceptions; tasks now sit in the calendar grid.

| Capability | Google Calendar | Hemlo v15 | Next |
|--------------------------------------|-------------------|------------------------------------|-----------------|
| Own events | Yes | Yes | — |
| Own events on the day and week | Yes | No (Agenda page only) | AGN-02 |
| Repeating events and reminders | Yes | No | AGN-03 |
| Show other calendars read-only | Yes | Yes (followed calendars) | — |
| Put Hemlo into Google Calendar | — | Yes (private feed, health kept out) | — |
| Tasks and events in one grid | Yes (2025+) | Part | TOD-02, PLN-11 |

## 3.19 Projects vs Trello

**Why Trello:** the clearest board: a project is a board of lists, cards carry checklists with progress, and moving a card is a drag. Weak point: other views are paid, and it is team-oriented.

| Capability | Trello | Hemlo v15 | Next |
|------------------------------------------|------------------------|--------------------------|------------------|
| Projects with a status | Yes | Yes | — |
| Board by status | Yes | Can be added in Edit module | PRJ-04 |
| Tasks inside a project, progress shown | Cards and checklists | No | PRJ-02 |
| Project tasks on the day when dated | Due dates | No | PRJ-02 |
| Milestones and goals on the year | Timeline (paid) | No (stub) | PRJ-03, PRJ-06 |
| Project templates | Yes | No | PRJ-05 |

## 3.20 Finance vs Wallet by BudgetBakers

**Why Wallet:** made in Prague, bank sync across the EU (Netherlands included), budgets, planned payments and bill reminders, shared family accounts, a lifetime option. Runner-up Monefy: the fastest manual entry (amount, then a category button). Weak point of Wallet: top-level categories cannot be renamed.

| Capability | Wallet / Monefy | Hemlo v15 | Next |
|-------------------------------------------------|-------------------|------------------------------|------------|
| Entries with category and amount | Yes | Yes (category is free text) | FIN-02 |
| Income and expense | Yes | No | FIN-02 |
| Budgets per category | Yes | No | FIN-03 |
| Planned payments on the calendar | Yes | No | FIN-04 |
| Two-tap entry | Monefy | No | FIN-05 |
| Bank import | Sync | Generic CSV | FIN-06 |
| Spending next to the rest of life (Stats) | No | Yes | — |

## 3.21 Household vs Sweepy (and Tody)

**Why Sweepy:** rooms, chores with frequencies, a daily list per household member, fair share. Tody adds the best-loved flexible model: each chore has a "due-ness" bar that grows from green to red and never "fails"; "just did it" resets it; holiday mode. Homsy is the only one with true rotation between people.

| Capability | Sweepy / Tody | Hemlo v15 | Next |
|-----------------------------------------------|--------------------------------|------------------|------------|
| Chosen days, every N days, monthly on a date | Yes | No (label only) | HSE-01 |
| After completion and flexible chores | Tody | No | HSE-02 |
| Chores on the day's list and the calendar | Yes | No | HSE-03 |
| Rooms | Yes | No | HSE-04 |
| Shared with the household | Yes | No (per person) | HSE-05 |
| Assign and rotate | Assign (Sweepy), rotate (Homsy) | No | HSE-06 |
| Pause for holidays | Tody | No | HSE-08 |
| Starter packs | Questionnaire | No | HSE-10 |
| Chores next to shopping, meals and the plan | No | Part | HSE-03 |

## 3.22 Looks (colours and icon)

Not a module, but asked for. The leaders: **TickTick** (40+ themes and list backgrounds, free), **Business Calendar 2** (22 app themes, 14 widget themes), **HabitNow** (themes and icons). Android itself offers system colours from the wallpaper (Material You) and themed monochrome icons. Hemlo v15 follows the phone's light or dark mode and lets each module have a colour; it has no themes, no dark choice of its own and one icon. The design page "Hemlo — Looks" shows a starting set of themes and icons (LOOK-01 to LOOK-12).



# Part 4. The whole app against its closest match

## 4.1 Side by side

| What a life planner needs | Excel / Google Sheets | Notion (Life OS) | Memento Database | Hemlo v15 | Hemlo after v16–17 |
|--------------------|----------------|------------------|--------------------|------------------|-------------------|
| A view of today to act on | No (by hand) | Part (filtered views) | Part (calendar) | Yes (tasks only) | Yes, every module |
| Week, month and year planning | No | Part (calendar, timeline) | Part (calendar) | Yes | Yes, plus Day and Inbox |
| Repeats | No | Part (repeating templates) | Part (automation) | Yes (tasks) | Yes, everything |
| Reminders | No | Part | Yes | Yes (tasks) | Yes, by module |
| Habits | Part (tick grids) | Part (templates) | Part | Part (a tab) | Yes |
| Food with real nutrition data and units | No | No | No | Yes | Yes, EU data |
| Your own trackers with typed fields | **Yes, anything** | Yes | Yes | Yes | Yes, more kinds |
| Several views of the same data | Part (sheets, filters) | Yes | Yes | Yes | Yes |
| Formulas | **Yes** | Yes | Yes | Yes (safe subset) | Yes |
| Pivot-style stats, saved | **Yes (not on Sheets for Android)** | Part (chart view) | Yes (aggregation) | No (fixed cards) | Yes (stats builder) |
| Stats on the home screen | No | No | Yes | No | Yes (widget) |
| Copy and paste anything anywhere | **Yes** | Yes | Part | No | Yes (copy to days, templates) |
| Templates | Yes (files) | Yes | Yes | Part (setups) | Yes (notes, tasks, days, modules, stats) |
| Import and export | **Yes** | Part | Yes | Yes | Yes |
| Works offline on a phone | Part | Part (first 50 rows) | Yes | Yes | Yes |
| Easy on a phone | No | Part (learning curve) | No (steep) | Part (overloaded) | Goal: yes |
| Home-screen task widget | No | No (page shortcuts only) | Yes | Yes | Yes |

## 4.2 Excel's freedom, translated into Hemlo

The owner's instinct is that Hemlo should feel as free as a spreadsheet. This table is the translation: every spreadsheet freedom and the Hemlo feature that gives the same freedom without needing spreadsheet skills.

| In a spreadsheet | In Hemlo | Status |
|--------------------------------|-------------------------------------------|-----------------------------------|
| A sheet | A module (built-in or your own), with its own page | Done |
| Columns with a type (date, number, dropdown, checkbox) | Fields of a kind (date, number with unit, choice, yes/no…) | Done; multi-choice, rating, money, photo to add (MOD-11, MOD-12) |
| Add or hide a column | Add, hide, rename, reorder fields in Edit module | Done |
| Formulas | Calculated fields (safe formula language) | Done |
| Filter and sort | Views with their own columns, and one search | Partly (GEN-10) |
| Several tabs over the same data | Several views (list, table, calendar, board, grid, chart, form) | Done |
| Copy a row, fill down | Copy to… days, Duplicate, templates | To build (TSK-20 to TSK-26) |
| Copy a whole block | Copy a day or week, day and week templates | To build (PLN-06, PLN-08) |
| A template workbook | Starting layouts, module presets, note templates | Partly |
| Pivot table | Stats builder: measure × summary × group by × range | To build (STA-10) |
| Pivot chart | Chart chosen automatically, table toggle, saved as a stats template | To build (STA-12, STA-13) |
| Conditional formatting | Module colours, heat on Plan, year-in-pixels | Partly (STA-17) |
| Freeze panes, many sheets open | Pinned cards on Today, pinned page on the bar | To build (TOD-20, NAV-20) |
| Save as CSV or Excel, import a file | Export link on every page, import and export centre | Done |
| Share a file | Calendar feed, recipe sharing; household sharing | Partly |

What a spreadsheet cannot do and Hemlo does: dates become a day plan, repeats lay themselves out, reminders arrive, a widget shows today, meals become a shopping list, the cupboard empties itself, and it all works on a phone with no formulas to write.

## 4.3 Verdict

- **Closest product: Notion Life OS.** Same scope, same freedom. Hemlo beats it on speed, offline use, Android widgets, real food data and planner behaviour; it must match it on templates and views.
- **Freedom benchmark: Excel.** Hemlo reaches it with the stats builder, copy and templates; it already matches it on fields, views, formulas and import/export.
- **Android-native analogue: Memento Database.** Hemlo beats it by being a planner first; it should borrow its widgets and field kinds.

# Part 5. Usability: the person's point of view

## 5.1 Where the app feels overloaded or overlapping today

Found by walking through version 15 as a person would, screen by screen (from the specification).

| # | Overlap or overload | What the person experiences | Fix |
|-----|------------------------------------|------------------------------------|---------------------------------|
| 1 | Today and Plan both browse any day with the same header and week strip | "Which one do I use?" Today edits any day; Plan shows days but cannot open a task | Today = today; Plan gets Day view, Inbox, add and open (5.3) |
| 2 | The same section appears in two places: Body tab on Today and the Habits / Supplements / Health pages | The same list twice, with different routes in | Items on Today's list; module pages keep history and setup |
| 3 | Food → Day meal cards and meal tasks on Today | Two places for the same meal, and ticking one does not tick the other | One meal item, ticked in either place (GEN-31) |
| 4 | Three places for events: Agenda page, followed calendars on Today, Plan | Own events are missing from Today and Plan, followed ones are not | All events on Today and Plan (AGN-02) |
| 5 | Records shown in three forms: module page, Today module tab, Stats | Hard to know where to add or see things | Module page = add and history; Today = what is due; Stats = numbers |
| 6 | Up to 16 pages on the bar | A crowded bar or a drawer to hunt through | Modules hub and a pinned page (NAV-20) |
| 7 | Long press means drag on Today, select in Food tables, move on Plan | Unpredictable | One rule (GEN-52) |
| 8 | Two searches | Some lists search well, some poorly, Recipes not at all | One search (GEN-10) |
| 9 | + always makes a task | Adding food, a habit tick or an expense takes several screens | A context-aware + (GEN-50) |
| 10 | Rules shown that do nothing (9 of 14) | Switches and promises that do not deliver | Carry them out or hide them (MOD-06) |
| 11 | Settings in four tabs with many panels | Hard to find things | Search in settings; group by module; Looks section |
| 12 | Modules switched on that were never chosen | Food, Training and others appearing after a minimal setup | Sign-up default fixed (GEN-02) |

## 5.2 Typical journeys: now and after

Steps counted as taps and screens a person goes through.

| Journey | Now (v15) | After | How |
|--------------------------|-------------------------------------|-------------------------------|----------------|
| Meal prep on Sunday: two recipes' ingredients as a checklist, ticked while cooking | Not really possible: Recipes → Select → tick two → Copy ingredients → Today → change day to Sunday → + → type title → paste into note → Save; on Sunday open the task → Open as page → tick (about 14 steps, and the list is plain text, not linked) | Plan → Sunday → + Task "Meal prep" → note: Insert → Recipe ×2 → Save; on Sunday: long press → tick (about 7 steps) | NOT-20, TOD-10, PLN-02 |
| Copy "Read 30 min" to the next three weekdays with a reflection prompt | Make it repeat, or retype it three times | Long press → Copy to… → pick three days → Notes: "Reading reflection" template → Copy (5 steps) | TSK-20, NOT-14 |
| Log a ready meal bought at the supermarket for lunch | Food → Foods → Scan → Add to my foods → Day → Lunch → Just numbers → From a food → search it → amount → Save (about 11 steps) | + → Food → Lunch / now (pre-filled) → Scan → Add (4 steps) | MEAL-10 to MEAL-14 |
| Add "Mobility" on Mon, Wed, Fri with the exercises attached, and see it on Today | Not possible (no chosen days, no note, not on Today) | Habits → + → name, Repeat: chosen days, Note: checklist → Save; it shows on Today on those days | HAB-01, HAB-10, HAB-20 |
| Weekly cleaning chores shared and rotating between two people | Not possible | Household → starter pack → assign "rotate" → chores appear on each person's Today | HSE-01 to HSE-06 |
| Add toilet paper to the list and get a shopping trip on Saturday | Not possible | Shop → + "toilet paper" → with "Plan a trip" on, Saturday shows "Shopping (5 items)" | SHOP-10, SHOP-20 |
| Compare protein eaten with training days over a month | Not possible | Stats → New → Protein, average, by day, this month, compare: training days → Save, pin to Today | STA-10, STA-11, STA-14 |
| Set the right activity level as an office worker who goes to the gym twice a week | Pick from ten levels where "desk job" is 1.2 (too low) | Work: mostly sitting; Training: 1–2 a week → 1.6, with the example day | BODY-10 to BODY-13 |

## 5.3 The interaction rules (one page)

1. **Today is for doing; Plan is for arranging.** Today: today's items from every module set to show there, the carry-over, pinned cards. Actions: tick, log, expand, start, push, skip, move to tomorrow. Plan: Day, Week (1–14 days), Month, Year, Inbox. Actions: add, open, drag, copy, swap, repeat, templates.
2. **Tap opens, short hold drags, long hold expands.** On Today and Plan's Day view, a tap opens the editor; a short hold and a move drags the item; holding still longer expands it in place (note, checklist, quick actions). In tables and module lists, a hold enters multi-select. Every gesture's action is also in the item's ⋮ menu.
3. **The + knows where you are.** On a module page it adds that module's thing. On Today and Plan it opens a menu of at most six add types, ordered by use.
4. **One add sheet, two steps at most.** Step 1 the essentials (which meal, when; which day); step 2 the source: Recent · Saved · Search · Scan (and module-specific ones). Never a sheet on top of a sheet.
5. **Copy to… is always the same dialog.** Days (many), time (same, new, none), notes (same, ticks cleared, none, template).
6. **One Repeat sheet** for everything that repeats.
7. **One search** everywhere.
8. **Undo after every change** that moves, deletes or copies.
9. **No more than two levels** inside a module: the list, then an item. Settings in sheets.
10. **Only what is on appears.** Every module has Show on Today / Plan / widget / Stats / reminders.
11. **Calm defaults**: a new person sees Today, Plan and the modules of their template, with empty states that offer the first action; tips appear once, when they are useful.
12. **Nothing removed**: anything moved gets a one-time "what moved where" note, and a "Classic layout" switch stays for one or two versions.

## 5.4 Function preservation map

Every function that moves, and where it lives afterwards. Nothing is dropped.

| Function in v15 | Where it is now | Where it goes |
|------------------------------------|--------------------------|------------------------------------------------|
| Look at and edit another day's tasks | Today (week strip, date picker) | Plan → Day view (same rail, same actions) |
| Week strip and "Go to a day" | Today and Plan header | Plan only; Today keeps "Tomorrow" peek |
| Today's tabs (Body, Work, Training, modules, Evening, Sleep) | Today | Kept for today as filter chips over one list; Body's sections become items and pinned cards |
| Weigh-in form | Body tab, Health page | Health card on Today (pinned) and Health page |
| Habits section | Body tab, Habits page | Habit items on Today; Habits page for setup and history |
| Supplements section | Body tab, Supplements page | Slot items on Today; Supplements page for setup |
| Sleep form | Sleep tab | Sleep item on Today (morning), Sleep page |
| Push 15/30/60, tick, lock icon | Task row | Same |
| Drag to reorder | Long press on Today | Short hold and move, on Today and Plan's Day view (long hold expands instead) |
| ⋮ Move up / Move down | Task row | Same menu, plus Copy to…, Duplicate, Skip, Delete |
| Evening review | Today compact line, Evening tab | Carry-over row on Today, and the review at the review time |
| Repeats to come (days beyond 8 weeks) | Today | Plan → Day view |
| Export link | Today, Plan, pages | Same |
| Hold a day to swap, hold a task to move | Plan Week | Same, plus Copy |
| Four meal cards | Food → Day | Meal list (own meal names optional, cards if set in settings) |
| Just numbers, per 100 g etc. | Meal card | "Just numbers" source in the add-food sheet |
| From a food | Meal card | "Foods" source, keeping the link to the food |
| Size the main meal | Dinner card | The meal the person marks as main |
| Shopping trip list | Shop → Trip | Shop → List (manual items, sections, shop filter) |
| Stores text | Shop → Stores | Stores tab that works |
| Page bar styles | More → Modules | Same, plus "Hub" |
| Settings panels | More (four tabs) | Settings with search; same panels, plus Looks |

## 5.5 Navigation proposal

- **Bar (Hub style, recommended from 5 modules):** Today · Plan · *one page the person pins* (for example Food) · Stats · Modules. The Modules page is a grid of every module that is on, with search, ordered by use; long press → Pin to bar, Pin a card to Today, Hide, Settings.
- **The existing styles stay** (one row, two rows, three rows, drawer, fan) for people who like them.
- **Today's top:** date, the pinned figure or card row, holiday chips; then the list.
- **Plan's top:** Day · Week · Month · Year · Inbox, and the date picker.

# Part 6. Roadmap

The requirements in the first document carry a priority. Grouped into releases:

## Version 16 (Must): "everything linked, everything appears"

1. **Visibility and the frame:** GEN-01 to GEN-06 (one "is on" rule, Show on Today / Plan switches, sign-up default), TOD-01 to TOD-05 and PLN-01, PLN-02, PLN-04, PLN-07 (Today/Plan split, Day view, Inbox), GEN-54 (undo), NAV-26 (what moved where).
2. **One scheduling engine:** GEN-20, GEN-21, GEN-23, with habits (HAB-01, HAB-02, HAB-10, HAB-11, HAB-20 to HAB-23) and chores (HSE-01, HSE-03, HSE-05, HSE-07).
3. **Copy and templates:** TSK-20 to TSK-25, NOT-10 to NOT-13, NOT-16, NOT-20, NOT-21, PLN-06; long press to expand and tick (TOD-10 to TOD-14).
4. **Food:** FOOD-01 to FOOD-05, FOOD-08 to FOOD-14, FOOD-19, UNIT-02, UNIT-10 to UNIT-16, UNIT-20 to UNIT-23, REC-01, REC-02, REC-04, REC-05, REC-10, REC-20, REC-21, MEAL-01 to MEAL-03, MEAL-05, MEAL-07, MEAL-09 to MEAL-14, MEAL-17, PROD-02, PROD-03, PROD-10, BODY-04, BODY-05, BODY-10 to BODY-16.
5. **Shopping:** SHOP-01 to SHOP-03, SHOP-10, SHOP-13, SHOP-14, SHOP-20, SHOP-21, SHOP-23, SHOP-30 to SHOP-32.
6. **Stats:** STA-02, STA-03, STA-10, STA-12 to STA-14, STA-18, STA-19, STA-21, and stats widgets WID-10.
7. **Modules and finishing:** MOD-06, MOD-10, MOD-11, GEN-50 to GEN-52, GEN-55, GEN-10 to GEN-13, AGN-02, SUP-01, TRN-02, TRN-03, TRN-05, SLP-02, PRJ-02, FIN-02, FIN-03, LRN-02, HLT-02, HLT-06, SET-04, SET-06, SET-07, TOD-15, TSK-09, ONB-10, ONB-14, LOOK-01, LOOK-03, LOOK-05, LOOK-11, DATA-06, SYNC-03.
8. **Release:** SEC-04, PLAT-03 to PLAT-09 (store texts and screenshots after the new design).

This is a large version. If it has to be split, the order above is the order of value: 1–3 change how the app feels; 4–5 fix the food and shopping complaints; 6–7 finish the modules.

## Version 17 (Should)

Pinned cards (TOD-20, TOD-21), Week 1–14 days (PLN-03), templates for days and weeks (PLN-08), task templates (TSK-26), prompt after done (NOT-14, NOT-15), saved meals (MEAL-08), stats compare and ready-made templates (STA-11, STA-15), Modules hub (NAV-20 to NAV-22), themes from a colour and system colours (LOOK-02, LOOK-04), alternate app icons (LOOK-10), flexible and after-completion repeats (GEN-22, HSE-02), rotation (GEN-24, HSE-06), goals and milestones (GEN-36, PRJ-03, PRJ-06), routines with rest timer (TRN-04), supplement slots and stock (SUP-02 to SUP-04), sleep bedtime (SLP-03), trend weight (HLT-03), planned payments (FIN-04), periodic pull (SYNC-02), and the rest marked Should.

## Later (Could)

Natural-language quick add, adaptive maintenance estimate, correlations, Nutri-Score, label scanning, cook mode, bank imports, Health Connect, supermarket offers, an assistant that edits on request, iPhone.



# Appendix A. Research notes: planner, habits, stats, custom modules and the whole app

Reproduced in full from the research of 1 October 2026, with its sources.


Method: every fact below comes from a page that was actually opened (listed under each section's Sources), unless it is marked **[unverified]** (my own background knowledge, or a claim I could not confirm on an opened page) or **[conflict]** (sources disagree). Play Store figures (rating, downloads, "last updated") were read from the US Play listing on 2026-10-01.

### Picks at a glance

| # | Hemlo module | Primary (best + easiest) | Runner-up |
|-----|------------------------------|------------------------------------|---------------------------------------|
| 1 | Today / daily view | **Structured** (Android, 1M+, 4.6) | Tiimo (iPhone App of the Year 2025; Android relaunched May 2026, missing some features) |
| 2 | Plan (week/month/year) | **Business Calendar 2** (Android, 10M+, 4.6, real Year view) | Google Calendar (default; **no Year view on Android**) |
| 3 | Tasks, repeats, templates/duplicating | **Todoist** (best quick-add NLP) | TickTick (all-in-one, cheaper) |
| 4 | Notes with checklists & templates | **Google Keep** (easiest, 1B+) | Obsidian (real templates with variables, Bases) |
| 5 | Habits | **HabitNow** (Zapier's Android pick, 5M+, 4.8, one-time unlock) | Loop Habit Tracker (free/OSS, habit-strength score; last update Sep 2025) |
| 6 | Stats / dashboards / widgets | **Exist.io** (cross-source correlations) | Daylio (simplest logging + Year in Pixels, 10M+) |
| 7 | Custom modules | **Memento Database** (Android-native no-code DB, views + charts + widgets) | Notion (databases + views + repeating templates) |
| 8 | Whole app closest match | **Notion (Life OS template setups)** | Google Sheets/Excel = the "freedom" reference; Memento = closest Android-native |


### 1. Today / daily planning view

#### Primary: Structured — Daily Planner
- **Platforms:** iPhone, iPad, Mac, Apple Watch, web (web.structured.app), **Android** (needs Android 11+). Android is described by the vendor as being in "early development"; "not all features known from Apple are available yet". Widgets are already on Android. Sync via "Structured Cloud".
- **Play Store:** 4.6★, 1M+ downloads, updated 2026-09-21.
- **Why it's loved / UX patterns:**
  - One **visual vertical timeline** that merges tasks, calendar events and focus sessions; each task has an icon and colour, and its length shows its duration.
  - An **Inbox** for undated tasks: tap + to capture, then give a time to move it onto the timeline, or drag it back to the inbox. On Apple devices: swipe right to complete, swipe left to delete, and drag down to complete or delete.
  - The **Energy Monitor** and "energy-based planning" match tasks to how much energy you have.
  - **Structured AI** turns brain-dumps into a schedule (Android lacks the AI features, per Toolfinder).
- **Duplicating and copying:**
  - **Duplicate a task:** open it, go to the ⋯ menu and tap Duplicate. The editor opens pre-filled so you can change the day, time, colour, name or icon before saving. The help page does not say whether notes and subtasks come along **[unverified]**.
  - **Copy a whole day:** long-press the date, choose "Copy Tasks From Day", and pick which kinds to copy (regular tasks, recurring tasks, calendar events, reminders). Then long-press the target date and choose "Paste from [Date]". You can paste into several days. **This is not available on Android or the web.**
  - **Template workaround:** the vendor recommends keeping "template task" copies in the Inbox and duplicating them onto the timeline whenever needed.
- **Free vs Pro:**
  - **Free:** timeline, all-day and inbox tasks, subtasks and notes, icons and colours, notifications, drag & drop, **widgets**, Energy Monitor, customisation (app colour, layout, font size).
  - **Pro:** AI, calendar/reminders import, **recurring tasks**, Replan, custom notifications, custom colour palette, premium icons.
  - **Price:** monthly, yearly or one-time. Toolfinder quotes $29.99/yr or $49.99 lifetime **[unverified on an official page]**.
- **Weaknesses:**
  - Recurring tasks are behind the Pro paywall.
  - Any.do's June 2026 test says it "lacks project organization, limited recurring task flexibility, weak … long-term planning".
  - Play reviewers ask for bulk paste/import of tasks.
  - The Android version lags iOS (no copy-day, no AI).
- **Ideas for Hemlo:**
  1. A **single timeline that merges tasks, events and habit slots**, using icon + colour + duration blocks, with an **Inbox drawer** that you drag from onto the timeline.
  2. **Long-press a date → "Copy day" → choose what to copy (tasks / recurring / events / notes) → paste into one or more days.** Structured has no copy-day on Android, so this is an easy win for Hemlo.
  3. **Duplicate opens the editor pre-filled** with day/time unlocked. Add a toggle such as "include notes & checklist", because Structured doesn't make this explicit.
  4. Keep **widgets and theming free** and charge for power features, which is the same split Structured uses.

#### Runner-up: Tiimo
- **Platforms:** iOS, iPadOS, watchOS, web, Android. Android was **rebuilt and relaunched on 2026-05-04**.
- **Android gaps:** at launch, Android lacks Google Calendar integration, the AI Co-Planner, focus tunes, mood tracking, web planner access, **widgets** and Live Activities.
- **Play Store:** 4.7★, 50K+ downloads, updated 2026-09-17.
- **Awards:** **iPhone App of the Year 2025** (App Store Awards).
- **Loved for:**
  - A visual timeline grouped by **time of day** (morning, afternoon, evening).
  - A focus timer, with timers on subtasks.
  - AI task breakdown.
  - Heavy use of colour and icons; ADHD/autism-friendly.
- **Complaints on Android:** no month view in the calendar, deleting items is hard, the timer has no end sound, and AI placement is inconsistent.
- **Price:** free core; Pro is an annual subscription after a 7-day trial (amount not shown).
- **Ideas for Hemlo:**
  - **Morning / Afternoon / Evening buckets** as an alternative Today layout for untimed items.
  - **Timers on checklist sub-items.**

#### Also considered
- **Sunsama:** apps on iOS, Android, macOS, Windows and Linux. $25/mo or $20/mo yearly, 14-day trial, explicitly no free or lifetime plan. Its guided daily-planning ritual is praised, but Toolfinder calls it "desktop-focused; not ideal for quick on-the-go planning".
- **Motion:** praised for AI auto-scheduling, but $29/mo, no free plan and a steep learning curve (Toolfinder).
- **Akiflow:** ~$19/mo yearly (Toolfinder).
- **TickTick:** see section 3.

#### Sources
- Structured homepage — https://structured.app
- Structured on Google Play — https://play.google.com/store/apps/details?id=io.unorderly.structured&hl=en_US
- Structured help: "Structured on Android" — https://help.structured.app/en/articles/331714
- Structured help: "How to Copy Tasks or Days" — https://help.structured.app/en/articles/1901058
- Structured help: "Free vs Pro" — https://help.structured.app/en/articles/1897986
- Structured help: "How to Use the Inbox" — https://help.structured.app/en/articles/338178
- Tiimo homepage — https://www.tiimoapp.com
- Tiimo for Android (relaunch) — https://www.tiimoapp.com/resource-hub/tiimo-android-relaunch
- Tiimo on Google Play — https://play.google.com/store/apps/details?id=com.tiimo.androidappreactnative&hl=en_US
- Sunsama pricing — https://www.sunsama.com/pricing
- Toolfinder: Best Daily Planner Apps 2026 — https://toolfinder.com/best/daily-planner-apps
- Any.do blog: Best Daily Planner App in 2026 (June 2026) — https://blog.any.do/best-daily-planner-app-in-2026-7-options-we-actually-tested/


### 2. Plan / calendar views (week · month · year)

#### Primary: Business Calendar 2 (Appgenix)
- **Platform:** Android only.
- **Play Store:** 4.6★ from 274K reviews, 10M+ downloads, updated 2026-09-23.
- **Views:** 6 main views: Month, Week, Day, Agenda, **Year** and Tasks.
  - The week view can show **1 to 14 days**, changed with a simple swipe/pinch. Play text: "adjust weekly planner with simple swipe to show anything between 1 and 14 days".
- **Loved for:**
  - **Widgets:** 7 widgets, 14 widget themes and 50+ widget options. 2sync calls it the leader in widgets (multiple sizes, configurable density).
  - **Themes and colours:** 22 app themes, plus custom background colours for selected days.
  - **Event templates:** a "template setup assistant suggests templates based on events".
  - **Fast entry:** auto-complete of title and location from history, and voice input.
  - **Drag & drop to move, copy or delete events** in the day and week planners (Pro).
  - **Tasks:** drag-and-drop tasks between lists and change parent/subtask relationships; recurring tasks, subtasks and 5 priorities (Pro).
  - Zapier praises it as "easy to customize without opening the settings".
- **Weaknesses:**
  - Ads in the free version.
  - Dense and power-user oriented (TechRadar: "may overwhelm those seeking simplicity").
  - Android only.
- **Pricing [conflict]:** TechRadar (2021) says a one-time premium under $10, and a separate "Business Calendar 2 Pro" Play listing exists. A recent Play reviewer complains about a "$10 yearly subscription". The current model is likely a subscription with a legacy one-time Pro key **[unverified]**.
- **Ideas for Hemlo:**
  1. **Pinch or swipe the week view to any length from 1 to 14 days.**
  2. A true **Year view** with heat-shaded days. Google Calendar has none on Android, so this is a gap.
  3. **Learned templates** that suggest a template after you create similar items repeatedly.
  4. **Drag with a modifier (or long-press → "Copy") to copy an item to another day** directly in the week/month grid.

#### Runner-up: Google Calendar
- **Status:** the default for most people. Zapier and 2sync both rank it best overall (pre-installed, Gmail event detection, sharing).
- **Android views:** Google's Android help lists Schedule and Month (plus Day, 3-day and Week **[unverified — help page only named Schedule/Month]**). The **Year view is web-only**; the Android help page does not offer it.
- **2026 changes:** Reminders were folded into Google Tasks, so tasks now show inside the Calendar grid. Gemini scheduling help depends on plan.
- **Idea for Hemlo:** **show tasks and events in the same grid** with the same visual language, as Google did after merging Reminders into Tasks.

#### Also considered
- **Fantastical:** iPhone, iPad, Mac, Apple Watch, **Windows** and Vision Pro, but **no Android**. Famous for natural-language event entry (Flexibits Premium subscription).
- **Proton Calendar:** end-to-end encrypted.
- **Notion Calendar:** links events to Notion pages and databases (2sync).

#### Sources
- Business Calendar 2 on Google Play — https://play.google.com/store/apps/details?id=com.appgenix.bizcal&hl=en_US
- Appgenix: Business Calendar 2 features — https://www.appgenix-software.com/business-calendar-features/
- TechRadar: Business Calendar 2 review (2021) — https://www.techradar.com/reviews/business-calendar-2
- Zapier: The 7 Best Calendar Apps for Android in 2026 (updated Aug 2026) — https://zapier.com/blog/best-android-calendar-apps/
- 2sync: 9 best calendar apps for Android in 2026 — https://2sync.com/blog/best-calendar-apps-for-android
- Google Calendar Help (Android): change your view — https://support.google.com/calendar/answer/6110849?co=GENIE.Platform%3DAndroid&hl=en
- Drag: Google Calendar 2026 Ultimate Guide — https://www.dragapp.com/blog/google-calendar-guide/
- Flexibits Fantastical — https://flexibits.com/fantastical


### 3. Tasks, repeats, task templates and duplicating

#### Primary: Todoist
- **Platforms:** Android (including Wear OS), iOS, web, macOS and Windows.
- **Play Store:** 4.7★ from 305K reviews, 10M+ downloads.
- **Why it's the easiest:**
  - **Smart Quick Add** parses natural language, e.g. "Submit report every Friday at 4pm #Work".
  - In 2026 Quick Add was **redesigned to open clean**, with action chips appearing only as you type.
  - Parsing now handles **start time + duration** ("Meet tomorrow 9-10").
  - Typing `{` brings up deadline suggestions.
  - Toolfinder: Todoist "parses complex dates like 'every other Tuesday at 3pm' flawlessly".
- **Voice capture:** **Ramble** is a voice-to-tasks feature. Android home-screen widgets got a Ramble shortcut in 2026. Free plans have a monthly limit on Ramble sessions.
- **Other 2026 changes:**
  - Material 3 Expressive refresh on Android (June 2026).
  - "Urgent reminders" on Android: full-screen alarms that bypass Do Not Disturb.
  - Completed recurring occurrences now stay visible in Today and Upcoming (Sep 2026).
  - Calendar tasks can be colour-coded.
- **Duplicating and templates:**
  - **Android duplicate:** Browse → project → ⋯ → Select tasks → ⋯ → "Duplicate tasks".
  - **What a copy includes:** active sub-tasks are copied. **Comments, custom reminders and completed sub-tasks are NOT copied.**
  - **Templates** are project-level: a gallery of 15+ categories in list, board and calendar layouts. Business plans have shared templates.
  - **Swipe actions** are configurable (Settings → General → Swipe actions).
- **Pricing:**
  - **Beginner (free):** 5 projects, 3 filter views, 1-week activity history.
  - **Pro:** 300 projects, calendar layout, durations, custom reminders, 150 filters, unlimited Ramble.
  - **Business:** $6/user/mo.
  - **Pro price [conflict]:** the page renders prices client-side, so I could not read it directly. Toolfinder says $4/mo billed yearly; 2sync says $60/yr after a ~25% increase in Dec 2025.
  - The pricing-page parse suggested "recurring due dates" are Pro-only, but I could not confirm this in the raw HTML **[unverified]**.
- **Weaknesses:**
  - No built-in habit tracker or pomodoro (Toolfinder).
  - Reminders are on Pro.
  - Play reviews mention recurring-task reliability issues.
- **Ideas for Hemlo:**
  1. **One-line Quick Add with progressive chips:** parse date, time-range, repeat, #module and !priority as you type, and only show chips after the user starts typing.
  2. **Explicit duplicate rules.** Todoist silently drops comments and completed sub-items; Hemlo should ask, or remember, "Copy notes? Copy checklist (reset ticks)? Copy reminders?".
  3. **Keep completed recurring occurrences visible** in Today so streak and stat history are obvious.
  4. A **voice brain-dump button on the widget** that turns speech into several tasks.

#### Runner-up: TickTick
- **Platforms:** web, Android, Wear OS, iOS, Mac and PC.
- **Play Store:** 4.7★ from 165K reviews, 10M+ downloads, updated 2026-09-24. MakeUseOf called it "the best to-do app for Android".
- **Loved for its all-in-one design:** tasks, NLP dates, voice, **List / Kanban / Timeline views**, a habit tracker with stats, Pomodoro, Eisenhower Matrix, countdowns, and calendar views (year, month, week, agenda, multi-day). Also 40+ themes and custom list backgrounds.
- **Weaknesses:**
  - NLP is "less sophisticated" than Todoist's.
  - The interface is "more complex … potentially overwhelming" (Any.do).
- **Pricing [conflict]:** Premium is listed as $36/yr (Toolfinder), $49.99/yr (2sync) and $3.99/mo billed annually (Any.do).
- **Unverified features:** TickTick's help centre is JS-rendered and I couldn't read it. Task duplication, task templates and "convert task ↔ note" exist in TickTick but are **[unverified]** here.
- **Ideas for Hemlo:**
  - **Themes and list backgrounds as a free delight feature.**
  - **Matrix and timeline as alternative views** of the same task list.

#### Also considered
- **Things 3:** iOS/Mac only, no Android **[not opened; unverified]**.

#### Sources
- Todoist pricing — https://www.todoist.com/pricing
- Todoist help: duplicate / introduction to tasks — https://www.todoist.com/help/articles/duplicate-a-task-in-todoist-2OZqUwJT
- Todoist templates — https://www.todoist.com/templates
- Todoist 2026 Changelog — https://www.todoist.com/help/todoist/product-updates/2026-changelog-HD3jJAtLd
- Todoist on Google Play — https://play.google.com/store/apps/details?id=com.todoist&hl=en_US
- TickTick features — https://ticktick.com/features
- TickTick on Google Play — https://play.google.com/store/apps/details?id=com.ticktick.task&hl=en_US
- Toolfinder: Todoist vs TickTick (2026) — https://toolfinder.com/comparisons/todoist-vs-ticktick
- 2sync: TickTick vs Todoist 2026 — https://2sync.com/blog/ticktick-vs-todoist
- Any.do blog (June 2026) — https://blog.any.do/best-daily-planner-app-in-2026-7-options-we-actually-tested/


### 4. Notes with checklists and templates

#### Primary: Google Keep (easiest)
- **Platforms:** Android, iOS, web, Wear OS and a Chrome extension.
- **Play Store:** 4.6★ from 2.58M reviews, **1B+ downloads**, updated 2026-09-14.
- **Why it's loved:**
  - Speed and simplicity. ClickUp: the "home screen widget opens a blank note without loading the app".
  - Notes can be text, checklist, voice (with transcription), photo or drawing.
  - **Checklists:** items can be **drag-reordered and indented** into sub-items, and ticked items drop to a bottom section. Hide/delete checked items is described by third-party guides **[unverified on official help]**.
  - Organisation: colour + background images, labels, pin, archive, reminders, collaboration.
  - Search covers text, voice transcripts and **text in images**.
  - A note can be sent to Google Docs. Grid or list layout.
  - Gemini can generate lists.
- **Copy and templates:**
  - "Make a copy" is in the note's ⋯ menu **[unverified — the official Keep help URL I tried 404'd]**.
  - **There are no real templates.** The usual workaround is a pinned "template" note that you copy.
- **Weaknesses:**
  - No templates or structure.
  - Takeout export is HTML/JSON that "most rival apps have no direct importer for" (ClickUp).
  - Some users complain about a recent UI redesign changing note width and font size (Play reviews).
- **Pricing:** free.
- **Ideas for Hemlo:**
  1. A **widget button that opens a blank note or checklist instantly**.
  2. **Drag-to-indent checklist items**, with ticked items auto-collapsing to the bottom.
  3. **Colour + label as the only required organisation**, so nothing has to be filed before writing.
  4. Add what Keep lacks: **"Save as template"** and **"New from template"** for notes and checklists, with an option to reset ticks when used.

#### Runner-up: Obsidian (templates done right)
- **Templates core plugin:** set a template folder, then "Insert template". Variables `{{title}}`, `{{date}}` and `{{time}}` support Moment.js formats such as `{{date:YYYY-MM-DD}}`. It works with **Daily notes**, which can auto-create today's note from a template.
- **Bases** core plugin: database-like views of notes (Table, List, Cards, Kanban, Map) with filters, sorts and **formulas**, all built on note properties.
- **Pricing:** free for personal and commercial use. Sync costs $4/mo (yearly) or $5/mo; Publish costs $8–10/mo.
- **Weaknesses:**
  - You have to assemble the system yourself.
  - Phone-to-laptop sync is a paid add-on (ClickUp).
- **Ideas for Hemlo:**
  - **Template variables** such as {date}, {weekday} and {title}.
  - **"Daily note from template" auto-created on first open of the day**, and attached to Today.

#### Also considered
- **Notion:** database templates and repeating templates; see section 7.
- **Samsung Notes:** Galaxy-only.
- **OneNote:** freeform canvas.

#### Sources
- Google Keep on Google Play — https://play.google.com/store/apps/details?id=com.google.android.keep&hl=en_US
- Computerworld: Google Keep cheat sheet (Apr 2026) — https://www.computerworld.com/article/1714705/google-keep-cheat-sheet-how-to-get-started.html
- ClickUp: 10 Best Note Taking Apps for Android 2026 (Aug 2026) — https://clickup.com/blog/note-taking-apps-for-android/
- Obsidian Help: Templates — https://obsidian.md/help/plugins/templates
- Obsidian Help: Bases — https://obsidian.md/help/bases
- Obsidian pricing — https://obsidian.md/pricing


### 5. Habits

#### Primary: HabitNow — Daily Routine Planner
- **Platform:** Android only.
- **Play Store:** 4.8★ from 92.9K reviews, 5M+ downloads, updated 2026-07-26.
- **Zapier's pick:** "Best for Android users" in its 5 best habit tracker apps.
- **Why it's loved:**
  - Very quick setup ("clear and intuitive interface … quick and painless", productivity-apps.com).
  - Daily, weekly, monthly and custom schedules.
  - **Habits and to-do tasks in one app.**
  - Built-in timer and Pomodoro.
  - Charts, stats and streak counters.
  - **Widgets.**
  - **Themes and icon customisation.**
  - App lock.
  - **One-time purchase** instead of a subscription.
- **Pricing:**
  - Zapier: free for up to 7 habits, $5.99 for unlimited.
  - productivity-apps.com: one-time IAP between €1.09 and €11.99, with the free cap at 5–6 habits **[conflict on cap]**.
- **Weaknesses:**
  - **No cross-device sync or cloud backup** (local; export/backup exists).
  - Widgets sometimes don't refresh after completing items.
  - Notification and alarm timing issues.
  - Paywall placement is the top complaint in reviews.
- **Ideas for Hemlo:**
  1. **Habits and tasks share one Today list** but keep separate streak and stat logic, which is HabitNow's core appeal.
  2. A **one-time "Pro" unlock** is a competitive pricing story against subscription apps.
  3. **Widget reliability is a differentiator.** Competitors' widgets go stale, so refresh widgets immediately on check-in, including from the widget itself.
  4. **Daily / weekly-count / monthly-count schedules**, e.g. "3× per week".

#### Runner-up: Loop Habit Tracker
- **Platform and price:** Android, Play + F-Droid. Free, open source (GPLv3), no ads, no account, offline.
- **Play Store:** 4.8★ from 63.4K reviews, 5M+ downloads. **Last updated 2025-09-14**, so maintenance is slow.
- **Loved for:**
  - A **habit strength score** that weighs consecutive completions *and* recovery after missed days, rather than a fragile streak.
  - Flexible frequency ("3 times weekly").
  - Detailed charts and home-screen widgets.
  - CSV/SQLite export.
  - 2sync names it the Android pick.
- **Weaknesses:**
  - Widget stability issues.
  - No sync.
- **Idea for Hemlo:** a **"strength %" alongside streaks**, so missing one day doesn't feel like losing everything.

#### Also considered
- **Habitify:** iOS, Android, macOS, web and Wear OS. 4.3★, 500K+ downloads. Groups habits by time of day, supports habit stacking, Google Fit/Strava integrations. Free tier is 3 habits; $49.99/yr or $119.99 lifetime. Reviewers complain about aggressive paywall prompts and a removed paid feature.
- **Streaks:** iOS only, $5.99 one-time.
- **Everyday:** not researched **[unverified]**.

#### Sources
- HabitNow on Google Play — https://play.google.com/store/apps/details?id=com.habitnow&hl=en_US
- productivity-apps.com: HabitNow review — https://productivity-apps.com/apps/habit-now-daily-routine-planner
- Zapier: The 5 best habit tracker apps — https://zapier.com/blog/best-habit-tracker-app/
- 2sync: 12 best habit tracking apps in 2026 — https://2sync.com/blog/best-habit-tracker-apps
- Loop Habit Tracker on Google Play — https://play.google.com/store/apps/details?id=org.isoron.uhabits&hl=en_US
- Loop Habit Tracker site — https://loophabits.org
- Habitify on Google Play — https://play.google.com/store/apps/details?id=co.unstatic.habitify&hl=en_US


### 6. Stats / personal dashboards / widgets

#### Primary: Exist.io
- **Platforms and price:** iOS, Android and web; one tier at $6.99/mo or $62.90/yr, 30-day trial.
- **Why it's loved:**
  - It **pulls data from 20+ services automatically**: Apple Health, Fitbit, Strava, **Todoist**, GitHub, Spotify, weather and more.
  - It adds a daily mood rating and runs **automatic correlations**, e.g. "What makes me happiest?".
  - The dashboard shows the top correlations. A user write-up says this motivated real behaviour change: "my mood increases when I bother to get out of the house".
- **Custom tracking:**
  - Attribute types: Quantity, Decimal, Duration, Scale 1–9, Time of day, Percentage, plus custom tags.
  - Quantity and duration default to 0 when nothing is logged.
  - New attributes are created from "Track something new" on the Review tab.
  - It needs several weeks of data before correlations become meaningful.
- **Weaknesses:**
  - It does not build arbitrary charts or pivots.
  - Coverage depends on integrations; for example, the user write-up notes no YouTube Music integration.
  - Power users script the API to fill gaps.
  - Native home-screen widgets are not confirmed **[unverified]**.
- **Ideas for Hemlo:**
  1. A **correlation card** ("On days you trained, mood +0.8"). Hemlo already owns tasks, habits and custom fields, so it can compute this with no integrations.
  2. **Typed attributes with sensible defaults**: count/duration default to 0, while scales stay empty when not logged so averages aren't distorted.
  3. A **"Review" tab** that collects everything that needs a daily manual log in one place.
  4. An **open API / import** so power users can push their own data in.

#### Runner-up: Daylio
- **Platforms and Play Store:** Android and iOS. 4.7★ from 442K reviews, 10M+ downloads, updated 2026-09-29. 20M+ users since 2015.
- **Loved for:**
  - **Two-tap logging**: pick a mood, then tap activity icons.
  - The **"Year in Pixels"** grid.
  - Weekly, monthly and yearly stats with activity↔mood correlations.
  - Goals and habits, writing templates, themes, PIN lock.
  - Local-first data with Google Drive backup; PDF/CSV export.
- **Price:** free with Premium IAP (amount not shown).
- **Ideas for Hemlo:**
  - A **Year-in-Pixels heatmap for any metric** (habit done, mood, a custom field).
  - **Icon-grid logging** instead of forms.

#### Gap no competitor fills well
- None of the stats apps offers **pivot-table-style, user-configurable stats templates**.
- The closest are spreadsheet pivots (**not available in the Google Sheets Android app**; see section 8), Notion's Chart view, and Memento's aggregation and chart widgets (section 7). This is a real differentiator for Hemlo: "pick a module → group by field/period → aggregate (sum/avg/count/streak) → chart type → pin as widget".

#### Also considered
- **Bearable:** iOS and Android (4.6★ on Play). Health, symptom and mood tracking with 30+ report types and experiments. Premium is $34.99/yr. It is health-centric, so a weaker fit for a general planner.
- **Gyroscope:** iPhone-first plus a Chrome extension and desktop beta, **no Android**. AI health coaching.
- **Nomie:** left the app stores and is now open source (Nomie 6 OSS on GitHub), so it is not a current consumer competitor.

#### Sources
- Exist homepage — https://exist.io
- Exist: Manual tracking help — https://exist.io/page/help-manual-tracking/
- James Leighton: My Life Tracking Setup using Exist.io (2024) — https://www.jamesleighton.com/2024/09/my-life-tracking-setup-using-existio/
- Daylio on Google Play — https://play.google.com/store/apps/details?id=net.daylio&hl=en
- Daylio homepage — https://daylio.net
- Bearable homepage — https://bearable.app
- Gyroscope homepage — https://gyrosco.pe
- Nomie 6 OSS (GitHub, search result only — not opened) — https://github.com/dailynomie/nomie6-oss


### 7. Custom modules / build-your-own tracker

#### Primary: Memento Database
- **Platforms:** Android, iOS, Windows, macOS and Linux. The mobile apps work fully offline and sync through Memento Cloud.
- **Play Store:** 4.6★ from 29.3K reviews, 1M+ downloads, updated 2026-07-04.
- **Why it fits Hemlo best:**
  - **Fields:** 20–30+ field types, including text, number, date, files, location, barcode, NFC, calculations and relations between libraries.
  - **Views:** List, Cards, **Table**, Map, **Calendar** and Gallery.
  - **Analysis:** grouping, filters and **aggregation** with **charts**.
  - **Dashboards** combine several libraries using four widget kinds: **Aggregation** (sum/avg), **Chart** (bar/line/pie), **List** and **Script** (JavaScript UI). The dashboard layout itself does **not** sync between devices.
  - Separate **home-screen entry widgets** exist (help page "Entries list widget" — title only seen).
  - **Templates:** "thousands" of ready-made library templates.
  - **Power features:** no-code automation rules, JavaScript, SQL, Google Sheets sync, CSV import/export, AI assistant.
- **Weaknesses:**
  - Steep learning curve, and import/export is described as complex (Play reviews).
  - The free tier is limited to 3 cloud libraries, which reviewers call "useless if you can only use/import 3 libraries" (unlimited local libraries on mobile are free).
  - It looks like a database rather than a planner.
- **Pricing (G2):**
  - Free: 3 libraries, 100MB, 200 AI credits/mo.
  - Lite: $4/mo.
  - Team: $6/mo.
  - Pro: $8/mo.
  - Pro Plus: $12/mo.
- **Ideas for Hemlo:**
  1. A **module builder with typed fields** (number, duration, rating, select, checkbox, date, relation) plus **view switching** (table / board / calendar / chart) on the same data.
  2. **Aggregation and chart widgets bound to a module**, usable both in-app on a dashboard and as **Android home-screen widgets**. Fix Memento's weakness by syncing the dashboard layouts too.
  3. **Start-from-template gallery** for modules (e.g. Workouts, Reading log, Expenses, Meals).
  4. Hide the power features (scripts, SQL) entirely. Hemlo wins on *easy*, so offer "smart defaults" instead of formulas.

#### Runner-up: Notion (databases)
- **Views:** Table, Board, Timeline, Calendar, List, Gallery, **Chart** (bar/line/donut) and Form, with grouping and sub-grouping.
- **Database templates** pre-set properties and content.
- **Repeating templates** auto-create a page daily, weekly, monthly or yearly at a chosen start time. Nesting is not allowed inside daily repeats; the maximum nesting depth is 3.
- **Mobile widgets** (Android and iOS) are only Page, Favorites, Recents and AI shortcuts, **with no live database or chart widget**. A third-party app, NotiZen, exists to fill this gap (search result, not opened).
- **Pricing:** Free / Plus $10 / Business $20 per member per month. Full AI is now on Business.
- **Offline:** offline editing exists on desktop and mobile, but only the first 50 database rows download automatically, and buttons, forms and embeds don't work offline.
- **Weaknesses:** slows down with large databases, real learning curve (smartremotegigs, Aug 2026).
- **Idea for Hemlo:** **repeating templates** (e.g. auto-create "Weekly review" every Sunday) as a first-class repeat type.

#### Also considered
- **Airtable:** Free / Team $20 / Business $45 per user per month (yearly). Team-oriented and overpriced for personal use.
- **Tap Forms:** Apple-only **[not opened; unverified]**.
- **Collections:** not researched.

#### Sources
- Memento Database on Google Play — https://play.google.com/store/apps/details?id=com.luckydroid.droidbase&hl=en_US
- Memento Database homepage — https://mementodatabase.com
- Memento Database FAQ — https://mementodatabase.com/faq.html
- Memento help: Widgets Overview — https://help.mementodatabase.com/?ht_kb=widgets-overview
- Memento help: Dashboard — https://help.mementodatabase.com/?ht_kb=dashboard
- G2: Memento Database pricing — https://www.g2.com/products/memento-database/pricing
- Notion Help: Views, filters & sorts — https://www.notion.com/help/views-filters-and-sorts
- Notion Help: Database templates — https://www.notion.com/help/database-templates
- Notion Help: Mobile widgets — https://www.notion.com/help/mobile-widgets
- Notion pricing — https://www.notion.com/pricing
- Airtable pricing — https://www.airtable.com/pricing


### 8. Whole app — closest overall match

#### Verdict: Notion (configured as a "Life OS") is the closest match; Google Sheets/Excel is the "freedom" benchmark; Memento Database is the closest Android-native analogue

| Criterion (Hemlo) | Google Sheets / Excel | Notion (Life OS) | Memento DB | Exist.io | Bearable |
|------------------|-----------------|-------------------------|------------------|-------------------|-------------|
| Today / daily view | ✗ (manual) | ◐ (via templates, filtered views) | ◐ (calendar view) | ✗ | ✗ |
| Week / month / year plan | ✗ | ◐ (Calendar, Timeline) | ◐ (Calendar) | ✗ | ✗ |
| Tasks with repeats | ✗ | ◐ (repeating templates) | ◐ (automation) | ✗ | ✗ |
| Habits | ◐ (checkbox grids) | ◐ (template databases) | ◐ | ◐ (as attributes) | ◐ |
| Free-form custom modules / fields | ✓✓ (anything) | ✓ (databases + 8 view types) | ✓ (30+ field types) | ◐ (typed attributes) | ◐ (custom factors) |
| Pivot-style configurable stats | ✓✓ (pivot tables, **web/desktop only — not on Sheets Android**) | ◐ (Chart view, group-by) | ✓ (aggregation and chart widgets) | ◐ (fixed correlations) | ◐ (30+ fixed reports) |
| Home-screen stats widgets | ✗ | ✗ (only page/recents/favourites/AI widgets) | ✓ (aggregation and chart widgets) | ? | ? |
| Easy on a phone | ✗ | ◐ (learning curve, slow with large databases) | ◐ (steep) | ✓ | ✓ |

✓ = covered, ◐ = partial/workaround, ✗ = missing, ? = not verified.

#### Why Notion is the closest
- People already build exactly Hemlo's module set in Notion Life OS templates: **tasks/projects, habits, journal, goals, finance and dashboards** in one workspace.
- It offers the same kind of freedom: user-defined databases with table, board, calendar, timeline and chart views, plus repeating templates.
- The market proves the demand: there are many free and paid Life OS templates, with bundles around $99 (pathpages, May 2026).
- Its weaknesses are exactly Hemlo's opportunity:
  - "customization paralysis" and "a cluttered Notion Life OS defeats its purpose" (pathpages);
  - a learning curve and slowness with large databases (smartremotegigs);
  - no real Android database or stat widgets;
  - partial offline support.

#### Why not Sheets/Excel as the primary match
- They are the purest example of *freedom*: any field, formula and pivot.
- But they have no planner semantics: no dates-as-agenda, no reminders, no repeats, no widgets.
- Crucially, **pivot tables cannot be created or edited in the Google Sheets Android app**. Google's help says to use a computer.
- Sheets "Tables" (typed columns such as dropdown, checkbox, date and rating, plus "Group by" views with Sum/Count/Average) are the closest spreadsheet idea to Hemlo's module builder and are worth copying.
- Treat Sheets as Hemlo's **stats-engine reference** (group by, aggregate, pivot), not as the product it resembles.

#### Why not Memento, Exist or Bearable
- **Memento** has the closest feature set on Android (custom databases, views, aggregation and chart widgets) but is a database tool with no planner or Today semantics, and it is hard to learn.
- **Exist** and **Bearable** match only the Stats/insights module.

#### Positioning line for Hemlo
"Notion-level freedom and spreadsheet-level stats, with the speed of Keep and Structured on an Android home screen."

#### Other apps from the brief (not chosen)
- **Amie, Akiflow, Motion, Routinery, Fabulous:** not opened in depth.
- **Motion and Akiflow** are pricey desktop-first AI schedulers ($29/mo and ~$19/mo per Toolfinder).
- **Routinery and Fabulous** are routine/coaching apps, closer to Habits than to the whole app **[unverified]**.

#### Sources
- Google Sheets Help (Android): pivot tables — https://support.google.com/docs/answer/1272900?hl=en&co=GENIE.Platform%3DAndroid
- Google Sheets Help: Tables in Google Sheets — https://support.google.com/docs/answer/14239833?hl=en
- Android Police: How to create a pivot table in Google Sheets — https://www.androidpolice.com/how-to-create-a-pivot-table-in-google-sheets/
- Pathpages: The 15 Best Notion Life OS Templates of 2026 (May 2026) — https://pathpages.com/blog/notion-life-os
- Smart Remote Gigs: Notion Review 2026 (Aug 2026) — https://smartremotegigs.com/notion-review/
- Notion Help: Working offline — https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know
- Notion Help: Mobile widgets — https://www.notion.com/help/mobile-widgets
- Notion Help: Views, filters & sorts — https://www.notion.com/help/views-filters-and-sorts
- Memento Database FAQ — https://mementodatabase.com/faq.html
- Exist homepage — https://exist.io
- Bearable homepage — https://bearable.app
- Toolfinder: Best Daily Planner Apps 2026 — https://toolfinder.com/best/daily-planner-apps


### Cross-cutting patterns Hemlo should adopt (summary)

1. **Duplicate / copy:**
   - Long-press on a day lets you copy the day, choose what kinds of items to include, and paste into many days. Structured has this on iOS only.
   - A per-item "Duplicate" opens a pre-filled editor.
   - An explicit **"include notes / checklist (reset ticks) / reminders"** option. Todoist silently drops comments and completed sub-tasks.
2. **Templates everywhere:**
   - Note templates with variables ({date}, {title}), as in Obsidian.
   - Repeating templates (Notion).
   - Learned event templates (Business Calendar 2).
   - Inbox "template tasks" (Structured).
3. **Long-press as the power menu:** long-press a date to copy or paste; long-press an item to multi-select, duplicate or move. Swipe right to complete and swipe left to delete or reschedule, made configurable as in Todoist's settings.
4. **Widgets as a selling point:**
   - Competitors' widgets are weak or stale: Notion has no database widgets, Tiimo Android has none yet, and HabitNow and Loop widgets fail to refresh.
   - Hemlo should ship quick-add, Today list, habit check-in and **stat/chart widgets** that update instantly.
5. **Customisation as delight:** TickTick has 40+ themes, Business Calendar 2 has 22 app themes and 14 widget themes, and HabitNow has themes and icons. Alternate app icons were not verified for any of these apps **[unverified]**.
6. **Pricing:** the market rewards a **one-time unlock** (HabitNow, Streaks, Structured lifetime) or low annual pricing. Subscription-only plans with tight free caps (Habitify's 3 habits, Memento's 3 cloud libraries) are the top source of complaints.



# Appendix B. Research notes: life modules and usability

Reproduced in full from the research of 1 October 2026, with its sources.


Researched 2026-10-01. Every source listed under "Sources" was opened during this session. Anything marked **[UNVERIFIED]** comes from general knowledge or a page that didn't render, and should be checked before you rely on it. Play Store ratings and download counts were read off the listing pages on the research date and will drift.


### TL;DR: the 10 decisions that matter most

1. **Today = do, Plan = arrange.** Today is a *filter* (Things: "a filter across the entire app") showing only what is due, scheduled or pinned for today, and you act on it by ticking, logging or starting a timer. Plan is the only place where you drag, reschedule, set recurrences, use the backlog or apply templates. Today never shows future days, and Plan never asks you to tick things off (it shows status only).
2. **Keep 4 bottom tabs plus 1 "Modules" hub.** Use Today · Plan · [user-pinned module] · Stats, plus a Modules hub (grid) that holds every other module as a spoke. Android docs say a nav bar is for "three to five destinations of equal importance". NN/g calls a hub good for task-based apps, with the cost of "an extra step back to the hub".
3. **Use a pinned-cards home (Apple Health "Pinned", Exist's "pin four attributes", Google Health "focus tiles").** Today shows at most 4–6 pinned module cards, which the user picks in an Edit mode with **drag-to-reorder** (Google Health users complain they can't reorder). Never inject promo or "insight" cards that come back after the user removes them. That is the main Samsung Health complaint.
4. **Use one shared scheduling engine for tasks, chores, habits, supplements, training and study.** Model it as RFC 5545 RRULE plus Hemlo extras: completion-based repeats ("every! 3 days" as in Todoist), flexible or condition-based chores (Tody), assignee rotation (Homsy), and "easy days" (Anki). Show it as one shared "Repeat" sheet with chips: Daily · Weekdays · Weekends · Specific days · Every N days/weeks · Monthly (date / nth weekday) · Specific dates · After completion.
5. **The FAB opens a context-aware chooser.** On Today, it opens a Material 3 FAB menu (2–6 items: Task, Meal, Log, Note, Expense, …) ordered by the user's own frequency. Each item opens a short bottom sheet with **Recent · Frequent · Saved (meals/templates) · Search · Scan** tabs, plus "Copy from yesterday / another day".
6. **Long-press is a shortcut only.** Long-press enters multi-select (contextual action bar: Move, Copy to day, Duplicate, Delete, Select all, Undo) or opens a short context menu. Every long-press action must **also** be in a visible ⋮ menu (NN/g, Apple HIG) and exposed via `onLongClickLabel` / accessibility custom actions.
7. **Stats work like a "pivot-lite" builder.** Pick a Metric (sum/avg/count/streak) × Group by (day/week/month/module/tag/member) × Filter × Compare-with (Bearable-style overlay), then Save as a stats template card. Ship 6–8 ready-made templates and require nobody to build their own (NN/g: users rarely customise).
8. **Offer colours in 3 tiers.** Follow system (Material You, Android 12+) / pick a seed colour / curated palettes. Generate schemes with `@material/material-color-utilities` (TypeScript, works in a WebView), and auto-check WCAG 2.2 AA: 4.5:1 for text and 3:1 for UI and graph strokes.
9. **App icon: a monochrome layer is required, and 3–6 bundled alternates are optional.** Add the `<monochrome>` layer to the adaptive icon (Android 13+ themed icons). Alternate icons use `activity-alias` via `@capacitor-community/app-icon` (Android support is in that repo's docs), with up-front warnings that the launcher may take a few seconds to update and may drop pinned shortcuts.
10. **Onboarding: pick a template, then optionally tweak modules.** Start with a 1-screen "What do you want Hemlo for?" (Student / Fitness / Household / Money / Everything-lite), which switches on 3–5 modules and seeds their cards. Everything else stays off but is discoverable in the Modules hub. Every empty module gets an empty state with a one-tap "Create / Import template" button.


## Part A: Competitors per module

### A1. Learning / study → **Primary: AnkiDroid (Anki)** · Runner-up: **Forest** (study-time tracking)

**Why chosen:** for "plan/track study time + spaced repetition", AnkiDroid is the strongest SRS engine on Android and is completely free. Forest is the best-loved *time-tracking* companion. Hemlo needs ideas from both: Anki's scheduling and Forest's low-friction focus timer.

| | AnkiDroid | Forest |
|------------------|-------------------------------------------|--------------------------------------------------|
| Rating / installs | 4.8★ (165k+ reviews), 10M+ | 4.5★ (770k+), 10M+, Google Play Best App / Editors' Choice |
| Price | Free, no ads/IAP (AnkiMobile iOS $24.99 one-time) | Free with ads/IAP; Forest Plus subscription |
| Loved for | FSRS scheduler, offline, free AnkiWeb sync, huge shared-deck library | Gamified focus timer, allow-list app blocker, **custom tags** (Study/Work/Exercise), weekly/monthly/yearly stats |
| Weaknesses | "Deck list looks like a spreadsheet", confusing settings, needs days to weeks before it "clicks" | Login/crash bugs after updates; little customisation of the stats view |

**Relevant scheduling patterns (Anki manual):**
- **Desired retention** (default 90%). FSRS schedules each card for a target recall probability. Higher retention means more reviews, and the manual warns against going above 97%.
- **Daily limits:** new cards/day and max reviews/day. These are caps so a backlog never floods a day.
- **Easy Days:** "If you want to spend less time on Anki on some days of the week, such as Sundays…". Reduces the load on chosen weekdays.

**Ideas to borrow for Hemlo Learning:**
1. **Study items with a review schedule.** Any learning item (topic, chapter, flashcard set) gets a "Review" toggle that uses expanding intervals (1-3-7-14-30 days, or FSRS-lite later) and shows up in Today as "3 reviews due". Don't build a full flashcard app. Link out to or import from Anki (`.apkg` → [UNVERIFIED feasibility], CSV for sure).
2. **Daily caps + Easy Days** at module level: "max 30 min new material/day", "lighter on Sat/Sun". The same "Easy Days" concept can be reused by Training and Household (see A5).
3. **Forest-style focus timer with tags** that logs study time directly into Learning stats (minutes per subject per week), with a one-tap start from the Today card.
4. **Weekly target per subject** ("Dutch 3 h/week") shown as a progress ring. Plan distributes it into suggested blocks, and Today shows only today's block.

Sources: [AnkiDroid – Google Play](https://play.google.com/store/apps/details?id=com.ichi2.anki&hl=en) · [AnkiDroid Review 2026 – flashcard-maker.cc](https://flashcard-maker.cc/blog/ankidroid-review/) · [Anki Manual – Deck Options](https://docs.ankiweb.net/deck-options.html) · [Forest – Google Play](https://play.google.com/store/apps/details?id=cc.forestapp&hl=en)


### A2. Agenda / calendar sync → **Primary: Google Calendar (Android)** · Runner-up: **Business Calendar 2**

**Why chosen:** Google Calendar is the easiest option and the system of record for Google sync (4.6★, 4.8M reviews, 10B+ installs, free). Business Calendar 2 (4.6★, 273k reviews, 10M+) is the best power-user layer on top of the same sync. Users of Hemlo's Agenda module will compare it against both.

**Google Calendar: loved for / relevant**
- Month/week/day views, Gmail auto-events, Wear OS tiles, widgets, colour-coding.
- **Tasks inside the calendar (Nov 2025):** you can block time for a Google Task, and "it stays in your Tasks list and reminders still fire". Weakness: Tasks deadlines can't have a precise time (Android Central).
- Recurrence follows **RFC 5545 RRULE** (FREQ, INTERVAL, BYDAY, COUNT, UNTIL), with single-instance *exceptions*. Recurring series are capped at 730 occurrences.

**Business Calendar 2: loved for / relevant**
- Syncs Google, Outlook, Exchange, CalDAV, plus Google Tasks and Microsoft To Do.
- Week planner shows **any 1–14 days**. A **heat map** finds free slots. Can quickly hide calendars ("focus on work, family or private").
- Multi-select events to move/copy/delete in bulk. 7 widgets, 22 themes, up to 5 reminders per event.
- Weaknesses: moved from one-time purchase to subscription (review backlash), and some reports of "disappearing events" blamed on sync.

**Pricing:** Google Calendar is free. BC2 is freemium with a Pro subscription (themes, weather, PDF print, recurring tasks with subtasks).

**Ideas to borrow:**
1. **Treat the agenda as a read/write overlay on Google, not a separate calendar.** Show Google events read-only in Today (Things also shows "today's events at the top"). Plan time-blocks Hemlo tasks *into* the calendar as events or tasks, the same model Google now uses.
2. **Store all recurrence as RRULE + exceptions** (the same as Google) so sync round-trips losslessly. Edit "this occurrence / this and following / all".
3. **Variable-width week (1–14 days) and a free-time heat map** in Plan. Show a "busy-ness" bar per day so the user can see where a chore or study block fits.
4. **Calendar visibility chips** (Work / Family / Personal) that hide calendars with one tap, without unsubscribing.

Sources: [Google Calendar – Google Play](https://play.google.com/store/apps/details?id=com.google.android.calendar&hl=en_US) · [Android Central – Google Calendar tasks feature (18 Nov 2025)](https://www.androidcentral.com/apps-software/google-calendars-new-task-feature-is-the-productivity-upgrade-you-actually-need) · [Google Calendar API – Events & recurrence](https://developers.google.com/workspace/calendar/api/concepts/events-calendars) · [RFC 5545 §3.3.10 RRULE](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10) · [Google Calendar Help – repeating events (Android)](https://support.google.com/calendar/answer/37115?hl=en&co=GENIE.Platform%3DAndroid) · [Business Calendar 2 – Google Play](https://play.google.com/store/apps/details?id=com.appgenix.bizcal&hl=en) · [Business Calendar 2 – productivity.directory](https://productivity.directory/business-calendar-2)
*The help page didn't list the custom-repeat UI options (Google Calendar's "Custom: every N days/weeks on Mon/Wed…, monthly on day X or 4th Tuesday, ends never/on date/after N") → **[UNVERIFIED wording]**. The RRULE spec does cover these.*


### A3. Projects → **Primary: Todoist** · Runner-up: **Trello**

**Why chosen:** Todoist (4.7★, 290k reviews, 10M+) is the easiest projects tool on Android that *also* solves Today vs Upcoming, which is Hemlo's exact problem. Trello is the best pure board (kanban).

**Todoist: loved for / relevant**
- Projects → sections → tasks → sub-tasks, with **list / board / calendar layouts** of the same project (calendar layout is Pro).
- **Natural-language Quick Add** ("every mon, fri at 20:00") and voice "Ramble".
- **Recurring grammar** (the best reference for Hemlo's repeat sheet):
  - `every day`, `every weekday` (Mon–Fri), `every other week`, `every 3 workdays`, `every 2 weeks`
  - `every mon, fri`, `every 2, 15, 27` (dates of the month), `every 1st wed jan`, `every last workday at 3pm`
  - **`every!`**: completion-based ("next date … after the day you completed the task")
  - Bounds: `starting on aug 3`, `until aug 3`, `for 3 weeks`, `from 10 May until 20 May`
- Today = "every task scheduled for today across all your projects". Only dated tasks appear in Today/Upcoming.
- Weaknesses (Play reviews): weak reminders (users want full-screen alarms), recurring tasks occasionally vanish, setting dates on routines takes several steps, can't move a section between projects, can't multi-select labels at creation.
- **Pricing:** Free (5 projects, 3 filters, list+board); Pro $4/mo yearly (300 projects, calendar layout, durations, reminders); Business per seat.

**Trello: loved for / relevant**
- Pure kanban boards, checklists inside cards, Power-Ups. Free: 10 boards/workspace, 250 automation runs/mo. Standard $5/user/mo (unlimited boards, **collapsible lists, advanced checklists**). Premium $10 (Calendar, Timeline, Table, Dashboard views).
- Weakness for Hemlo-style use: the paywall gates non-board views, and it's team-oriented.

**Ideas to borrow:**
1. **One project, three layouts** (List · Board · Timeline) as a toggle, not three modules. A project's tasks are ordinary Hemlo tasks, so they appear in Today when dated, which avoids a separate "project tasks" silo.
2. **Natural-language date and repeat parsing** in the quick-add field (start with English patterns from the Todoist list above), with chips shown under the input as live preview.
3. **Checklists inside items with a progress chip** ("3/7") and collapsible sections (Trello Standard). Expand inline on tap, no new screen.
4. **Project templates** (Move house, Exam prep, Product launch) whose dates are *relative* to a start date. **[UNVERIFIED: Todoist's template help page didn't render, so relative-date behaviour wasn't confirmed]**.

Sources: [Todoist – Google Play](https://play.google.com/store/apps/details?id=com.todoist&hl=en) · [Todoist – Introduction to recurring dates](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV) · [Todoist – Today view](https://www.todoist.com/help/articles/plan-your-day-with-the-todoist-today-view-UVUXaiSs) · [Todoist – Pricing](https://www.todoist.com/pricing) · [Trello – Pricing](https://trello.com/pricing)


### A4. Finance / budgeting (EU) → **Primary: Wallet by BudgetBakers** · Runner-up: **Monefy** (manual, fastest entry)

**Why chosen:** Wallet is EU-based (Prague) with the broadest EU bank sync, GDPR/PSD2 and a strong Android rating (4.7★, 378k reviews, 10M+). Monefy is the "easiest" manual tracker. YNAB was rejected as primary: it's USD-only ($14.99/mo or $109/yr), syncs selected banks in only 18 European markets, has 24–72 h import delays and is English-only (Bilance comparison).

**Wallet: loved for / relevant**
- Bank sync: "more than 5,000 institutions across the EU and UK" via the Salt Edge aggregator (Finny). Bilance says 15,000+ banks worldwide. **Netherlands is listed** as covered.
- Budgets, **planned payments / bill reminders**, shared family accounts with access levels, 150+ currencies, investments, CSV/XLS/OFX import.
- **Lifetime one-time premium** option (Play listing), plus ~€4.49/mo subscription (Finny).
- Weaknesses: free tier is mostly manual. Budgets and planned payments aren't in the web app, and recurring payments must be entered by hand (Bilance). Users can't delete or rename *top-level* categories, only subcategories (Play reviews). Feature density "may overwhelm" (Finny).

**Monefy: loved for**
- A one-screen pie chart with category buttons gives the fastest possible expense entry, plus a widget. 4.1★, 194k reviews, 10M+.
- Weaknesses: no bank sync at all, aggressive upgrade prompts.

**Spendee** (mention): sync across all EU countries (2,500+ providers), but auto-categorisation is premium-only.

**Ideas to borrow:**
1. **Monefy-speed entry:** amount keypad first → category grid (recent first) → done. 2 taps for 90% of entries. Put the advanced fields (account, tags, notes, split) behind "More" (progressive disclosure).
2. **Planned payments in Today and Plan:** recurring bills use the shared scheduling engine (monthly on day X, every N months, nth weekday). They appear in Today as "Rent due – mark paid" and in Plan as a month cash-flow strip.
3. **Fully editable categories, including top-level ones** (fixes Wallet's most-cited complaint), plus EUR-first with optional multi-currency per account.
4. **Bank sync later, via import first:** start with CSV import from Dutch/Lithuanian banks (ING, Rabobank, ABN AMRO, Revolut CSVs **[UNVERIFIED column formats]**). A PSD2 aggregator (Salt Edge / GoCardless Bank Account Data **[UNVERIFIED current pricing/availability]**) only if there's demand. Price parity matters: Wallet's lifetime option is loved.

Sources: [Wallet – Google Play](https://play.google.com/store/apps/details?id=com.droid4you.application.wallet&hl=en) · [Finny – Wallet by BudgetBakers Review 2026](https://getfinny.app/blog/wallet-budgetbakers-review-2026) · [Bilance – Best budgeting apps in Europe (2026)](https://www.bilanceapp.com/blog/best-apps-europe) · [YNAB – Pricing](https://www.ynab.com/pricing) · [Monefy – Google Play](https://play.google.com/store/apps/details?id=com.monefy.app.lite&hl=en)
*Note: Bilance and Finny are competitor blogs, so their numbers may be biased.*


### A5. Household chores → **Primary: Sweepy** · Runner-up: **Tody**

**Why chosen:** Sweepy (4.5★, 18k reviews, 1M+) is the easiest *shared-household* chore app on Android: it auto-generates a daily schedule per member and has leaderboards. Tody (4.7★, 21.5k, 1M+) has the best-loved *flexible* scheduling model. **OurHome** has had no updates since 2022 (ChoreSplit), so avoid it as a benchmark. **Homsy** is the only app found with true **automatic rotation** ("so nobody receives the same task consecutively").

| | Sweepy | Tody |
|---------------|---------------------------------------------|--------------------------------------------------|
| Model | Rooms → tasks → frequency; per-room "cleanliness decay score"; **Smart Schedule** auto-generates each member's daily list (Premium) | **Indicator / condition-based**: each task has an interval, and a green→red bar shows how "due" it is; no penalties for missing dates; "Just did it" retroactive; **vacation mode** |
| Multi-user | Assign to members, leaderboard, coins | Members "check in to claim credit"; FairShare (2025) visualises balance |
| Pricing | Free (1 user); Premium $12.99–19.99/yr (sources disagree) | Free (1 device); Solo ~$9.99/yr; Duo/Family ~$18–25+/yr |
| Weaknesses | Setup questionnaire "somewhat overwhelming"; daily lists can overload if not calibrated; **rotation is "limited"**; no shopping/calendar | "Days overdue" label feels too harsh; no AM/PM split; sync and sharing now paid; condition-based doesn't suit people who want fixed days |

**Scheduling patterns Hemlo should support (combine all three schools):**
- **Fixed** (calendar-style, RRULE): specific weekdays (Mon/Thu), weekends only (Sat+Sun), weekdays only, every N days/weeks, monthly on date / nth weekday, specific one-off dates.
- **Flexible / condition-based** (Tody): "every ~7 days" with a due-ness bar that *never shows as failed*, just more urgent. Completing it resets the timer (= Todoist `every!`).
- **Rotation** (Homsy): assignee list [E, Partner] with modes *alternate each occurrence* / *alternate each week* / *least-recently-done* / *fixed*. Skipping passes the chore to the next person.
- **Load balancing** (Sweepy Smart Schedule + Anki Easy Days): a "max chores per day" cap and "light days" (e.g., none on Fri). Flexible chores get distributed across non-light days.

**Ideas to borrow:**
1. **Rooms/areas as grouping plus a due-ness bar** per chore (Tody). In Today, show only "due today + overdue flexible chores", capped at N per day.
2. **Rotation built into the repeat sheet**: "Assign: Rotate between E → Partner (each time)". Show the next assignee in Plan.
3. **Friendly overdue language** ("getting dusty", not "5 days overdue") and **vacation / pause mode** for the whole household module.
4. **Starter packs** (Studio flat / Family house) seed rooms and default frequencies, avoiding Sweepy's long setup questionnaire. Users then remove what they don't need.

Sources: [Sweepy – Google Play](https://play.google.com/store/apps/details?id=app.sweepy.sweepy&hl=en) · [Common Sense Media – Sweepy review](https://www.commonsensemedia.org/app-reviews/sweepy-home-cleaning-schedule) · [OneHaus vs Sweepy (2026)](https://onehaus.app/compare/haus-vs-sweepy) · [Tody – Google Play](https://play.google.com/store/apps/details?id=com.looploop.tody) · [Tidied – Tody App Review](https://www.tidied.app/blog/tody-app-review) · [Homsy – Best Chore Chart Apps 2026](https://gethomsy.com/blog/comparisons/best-chore-chart-apps-2026) · [ChoreSplit – What happened to OurHome](https://choresplit.com/compare/ourhome)
*OneHaus, Homsy and ChoreSplit are competitors writing comparisons, so treat their claims about rivals with caution. Sweepy's "specific weekday" support wasn't confirmed: **[UNVERIFIED]**.*


## Part B: UX research

### B1. Progressive disclosure, hub vs spoke, calm home screens

**Findings**
- **Progressive disclosure** "defers advanced or rarely used features to a secondary screen". Decide what goes first using frequency-of-use data and testing. **Designs beyond 2 disclosure levels "typically have low usability"** (NN/g).
- Complex apps: "Every extra unit of information in an interface competes with the relevant units of information." Accelerators (shortcuts) serve experts without cluttering things for novices (NN/g, 10 heuristics for complex apps).
- **Navigation:** tab bars work for ≤5 options. A **navigation hub** suits task-based apps but "devotes the homepage exclusively to navigation… and incurs an extra step (back to the hub)" (NN/g). Android: a nav bar is for "three to five destinations of equal importance".
- **Calm homes via pinning:**
  - Apple Health Summary: "Your Pinned list shows how you're doing in each health category that day… To add or remove a category from your Pinned list, tap it."
  - Exist (2025 redesign): "pin four attributes to the top of your Home tab".
  - Google Health (2026) "focus tiles": add/remove via Edit, 6 small or 2 large per page. Complaint: "no way to reorder the tiles without removing them all".
  - Notion Home: sections can be reordered (Move up/down), hidden, and given an item count.
- **Anti-patterns:** Samsung Health users hate home cards they can't remove permanently ("Insights" cards "will return… whether you want them or not"). The Fitbit → Google Health redesign drew backlash for *removing* features, wasting white space, and forcing migration without a choice.

**Recommendations for Hemlo**
1. **Information architecture:** bottom bar = **Today · Plan · ⟨Pinned module⟩ · Stats · Modules**. The Modules tab is a hub grid of all enabled modules, ordered by usage, with long-press → "Pin to bar / Pin to Today / Hide". Each module is a spoke with its own top-level screen (≤2 disclosure levels: module list → item detail).
2. **Today home = pinned cards only.** Default is 4 cards, max ~6, with an "Edit Today" mode for add/remove/**drag-reorder**, a size toggle (compact/large), and a "Show on: weekdays / weekends / always" setting per card. A card only ever disappears or appears because the user said so.
3. **Every module card shows one glanceable number + one primary action** ("Protein 82/140 g · +Add meal", "3 chores due · Start"). Detail lives inside the module.
4. **"Without losing function" migration rule:** nothing is removed. Rarely used actions move to an overflow (⋮) or "More options" expander. Run a one-time "What's new" tip that points to where things moved, and keep a "Classic layout" toggle for 1–2 releases (lesson from the Google Health backlash).
5. **Measure it:** add local usage counters per action and module (privacy-friendly) to decide what gets promoted to level 1, as NN/g's frequency-of-use advice suggests.

Sources: [NN/g – Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [NN/g – 10 Usability Heuristics Applied to Complex Applications](https://www.nngroup.com/articles/usability-heuristics-complex-applications/) · [NN/g – Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/) · [Android Developers – Navigation bar (Compose)](https://developer.android.com/develop/ui/compose/components/navigation-bar) · [Apple Support – Use the Health app](https://support.apple.com/en-ie/HT203037) · [Exist – Our 2025 redesign](https://exist.io/blog/exist-2025-redesign/) · [Android Central – Customizing the new Google Health app (1 Jun 2026)](https://www.androidcentral.com/wearables/fitbit/i-made-the-new-google-health-app-my-own) · [Notion Help – Home & My Tasks](https://www.notion.com/help/home-and-my-tasks) · [Samsung Community – customize Health home screen thread](https://us.community.samsung.com/t5/Samsung-Apps-and-Services/Samsung-Health-remove-Interests-and-allow-us-to-customize-the/td-p/2939285/page/2) · [PiunikaWeb – Google Health app backlash (25 May 2026)](https://piunikaweb.com/2026/05/25/google-health-app-fitbit-backlash-missing-features-ui-changes/)
*Material 3 navigation pages (m3.material.io) are JavaScript-only and couldn't be read. The Android Developers page was used instead.*


### B2. Today (doing) vs Plan (arranging)

**How the leaders split it**
| App | "Doing" surface | "Arranging" surface | Key rule |
|----------------|-------------------------------|--------------------------------------|-------------------------|
| **Things** | **Today** (+ This Evening): "to-dos that you want to start before the day ends… your priorities". Today is "a filter across the entire app: if the start date, deadline, or repeating rule… matches today's date, it shows up here." | **Upcoming**: "can't tackle right now but want to conquer on a specific day". When the start date arrives, items "transform into actionable items in Today". Anytime/Someday = backlog. | Start date ≠ deadline. Deadline items stay in Anytime. |
| **Todoist** | Today: "every task scheduled for today across all your projects". Overdue shown, reschedule inline. | Upcoming (week/calendar), projects | Only dated tasks appear in Today/Upcoming. |
| **Sunsama** | The day's list after planning | **Guided daily planning ritual**: 1) reflect on yesterday 2) add tasks from backlog/integrations 3) **check predicted workload vs threshold ("If you're over, a warning appears")** 4) order and timebox 5) share. Defer (D) / backlog (Z). Evening **shutdown**. | Suggests ~5.5 h planned work. Arranging is a deliberate ritual. |
| **Structured** | Timeline of today | **Inbox** ("dump") → drag into a timeline slot | Inbox vs timeline is the plan/do boundary. |
| **Microsoft To Do** | **My Day**: "resets every night, so you have a blank slate". **Suggestions** list pulls candidates in. | Lists / Planned | Today is *curated*, not automatic. |
| **TickTick** | Today: tasks + events "sorted by time", habits section below open tasks | Calendar (month/3-day/week), lists | Habits live inside Today. |

**Proposed Hemlo definitions (no overlap)**
- **Today = "What do I do now?"** A *read-and-act* filter for the current day only. It shows: (a) Google/agenda events (timeline strip at top), (b) items due/scheduled today across all modules (tasks, chores, habits, supplements, training, study reviews, bills), (c) overdue items in a collapsible "Carry-over" row, and (d) pinned module cards. Actions here: ✓ complete, log, start timer, snooze to tomorrow, skip. **No** recurrence editing, no drag across days, no backlog.
- **Plan = "When will I do it?"** The *arranging* workspace: Inbox/backlog (undated) · week strip (1–14 days, with a busy-ness heat bar) · month. Actions: drag to day/time, set or edit repeat, assign/rotate, apply templates, copy day/week, bulk select. Completion state is shown but not the focus.
- **Bridge between the two:**
  - An optional **"Plan my day"** sheet (Sunsama-lite) offered on the first open of the day, or from a Today button. It shows yesterday's unfinished items, suggestions (MS To Do-style: due soon, flexible chores, study reviews), and a **workload bar** (planned minutes vs a user-set daily capacity) that warns when over. Finish → Today.
  - An optional evening **"Close the day"** sheet that moves leftovers to tomorrow or the backlog.
- **Data rule:** Today is never a place where items "live". It's a query (`date == today || pinned_for_today`), as in Things, so the two screens can't disagree.

Sources: [Things – An In-Depth Look at Today, Upcoming, Anytime, and Someday](https://culturedcode.com/things/support/articles/4001304/) · [Things – User Guide](https://culturedcode.com/things/guide/) · [Todoist – Today view](https://www.todoist.com/help/articles/plan-your-day-with-the-todoist-today-view-UVUXaiSs) · [Sunsama User Manual – Daily Planning](https://help.sunsama.com/docs/usage-guides/daily-planning/) · [Structured Help – Getting Started](https://help.structured.app/en/articles/380546) · [Structured – Google Play](https://play.google.com/store/apps/details?id=io.unorderly.structured&hl=en) · [Microsoft Support – My Day and suggestions](https://support.microsoft.com/en-us/office/my-day-and-suggestions-fc09a1b9-0854-4906-b166-f480ee97a139) · [TidBITS – TickTick (14 Aug 2025)](https://tidbits.com/2025/08/14/ticktick-provides-a-focused-daily-task-list-and-more/)
*Todoist's Upcoming help page returned only the help-centre home page, so its exact behaviour wasn't verified. Structured complaints worth avoiding: one-by-one rescheduling and no bulk add (Play reviews).*


### B3. Long-press, expandable items, checklists, accessibility

**Findings**
- Android Compose: `combinedClickable(onClick, onLongClick, onLongClickLabel)`. "As a best practice, you should include haptic feedback when the user long-presses elements." `onLongClickLabel` makes TalkBack announce e.g. "Open context menu" instead of a generic "double tap and hold".
- Android accessibility: for drag/swipe gestures, "provide an alternate way… by exposing the action to accessibility services" (`customActions`).
- **NN/g contextual menus:** long-press/swipe menus are "not discoverable". "Actions available through the gesture should also be present in the visible UI." Keep it under 10–12 items, ordered by frequency.
- **Apple HIG context menus:** "Always make context menu items available in the main interface, too". "Aim for a small number of menu items". Submenus at most one level. Put destructive items last, in red. Support context menus *consistently* everywhere or users think something's broken. "Provide either a context menu or an edit menu for an item, but not both."
- **NN/g bulk actions:** select-all, a contextual action bar, feedback plus **undo**.
- **NN/g mobile accordions:** good for previewing structure. Risks: users mistake an expanded accordion for a new page and press Back, and long content makes the collapse control hard to reach. Fix with **sticky headers** and **Back collapses the accordion**.
- WCAG 2.2 SC 2.5.8 target size min **24×24 CSS px**. The Android widget quality guide uses **48×48 dp** touch targets.

**Recommendations for Hemlo**
1. **Tap = expand inline** (accordion row: notes, checklist, quick fields). **Tap title again or Back = collapse.** **Chevron or ⋮ = full actions.** **Long-press = enter multi-select** with haptic feedback. Use one consistent rule across every module list.
2. **Selection mode** shows a top contextual action bar: Select all · Copy to day… · Move to day… · Duplicate · Change repeat · Delete (last, red) · Undo snackbar.
3. **Single-item context menu** (via ⋮, and long-press while *already* in normal mode if you choose that instead) with ≤7 items: Edit · Copy to another day · Duplicate · Save as template · Pin to Today · Skip this time · Delete.
4. **Checklists inside items:** inline checkboxes with a "3/7" progress chip on the collapsed row. Ticking the last sub-item offers "Complete parent?" Don't auto-complete silently.
5. **Accessibility:** every long-press and swipe action is mirrored in ⋮ and exposed as accessibility custom actions (in a Capacitor WebView: `aria-haspopup`, `role="menu"`, and a visible "More options" button; native TalkBack custom actions aren't available to web content **[UNVERIFIED WebView parity]**). Targets ≥48 dp. Swipe-to-complete must have a button equivalent.

Sources: [Android Developers – Tap and press (Compose)](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/tap-and-press) · [Android Developers – Accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) · [NN/g – Contextual Menus](https://www.nngroup.com/articles/contextual-menus/) · [Apple HIG – Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus) · [NN/g – Bulk Actions: 3 Design Guidelines (video)](https://www.nngroup.com/videos/bulk-actions-design-guidelines/) · [NN/g – Accordions on Mobile](https://www.nngroup.com/articles/mobile-accordions/) · [W3C – Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [Android – Widget quality guidelines](https://developer.android.com/docs/quality-guidelines/widget-quality)
*Material 3 gesture/list pages (m3.material.io, m2.material.io) are JS-only and couldn't be read. The claim that "Material 3 recommends long-press for selection" is **[UNVERIFIED from the M3 site directly]**, though Android's own Compose docs show long-press → context menu.*


### B4. Quick-add / FAB chooser, recent & frequent, copy to other days, templates

**Findings**
- The FAB is "a single, focused action… the most common pathway" (Android docs). **Material 3 Expressive FAB menu**: shows "2–6 related actions", "should always appear in the same place as the FAB that opened it", and replaces speed dials and stacked small FABs. It isn't used with extended FABs.
- **NN/g bottom sheets**: for quick, transient interactions. Support Back to dismiss and show a visible close (X). **Don't stack sheets** or use them to replace page flows.
- **Recognition over recall** (NN/g): recently used and saved items cut memory load (Amazon recently viewed, history).
- **MyFitnessPal saved meals**: "A meal is a group of foods you eat together, logged as separate diary entries". Log via + → My Meals → choose slot → +. Saved meals can be copied to make variations.
- **Cronometer user complaints**: typing names every time is a "UX nightmare". Recent is global rather than per meal slot. Users lean on "copy to today" and copy whole meals or days.
- **Android app shortcuts**: launchers show "up to four shortcuts" (static + dynamic). Pinned shortcuts are unlimited. Good for "Add meal", "Log water", "Start focus".

**Recommendations for Hemlo**
1. **Context-aware FAB:** inside a module, the FAB = that module's primary add (one action). On **Today**, the FAB opens an **M3 FAB menu (≤6)** of the user's most-used add-types, ordered automatically and editable.
2. **The add flow is one bottom sheet, two steps max.** Example, *Add meal:* step 1 = slot (auto-selected by time of day: Breakfast/Lunch/Dinner/Snack) + time. Step 2 = source tabs **Recent (per slot) · Frequent · Saved meals · Recipes · Search · Scan barcode**. Multi-select foods → Add. Never a stacked second sheet: a full-screen page instead if deep editing is needed.
3. **Copy everywhere:** "Copy to…" on items, meals, whole days and whole weeks, with a dialog: target day(s) (multi-select dates, or "every weekday this week") + toggles **Include notes · Include checklist state · Include time**. Plus "Copy from yesterday" / "Repeat last <slot>" at the top of the Recent tab.
4. **Templates as first-class objects:** save any item/day/week/project as a template ("Leg day", "Sunday reset", "Meal prep Mon"). Apply from Plan (drag onto a day) or from the add sheet's Saved tab.
5. **Dynamic launcher shortcuts** (up to 4) mirroring the FAB menu's top items, via a small Capacitor plugin. **[UNVERIFIED that an off-the-shelf Capacitor shortcuts plugin is maintained; a custom plugin is trivial.]**
6. **Smart defaults:** remember last quantity/portion per food, last duration per workout, last amount per expense category.

Sources: [Android Developers – FAB (Compose)](https://developer.android.com/develop/ui/compose/components/fab) · [material-components-android – FloatingActionButtonMenu.md](https://github.com/material-components/material-components-android/blob/master/docs/components/FloatingActionButtonMenu.md) · [NN/g – Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/) · [NN/g – Recognition vs Recall](https://www.nngroup.com/articles/recognition-and-recall/) · [MyFitnessPal – Create, find, and log your saved meals](https://support.myfitnesspal.com/hc/en-us/articles/360032625331-Create-find-and-log-your-saved-meals) · [Cronometer Forum – "Why is adding recent/frequent food so complicated?"](https://forums.cronometer.com/discussion/comment/21619) · [Android Developers – App shortcuts](https://developer.android.com/develop/ui/views/launch/shortcuts)


### B5. Configurable stats ("pivot-lite") and home-screen widgets

**Findings**
- **NN/g dashboards:** "information that can be consumed fast, with a minimum of interaction". Prefer **length and 2D position** (bar, line, dot). Avoid pie/area/3D.
- **Pivot model (Looker Studio):** Row dimensions × Column dimensions (≤2) × Metrics (aggregations: COUNT/SUM/AVG), with **expand-collapse** of hierarchy levels. **Excel PivotTables:** summarise, group, filter, sort, "pivot" rows↔columns, drill down to detail.
- **Bearable correlations:** pick a health metric (mood, sleep, energy…) and a **factor that appears "as a gradient in the background of the graph on the days when the factor was tracked"**. Needs ≥3 days with and ≥3 days without, and recommends 30 days. Bearable warns about timing and confounding.
- **Exist:** pin 4 attributes to Home, a per-attribute "full history of your raw data by month", and PDF export (2026).
- **Android widget quality:** pick **one primary use case**. Resizable to at least one of 2×2, 4×1, 4×2. Support **dynamic colour + light/dark**, the system corner radius, intentional empty states, manual refresh when data is expected to change often, 48 dp targets, and **"Widget uses system configuration instead of a custom widget settings entry point"** (reconfigurable, with a default config so setup is optional).
- **Glance** = Jetpack Compose-based widget framework (Kotlin, native). **Capacitor:** widgets must be written natively (`AppWidgetProvider`). Data can be shared through SharedPreferences, which is what Capacitor `Preferences` uses on Android (default group `CapacitorStorage`). `capacitor-widget-bridge` provides `reloadAllTimelines()` to refresh.

**Recommendations for Hemlo**
1. **Stats builder = 4 dropdowns on one screen:** **Measure** (any numeric field from any enabled module: kcal, protein, minutes studied, € spent, chores done, sleep h) · **Aggregate** (sum/avg/count/min/max/streak/% days hit goal) · **Group by** (day/week/month/weekday/module/category/tag/member) · **Range** (7d/30d/90d/YTD/custom). An optional **Compare** overlays a second measure, or a factor shaded as background (Bearable). Chart type is chosen automatically (line for time, bar for categories), with a table toggle (= the pivot view, rows expandable).
2. **"Save as stats template"** → becomes a card that can be pinned to Stats, to Today, or to a widget. Ship presets: Protein vs goal (week), Training volume by muscle group, Study minutes by subject, Spending by category (month), Chores per member (fair-share), Sleep vs caffeine/training.
3. **Keep mobile pivots shallow:** 1 row dimension + optional 1 column dimension on phone (Looker allows 2 column dims. Two levels is the NN/g disclosure ceiling), with tap-to-drill into the underlying entries.
4. **Correlation honesty:** show "needs ≥3 days with/without" placeholders and a caveat line, as Bearable does.
5. **Widgets (native Kotlin/Glance or RemoteViews inside the Capacitor Android project):** start with 3: **Today list** (4×2, check-off), **Quick add** (4×1 buttons = FAB menu), **Stat card** (2×2, configurable to any saved stats template). The JS side writes a compact JSON snapshot to SharedPreferences on every change and calls a widget reload. Use system configuration with `configuration_optional` defaults.

Sources: [NN/g – Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/) · [Looker Studio – Pivot table reference](https://docs.cloud.google.com/data-studio/pivot-table-reference) · [Microsoft Support – Overview of PivotTables and PivotCharts](https://support.microsoft.com/en-us/office/overview-of-pivottables-and-pivotcharts-527c8fa3-02c0-445a-a2db-7794676bce96) · [Bearable – How to find correlations](https://bearable.app/support/howto/how-to-find-correlations/) · [Bearable – What are Factors?](https://bearable.app/support/tips/what-are-factors/) · [Exist – Our 2025 redesign](https://exist.io/blog/exist-2025-redesign/) · [Android – Widget design guide](https://developer.android.com/design/ui/mobile/guides/widgets) · [Android – Widget quality guidelines](https://developer.android.com/docs/quality-guidelines/widget-quality) · [Android – Widget configuration](https://developer.android.com/develop/ui/views/appwidgets/configuration) · [Android – Jetpack Glance](https://developer.android.com/develop/ui/compose/glance) · [capacitor-widget-bridge (GitHub)](https://github.com/kisimediade/capacitor-widget-bridge) · [Capacitor – Preferences API](https://capacitorjs.com/docs/apis/preferences)


### B6. Personalisation: colours and app icon (Capacitor feasibility)

**Findings**
- **Dynamic colour (Android 12+):** wallpaper → 5 key colours (primary, secondary, tertiary, neutral, neutral-variant) → tonal palettes (13 tones) → light/dark schemes. Android 13+ adds variants (Tonal Spot, Neutral, Vibrant, Expressive). `HarmonizedColors` shifts brand/custom colours to sit with the dynamic palette. Widgets support dynamic colour from Android 12, adaptive icons from 13.
- **material-color-utilities** (Google, **TypeScript on npm** `@material/material-color-utilities`): HCT colour space, "themes… generated from a single seed color", contrast measurement and DynamicScheme. **This runs in the WebView**, so seed-colour theming needs no native code.
- **Reading the *system* wallpaper palette in a Capacitor WebView** needs a small native plugin. OpenTubeX (a Capacitor app) did exactly this: "Adds a local Capacitor plugin for Android 12+ and applies the native palette… palette should update without restarting". Natively these are the `android.R.color.system_accent1_*` / `system_neutral1_*` resources (API 31) **[UNVERIFIED: the R.color reference page was truncated on fetch]**.
- **WCAG 2.2 AA:** text ≥ **4.5:1** (large text ≥ 3:1 = 18 pt, or 14 pt bold). **Non-text UI components and meaningful graphics ≥ 3:1** against adjacent colours. Inactive components are exempt. Values are not rounded (2.999 fails). Apple HIG goes further: "strive for a contrast ratio of 7:1, especially in small text", and supply increased-contrast variants. Don't rely on colour alone (HIG).
- **Themed icons (Android 13+):** add `<monochrome>` to the adaptive icon. Layers are 108×108 dp with a 66×66 dp safe zone. Shown only if the user enables themed icons. **From Android 16 QPR2 the system auto-themes icons for apps that don't provide one.**
- **Alternate launcher icons:** `activity-alias` per icon, toggled via `PackageManager.setComponentEnabledSetting(..., DONT_KILL_APP)`. Caveats: the change isn't always instant (launcher cache), **pinned shortcuts may be removed**, and OEM launchers vary. **`@capacitor-community/app-icon`** documents Android setup (each alternate = an `<activity-alias>` in the manifest). The older `aeharding/app-icon` says its Android support is beta/experimental, so prefer the community plugin. All icons must be **bundled in the APK** (no downloading new icons).
- **Play policy:** no specific rule against user-chosen alternate icons was found. Play Protect's Mobile Unwanted Software policy requires apps to "explicitly and clearly explain to the user what system changes will be made" and not "interfere with… the usability of the device". *Hiding* the icon is the pattern associated with adware. **[UNVERIFIED: no explicit Play policy text on alternate icons was located. Keep alternates clearly Hemlo-branded, user-initiated, and never hide the launcher entry.]**

**Recommendations for Hemlo**
1. **Theme picker (Settings → Appearance), three tiers:**
   1. **System colours** (default on Android 12+, via a tiny native plugin that reads the system palette and re-reads it on resume).
   2. **Seed colour:** a colour wheel plus ~12 curated swatches. Generate a full M3 light/dark scheme with `material-color-utilities` and set CSS custom properties (`--md-sys-color-primary`, …).
   3. **Preset palettes** (e.g., Calm, Forest, Ocean, Mono, High-contrast) plus **per-module accent** (nutrition green, finance blue, …), harmonised to the main scheme.
   - Contrast-level slider (Standard / Medium / High) using the library's contrast support.
2. **Automatic contrast guard:** on every theme change, compute on-surface/on-primary text ≥4.5:1 and outlines/chart strokes/checkbox borders ≥3:1. If a user colour fails, nudge the tone in HCT and show "Adjusted for readability". Always pair colour with icons/labels for status.
3. **Light / Dark / System** mode, and an **AMOLED black** option (common in Android planners) **[UNVERIFIED as a cited pattern]**.
4. **App icon:** ship the adaptive icon **with a monochrome layer** now (free win; Android 16 QPR2 will otherwise auto-theme it). Then offer **4–6 bundled alternates** (Classic, Dark, Light, Mono, Seasonal) via `@capacitor-community/app-icon`. Before switching, show "Your launcher may take a few seconds to update; home-screen shortcuts may need re-adding." Keep the default entry so there's always exactly one enabled alias.
5. **Widgets follow the app theme** (dynamic colour or the user's seed), since the widget quality guide's Tier 1 requires theme support.

Sources: [Android Developers – Dynamic colors](https://developer.android.com/develop/ui/views/theming/dynamic-colors) · [material-color-utilities (GitHub)](https://github.com/material-foundation/material-color-utilities) · [OpenTubeX PR #1340 – Material You system colors in Capacitor](https://github.com/OpenTubeX/OpenTubeX/pull/1340) · [Android R.color reference](https://developer.android.com/reference/android/R.color#system_accent1_500) · [W3C – Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [W3C – Understanding SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [Apple HIG – Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) · [Apple HIG – Color](https://developer.apple.com/design/human-interface-guidelines/color) · [Android Developers – Adaptive icons](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive) · [DEV – Dynamic icons on Android with activity-alias](https://dev.to/anandankur16/let-users-change-your-app-icon-a-guide-to-dynamic-icons-on-android-with-activity-alias-3okp) · [@capacitor-community/app-icon (GitHub)](https://github.com/capacitor-community/app-icon) · [aeharding/app-icon (GitHub)](https://github.com/aeharding/app-icon) · [Google – Mobile Unwanted Software policy](https://developers.google.com/android/play-protect/mobile-unwanted-software) · [Apple HIG – App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)


### B7. Onboarding for modular apps: choose modules, templates, empty states

**Findings**
- **NN/g onboarding:** 3 components: feature promotion, customisation, instructions. "**Content customization**… is more likely to be appropriate for initial app onboarding". Visual customisation should be *deferred*. Keep it brief, explain why, and always offer a highly visible **Skip**. Best of all: "avoid creating app onboarding whenever possible and instead spend your resources making the UI more usable."
- **NN/g customisation (7 tips):** make customisation visible near the content, easy and layered. **"Don't rely on customization… Users often won't bother"**, so defaults must work alone. Encourage it gently *after* engagement, and let users change choices later.
- **Apple HIG onboarding:** "fast, fun, and optional". Teach through interactivity. Prefer **context-specific tips** over a big upfront flow. "Postpone nonessential setup flows or customization steps. Provide reasonable default settings." Ask for permissions at the point of need.
- **NN/g empty states:** 1) communicate status ("no records for this range"), 2) give learning cues ("Star your favorites to list them here"), 3) **provide direct pathways** (Create button plus Learn more).
- **Bearable** advises users to "focus on tracking as few things as possible".
- **Sweepy's** detailed setup questionnaire is reviewed as "somewhat overwhelming" (Common Sense Media).

**Recommendations for Hemlo**
1. **One-screen start:** "What do you want Hemlo for?" offers multi-select **goal templates**, each switching on 3–5 modules and pinning their Today cards:
   - *Get organised* (Today, Plan, Tasks, Notes, Agenda)
   - *Eat & train* (Nutrition, Recipes, Shopping, Training, Supplements)
   - *Study* (Learning, Agenda, Habits, Focus/Stats)
   - *Run the home* (Household, Shopping, Stock, Finance)
   - *Everything (advanced)*
   Then a **Skip** that lands on a working default (Today + Plan + Tasks). The question is about content, not visuals, per NN/g.
2. **No visual customisation during onboarding.** Theme, icon and card layout come *after* a few days, via a single "Make Hemlo yours" tip card that can be dismissed for good.
3. **Modules hub = app-store-like list** with toggles, a one-line description and a preview screenshot per module. "Recommended for you" is based on the selected goals. Turning a module off **hides it without deleting data** (say so explicitly).
4. **Every module has a designed empty state:** an illustration, one sentence of value, a primary button ("Add first meal" / "Import from CSV" / "Use 'Studio flat' chore pack"), and a secondary "Learn more" link that opens a 3-step interactive mini-tour.
5. **Just-in-time tips** instead of a tour: the first long-press triggers a tip about multi-select, the first item with a checklist shows "Tap to expand", the third manual meal entry shows "Save as meal?", and so on. Show each tip once. A "Tips & tutorials" page in Settings replays them (HIG: tutorials should be "easy… to find… later").
6. **Permissions on demand:** Calendar access when Agenda is first opened, notifications when the first reminder is set, camera on the first barcode scan.

Sources: [NN/g – Mobile-App Onboarding: Components and Techniques](https://www.nngroup.com/articles/mobile-app-onboarding/) · [NN/g – 7 Tips for Successful Customization](https://www.nngroup.com/articles/customization/) · [Apple HIG – Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) · [NN/g – Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/) · [Bearable – What are Factors?](https://bearable.app/support/tips/what-are-factors/) · [Common Sense Media – Sweepy review](https://www.commonsensemedia.org/app-reviews/sweepy-home-cleaning-schedule)


### Appendix: one shared "Repeat" sheet (synthesis of A1–A5)

| Chip | Stored as | Seen in |
|-----------------------------------------|------------------------------------------|---------------------------|
| Once (specific date[s]) | RDATE list | Agenda, tasks, bills |
| Daily / every N days | `FREQ=DAILY;INTERVAL=N` | Habits, supplements, study |
| Weekdays / Weekends / Specific days | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` / `SA,SU` / custom | Training, chores |
| Every N weeks on days | `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR` | Chores, training splits |
| Monthly on date / nth weekday / last workday | `BYMONTHDAY=15` / `BYDAY=2TU` / `BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1` | Bills, household |
| After completion ("every! 7 days") | Hemlo flag `mode=after_completion` | Chores (Tody), haircut, plants |
| Flexible window ("about every 7 days") | `mode=flexible` + due-ness bar | Chores, cleaning |
| Ends: never / on date / after N | `UNTIL` / `COUNT` | All |
| Assign: me / person / **rotate** (each time, each week, least-recent) | Hemlo `assignees[] + rotation` | Household, shared shopping |
| Skip on "light days" / cap per day | Hemlo load-balancer setting | Household, study, training |

Sources: [RFC 5545 §3.3.10](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10) · [Todoist – Recurring dates](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV) · [Anki – Deck Options (Easy Days)](https://docs.ankiweb.net/deck-options.html) · [Tidied – Tody review](https://www.tidied.app/blog/tody-app-review) · [Homsy – chore apps 2026](https://gethomsy.com/blog/comparisons/best-chore-chart-apps-2026)



# Appendix C. Research notes: food, fitness, body and sleep, with EU reference data

Reproduced in full from the research of 1 October 2026, with its sources.


Research date: 2026-10-01. Context: Hemlo is a modular phone planner and life tracker, Android first, for an EU (Netherlands) user.

**How to read this file**
- Every fact comes from a page opened during this session. Sources are listed per section.
- **[UNVERIFIED]** marks anything I could not confirm on a primary page: recalled knowledge, a figure from a single low-quality page, or a page that gave contradictory numbers.
- **[COMPETITOR-AUTHORED]** marks review or comparison pages written by a rival app (for example nutrola.app, sensai.fit, pillscircle, plantoeat, pantrypersona). Treat their price and feature claims as indicative only.
- Prices are USD unless stated. EU prices often differ, so check the Play Store in NL before quoting any of them.


### Summary: one primary pick per module

| # | Module | Primary (Android, 2026) | Runner-up | Why it wins |
|-----|------------------|-----------------------|---------------------------|-------------------------------------|
| 1 | Nutrition logging | **MacroFactor** | Cronometer (Yazio for EU branded data) | Fastest logger; meals are placed on a timeline instead of fixed slots; multi-add, AI describe, copy/paste across days |
| 2 | Recipes & meal plan | **Paprika 3** | Samsung Food | One-time purchase; web import; grocery list combines ingredients and sorts them by aisle; pantry; scaling and unit conversion |
| 3 | Shopping list | **Bring!** | OurGroceries / Listonic | Swiss/EU; icon tiles for catalogue items; custom items; "2 kg apples" style details; reorderable sections; shared lists |
| 4 | Pantry / stock | **KitchenPal** | Grocy (self-hosted, as a data-model reference) | Barcode lookup against 5M+ products; fridge/freezer/pantry zones; expiry alerts; shared list |
| 5 | Product DB / barcode | **Open Food Facts** (app and open data) | Yuka (scan-and-score UX) | ODbL open data, about 4M products, strong in Europe, usable inside Hemlo |
| 6 | Training | **Hevy** | Strong | Shows previous values inline, starts the rest timer when you tick a set, set types, supersets, Wear OS, generous free tier |
| 7 | Supplements / meds | **MyTherapy** (smartpatient, Munich) | Medisafe | Free, EU-made, 4.6★ from 241K ratings; covers supplements, stock and refill alerts, and a measurements diary |
| 8 | Weight / body | **Libra** (Android) | Happy Scale (iOS only, UX reference); MacroFactor's trend weight | Documented exponential-moving-average trend and regression forecast; €1/month premium |
| 9 | Sleep | **Sleep as Android** | Sleep Cycle; SleepTown (habit/gamified) | 4.6★, 10M+ installs, smart-wake window, wearables, one-time unlock |

Major market event: **Mealime shuts down on 21 Oct 2026** with no export option (Albertsons is folding it into its grocery apps). Do not model Hemlo on Mealime. Its users are looking for a new app right now.


### 1. Nutrition / food logging

#### Primary: MacroFactor (Stronger By Science Technologies)
- **Platform and price:** Android and iOS. Play Store lists 4.7★ (16.3K reviews), 1M+ installs, updated 22 Aug 2026. Prices are $11.99/month, $47.99/6 months, $71.99/year, with a 7-day trial and no free tier. Outlift lists a $90/year bundle with MacroFactor Workouts.
- **What makes it fast:**
  - **Search pre-loads before you type.** It shows your "hourly go-tos, your favorited foods, and … recently logged" foods. Results come in tiers: History, then Custom, then Common (research-grade), then Branded.
  - **Multi-add.** One tap adds the food's default serving to a minified "Plate" without leaving search. The app "remembers foods and servings you logged in the past."
  - **The Plate is a staging area.** You stage several foods, adjust each one's unit and quantity in a box on the right, then tap "Log Foods" once.
  - **Quick Add** takes kcal, protein, fat, carbs and alcohol directly.
  - **Input methods:** barcode scanner, label scanner, and **AI Describe** (voice or text, e.g. "2 eggs and toast"), which is parsed into ingredients and quantities. AI photo logging also exists.
  - **Units:** you can switch to standard measures like "1 large egg", to grams, or to custom portions. When a food has weight or volume info, the default serving is auto-converted to g, oz, ml and cup. You can pin up to two favourite weight/volume units (g, oz, lb, ml, cup, tbsp, tsp, fl oz).
  - **Settings:** "Optimize for speed" (default) versus "Optimize for context". You can also choose tile density (Comfort/Compact).
- **Meal slots: there are no fixed slots.** MacroFactor uses a **timeline**. Each food is timestamped to the minute, and empty hours can be hidden or foods collapsed into icon rows. Their stated reason: "The timeline represents the day as it is rather than what it 'should' be." It avoids deciding whether a protein bar is breakfast or a snack, and it suits intermittent fasting or five small meals.
- **Copying:** Timeline 2.0 has tap-to-select for a food, an hour or a whole day. You can then copy, move or delete. Shortcuts "To Today" and "To Tomorrow" exist, and Multi-Paste works across several days without clearing the clipboard.
- **Saved meals and recipes:** select foods on the timeline and choose "Create recipe". When logging a saved meal, **"Explode"** logs it as separate items so each portion can be edited.
- **Weaknesses:** no free tier; limited micronutrients for packaged foods; no social features. Some very lean users report the targets run 100–200 kcal low. Some Play reviewers wanted exercise-calorie tracking built in.
- **Ideas for Hemlo:**
  1. **A staging plate plus a single "log" action**, with multi-add from search and remembered last serving per food.
  2. **Time-based logging with optional labels**, so meal names become tags and are not required. Offer "copy hour/day to Today/Tomorrow" and multi-paste.
  3. **An "Explode" option for saved meals**, so you can tweak one ingredient without editing the template.
  4. **Show history and favourites before typing**, and rank results as History, then Custom, then Generic (NEVO), then Branded (OFF).

#### Runner-up: Cronometer
- **Platform and price:** web, Android and iOS. Gold is $8.99/month or $49.99/year. The free tier has ads, and the barcode scanner is Gold-only according to Garage Gym Reviews.
- **Meal slots:** "Diary Groups" are opt-in (More > Display > Diary Settings > Show Groups). You can rename groups and choose which are shown. If no group is selected, entries go to the first group. Swiping a group header right lets you **copy yesterday's group to today**, make a recipe or meal from the group, see a per-group nutrition summary, or delete the group. Each group can have its own Quick Add default.
- **Strengths:** tracks 84 nutrients; integrates Fitbit and Garmin.
- **Weaknesses:** the density of features overwhelms some users ("so much that can be tracked … overwhelmed"); manual recipe entry is tedious.
- **Activity levels:** stated by Cronometer staff on the official forum as BMR multipliers:

  | Level | Added on top of BMR | Effective multiplier | Description |
  |---|---|---|---|
  | Sedentary | +0.2 × BMR | 1.2 | little or no exercise |
  | Lightly Active | +0.375 × BMR | 1.375 | basic daily living plus light exercise 1–3 days/week |
  | Moderately Active | +0.5 × BMR | 1.5 | moving often through the day and/or moderate exercise 3–5 days/week |
  | Very Active | +0.9 × BMR | 1.9 | manual labour or competitive athletic training |

  Users can also set a custom fixed number.
- **Idea for Hemlo:** let users **turn meal groups on or off**, rename them, and use "copy yesterday's group".

#### Others assessed
- **MyFitnessPal:**
  - Meals: up to **5 meals**, the default three plus two of your own, renamed for every day via Settings > Diary Settings > Customize Meal Names. This is free.
  - Paywall (May 2026): scan-a-meal (photo), recipe URL import and macro-by-meal goals moved to Premium, which costs $19.99/month or $79.99/year. Barcode scanning stays free. Parent company bought Cal AI in March 2026.
  - Activity level: MFP's community guidance says it reflects non-exercise activity only, and workouts are logged separately.
  - **[UNVERIFIED]** MFP's exact wording, recalled: "Not Very Active – spend most of the day sitting (e.g. bank teller, desk job)", "Lightly Active – a good part of the day on your feet (e.g. teacher, salesperson)", "Active – a good part of the day doing some physical activity (e.g. food server, postal carrier)", "Very Active – heavy physical activity (e.g. bike messenger, carpenter)".
- **Yazio (Germany):**
  - **Meal slots are fixed:** "There are currently four categories … Breakfast, Lunch, Dinner and Snacks", and you cannot add more (Yazio help).
  - Quick Add takes a description plus kcal and optional macros.
  - Strong EU branded database (about 2.5M foods, especially DE/AT/CH/FR). Barcode scanning is in PRO.
  - PRO costs about $9.99/month or $39.99/year, with a 7-day trial. Fasting timer is free. Tracks 28 nutrients. Mobile only.
- **Lose It!:**
  - Easiest learning curve; reliable barcode scanner; Snap It photo logging is weak on mixed dishes.
  - Premium costs $39.99/year ($19.99/month); family plan $59.99/year.
  - Tracks 25 nutrients; database accuracy varies because entries come from users.

#### Units versus grams (synthesis for Hemlo)
- MacroFactor and Cronometer both offer **named household units next to grams**, such as "1 large egg", cup or slice. Defaults come from the reference database's portion table, and MacroFactor auto-converts once weight is known.
- For NL, the legal source of named-unit weights is **RIVM Portie-online**, which gives S/M/L per piece with and without waste (see Section 11).

#### Ready-meals by barcode
- MacroFactor, MFP (free), Lose It!, and Yazio/Cronometer (paid) all scan barcodes and fall back to manual or label entry.
- MacroFactor also scans the **nutrition label**, so an unknown product can be created from a photo of its table.
- Hemlo should use OFF lookup, then label OCR, then a create-food form that follows the EU 1169/2011 fields (Section 10).

#### Sources
- MacroFactor, Timeline-based food log — https://macrofactor.com/timeline-based-food-logger/
- MacroFactor, New food logger — https://macrofactor.com/new-food-logger/
- MacroFactor Help, How to Log Food — https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor
- MacroFactor Help, Configure Your Food Logger — https://help.macrofactorapp.com/en/articles/219-how-to-configure-your-food-logger
- MacroFactor Help, Save a Meal — https://help.macrofactorapp.com/en/articles/239-save-a-meal-for-later-use
- MacroFactor Help, Interpreting expenditure — https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure
- MacroFactor Play Store — https://play.google.com/store/apps/details?id=com.sbs.diet
- Outlift, MacroFactor review (2026) — https://outlift.com/macrofactor-review/
- Bento Bunny, MacroFactor cost — https://www.bentobunny.app/guides/macrofactor-cost [COMPETITOR-AUTHORED]
- Cronometer Support, Mobile Diary Groups — https://support.cronometer.com/hc/en-us/articles/360019002571-Mobile-Diary-Groups
- Cronometer forum (staff), activity levels — https://forums.cronometer.com/discussion/comment/11163
- Garage Gym Reviews, Cronometer review — https://www.garagegymreviews.com/cronometer-review
- MyFitnessPal Support, meal names — https://support.myfitnesspal.com/hc/en-us/articles/360032622311-Can-I-change-my-meal-names-or-add-more-meals
- MFP community, activity level — https://community.myfitnesspal.com/en/discussion/10829436/activity-level
- The Nutrition Magazine, MFP paywall changes — https://thenutritionmagazine.com/articles/myfitnesspal-paywall-changes-explained/
- Yazio Help, meal categories — https://help.yazio.com/hc/en-us/articles/360000933405-Can-I-add-new-meal-categories
- Yazio Help, Quick Add — https://help.yazio.com/hc/en-us/articles/360000530018-Can-I-log-my-meal-s-calories-without-adding-the-individual-ingredients
- calorie-trackers.com, Yazio review — https://calorie-trackers.com/reviews/yazio/
- calorie-trackers.com, Lose It! review — https://calorie-trackers.com/reviews/lose-it/


### 2. Recipes & meal planning

#### Primary: Paprika Recipe Manager 3 (Hindsight Labs)
- **Platform and price:** Android, iOS, Mac and Windows, each sold separately as a one-time purchase.
  - Play Store: 4.9★ (20.7K reviews), 500K+ installs.
  - The free version is capped at 50 recipes. Unlimited recipes and sync come with the in-app purchase.
  - **[UNVERIFIED]** The Android price is about $4.99; the exact NL price was not shown.
  - Paprika 4 is in open beta.
- **Loved UX:**
  - Built-in browser saves a recipe from any website in one tap, which strips the blog clutter users complain about.
  - Offline access.
  - Scaling plus metric/imperial conversion ("SCALE & CONVERT"), and the scale carries over to the grocery list.
  - Cook-mode features: timers and step progress.
- **Grocery list:**
  - Manual items via "+". As you type, the **aisle is auto-selected**, and you can override it.
  - **Consolidates** duplicates across recipes ("2 eggs + 3 eggs = 5 eggs"), which can be switched off.
  - Multiple lists.
  - Sorts by aisle (default) or by recipe.
  - Aisles can be **reordered or renamed** under Settings > Grocery List > Aisles. Caveat: renaming a default aisle breaks automatic assignment to it.
- **Pantry:**
  - Each item has quantity, purchase date, expiry and in-stock status.
  - **Pantry items are auto-unchecked when a recipe is added to the grocery list**, so you don't buy what you already have.
  - Sort by aisle, date, expiry or stock.
- **Meal planner:** daily, weekly or monthly plans, plus reusable multi-day "menus".
- **Weaknesses:**
  - The ingredient parser expects the format "quantity unit ingredient".
  - Each platform is bought separately.
  - **[UNVERIFIED]** The interface looks dated, and there is no built-in nutrition database (nutrition comes from what a recipe page provides).
- **Ideas for Hemlo:**
  1. Recipe to list with **merging of quantities** and the same unit normalisation used by food logging.
  2. **Auto-assign an aisle while typing**, with a user-reorderable aisle order.
  3. **Skip items already in the pantry** when generating the list.
  4. Reusable "menus" (week templates) that can be dropped onto the calendar.

#### Runner-up: Samsung Food (formerly Whisk)
- **Price and platform:** free. Food+ costs $6.99/month or $59.99/year. Web, Android, iOS and the Galaxy Store.
- **Features:**
  - Saves recipes from any site; 180K recipes with nutrition.
  - Meal plan becomes a shopping list **auto-sorted by aisle**.
  - Diet and allergen filters; shared plans and lists.
  - Daily macro breakdown with targets "based on methodologies from WHO, USDA" and RDs.
  - Food+ adds AI personalisation and removes ads.
- **Idea:** show per-day macro totals on the meal plan, so planning and logging connect.

#### Others
- **Mealime:**
  - Play Store: 4.5★ (26.2K reviews), 1M+ installs; Pro costs $2.99/month. Recipes take about 30 minutes or less and the grocery list is generated automatically.
  - **It shuts down on 21 Oct 2026** with no export. Albertsons is moving it into "Meals Hub", and Pro billing has stopped.
- **Plan to Eat** and **Mela (iOS)** were not researched further. Mela is iOS-only, and Plan to Eat's blog pages failed to load (redirect loop).

#### Sources
- Paprika site — https://www.paprikaapp.com/
- Paprika Android user guide — https://www.paprikaapp.com/help/android/
- Paprika support, reorder aisles — https://paprikaapp.zendesk.com/hc/en-us/articles/15457287151383-How-do-I-reorder-the-grocery-aisles-to-match-my-store
- Paprika Play Store — https://play.google.com/store/apps/details?id=com.hindsightlabs.paprika.android.v3&hl=en_US
- Samsung Food, meal planner — https://samsungfood.com/meal-planner/
- Mealime Play Store — https://play.google.com/store/apps/details?id=com.mealime&hl=en_US
- Pann, "Is Mealime shutting down?" — https://www.pann-app.com/blog/is-mealime-shutting-down [COMPETITOR-AUTHORED; it cites mealime.com's closing notice]


### 3. Shopping list

#### Primary: Bring! (Bring! Labs AG, Zürich)
- **Platform and price:** free. Play Store: 4.4★ (144K reviews). Android, iOS, tablets, watches and web.
  - **[UNVERIFIED]** Premium price: not shown on any page I opened.
- **Adding items:**
  - **Catalogue items appear as icon tiles** grouped by category: tap to add, tap again to remove.
  - **Custom items:** "Enter the item name … If the searched item does not exist, Bring! will assign a suitable icon."
  - **Specification (amount) inline:** type "2 kg apples" in search, or long-press an item to edit its details. "Smart specifications" suggestions can be turned on.
  - Voice entry.
- **Recently Used:** checked-off items move to a "Recently Used" strip, and one tap re-adds them. This is the main speed trick.
- **Sections and store order:**
  - Reorder categories via Profile > Settings > List settings > [list] > **Sort your list**.
  - Hide categories with the eye icon.
  - Switch between "List" and "Tiles" view; turn "Group by Categories" on or off.
  - Drag to reorder lists.
- **Sharing and extras:** shared lists sync in real time. Invite people when creating a list. Lists can be sent or printed (PDF). Recipes add their ingredients in one click. Loyalty cards and store offers.
- **Weaknesses:** users ask for **custom categories**; the catalogue has gaps for non-Western foods (for example Asian ingredients); catalogue items cannot be moved between lists.
- **Ideas for Hemlo:**
  1. A **tile grid with a "recently used" strip**, so recurring groceries take one tap.
  2. **Free-text amount parsing** ("2 kg apples", "6 eggs") into quantity, unit and item.
  3. **Per-list or per-store section order**, plus **collapsible sections** and hiding empty ones.
  4. Allow **custom sections**, which Bring! users request.

#### Runner-up options
- **OurGroceries:**
  - Free with ads; premium costs about $1/month, $6/year or $20 lifetime, and removes ads for the whole household.
  - Add items by typing, from a "master list" of past items, by **barcode (17M items)**, or by voice (Alexa, Google Assistant, Siri).
  - Categories, plus **drag-and-drop to match your store layout**. Crossed-off items sort alphabetically, by recency or by frequency.
  - Recipes go to the list in one action, and you can choose a **target list per ingredient** (for example produce to the greengrocer list, meat to the butcher list).
  - Android, Wear OS and web.
- **Listonic:**
  - Free, unlimited lists, 10M+ users, 40+ languages.
  - Auto-sorts by aisle or alphabetically; price/cost calculator; smart suggestions from your history; widgets; use without an account.
- **AnyList:**
  - Complete costs $9.99/year (individual) or $14.99/year (household).
  - Store-specific filtering and categories, recipe import, meal-plan calendar, scaling, item prices with running total, location reminders.
  - Android exists, but the strongest extras (Mac app, Watch) are Apple-only.

#### Sources
- Bring! Help Center, Items & Lists — https://www.getbring.com/help-center-main-categories/items-lists
- Bring! Play Store — https://play.google.com/store/apps/details?id=ch.publisheria.bring&hl=en_US
- OurGroceries user guide — https://www.ourgroceries.com/user-guide
- Listonic — https://listonic.com/
- AnyList Complete — https://www.anylist.com/complete


### 4. Pantry / stock

#### Primary: KitchenPal (iCuisto Pte Ltd)
- **Platform and price:** Android and iOS. Play Store: 4.5★ (6.3K reviews), 100K+ installs, updated 17 Sep 2026.
  - A subscription (monthly, annual or lifetime) unlocks unlimited barcode scans, meal planning and custom storage sections.
  - **[COMPETITOR-AUTHORED]** pantrypersona puts it at $1.99–3.99/month or $29.99 lifetime.
- **Features:**
  - Barcode lookup against **5M+ products**; voice and text entry.
  - Storage zones (fridge, freezer, pantry); expiry dates and alerts.
  - Shared real-time grocery list; recipe suggestions from what you have; meal-plan calendar; brand nutrition comparison.
  - No receipt scanning.
- **Weaknesses:** some barcode mismatches reported. Key features are paywalled. **[COMPETITOR-AUTHORED]** pantrypersona says auto-deduct after cooking is not offered.
- **Ideas for Hemlo:**
  1. **Storage zones** (fridge, freezer, cupboard) as a field on each stock item, with an "expiring soon" summary.
  2. Barcode add that **reuses the same OFF lookup** as food logging.
  3. Recipe suggestions ranked by how much of the recipe you already have in stock.

#### Runner-up as a data-model reference: Grocy (open source, self-hosted, free)
- **Master data:** Locations, **Quantity Units with conversions** (pack, bottle, piece, ml), Product Groups, and **Parent products** (for example egg pack sizes rolled up into one stock figure).
- **Purchase:** add by name or barcode. Best-before shortcuts let you type MMDD or YYYYMMDD. Several barcodes can map to one product.
- **Consume:** remove stock or mark it opened, which changes the expiry. Moving an item to the freezer recalculates its thaw date.
- **Recipes check stock and deduct consumed quantities automatically.**
- **A minimum-stock threshold auto-adds the product to the shopping list.**
- **Idea:** borrow the Grocy model for Hemlo:
  - product, stock lot (quantity, unit, location, best-before, opened);
  - unit conversions per product (1 piece = X g);
  - minimum stock that feeds the shopping list;
  - "cooked recipe" or "logged meal" that deducts from stock.

#### Others
- **NoWaste:** Play Store 3.1★ (275 reviews), 50K+ installs. Pro raises the item limit from 500 to 5000. Complaints: data entry is too detailed, and one user lost 350+ items after a reinstall. This shows what to avoid: **heavy data entry and fragile sync**.
- **Pantry Check:** barcode plus photo fallback; free up to 200 items; automatic shopping list from usage; expiring-items summary added Sep 2026. The Play listing showed a small install count.

#### Sources
- KitchenPal Play Store — https://play.google.com/store/apps/details?id=fr.icuisto.icuisto&hl=en_US
- KitchenPal site — https://kitchenpalapp.com/en/
- Grocy docs, food tutorial — https://github.com/grocy/grocy-docs/blob/master/tutorials/food.md
- NoWaste Play Store — https://play.google.com/store/apps/details?id=com.khcreations.nowaste&hl=en_US
- Pantry Check Play Store — https://play.google.com/store/apps/details?id=com.pantrycheck.pantrycheck&hl=en
- Pantry Persona, best pantry apps 2026 — https://www.pantrypersona.com/blog/best-pantry-inventory-apps-2026 [COMPETITOR-AUTHORED]


### 5. Product database / barcode

#### Primary: Open Food Facts (app and open data)
- **App:** Play Store 4.2★ (7.46K reviews). Scans **about 4M products**. Shows Nutri-Score (A–E), NOVA (1–4), and carbon/packaging info, plus allergen alerts and price tracking. Can be used anonymously.
  - Complaints: slow photo loading; edits that don't seem to stick.
- **Licence:**
  - Database: **ODbL 1.0**. Contents: **DbCL**. Images: **CC BY-SA**.
  - Obligations:
    - attribution ("Contains data from Open Food Facts, available under the Open Database License");
    - **share-alike** for derived databases;
    - visible attribution in the UI.
  - They ask reusers to notify reuse@openfoodfacts.org.
- **Access:**
  - Bulk exports: nightly MongoDB dump, JSONL, Parquet (Hugging Face), CSV (about 9 GB), and 14-day deltas.
  - Live API: **v2 is deprecated, so build new integrations on v3** (v3.6 current).
  - Required User-Agent: `AppName/Version (ContactEmail)`.
  - Rate limits: **15 req/min/IP for product reads, 10 req/min/IP for search**. These apply per user when requests come from mobile apps.
  - Staging server: world.openfoodfacts.net (basic auth off/off).
- **EU data quality:** best coverage of any open source for EU and French products. Data is entered by users, so values can be wrong or missing. **[UNVERIFIED]** I did not find a quantitative audit.
- **Ideas for Hemlo:**
  1. Scan a barcode, look it up in OFF (v3), and show kcal and macros per 100 g and per pack/portion.
  2. If the product is not found, **scan the nutrition table**, prefill the EU 1169 fields, and optionally contribute it back to OFF.
  3. Cache looked-up products locally to stay within the 15 req/min limit.
  4. Show the Nutri-Score badge, which is already familiar to NL shoppers.

#### Runner-up (UX reference only): Yuka
- **Reach:** Play Store 4.7★ (185K+ reviews), 10M+ installs; 80M users claimed. 4M foods and 2M cosmetics, with about 1,200 new products a day. No ads, and independent of brands.
- **Scoring:** "Nutritional quality is 60% … additives 30% … organic dimension 10%". Additives are rated green, yellow, orange or red using EFSA, IARC and other studies. A high-risk additive caps the score at 49/100.
- **Premium:** offline mode, search without scanning, and diet flags (palm oil, gluten, lactose). **[UNVERIFIED]** The price was not shown; it is about €15/year.
- **Criticism:** it penalises additives regardless of dose.
- **Idea:** one big colour verdict plus "better alternative" suggestions. Yuka's database is proprietary, so Hemlo cannot reuse its data.

#### Sources
- OFF data and licences — https://world.openfoodfacts.org/data
- OFF API docs — https://openfoodfacts.github.io/openfoodfacts-server/api/
- OFF Play Store — https://play.google.com/store/apps/details?id=org.openfoodfacts.scanner&hl=en_US
- Yuka app page — https://yuka.io/en/app/
- Yuka Help, how food is rated — https://help.yuka.io/l/en/article/ijzgfvi1jq-how-are-food-products-scored
- Yuka Play Store — https://play.google.com/store/apps/details?id=io.yuka.android&hl=en_US


### 6. Training / workouts

#### Primary: Hevy (Hevy Studios S.L., Spain)
- **Platform:** Play Store 4.9★ (270K+ reviews), 5M+ installs. Wear OS app with heart rate and live sync. A recent update added ChatGPT and Claude integration.
- **Price:**
  - **[COMPETITOR-AUTHORED]** sensai.fit: Pro $2.99/month, $23.99/year, $74.99 lifetime.
  - The Play listing text says about $30/year.
  - Free tier: unlimited workouts, **4 routines**, 7 custom exercises, 3 months of advanced graphs, no ads.
- **Loved UX:**
  - **Start an empty workout in 2 taps.** The stopwatch starts immediately, with volume and set count shown.
  - **Adding an exercise you've done before pre-fills sets, weight and reps** from last time.
  - A **"PREVIOUS" column** shows the last session's values inline. A setting chooses between "Last completion" and "Routine-specific" history.
  - **Ticking a set starts the rest timer.**
  - Set types (warm-up, drop, failure), supersets, notes and RPE. A three-dot menu reorders or replaces exercises.
  - Finish summary shows duration, volume and sets; date and time are editable.
  - Social feed; 1RM, muscle-group charts and calendar.
- **Weaknesses:** smaller exercise library (about 400) than Fitbod or JEFIT; does not use recovery data such as HRV or sleep.
- **Ideas for Hemlo:**
  1. **Prefill from last time, show a PREVIOUS column, and start rest on tick.** This is the core of a fast logger.
  2. Make **routines into plan blocks** on the Hemlo calendar, and log them when done.
  3. Feed sleep and recovery data into training (Hemlo has the Sleep module, which Hevy lacks).

#### Runner-up: Strong
- **[COMPETITOR-AUTHORED]** $4.99/month, $29.99/year, $99.99 lifetime. Free: 3 routines and unlimited logging.
- Two-tap logging, minimal UI, best CSV export. No automatic progression.

#### Others
- **Fitbod:** $15.99/month or $95.99/year; 3 free workouts. Algorithmic programming based on muscle fatigue; 1,600+ exercises.
- **JEFIT:** Elite costs $12.99/month or $69.99/year. Large free tier (1,400+ exercises), deep analytics, dated UI.
- Fitbod and JEFIT figures come from sensai.fit [COMPETITOR-AUTHORED].

#### Sources
- Hevy Play Store — https://play.google.com/store/apps/details?id=com.hevy&hl=en_US
- Hevy help, previous workout values — https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy
- Hevy, start empty workout — https://www.hevyapp.com/features/start-empty-workout/
- Hevy pricing page (content didn't render) — https://hevy.com/pricing
- SensAI, Hevy vs Strong 2026 — https://www.sensai.fit/blog/hevy-vs-strong-2026 [COMPETITOR-AUTHORED]
- SensAI, Hevy vs Strong vs Fitbod vs Jefit — https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod-vs-jefit [COMPETITOR-AUTHORED]


### 7. Supplements / medication schedule

#### Primary: MyTherapy (smartpatient GmbH, Munich)
- **Platform and price:** Play Store 4.6★ (241K reviews). Free; the listing says it contains ads. Won first place in the German Health Award (n-tv, 2023).
- **Features:**
  - Medication **and supplement** reminders.
  - **Pill inventory with refill alerts.**
  - Measurements (blood pressure, weight, glucose); symptom and pain diary; mood tracking; family profiles.
- **Weaknesses:** a recent redesign is called "unnecessarily complicated", with too many checkboxes and notifications.
- **Ideas for Hemlo:**
  1. A supplement item carries **dose schedule plus stock count**, so stock decrements when you tick a dose and a **refill reminder** fires at N days left.
  2. **One "take all" tick per time slot** (morning stack), with per-item undo, to avoid the checkbox fatigue MyTherapy users report.
  3. Supplement ticks can optionally log nutrients (for example vitamin D µg) into nutrition totals.

#### Runner-up: Medisafe
- **Platform:** Play Store 3.6★ (249K reviews); Wear OS.
- **Paywall:**
  - Outside the US there is a **14-day trial, then a subscription is required** (about £5/month per reviews).
  - In the US there is a free tier, with a medication-count cap reported in 2026.
- **Features:** caregiver "Medfriend", drug-interaction checker (US/English only), 20+ measurements.
- **Lesson:** reviews show a strong backlash after moving core reminders behind a paywall. **Keep basic reminders free.**

#### Others
- **Round Health:** iOS only, not researched.

#### Sources
- MyTherapy Play Store — https://play.google.com/store/apps/details?id=eu.smartpatient.mytherapy&hl=en_US
- Medisafe Play Store — https://play.google.com/store/apps/details?id=com.medisafe.android.client&hl=en_US
- PillsCircle, Medisafe no longer free — https://pillscircle.com/blog/medisafe-no-longer-free-caregiver-alternative [COMPETITOR-AUTHORED]


### 8. Weight / body

#### Primary: Libra Weight Manager (Android; Daniel Cachapa)
- **Platform and price:** Play Store 4.3★ (20K+ reviews). Premium costs €1/month and gives ad-free use and unlimited chart sharing. Withings integration and cloud sync.
- **Trend algorithm (documented):** a time-aware exponential moving average inspired by *The Hacker's Diet*.
  ```
  smoothingDays = 7
  power = 1 - e^(-Δt / (smoothingDays·day))     // the docs print e^(Δt/…); the sign must be negative for 0<power<1
  trend = previousTrend + power · (weight − previousTrend)
  ```
  The docs show the exponent without the minus sign. As printed, `power` would be negative, so the minus is assumed to be a typo in the docs.
- **Forecast:** simple linear regression over the **trend** values (not raw weights) inside a forecast window (default 7 days, configurable). It projects up to 6 months ahead.
- **Ideas for Hemlo:**
  1. Show **trend weight as the headline number** and the raw weight as small dots.
  2. Weekly rate from regression on the trend, with an estimated goal date.
  3. Handle irregular weigh-ins properly by using the time-weighted alpha, as Libra does.

#### Reference: Happy Scale (iOS only)
- A moving-average trend, a goal-date prediction, and **milestones that break a big goal into smaller targets**. Passcode lock. Reviewers say it helps them "not get discouraged with the natural ups and downs".
- **Idea:** milestone checkpoints plus encouraging framing of the trend.

#### Reference: MacroFactor expenditure from trend weight
- **Expenditure formula:** "Calories out = Calories in − Change in stored energy". Stored energy is taken from **trend weight**, not daily weights.
- **Initial estimate:** BMR (Cunningham) × custom activity multipliers. Expected error is "400–500 kcal (or more)". About 2–3 weeks of logging gives a solid estimate.
- **Data needed:** nutrition logged at least 6 of 7 days, and at least one weigh-in per week.
- **Idea:** Hemlo can combine its nutrition log and weight trend to show an **adaptive TDEE**. This is Hemlo's cross-module advantage.

#### Sources
- Libra Play Store — https://play.google.com/store/apps/details?id=net.cachapa.libra&hl=en_US
- Libra, What is a trend? — https://libra-app.eu/support/trend/
- Libra, How forecasts are calculated — https://libra-app.eu/support/forecast/
- Happy Scale — https://happyscale.com/
- MacroFactor Help, expenditure — https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure


### 9. Sleep

#### Primary: Sleep as Android (Urbandroid, Petr Nálevka, Prague)
- **Platform and price:** Play Store 4.6★ (392K reviews), 10M+ installs. 7-day premium trial, then free or a **one-time** premium unlock, which reviewers single out as rare.
- **Features:**
  - **Smart wake-up within a "Smart Period" window (default 30 min)**, triggered by light sleep and never later than the alarm time.
  - Sonar (contactless) or accelerometer tracking; wearables (Pixel Watch, Galaxy, Wear OS, Garmin, Fitbit, Polar).
  - Snore and sleep-talk detection; CAPTCHA tasks to stop oversleeping.
  - Sleep score from **deficit, regularity, efficiency** and health metrics. Bedtime notification.
- **Weaknesses:**
  - The Play data-safety section says data may be shared with third parties and cannot be deleted.
  - **[UNVERIFIED]** The settings are dense and intimidating.
- **Ideas for Hemlo:**
  1. **Sleep target plus a running sleep deficit**, and regularity (consistent bed and wake times) as a first-class metric.
  2. A **bedtime reminder** derived from the alarm time minus the target duration.
  3. Import from Health Connect instead of building tracking from scratch.

#### Runner-ups
- **Sleep Cycle (Sweden):**
  - Play Store 4.5★ (216K reviews), 10M+ installs.
  - Smart alarm window: default 30 min, adjustable 10–30 min per the help article. The Play listing says "up to 90 minutes".
  - Snore recording; sleep sounds.
  - Complaints: subscription value; misattributes a fan's noise to snoring.
- **SleepTown (Seekrtech, the makers of Forest):**
  - 4.2★ (about 14K reviews).
  - You **set bedtime and wake-up goals and build a town** when you meet them.
  - Complaints: the 4–10 h window can't be changed; charged again when signing in on another device.
  - **Idea:** light gamification and streaks for bedtime adherence, with a user-editable range.

#### Sources
- Sleep as Android Play Store — https://play.google.com/store/apps/details?id=com.urbandroid.sleep&hl=en_US
- Sleep as Android docs, Smart wake-up — https://sleep.urbandroid.org/docs/sleep/smart_wake_up.html
- Sleep Cycle support, Smart Alarm — https://support.sleepcycle.com/hc/en-us/articles/7858323091356-What-is-the-Smart-Alarm-Clock
- Sleep Cycle Play Store — https://play.google.com/store/apps/details?id=com.northcube.sleepcycle&hl=en_US
- SleepTown Play Store — https://play.google.com/store/apps/details?id=seekrtech.sleep&hl=en_US


### 10. EU nutrition labelling: Regulation (EU) No 1169/2011

Quoted from the regulation text on legislation.gov.uk ("as adopted" view; EUR-Lex blocked automated fetch). It was amended up to the 2018 consolidation, and these articles are unchanged in substance.

#### Article 30: content of the declaration
- **Mandatory:** (a) energy value; (b) fat, saturates, carbohydrate, sugars, protein and salt.
  - Salt may carry a note that it comes "exclusively due to the presence of naturally occurring sodium".
- **Voluntary:** mono-unsaturates, polyunsaturates, polyols, starch, fibre, and vitamins or minerals from Annex XIII Part A when present in "significant amounts".
- **Front-of-pack repeat:** energy only, or energy plus fat, saturates, sugars and salt.

#### Article 32: expression per 100 g or 100 ml
- Energy and nutrients **shall be expressed per 100 g or per 100 ml**.
- Vitamins and minerals must also be shown as a % of the reference intake.
- Optionally, nutrients can be shown as % of RI with the statement "Reference intake of an average adult (8 400 kJ/2 000 kcal)".

#### Article 33: per portion
- Per-portion or per-consumption-unit values are allowed **in addition**, provided the portion is quantified on the label along with the number of portions per pack. (Summarised by the fetch tool; the article text itself was not opened.)

#### Annex I definitions
- **Salt = sodium × 2.5.**
- **Carbohydrate** = "any carbohydrate which is metabolised by humans, and includes polyols". Fibre is therefore declared separately.

#### Annex XIV: energy conversion factors

| Component | kJ/g | kcal/g |
|--------------------------------------------------------------------------------------------|--------|----------|
| Carbohydrate (except polyols) | 17 | 4 |
| Polyols | 10 | 2.4 |
| Protein | 17 | 4 |
| **Fat** | **37** | 9 |
| Salatrims | 25 | 6 |
| Alcohol (ethanol) | 29 | 7 |
| Organic acid | 13 | 3 |
| Fibre | 8 | 2 |
| Erythritol | 0 | 0 |

Fat is 37 kJ/g, not 38. One tool summary got this wrong, and it was corrected from the regulation text.

#### Annex XV: order and units
1. energy kJ/kcal
2. fat g, of which saturates, mono-unsaturates, polyunsaturates (g)
3. carbohydrate g, of which sugars, polyols, starch (g)
4. fibre g
5. protein g
6. salt g
7. vitamins and minerals (units per Annex XIII Part A)

#### Annex XIII Part B: adult reference intakes
- Energy **8 400 kJ / 2 000 kcal**
- Total fat **70 g**; saturates **20 g**
- Carbohydrate **260 g**; sugars **90 g**
- Protein **50 g**
- Salt **6 g**

#### Annex XIII Part A: vitamin and mineral NRVs (selection)
- Vit A 800 µg, Vit D 5 µg, Vit E 12 mg, Vit K 75 µg, Vit C 80 mg
- B1 1.1 mg, B2 1.4 mg, niacin 16 mg, B6 1.4 mg, folic acid 200 µg, B12 2.5 µg, biotin 50 µg, pantothenic acid 6 mg
- Potassium 2000 mg, chloride 800 mg, calcium 800 mg, phosphorus 700 mg, magnesium 375 mg
- Iron 14 mg, zinc 10 mg, copper 1 mg, manganese 2 mg, fluoride 3.5 mg, selenium 55 µg, chromium 40 µg, molybdenum 50 µg, iodine 150 µg

"Significant amount" means 15% of NRV per 100 g, or 7.5% per 100 ml for beverages.

These figures come from the "as adopted" version. **[UNVERIFIED]** Whether later amendments changed the vitamin D NRV was not checked.

#### Hemlo implementation notes
- Store every food **per 100 g or per 100 ml** using exactly the fields above. kcal and kJ are both stored or derived.
- Salt is stored; sodium = salt / 2.5.
- Optional fields: fibre, polyols, starch, MUFA, PUFA.
- When a label gives only macros, compute energy with the Annex XIV factors.
- The %RI display uses the Annex XIII Part B values.

#### Sources
- Reg. 1169/2011 Art. 30 — https://www.legislation.gov.uk/eur/2011/1169/article/30/adopted
- Art. 32 — https://www.legislation.gov.uk/eur/2011/1169/article/32/adopted
- Annex XIII — https://www.legislation.gov.uk/eur/2011/1169/annex/XIII/adopted
- Annex XIV — https://www.legislation.gov.uk/eur/2011/1169/annex/XIV/adopted
- Annex XV — https://www.legislation.gov.uk/eur/2011/1169/annex/XV/adopted
- EUR-Lex consolidated text (opened; Annex I quotes taken from here) — https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02011R1169-20180101


### 11. Open food composition databases and licences (for expanding Hemlo's catalogue)

| Database | Country | Size | Licence and terms | Fit for Hemlo |
|-------------------------|----------------|-----------------|-------------------------------|---------------------|
| **NEVO-online 2025/9.0** (RIVM) | NL | **2,328 foods** | **Free; may be built into commercial software.** Data must be used **unchanged**. Additions must be clearly marked as yours. Attribution required: *"Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven"* (or "… and other data sources"). **You may not charge end users for the NEVO data itself.** | Best generic NL ingredient base. Keep NEVO values unedited and serve them without a paywall. |
| **Portie-online 2026/2.0** (RIVM + Wageningen University) | NL | Measures and weights per NEVO code | All IP belongs to RIVM / the State. Use is allowed **"only in unchanged form and with source and version"**, cited as *"Portie-online versie 2026/2.0, RIVM, Bilthoven"*. Excel download is available. The page's `DCTERMS.rights: CC0` meta tag appears to be template boilerplate, so **do not rely on it**. | **Primary source for "1 medium onion" units in NL.** |
| **CIQUAL 2025** (ANSES) | FR | **3,484 foods, 74 components**; 300 new foods since 2020 | Earlier versions on data.gouv.fr use **Licence Ouverte / Etalab** (open, attribution). **[UNVERIFIED]** The 2025 dataset's licence is on recherche.data.gouv.fr, which blocked fetching. | Good second source for EU generics. |
| **USDA FoodData Central** | US | Foundation, SR Legacy, FNDDS, Branded | **CC0 1.0 (public domain)**; attribution requested. API key (data.gov), **1,000 req/h/IP**. Responses include `foodPortions` with household measures (verified via API). | Unit weights and generics; mostly US products. |
| **Swedish Food Agency (Livsmedelsverket)** | SE | about 2,500 foods, 50+ nutrients | **CC BY 4.0**; REST API (JSON) | An open-licensed EU option. |
| **EuroFIR FoodEXplorer** | EU (many national databases) | Aggregator | Members only, or pay-per-view. Republishing needs **written approval from EuroFIR with 28 days' notice**, and national licences apply. | Not suitable for bundling. |
| **Fineli** (Finland) | FI | — | Licence page blocked by robots.txt. **[UNVERIFIED]** Believed to be CC BY 4.0. | Possible. |
| **Open Food Facts** | Global, strong in EU | about 4M branded products | ODbL / DbCL / CC BY-SA (see Section 5) | Branded barcodes. Share-alike applies to derived databases. |

Recommended layering for Hemlo:
1. **NEVO** for generic NL foods (unchanged, attributed, free to the user).
2. **Portie-online** for unit weights.
3. **OFF** for barcodes.
4. **USDA FDC** (CC0) as a fallback for missing household measures.
5. User custom foods, marked as user data.

#### Sources
- NEVO conditions of use 2025/9.0 — https://www.rivm.nl/sites/default/files/2025-11/Conditions-of-use-NEVO-online-2025-dataset.pdf
- NEVO background information 2025 — https://www.rivm.nl/sites/default/files/2025-11/NEVO-online-background-information-2025.pdf
- Portie-online — https://portie-online.rivm.nl/
- Portie-online copyright and disclaimer — https://www.rivm.nl/portiegrootte-voedingsmiddelen/copyright-en-disclaimer
- CIQUAL 2025 table — https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table
- CIQUAL on data.gouv.fr — https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual/
- USDA FDC API guide — https://fdc.nal.usda.gov/api-guide
- USDA FDC API (queried directly) — https://api.nal.usda.gov/fdc/v1/foods
- Livsmedelsverket food composition data — https://www.livsmedelsverket.se/en/about-us/open-data/food-composition-data/
- EuroFIR FoodEXplorer — https://www.eurofir.org/our-tools/foodexplorer/


### 12. Unit weights for produce sold per piece (NL/EU)

#### Primary source: RIVM Portie-online 2026/2.0
- Pulled from the site's details view on 2026-10-01. The raw HTML is saved as `portie_details_raw.html` in this folder.
- "met afval" = as bought, including peel, core and waste. "zonder afval" = edible part.
- **Use the edible weight for nutrition, because NEVO values are per 100 g edible portion.** Use the as-bought weight for the shopping list and pantry.

| Item (NL name) | Small | Medium | Large | Edible factor | Notes |
|---------------------------|---------------|-------------|-----------|-------------|-------------------------------|
| Onion (ui), Ø<6 / 6–7 / >7 cm | 57 g (60 as bought) | **95 g (100)** | 142 g (150) | 0.95 | Extra-large stuffing onion 238 (260). 1 tbsp = 20 g. Red onion as bought: 60/100/150 |
| Garlic clove (teentje knoflook) | 2 g | **3 g** | 6 g | 0.85 | Bulb = 50 g as bought; solo garlic = 25 g |
| Egg, chicken, raw (ei) | S **40 g** | M **50 g** | L **60 g** | — | "1 egg" = 50 g. Bantam 35 g, double yolk 65 g, quail 25 g. Portie-online gives no XL value |
| Banana (banaan) | 100 g (143 with peel) | **130 g (186)** | 165 g (236) | 0.70 | |
| Apple with skin (appel), Ø<6.5 / 6.5–7.5 / >7.5 cm | 76 g (85 with core) | **135 g (150)** | 162 g (180) | 0.9 without core | |
| Tomato (tomaat), Ø<4 / 4–6 / >6 cm | 66 g (70) | **89 g (94)** | 138 g (145) | 0.95 | Cherry tomato 10 g; beef tomato 142 (150); slice 15 g |
| Potato raw (aardappel), length <6.5 / 6.5–7.5 / >7.5 cm | 50 g peeled (63 with skin) | **70 g (88)** | 100 g (125) | 0.8 | Baby potato (kriel) 25 g |
| Carrot, winter carrot (winterpeen) | 144 g (160) | **243 g (270)** | 338 g (375) | 0.9 | Bunch carrot (bospeen) 20 g each; bunch 455 g |
| Bell pepper (paprika) | — | **136 g (170)** | — | 0.8 | Strip 3 g |
| Cucumber (komkommer), <31 / 31–34 / >34 cm | 304 g (320) | **399 g (420)** | 522 g (550) | 0.95 | 10 g per cm. Snack cucumber 36 g. Serving = 1/5 cucumber = 84 g |
| Avocado, <10 / 10–11 / >11 cm | 80 g | **180 g** | 300 g | 0.72 | Weights are without skin and stone |
| Lemon (citroen) | — | **67 g (128 with peel)** | — | 0.52 | Slice 6 g (12 g with peel) |
| Lime (limoen) | 24 g (35) | — | 62 g (88) | 0.70 | Juice of 1 lime = 10 g |
| Courgette, <22 / 22–24 / >24 cm | 250 g | **400 g** | 550 g | 0.9 | Weights are as bought. 1 tbsp = 30 g |
| Leek (prei), <45 / 45–50 / >50 cm | 80 g (100) | **128 g (160)** | 220 g (275) | 0.8 | |
| Orange (sinaasappel) | 70 g (100) | **130 g (186)** | 170 g (243) | 0.70 | Segment 10 g |
| Mandarin (mandarijn) | 30 g (40) | **60 g (80)** | 80 g (107) | 0.75 | |
| Pear with skin (peer) | — | **214 g (225 with core)** | — | 0.95 without core | |
| Kiwi | — | **75 g (90 with skin)** | — | 0.83 | |
| Mushroom (champignon), cap <3 / 3–4 / >4 cm | 9 g | **14 g** | 22 g | 0.9 | Punnet (bakje) 230 g (250) |
| Broccoli head | 198 g (360) | **236 g (430)** | 275 g (500) | 0.55 | |
| Aubergine | 250 g | **400 g** | 600 g | 0.8 | Weights are as bought |

#### EU egg size classes: Commission Regulation (EC) No 589/2008, Art. 4
- XL ≥ 73 g
- L ≥ 63 g and < 73 g
- M ≥ 53 g and < 63 g
- S < 53 g

These are **whole-egg weights in the shell**. RIVM's 40/50/60 g are lower, which suggests edible content without shell. **[UNVERIFIED]** I did not confirm this interpretation in the Portie-online column notes.

**[UNVERIFIED]** Reg. 589/2008 has since been replaced by Delegated Regulation (EU) 2023/2465. I believe the weight grades were carried over unchanged, but did not check.

#### Cross-checks
- **USDA FDC (SR Legacy `foodPortions`, edible portion)**, queried live:
  - onion medium (2½" Ø) 110 g, small 70 g, large 150 g
  - egg large 50 g, medium 44 g, XL 56 g, small 38 g
  - banana medium 118 g
  - apple medium (3") 182 g
  - tomato medium 123 g, cherry 17 g
  - potato medium 213 g
  - carrot medium 61 g
  - red pepper medium 119 g, large 164 g
  - cucumber (8¼") 301 g
  - avocado 201 g
  - lemon without peel 58–84 g
  - zucchini medium 196 g
  - leek 89 g
  - garlic clove 3 g

  The US sizes differ from NL (bigger potatoes and apples, smaller carrots and courgettes), so **prefer Portie-online for NL**.
- **Belgium, NUBEL / Hoge Gezondheidsraad "Maten en gewichten"** (medium):
  - onion 115 g, apple 140 g, avocado 160 g, banana 130 g, egg 50 g, lemon 70 g, tomato 150 g, carrot 100 g, bell pepper 185 g, orange 140 g, pear 160 g, kiwi 75 g, mandarin 60 g
  - The "abrikoos 150 g" entry looks like a typo.

#### Hemlo implementation
- Each ingredient stores a list of units, e.g. `{label:"medium", grams_edible:95, grams_as_bought:100, source:"Portie-online 2026/2.0"}`.
- Default to "medium" when the user types "1 onion".

#### Sources
- Portie-online — https://portie-online.rivm.nl/ (search and details queries were run against this site)
- RIVM, Portie-online copyright — https://www.rivm.nl/portiegrootte-voedingsmiddelen/copyright-en-disclaimer
- Reg. (EC) 589/2008 Art. 4 — https://www.legislation.gov.uk/eur/2008/589/article/4/adopted
- USDA FDC API (SR Legacy fdcIds 170000, 171287, 173944, 171688, 170457, 170026, 170393, 170108, 168409, 171705, 167746, 169291, 169246, 169230) — https://api.nal.usda.gov/fdc/v1/foods
- NUBEL "Maten en gewichten" (Belgian Superior Health Council working group) — https://www.nubel.be/wp-content/uploads/2023/01/MatenEnGewichten.pdf?lang=nl


### 13. Physical activity level (PAL) for TDEE

#### Definitions
PAL = TEE / BMR over 24 hours. App "activity multipliers" are the same ratio: TDEE = BMR (Mifflin, Cunningham or Henry) × factor.

#### Authoritative categories

| Source | Categories (PAL) |
|-------------------------|-------------------------------------------------------------------------------------|
| **FAO/WHO/UNU 2001** (published 2004), Table 5.3 | Sedentary or light activity **1.40–1.69**; Active or moderately active **1.70–1.99**; Vigorous **2.00–2.40**. "PAL values > 2.40 are difficult to maintain over a long period of time." |
| **EFSA 2013** (energy DRVs) | Uses PAL **1.4, 1.6, 1.8, 2.0** for "low active (sedentary), moderately active, active and very active lifestyles", with BMR from Henry (2005). |
| **IOM 2002/2005 DRI** | Sedentary 1.0–<1.4; Low active 1.4–<1.6; Active 1.6–<1.9; Very active 1.9–<2.5. Walking equivalents at 3–4 mph for a 70 kg adult: 0 / 2.2 / 7.3 / 16.7 miles per day. "At least 60 min of moderate activity is required to raise the PAL from the sedentary to the active category." About 66% of healthy-weight adults measured by doubly labelled water had PAL > 1.6. |
| **NASEM 2023 DRI for Energy** (adults) | Inactive 1.0–<1.53; Low active 1.53–<1.69; Active 1.69–<1.85; Very active 1.85–<2.5. Notes "a valid, reliable tool does not exist to enable accurate classification of an individual's PAL category", and that step counts are only weakly associated with PAL. |

#### FAO example lifestyles (Table 5.1 factorial examples)
- **Sedentary/light, PAL 1.53.**
  - 8 h sleep (PAR 1.0), 1 h personal care (2.3), 1 h eating (1.5), 1 h cooking (2.1)
  - **8 h sitting office work (1.5)**
  - 1 h household (2.8), 1 h driving (2.0), **1 h walking (3.2)**, 2 h sitting leisure (1.4)
- **Active/moderate, PAL 1.76.**
  - 8 h sleep, 1 h personal care, 1 h eating
  - **8 h standing work with light loads (2.2)**
  - 1 h commuting (1.2), 1 h walking (3.2), **1 h aerobic exercise (4.2)**, 3 h leisure (1.4)
- **Vigorous, PAL 2.25.** About 6 h of non-mechanised agricultural work (4.1) plus water and wood carrying.
- **Narrative examples:**
  - Sedentary: male urban office workers who rarely do demanding activity.
  - Active: construction workers or masons, and **people with sedentary jobs who exercise about 1 h per day** (jogging, cycling, aerobics).
  - Vigorous: about 2 h of swimming or dancing per day, or heavy manual farm work.
- **Minimum PAL:** for emergency populations FAO recommends **1.40** rather than the earlier 1.27 baseline, "as people retain some activity".

#### Common app multipliers
- Many TDEE calculators use **1.2 / 1.375 / 1.55 / 1.725 / 1.9** (Sedentary, Lightly, Moderately, Very, Extremely active).
- Cronometer uses 1.2 / 1.375 / 1.5 / 1.9 (Section 1).
- **[UNVERIFIED]** The origin of these factors is commonly attributed to McArdle/Katch exercise-physiology texts. The calculator page I opened claims IOM/WHO origins without citation.
- MyFitnessPal applies its level to **non-exercise activity only** and logs workouts separately.

#### Why "office worker = 1.2" usually underestimates
1. **1.2 is below every authoritative floor.**
   - FAO's lowest category starts at **1.40**, and FAO uses 1.40 even for emergency rations.
   - EFSA's lowest planning value is **1.4**.
   - FAO's worked example of an office worker with 1 h of walking comes out at **1.53**.
   - NASEM's "inactive" band runs up to 1.53.
2. **The arithmetic doesn't leave room for normal living.**
   - At 1.2, all expenditure above BMR is only 20% of BMR.
   - The thermic effect of food alone is commonly put at about 10% of intake. **[UNVERIFIED]** I did not open a source for this figure.
   - That leaves about 10% of BMR for all standing, walking, chores and fidgeting, which matches bed rest or hospitalisation more than a person who commutes and runs a household.
3. **Measured data agree.** Doubly-labelled-water data behind IOM found about two-thirds of healthy-weight adults above PAL 1.6.
4. **The size of the gap matters.** For a BMR of 1,700 kcal, 1.2 gives 2,040 kcal while 1.45–1.55 gives 2,465–2,635 kcal. That is **400–600 kcal/day too low**.
   - A "deficit" built on 1.2 becomes an unnecessarily aggressive cut.
   - MacroFactor itself warns the initial estimate can be off by 400–500 kcal, and recommends correcting it from intake plus trend weight.
5. **Caveat.** 1.2 is only defensible when **exercise and steps are added separately**, as in MFP. Even then it ignores routine daily movement: home life, shopping and the commute.

#### Proposed Hemlo lifestyle presets
- **This table is Hemlo's own proposal**, built on the FAO factorial method and PAR values, the EFSA/FAO/NASEM bands, and Tudor-Locke step zones.
- **Step ranges are approximate guides, not equivalences.** NASEM notes steps are only weakly associated with PAL.
- The "Derived PAL" column is my factorial calculation. Only the rows marked FAO are quoted directly.

| Preset | Typical day | Steps/day (Tudor-Locke zone) | Derived PAL | Suggested default | Basis |
|---------------------|-----------------|--------------------|----------------|--------------|----------------------|
| **A. Mostly resting** | Housebound, recovery or illness, almost no walking | < 3,000 | 1.25–1.39 | **1.3** | Below FAO's floor. Only for genuine bed or chair rest. |
| **B. Desk job, no exercise, car or transit commute** | 8 h sitting at work, ~30 min walking, 3.5 h TV or sitting leisure | 3,000–5,000 (sedentary, < 5,000) | **≈1.43** (8×1.0 + 2.3 + 1.5 + 8×1.5 + 2.0 + 0.5×3.2 + 2.1 + 3.5×1.4 = 34.4 / 24) | **1.4** | FAO lower bound; EFSA "low active" 1.4 |
| **C. Desk job, walks or cycles to work, or a daily 1 h walk** | Like FAO's office example: 1 h walking plus 1 h household chores | 5,000–7,500 (low active) | **1.53** (FAO's own example) | **1.5** | FAO Table 5.1 sedentary/light example |
| **D. Desk job + 2–3 workouts/week (gym about 1 h) + some walking** | As C, plus about 3 h/week of exercise (≈0.43 h/day at PAR ≈ 4.2) | 6,000–9,000 (low to somewhat active) | **≈1.55–1.60** (C + 0.43 h × (4.2 − 1.4) / 24 ≈ +0.05) | **1.6** | EFSA "moderately active" 1.6 |
| **E. Desk job + daily ~1 h training** (or 5–6 hard sessions/week) | FAO: "sedentary jobs who exercise ~1 h daily" | 8,000–12,000 | 1.70–1.80 | **1.75** | FAO active band; EFSA 1.8 "active" |
| **F. Standing job** (retail, nurse, teacher, hairdresser, lab) | 8 h standing or light moving (PAR 2.2), commute, 1 h walking, no gym | 8,000–12,000 (somewhat active to active) | **≈1.67** (FAO active example minus the 1 h aerobics: 40.1/24) | **1.65** | FAO PAR values |
| **G. Standing job + 3+ workouts/week** | As F plus training | 10,000–14,000 | 1.75–1.85 | **1.8** | FAO active band (example 1.76) |
| **H. Physical job** (warehouse order-picking, construction, mason, courier on foot or bike, farm work) | Several hours of carrying or lifting and continuous walking | 12,500–20,000+ (highly active) | 1.85–2.0 | **1.9** | FAO lists construction workers and masons as active (1.70–1.99); EFSA 2.0 "very active" |
| **I. Very heavy labour or endurance athlete** | 2+ h/day of hard training, or heavy manual work all day | 15,000–25,000+ or high-volume cardio | 2.0–2.4 | **2.2** | FAO vigorous 2.00–2.40 (example 2.25); > 2.4 is not sustainable long-term |

**Tudor-Locke 2008 step zones (adults):**
- < 5,000 = sedentary
- 5,000–7,499 = low active
- 7,500–9,999 = somewhat active
- 10,000–12,499 = active
- ≥ 12,500 = highly active

30 min/day of moderate activity translates to about **3,000–4,000 steps** taken at ≥ 100 steps/min, on top of the baseline.

The < 5,000 sedentary index was reaffirmed by Tudor-Locke et al. in 2013.

#### UX recommendations for Hemlo
1. **Ask two separate questions:** work type (sitting, standing, physical) and planned training per week. Map the answers to the presets above instead of showing one vague "activity level" list.
2. **Show the preset's example day and step range** next to each option (for example "Desk job + 2–3 gym sessions, about 6–9k steps → 1.6").
3. **Never default to 1.2.** Default to 1.4–1.5, and show a note that 1.2 means "resting most of the day".
4. If Hemlo logs workouts and steps separately, **do not double count**. Either use a NEAT-only preset plus logged exercise, as MFP does, or use a total-PAL preset without adding exercise calories. Make this a single explicit choice.
5. After 2–3 weeks of nutrition logs and weigh-ins, **replace the preset with an adaptive estimate**: TDEE ≈ intake − Δ(trend weight) × energy density. This is MacroFactor's approach, with ≥ 6 of 7 days logged and at least one weigh-in per week.

#### Sources
- FAO/WHO/UNU, Human energy requirements (2001 consultation, 2004), Chapter 5 — https://www.fao.org/4/y5686e/y5686e07.htm
- EFSA NDA Panel 2013, DRVs for energy (abstract via Europe PMC, PMC13159830) — https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2013.3005
- Europe PMC record used for the EFSA abstract — https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.2903/j.efsa.2013.3005&resultType=core&format=json
- Brooks et al., Chronicle of the IOM physical activity recommendation (AJCN) — https://www.sciencedirect.com/science/article/pii/S000291652203948X
- NASEM 2023, DRIs for Energy, Ch. 7 Applications — https://www.nationalacademies.org/read/26818/chapter/9
- Tudor-Locke et al. 2008, Revisiting "How Many Steps Are Enough?" (MSSE; abstract via Europe PMC, PMID 18562971) — https://pubmed.ncbi.nlm.nih.gov/18562971/
- Tudor-Locke et al. 2013, A step-defined sedentary lifestyle index: < 5000 steps/day — https://cdnsciencepub.com/doi/10.1139/apnm-2012-0235
- Cronometer staff, activity-level multipliers — https://forums.cronometer.com/discussion/comment/11163
- Activity multipliers table (low-authority calculator site) — https://www.calculatemytdee.org/blog/activity-level-multipliers
- MacroFactor Help, expenditure — https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure


### 14. Cross-module ideas ranked for Hemlo (synthesis)

1. **One shared food and unit model** across logging, recipes, shopping list and pantry:
   - NEVO + Portie-online + OFF + USDA;
   - nutrients per 100 g following EU 1169;
   - a list of named units with edible and as-bought grams.
2. **Fast logging:** history and favourites before typing, multi-add to a staging plate, a single log action, and copy/paste of an hour or a day.
3. **Meals as flexible tags on timed entries.** Default to Breakfast/Lunch/Dinner/Snack but let users rename, add or hide them, and allow timeline mode. This avoids Yazio's fixed four and MFP's cap of five.
4. **Recipe → list → pantry loop:**
   - recipe to list with merged quantities;
   - pantry items skipped automatically;
   - "cooked" or "logged" deducts stock;
   - minimum stock feeds the list.
5. **Shopping list UX:**
   - icon tiles with a recently-used strip;
   - "2 kg apples" parsing;
   - reorderable, collapsible sections per store, plus custom sections.
6. **Trend weight plus adaptive TDEE** from the logs. Use honest PAL presets, never 1.2 by default.
7. **Training logger:** prefill from last time, PREVIOUS column, rest timer on tick, routines as calendar blocks.
8. **Supplements:** dose ticks decrement stock, refill alert, one-tap "take stack". Keep it free.
9. **Sleep:** target duration, running deficit and regularity, bedtime reminder, Health Connect import.


