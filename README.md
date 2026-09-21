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
