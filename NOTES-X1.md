# NOTES-X1 (version 19, branch v19/x1)

Planner extras: TSK-07 quick add, TOD-22 Plan my day, TOD-23 Close the day, GEN-70 day start and end,
AGN-07 busy all-day events.

## Decisions
- GEN-70 boundary: the day's cut-off comes from **day end**. When the day ends after midnight (day end earlier
  than day start, e.g. 09:00 to 01:30), the hours from midnight until day end still belong to the day before
  (Today, ticks, food logs, the review). A day that ends before midnight (the default 06:00 to 22:00) changes
  nothing: the calendar day is the day. The cut-off is never later than 12:00, so a broken pair can never
  hold "yesterday" past noon. Why not day start: a person who wakes at 05:30 with day start 06:00 would see
  yesterday at breakfast; day end is the edge people mean when they say "it is still Friday night".

## Log
- GEN-70 one helper: `planDay(now, profile)` in src/lib/day-edge-rules.ts (pure, `dayedge` check) and
  `planToday()` / `planDayOf()` in src/lib/day-edge.ts (reads the open profile from the store). Routed: useToday
  (moved to src/ui/useToday.ts; DayRail re-exports it), useDayRange, ModuleKit.localToday (covers Training, Learning,
  Projects, Finance, Sleep, Goals, Health), tasks.ts (ticks), series.ts (fill, follow, stop), review.ts,
  ReviewCard, reviewOpen (new optional `today`), TaskSheet, Food page, AddFoodSheet, FoodUnits, RecipeView,
  WeighIn, Habits, Chores, Supplements, Stats, TodayCards, stats-widget, widget.ts, shopping.ts, meals.ts,
  planned.ts, NoteEditor, RailSheets, ModuleEditor, BodySettings, PlanningSettings, src/modules (RecordSheet,
  RecordTools, record-repeat, views, Grid, Chart, ModulePage), PageHead's week strip. Left on the calendar day on
  purpose: file names (export, backup), Tips' once-a-day state, followed calendars' fetch window, reminders
  (notify.ts schedules clock times), onboarding start dates, the transfer screen's date pickers.
- GEN-70 edges on the rail: a late day's hours after midnight sort last (`cutoff` in DayItemSources, nowSlot and
  railGroups take it); "Day starts 06:00" / "Day ends 22:00" dashed lines on the timeline only where something
  falls outside, and only when switched on in the ⋮ ("Show day start and end", PlanPrefs.day_edges, off by
  default: CALM). Plan's Day view is the same rail. New RailEntry type 'edge' in DragList.
- TSK-07: src/lib/quick-add-rules.ts (`quickadd` check, ~90 cases). Task sheet: readings applied over the form
  (withQuickAdd in task-sheet-rules.ts), only for a new task once the person types in the name; a field set by
  hand wins; a chip tap takes the reading away (words stay). Inbox line: same chips; a line read as a day leaves
  the Inbox, so an "Open" bar says where it went. Switch: Settings → Planning → "Read dates and times from what
  I type" (PlanPrefs.quick_add, on by default).
- AGN-07: TRANSP kept from followed calendars (ParsedEvent.transp, IncomingEvent.busy, CalendarEvent.busy, local
  only: followed events are never synced, so no column). Warning: task sheet (line + Save says "Plan anyway"),
  Move to… sheet (in its warnings, "Move anyway"), Copy sheet (line + "Copy anyway"); drags in the week, the
  Inbox's drop and Plan for…, the select bar and Close the day's move to tomorrow add it to the Undo line.
  Agenda's built-in rule no_overlap is now 'switch' (def-rules.ts) with a new sentence (registry.ts); switching
  it off stops the warning. Own events: no busy mark (free, as Google's whole-day events are by default).
- TOD-22: src/lib/plan-day-rules.ts (+ `closeday` check), loader src/lib/plan-day.ts, sheet
  src/sections/PlanMyDay.tsx. Capacity: PlanPrefs.capacity_min (null = waking day from day start/end), also
  used by Plan's busy bars (capacityOf). Flexible household chores taken in Plan my day are pinned to today
  (PlanPrefs.today_chores, dayItems `pinnedChores`). Study reviews use X3's `reviewsDue` (file copied from
  v19/x3 as-is) when Learning's `review_schedule` is on; taking one makes a 30-minute "Review <subject>" task.
  First open of the day: device meta `plan_day_shown`; offered only when there is something to decide.
- TOD-23: src/lib/close-day-rules.ts, sheet src/sections/CloseDay.tsx; from the review (compact list when open,
  and the Evening tab's full review) and Today's ⋮. Moves use rail-actions `carry` (the review's own counting).
- Settings → Planning → "Your day": day start, day end (profile fields), hours a day can hold, Plan my day switch,
  quick add switch. Settings search entry "Your day".
