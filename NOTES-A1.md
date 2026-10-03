# A1 running log (Today and the day rail)

Plan, in order; each step committed when tsc passes.

1. hold-rules.ts (two-stage hold as a pure state machine) + hold.check.mjs; useLongPress two-stage, old callers unchanged.
2. day-items-rules extensions (rail groups, all-day events, followed calendar colour, habit logs not done, checklist "mark done?"), push past midnight in reorder-rules; checks.
3. today-prefs-rules (+ menu entries, order by use, hidden; layout; carry-over open) + check; today-prefs.ts (core module_instance.settings.today).
4. DragList over mixed rail entries; ItemRow (+css); DayRail.
5. Today rewrite: own header, Tomorrow peek, Inbox link, cards slot, carry-over row, tabs kept.
6. AddMenu (+ on Today and Plan).
7. After-done sheet, Move to…, push asks a time, Undo everywhere.
8. HoldSettings panel + More line.
9. e2e updates, README, screenshots, final tsc/check/build.

## Done
- 1 hold-rules + useLongPress (b6128e2)
- 2 day-items extensions, push rules (f817ad9)
- 3 today-prefs (23581ab)
- 4-7 DragList/ItemRow/DayRail/RailSheets/rail-actions, Today rewrite, AddMenu, CarryOverRow (8ad00e5)

## Left
- HoldSettings + More line
- build check, screenshots (harness), e2e updates (reorder, tasksheet), README e2e notes
- report
