-- The Morning Line — Phase 1: odds + model predictions
-- Run this in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- (Apply AFTER 001_schema.sql.)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.game_odds (
  game_id text not null references public.games(id) on delete cascade,
  sportsbook text not null,              -- bookmaker key, e.g. "draftkings"
  market text not null,                  -- "h2h" | "spreads" | "totals"
  outcomes jsonb not null,               -- the market's outcomes array from The Odds API
  fetched_at timestamptz not null default now(),
  primary key (game_id, sportsbook, market)
);

create table public.model_predictions (
  game_id text primary key references public.games(id) on delete cascade,
  season int not null,
  week int not null,
  home_win_prob numeric not null,        -- model P(home wins), 0..1
  fair_spread numeric not null,          -- home perspective; negative = home favored
  fair_total numeric not null,
  predicted_at timestamptz not null default now()
);

-- Line-movement history: one row per book when its numbers change.
create table public.odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  sportsbook text not null,
  spread_point numeric,                  -- home-team spread point (negative = home favored)
  total_point numeric,
  home_ml int,                           -- home moneyline, american
  captured_at timestamptz not null default now()
);
create index odds_snapshots_game_time_idx
  on public.odds_snapshots (game_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — public read (like games in 001); writes via service
-- role only (no insert/update/delete policies for regular users).
-- ---------------------------------------------------------------------------

alter table public.game_odds        enable row level security;
alter table public.model_predictions enable row level security;
alter table public.odds_snapshots  enable row level security;

create policy "game_odds publicly readable"
  on public.game_odds for select to anon, authenticated using (true);

create policy "model_predictions publicly readable"
  on public.model_predictions for select to anon, authenticated using (true);

create policy "odds_snapshots publicly readable"
  on public.odds_snapshots for select to anon, authenticated using (true);
