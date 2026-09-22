# GetIt

A modular planner that plans at every horizon — today's list to a full year — and
calculates food, training and shopping from the same data.

One React + TypeScript codebase ships three clients:

| Client  | Built with | Output |
| --- | --- | --- |
| Android | Capacitor  | `.apk` |
| Windows | Tauri      | `.exe` |
| Web     | Vite       | deployed build |

Data lives in Supabase (Postgres, eu-central-1) behind row-level security, with a
full local copy on each device so the app works offline and merges on reconnect.

## Layout

    supabase/migrations/   schema, RLS policies, seed
    seed/                  Excel extraction into the shared catalogue
    src/                   app (added next)

## Setup

Copy `.env.example` to `.env` and fill in the project URL and publishable key.

## Getting it running

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the publishable key from
   Supabase → Project Settings → API.
3. `npm run dev`

`npm run check` runs the calculation, formula and reminder checks. The two
end-to-end checks in `src/test` need a built app being served; `src/test/README.md`
says how.

## Where each client comes from

Push to `main` and the workflow in `.github/workflows/build.yml` builds all
three on GitHub's runners:

| Client | Downloaded from | Notes |
| --- | --- | --- |
| Web | Deployed to GitHub Pages | Also installs from the browser on Android |
| Android | The run's Artifacts, `getit-android` | Debug APK; sideload it |
| Windows | The run's Artifacts, `getit-windows` | NSIS installer and MSI |

Two repository secrets are needed first, under Settings → Secrets and variables
→ Actions: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are
safe to store there — the publishable key is public by design and row-level
security is what protects the data. Pages also has to be switched on once, under
Settings → Pages → Source: GitHub Actions.

## What is built

- **46 tables** with row-level security on every one, so a second account can
  see nothing of the first.
- **A shared catalogue** of 807 foods, 259 exercises and 26 recipes that every
  account starts with; personal logs stay private.
- **Local-first sync** — a full copy per device, field-level merge, and a
  conflict log the user can read rather than silent resolution.
- **A module engine** — 13 modules defined as fields, views and rules, with an
  editor that reads them the same way whether they shipped or were built.
- **Calculations, never stored figures** — the calorie budget, macro split,
  recipe macros, meal sizing and shopping quantities, checked against the spec.
