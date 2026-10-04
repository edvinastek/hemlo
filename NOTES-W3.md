# NOTES-W3 (v18) — modules, stats, reminders and the widget

Running log. Gaps from tasks18/w3.md, numbered 1–10.

## Log
- Started. Read brief, task, audit rows, calm.md, requirement rows.
- Gap 1 done: stats measures (sleep vs target/debt/regularity, trend weight + rate, habit strength (habitStrengths
  series, exact = Habits page), extra label figures, shopping spend + unpriced, Finance spent/income/net/budget/
  budget used). finance:entry:amount no longer offered; old views upgraded on read (upgradeSource). Checks:
  statsmeasures. pivot MeasureInfo.over lets budget used pass 100%.
- Gap 2: W1's useSelection/selection-rules/SelectBar copied byte-for-byte from v18/w1 e133c9a (lead: identical
  add/add, or take W1's). list-rules.ts (sort/filter/copy/stage) + modulelists check. RecordTools.tsx:
  useListTools (Generic page + DefView), OrderSheet, RecordSelectBar, CopyToDaySheet. ModuleHead gained
  useModuleMenuItems so views add items to the page's one ⋮. Finance Overview entries: hold to select.
- Gap 3 (MOD-12): migration 033 (stock columns + record-photos bucket/policies; storage part skipped where no
  Storage), security.sql section (B owner, M stranger since A deletes account earlier). Local proof:
  scratchpad/w3-localdb.sh with STORAGE=1 + w3-storage-stub.sql → 255 ok; plain localdb.sh → 248 ok.
  Dexie 14: photo table. photos.ts (resize, keep, upload after sync, daily tidy), photo-rules.ts + photos check.
- Gap 4 MOD-07: moduleSuggestions (def-rules) used in Onboarding (built modules switched on at finish) and in Settings
  → Starting layout (new describe box). Gap 5 LOOK-06: contrastNote(hex, papers), swatchesFor; ColourSettings uses
  the chosen theme's pages live and marks swallowed swatches.
- Gap 6/7: reminders for supplement slots (slot time), payments (time or 09:00, Paid button), refill reminders;
  tickFromReminder via setTaskDone (GEN-31), supplements slot tick, togglePaid. Stock: supplementStock etc. in
  tracking-rules (derived from ticks; columns 033 stock_count/stock_from/refill_days), UI on Supplements.
- Gap 8: ChorePrefs.mine_only (null = on when >1 member); day-items-rules choresFor filters Today/widget, not Plan.
- Gap 9: TodayWidget habit rows → app.getit.planner://open/m/habits?open=<id>; Habits reads ?open. Android compiles.
- Gap 10: TrackSheet useBackClose; habit/chore/supplement/payment/book/record sheets staged.
- Screens: shots18/w3 (20 × light/dark). Harness deleted.
- Final: tsc, check, vite build, localdb 001–033 + security 248 ok (255 ok with Storage stand-in).
