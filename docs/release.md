# Releasing GetIt: the checklist

Everything for a release, in order, in PowerShell, from the repository folder
(`C:\Users\edvin\Documents\GetIt16`). Version 19 is the first release made this
way; at that release the database still needs 033, 035 and 036 to 039.

You need Node and npm (installed), Git, a Supabase **personal access token**,
and for step 6 nothing else: the script fetches the Supabase command line tool
itself with `npx`.

## 1. Pull

```powershell
cd C:\Users\edvin\Documents\GetIt16
git checkout main
git pull
```

## 2. Install

```powershell
npm ci
```

## 3. Checks

```powershell
npm run check
npx vite build
```

Both must finish without `FAIL` or errors. Stop here if not.

## 4. A Supabase token for this release

Supabase → your avatar → Account → **Access Tokens** → Generate new token
(name it `release <date>`). Copy it, then:

```powershell
$env:SB = "sbp_..."
```

It lives only in this PowerShell window. Step 12 revokes it.

## 5. Database migrations

First see what would happen:

```powershell
node scripts/release.mjs --dry-run
```

The first time it says it would make the list of applied migrations, names
those it recognises as already applied (001 to 031), and lists what it would
apply (033, 035, 036, 037, 038, 039). Then:

```powershell
node scripts/release.mjs
```

Each migration runs in one transaction. If one fails, nothing of it is kept,
the run stops, and the message says which file and why; fix it and run the
same command again (it carries on from that file). Running it again when all
is applied says "No migrations to apply".

## 6. Server functions

```powershell
node scripts/release.mjs --functions
```

This brings the functions' shared rules up to date (`scripts/copy-shared.mjs`)
and deploys `calendar-feed`, `calendar-fetch`, `telegram-webhook` and
`telegram-send` with the Supabase command line tool, bundled on Supabase's
servers (no Docker). If a deploy fails, the script prints the commands to run
by hand, which are:

```powershell
$env:SUPABASE_ACCESS_TOKEN = $env:SB
npx --yes supabase@2.119.0 functions deploy calendar-feed --project-ref lphysuemxnmcuukzsoya --use-api --no-verify-jwt
npx --yes supabase@2.119.0 functions deploy calendar-fetch --project-ref lphysuemxnmcuukzsoya --use-api
npx --yes supabase@2.119.0 functions deploy telegram-webhook --project-ref lphysuemxnmcuukzsoya --use-api --no-verify-jwt
npx --yes supabase@2.119.0 functions deploy telegram-send --project-ref lphysuemxnmcuukzsoya --use-api --no-verify-jwt
```

## 7. Secrets

The Telegram bot first (docs/telegram.md, step 1), then `release.secrets.env`
in the repository folder (docs/telegram.md, step 2; Git ignores it). Then:

```powershell
node scripts/release.mjs --secrets --dry-run
node scripts/release.mjs --secrets
```

It names the secrets it sets and never prints their values.
`TELEGRAM_CRON_SECRET` also goes into Supabase Vault for the every-minute job.
Check the job is there (docs/telegram.md, step 3).

## 8. Telegram webhook

docs/telegram.md, step 4 (`setWebhook` with the secret), then step 6 to try it
once the app is built.

## 9. The public site (Netlify)

Only when the policy changed (version 19 adds Telegram and Health Connect, so
yes). With `VITE_CONTROLLER_NAME`, `VITE_CONTACT_EMAIL`, `VITE_SUPABASE_URL`
and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`:

```powershell
npm run build:site
```

Sign in at app.netlify.com, open the site → **Deploys**, and drag the
`dist-site` folder onto it (docs/android-release.md, "The public site").

## 10. Android build

Raise `version` in `package.json`, add `VITE_TELEGRAM_BOT` (the bot's username)
to `.env` and as a GitHub Actions variable, commit and push to `main`:

```powershell
git add package.json
git commit -m "Version 0.19.0"
git push
```

GitHub builds the signed App Bundle; download `getit-android-release` from the
run (docs/android-release.md, "Each release").

## 11. Play Console

- Testing → Closed testing (or Production) → Create new release → upload the
  `.aab`, write what is new.
- Store listing: texts from `store/listing.json`, phone screenshots from
  `store/screenshots/` (1080 × 1920; made by `node scripts/store-shots.mjs`).
- App content → Data safety: check `store/play-console-answers.md` still
  matches (version 19 adds Telegram reminders, sent only at the person's
  request, and Health Connect sleep, read on the phone).
- If the app now reads Health Connect: App content → Health apps declaration.

## 12. Revoke the tokens

- Supabase → Account → Access Tokens → **Revoke** the token from step 4, and
  close PowerShell (`$env:SB` goes with it).
- Keep `release.secrets.env` somewhere safe or delete it; the values live on
  Supabase now. Never commit it.

## The same from GitHub (optional)

Steps 5 and 6 can run on GitHub instead of your computer:

1. Make a Supabase token as in step 4 (one for GitHub, so you can revoke it on
   its own).
2. Repository → Settings → Secrets and variables → Actions → **New repository
   secret**: name `SUPABASE_ACCESS_TOKEN`, value the token.
3. Actions → **Deploy database and functions** → Run workflow. It runs every
   check first, then `node scripts/release.mjs --functions`. The box "Only say
   what would happen" is ticked by default: run it once like that, read the
   log, then run it again unticked.

It never runs on a push, and it does not set secrets (step 7 stays on your
computer). Delete the repository secret and revoke the token when you no
longer want GitHub to be able to change the database.
