-- The Morning Line — Phase 1 multi-sport: sport column + refresh state
-- Run this in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- (Apply AFTER 001_schema.sql and 002_odds.sql.)
--
-- Existing rows are all NFL, so the default keeps them correct.

-- ---------------------------------------------------------------------------
-- games.sport — which league a game belongs to ('nfl' | 'nba' | …)
-- ---------------------------------------------------------------------------

alter table public.games
  add column if not exists sport text not null default 'nfl';

create index if not exists games_sport_season_week_idx
  on public.games (sport, season, week);

create index if not exists games_sport_kickoff_idx
  on public.games (sport, kickoff);

-- ---------------------------------------------------------------------------
-- refresh_state — quota-policy bookkeeping for The Odds API free tier
-- (500 credits/month). One row per sport; written only by the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.refresh_state (
  sport text primary key,                       -- 'nfl' | 'nba' | …
  last_global_odds timestamptz,                 -- last us,uk,eu odds refresh
  last_boost_odds timestamptz,                  -- last game-window US boost
  updated_at timestamptz not null default now()
);

alter table public.refresh_state enable row level security;
-- No policies: only the service role (cron / server code) can read or write.
