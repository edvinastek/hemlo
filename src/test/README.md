# Checks

## Rule checks — `npm run check`

Types, then every check that needs nothing but Node. CI runs the same command.

- `calc` — BMR, maintenance, goal adjustments, protein, macros, packs, meal sizing.
- `formula` — the calculated-field parser, including that a formula cannot reach the page.
- `notify` — quiet hours across midnight, reminder wording.
- `body` — weigh-in parsing, the 7-day trend, when targets are recalculated.
- `series` — repeat rules, laying out days, "only this one" and "this and following".
- `tracking` — habit schedules and streaks, supplement slots.
- `review` — which tasks the evening review offers, and what each action does.
- `import` — reading the Excel workbook, ingredient lines, matching foods.
- `allowlist` — the invite-list script.

## Browser checks

They need the app built and served (`npm run build`, then
`npx vite preview --port 4173 --host 127.0.0.1`), and accounts to sign in as.
Make throwaway ones, run, and delete them afterwards:

```sh
export SB=<Supabase access token>  TEST_PASSWORD=<random>
export TEST_EMAIL=e2e-a@example.invalid TEST_NEW_EMAIL=e2e-b@example.invalid TEST_FEAT_EMAIL=e2e-c@example.invalid
node scripts/test-accounts.mjs create $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL
for t in features offline privacy tracking tour; do node src/test/$t.e2e.mjs || break; done
node scripts/test-accounts.mjs delete $TEST_EMAIL $TEST_NEW_EMAIL $TEST_FEAT_EMAIL
```

Never commit the password or the token. Every query in these checks is scoped
to the test accounts, because they run against the live project.

- `features` — a tester's first ten minutes: tasks, meals, shopping, reminders, the policy.
- `offline` — works with the network cut, survives a reload offline, catches up after.
- `privacy` — the first-run wizard, sign-out leaves nothing on the device, account deletion.
- `tracking` — weigh-in, habits and supplements, the same tick from two offline phones,
  a repeating task, the evening review, the Excel import, an export read into another account.
- `tour` — walks every screen and reports what rendered.

## Database — `supabase/test.sh`

Runs `supabase/tests/security.sql`: 30 attacks on the database — reading another
account's data, taking over a household, writing to shared catalogue rows,
signing up uninvited, deleting an account and what it leaves behind. It runs in
a transaction that rolls back, so it is safe against the live project.
