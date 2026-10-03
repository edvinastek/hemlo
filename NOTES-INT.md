# NOTES-INT — integration of the ten v16 branches

Running log (newest last). Item numbers follow tasks/int.md.

- 1 Done. Plan's Day view draws DayRail (which lists the repeats to come, so Plan's own PlannedDay under it is gone). The shared + (AddFab) replaces Plan's own + on every view; on the Inbox its day is today and the Inbox's capture line still adds straight to the Inbox.
- 2 Done. Task sheet: ProjectField and GoalField after Section (they hide while Projects is off); a new task's note offers "Start from a note template" (the note editor's own picker, filled for the task's day/title/time); Save as template can bring that note template (note_template_id, NOT-15); applyTaskTemplate now goes through applyNoteTemplate (after-done ones as a marker via withAfterDone, beside the own note); template notes keep no ticks. tasksheet.check extended.
