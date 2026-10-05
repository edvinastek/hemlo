# Visuma

Visuma is Lithuanian for "the whole": the whole of your life in one app. It was
called GetIt until version 20 (app ID `app.visuma.planner`, formerly
`app.getit.planner`).

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

## Releasing

Phones come first. `docs/android-release.md` covers the one-time upload key and
the public privacy and deletion pages, then each release. Everything Google
Play asks, answered to match the app, is in `store/play-console-answers.md`;
the listing text, icon, feature graphic and screenshots are in `store/`.
The iPhone app (built by GitHub's Macs and sent to TestFlight) is in
`docs/ios-release.md`, with App Store Connect's questions answered in
`store/app-store-answers.md`.

## Where each client comes from

Push to `main` and the workflow in `.github/workflows/build.yml` builds all
three on GitHub's runners:

| Client | Downloaded from | Notes |
| --- | --- | --- |
| Android | The run's `visuma-android-release` artifact | Signed App Bundle for Google Play, and an APK |
| iPhone | TestFlight, and the run's `visuma-ios-release` artifact | Only when the version changed or the run was started by hand; signed and uploaded once the Apple secrets are set (`docs/ios-release.md`) |
| Windows | The run's `visuma-windows` artifact | NSIS installer and MSI |
| Web | The run's `visuma-web` artifact | Static files; host anywhere |
| Public site | The run's `visuma-site` artifact | Privacy policy and account deletion pages |

All of them carry the version in `package.json`.

Two repository secrets are needed first, under Settings → Secrets and variables
→ Actions: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are
safe to store there — the publishable key is public by design and row-level
security is what protects the data. The Android signing secrets and the site's
secrets are listed in `docs/android-release.md`.

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
