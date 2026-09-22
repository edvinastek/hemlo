# Checks

`npm run check` runs the three that need nothing but Node:

- `calc.check.mjs` — the calculations against figures worked by hand for a
  made-up person: BMR, maintenance, goal adjustments, protein, macros that
  reconcile to the budget, packs after stock, meal sizing.
- `formula.check.mjs` — the calculated-field parser, including that a formula
  cannot reach the page: `window.document` and `fetch(1)` both fail to parse.
- `notify.check.mjs` — quiet hours across midnight, and reminder wording.

The two end-to-end checks need a built app being served (`npm run build` then
`npm run preview`) and a browser:

- `tour.e2e.mjs` — signs in and walks all five screens, counting what rendered.
- `offline.e2e.mjs` — ticks and pushes with the network cut, reloads the page
  while still offline, reconnects, and checks the changes reached Postgres and
  the queue drained. Needs `SB` set to a Supabase access token.

Both end-to-end checks sign in as a throwaway account given in `TEST_EMAIL` and
`TEST_PASSWORD`. Never commit those, and delete the account afterwards.

`supabase/test.sh` runs `supabase/tests/security.sql`: 29 attacks on the
database — reading another account's data, taking over a household, writing to
shared catalogue rows, signing up uninvited, deleting an account. It runs in a
transaction that rolls back, so it is safe against the live project.
