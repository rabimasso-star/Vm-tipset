# VM-tipset

A football prediction game (in Swedish) for the 2026 World Cup. Friends create
private leagues, predict match scores, and compete on a live leaderboard with
auto-calculated group tables and a knockout bracket that resolves from their
own predictions.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — Postgres, Auth, Row-Level Security, and Edge Functions (Deno)
- **API-Football** (api-sports.io) for fixtures and results
- Deployed on **Vercel** (with cron jobs)

> Note: this repo pins a Next.js version whose APIs may differ from older
> releases. See `AGENTS.md` — when in doubt, read `node_modules/next/dist/docs/`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```

Open http://localhost:3000.

See `.env.example` for the full list of required environment variables
(Supabase keys, API-Football key, `CRON_SECRET`, admin email).

## Database

The full schema is version-controlled under `supabase/migrations/`:

- `20260601000000_baseline_schema.sql` — tables, enums, constraints, indexes,
  the scoring functions, the `leaderboard` view, triggers, RLS policies, grants.
- `20260602000000_*` / `20260602010000_*` — the `join_league_by_code` function
  used by invite links.

Apply migrations to a linked Supabase project:

```bash
npx supabase db push
```

Scoring, point recalculation, and prediction locking live in Postgres functions
(`calculate_prediction_points`, `recalculate_points_for_match`,
`lock_predictions_for_started_matches`, ...). New auth signups get a `profiles`
row via the `on_auth_user_created` trigger.

## Edge Functions

Deno functions under `supabase/functions/` (`import-matches`, `lock-predictions`,
`recalculate-league-points`, `refresh-leaderboard`, `sync-world-cup-results`).
Their env vars are set with `supabase secrets set` — see `.env.example`.

## Scheduled jobs

`vercel.json` defines daily cron jobs that call:

- `/api/sync-results` — pulls fixtures/results from API-Football into `matches`.
- `/api/lock-predictions` — locks predictions for matches that have kicked off.

Both authenticate via `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET`
in the Vercel project env vars; Vercel adds that header to cron requests
automatically.

## Project structure

```
app/
  page.tsx                     Login / register
  dashboard/                   Leagues overview, join by code
  dashboard/league/[id]/       League view: predictions, tables, bracket, leaderboard
  join/[code]/                 Invite-link landing -> joins the league
  tournaments/                 Browse tournaments, create a league
  admin/                       Match / CSV import tools
  api/sync-results/            Cron: sync results from API-Football
  api/lock-predictions/        Cron: lock started matches
  lib/supabaseClient.ts        Browser Supabase client
supabase/
  migrations/                  Versioned database schema
  functions/                   Deno edge functions
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
