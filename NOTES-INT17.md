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
