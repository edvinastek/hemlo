# NOTES-INT17 — v17 integration: live tests green, one calm walk

Running log, newest last. Runner: scratchpad/int17/run.sh <test> (sources the env, never prints it).

## e2e
- offline — test: pushes now live in the open row (⋮ → Open here → Push 30 min); setup moved before sign-in (a
  task removed after the first pull stayed on the device: two rows). App: the row ⋮ (11 items) opened above a row
  near the top and ran off the screen; it now opens on the side with more room and scrolls inside itself.
- Console error on every page with holidays: "Moment Timezone has no data for Europe/Amsterdam" — the build's
  trimmed zones left links pointing at links; flattenLinks (src/lib/tz-links-rules.ts, checked in holidays.check).
- tracking — test: Today's parts via todayPart (tabs, or the Show choice past three); + → add menu → Task; Mobility
  row may still be open after Edit (weekend: due today); household waited for (moduleHere, after a reload) before its
  page; Water ticked from Today's Body on phone A; import counts measured on top of earlier runs; food count scoped
  to the account; "everything was sent" waits for the queue to drain. App: the sync's fold into a server twin
  (module_instance) deleted then put in two steps, so a module read as off for a moment and Today dropped the chosen
  Body tab after a weigh-in on a new account: now one Dexie transaction.
- widget — passes (failure was the stale account).
- tasksheet — test: 'Minutes' also matched "End time instead of minutes"; plain-row height measured from a bare row
  (rows are 49 px since the rail; the 44 px constant was v15's).
- repeat — test: + → Task. App: "Every N days" only counted on blur, so the sentence (and a Save straight after) said
  2 while the field said 3; a good number now counts as typed.
- reorder — App: an open untimed row drew its body beside a 56 px head (app.css .row grid won over .ir in the build);
  .row.ir now.
- stock — test: lunch planned through the add-food sheet (the per-meal recipe field went in v16); exact food name;
  the amount's own unit group. App: Stock's add search offered deleted (replaced) foods: "Fig" was added as "Figs fresh".
- daytabs — test: Today has no week strip (v17); the Work tab is lost by work hours switched off elsewhere (sync), the
  chosen tab falls back to Today and stays.
- modules — test: Sleep's + "Add a night", quality buttons, nights table on the Nights tab.
- views — test: habit sheet Name; Today's parts via tabs or Show; the retired "daily habit" rule (HAB-23, v16) checked
  as Show on Today; Sleep's bedtime rule has a switch since v16. App: Today's tabs ignored Show on Today (a habit kept
  off Today still had its tab): offToday in day-tabs (node checks added).
- nav — test: the week-strip swipe on Plan's Day view.
- holidays — test: legend inside the view's Key; no strip on Today.
- stats — test: Stats on the bar or the Modules page (CALM-04); no-break space folded.
- transfer — test: Finance fast entry (v16); comma quoting checked on the note.
- books — App: holding on a read-only figure (kcal) in the recipe table did nothing; read-only fields no longer stop
  the hold.
- calendarlinks — test: a followed event is a read-only rail row on Today.
- units — test: kcal read from the table's read-only field.
- food-units — test: waits for %RI and the unit; keys sorted. App: an own unit on a shared food did not show until the
  page was reopened (now read live from Nutrition's settings).
- landscape — test: the date picker is on Plan's Day view.
