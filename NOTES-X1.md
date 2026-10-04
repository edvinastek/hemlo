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
