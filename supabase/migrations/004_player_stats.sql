-- The Morning Line — Phase 2: player game stats (free via ESPN boxscores)
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. (Apply AFTER 003_sport.sql.)
--
-- One row per player per game. Source: ESPN scoreboard/summary API (free, no key).
-- Written only by the service role (ingest scripts / cron); read server-side
-- via the admin client like the rest of the stats engine.

create table if not exists public.player_game_stats (
  game_id text not null references public.games(id) on delete cascade,
  player_id text not null,              -- ESPN athlete id (stable across games)
  player_name text not null,
  team_abbr text not null,              -- e.g. 'LAL'
  is_home boolean not null,
  starter boolean not null default false,
  did_not_play boolean not null default false,
  minutes numeric,                      -- e.g. 35 (may include seconds as decimal in some feeds)
  points integer,
  rebounds integer,
  assists integer,
  steals integer,
  blocks integer,
  turnovers integer,
  fouls integer,
  plus_minus integer,
  fgm integer,
  fga integer,
  tpm integer,                          -- threes made
  tpa integer,                          -- threes attempted
  ftm integer,
  fta integer,
  oreb integer,
  dreb integer,
  primary key (game_id, player_id)
);

create index if not exists pgs_player_game_idx
  on public.player_game_stats (player_id, game_id);

create index if not exists pgs_game_idx
  on public.player_game_stats (game_id);

create index if not exists pgs_player_team_idx
  on public.player_game_stats (player_id, team_abbr);

alter table public.player_game_stats enable row level security;
-- No policies: only the service role (ingest / server code) can read or write.

-- Track which games have had player stats ingested, so the cron can skip them.
alter table public.games
  add column if not exists player_stats_ingested boolean not null default false;

create index if not exists games_nba_final_missing_pgs_idx
  on public.games (sport, status, kickoff)
  where sport = 'nba' and status = 'final' and player_stats_ingested = false;
