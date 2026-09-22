# 🏈 Pick'em — NFL picks with friends

A real multiplayer NFL pick'em app. Create a group, share the invite code,
pick winners before kickoff, and climb the season leaderboard. Scores update
automatically from nflverse.

**MVP scope:** NFL only · straight winner picks · no spreads · no confidence
points · no push notifications · mobile-friendly web (no native apps).

---

## How it works

1. **Sign up** with email + password, pick a display name.
2. **Create a group** (or join one with a 6-character invite code).
3. **Make picks** — tap a team for each game. Picks lock at kickoff (enforced
   server-side, not just in the UI).
4. **Scores sync automatically** — a scheduled job pulls results from nflverse
   every 30 minutes during the season and the leaderboard updates itself.

## Tech

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Postgres database + email auth (Row Level Security on)
- **nflverse schedules** — free, no-key CSV for schedules/scores
  (`https://github.com/nflverse/nflverse-data` schedules release)
- **The Odds API** — live odds from US/UK/EU books (free tier key in
  `ODDS_API_KEY`); prices stored American, rendered in American/Decimal/Fractional
- **Stats engine** (`lib/model.ts`) — Elo power ratings (2020→now) → win
  probability, fair spread, fair total; model-vs-market gaps, never picks
- **Vercel Cron** — hits `/api/cron/score` daily

---

## Deploy it yourself (about 20 minutes, all free)

### Step 1 — Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up / log in, then click **New project**.
3. Name it `pickem`, set a database password (save it somewhere), pick the
   region closest to you, and click **Create new project**. Wait ~2 minutes.
4. In the left sidebar, click **SQL Editor** → **New query**.
5. Open the file `supabase/migrations/001_schema.sql` in this repo, copy the
   entire contents, paste into the SQL editor, and click **Run**. You should
   see "Success. No rows returned".
6. In the left sidebar, go to **Authentication** → **Providers** → **Email**.
   Turn **"Confirm email" OFF** (so new users are signed in immediately after
   sign-up — simpler for an MVP with friends).
7. Go to **Project Settings** (gear icon) → **API**. Copy these two values —
   you'll need them in Step 3:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → this is `SUPABASE_SERVICE_ROLE_KEY` (click
     **Reveal**; keep this secret, never put it in client-side code)

### Step 2 — Put this code on GitHub

1. Create a free account at [github.com](https://github.com) if needed.
2. Create a new repository (e.g. `pickem`), then push this folder to it:
   ```bash
   cd pickem
   git init
   git add .
   git commit -m "Pick'em MVP"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/pickem.git
   git push -u origin main
   ```

### Step 3 — Deploy on Vercel (free)

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account.
2. Click **Add New…** → **Project** → **Import** your `pickem` repository.
3. When it asks for **Environment Variables**, add all four:
   | Variable | Value (from Step 1) |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `CRON_SECRET` | any long random string you make up (e.g. run `openssl rand -hex 32` in a terminal) |
4. Click **Deploy**. Wait for the build to finish — you'll get a live URL like
   `https://pickem-yourname.vercel.app`.

### Step 4 — Load the games

1. Sign up for an account on your new site.
2. While logged in, visit this URL (replace with your domain):
   ```
   https://YOUR-DOMAIN.vercel.app/api/games/ingest
   ```
   You should see `{"season":2026,"week":N,"upserted":16}` — games are now in
   the database. (Add `?week=5` to load a specific week.)
3. Create a group on the dashboard, share the invite code, and start picking.

### Step 5 — Automatic score updates

The file `vercel.json` already schedules `/api/cron/score` every 30 minutes.
One extra click in Vercel:

1. In your Vercel project, go to **Settings** → **Cron Jobs**.
2. Find the `/api/cron/score` job and add a **Custom Header**:
   `Authorization: Bearer YOUR-CRON-SECRET` (the same `CRON_SECRET` value
   from Step 3). This keeps strangers from triggering your scorer.

That's it — scores now refresh on their own all season.

---

## Local development

```bash
cp .env.example .env.local   # then fill in your Supabase values
npm install
npm run dev                  # http://localhost:3000
```

## Project layout

```
app/
  page.tsx                    landing page
  login/page.tsx              email sign in / sign up
  dashboard/page.tsx          my groups, create, join via code
  groups/[id]/page.tsx        weekly slate + pick buttons
  groups/[id]/leaderboard/    season & weekly standings
  api/
    groups/route.ts           GET my groups · POST create group
    groups/join/route.ts      POST join via invite code
    groups/[id]/games/        GET games + my picks for a week
    groups/[id]/leaderboard/  GET computed standings
    picks/route.ts            POST upsert pick (lock enforced)
    games/ingest/route.ts     GET pull nflverse schedule/scores into DB
    games/current-week/        GET latest week in DB
    cron/score/route.ts       GET secured scorer (Vercel Cron)
lib/
  nflverse.ts                 nflverse fetch + normalize
  ingest.ts                   upsert nflverse data into Supabase
  pickem.ts                   invite codes, winners, standings math
  api-auth.ts                 requireUser / requireMember helpers
  supabase/{client,server,admin}.ts
supabase/migrations/001_schema.sql
vercel.json                   cron schedule
```

## v2 ideas (not built)

- Weekly pick reminders (email via Resend, or push)
- Confidence points / spread picks
- More sports (other leagues need their own data source)
- Group chat / trash talk board
- Hide other members' picks until games lock
