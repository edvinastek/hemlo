# Engineer B — running log (v16/b)

Notes and templates, habits, household chores, supplements.

## Plan
1. Pure rules + checks: tracking-rules (habit streak/strength/history/day checklist, supplement slots and schedule),
   notes.ts (indent, move, ticked last, hidden codes), template-rules (day count, fill chips, list ops, apply),
   recipe-note-rules (blocks, update from recipe, combined list), chore-rules (packs, words, light days/cap),
   schedule-rules (chore pause dates).
2. Migration 030 (habit colour/mark/day_part; supplement rule/start/end; chore paused_from/until) + security.sql.
3. Notes UI: NoteEditor (Insert template / recipe / save as template, indent, markers in words), TemplatePicker,
   RecipeInsert, NotesPage (links, markers, reorder, ticked last), settings/NoteTemplates + More line.
4. Habits page + HabitSheet. 5. Supplements page + slots + day-items. 6. Chores page + ChoreSheet + ModulePage line.
7. HAB-23. 8. e2e file, screenshots, verification.

## Done
- Rules + checks (tracking, notes, notetemplates, household, schedule pause) — committed.
- Migration 030 + security.sql (145 pass on pgb/55440) — committed.
- Notes UI: NoteEditor Insert menu, TemplatePicker, RecipeInsert, NotesPage moves/ticked last, settings/NoteTemplates — committed.
- Habits page + HabitSheet; HAB-23 (def-rules habits.daily -> always; retireHabitsDailyRule) — committed.
- Supplements page + slots + SupplementSheet; day-items feed (slots, chore prefs, member names, day part) — committed.
- Chores page + ChoreSheet + packs + holiday/light days + names + old records; ModulePage line — committed.

- e2e tracking updated; screenshots in scratchpad/shots/b; tsc, check, build pass.

## Left
- report to lead.
