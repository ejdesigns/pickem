-- The Morning Line — Phase 3: NFL player game stats (free via ESPN boxscores + nflverse)
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. (Apply AFTER 004_player_stats.sql.)
--
-- Extends public.player_game_stats with nullable NFL-specific columns.
-- NBA rows are untouched (all new columns stay NULL for them).
-- Sources: ESPN summary API for the current season (free, no key) and the
-- nflverse stats_player_week CSVs (with roster espn_id crosswalk) for history.
-- Written only by the service role (ingest scripts / cron); read server-side
-- via the admin client like the rest of the stats engine.

alter table public.player_game_stats
  add column if not exists position text,            -- QB/RB/WR/TE/K/... (nflverse rows only)
  add column if not exists pass_cmp integer,
  add column if not exists pass_att integer,
  add column if not exists pass_yds integer,
  add column if not exists pass_td integer,
  add column if not exists pass_int integer,
  add column if not exists pass_sacks integer,      -- sacks taken
  add column if not exists pass_sack_yds integer,   -- yards lost on sacks (positive)
  add column if not exists rush_att integer,
  add column if not exists rush_yds integer,
  add column if not exists rush_td integer,
  add column if not exists rush_long integer,
  add column if not exists receptions integer,
  add column if not exists targets integer,
  add column if not exists rec_yds integer,
  add column if not exists rec_td integer,
  add column if not exists rec_long integer,
  add column if not exists fumbles integer,
  add column if not exists fumbles_lost integer,
  add column if not exists tackles integer,         -- combined tackles
  add column if not exists tackles_solo integer,
  add column if not exists sacks numeric,           -- defensive sacks (can be x.5)
  add column if not exists tfl integer,              -- tackles for loss
  add column if not exists def_pd integer,           -- passes defended
  add column if not exists def_qb_hits integer,
  add column if not exists def_int integer,
  add column if not exists def_int_yds integer,
  add column if not exists def_int_td integer,
  add column if not exists fg_made integer,
  add column if not exists fg_att integer,
  add column if not exists fg_long integer,
  add column if not exists xp_made integer,          -- extra points (PAT)
  add column if not exists xp_att integer,
  add column if not exists kick_pts integer;

-- RLS stays as 004 set it: enabled, no policies, service role only.

-- Let the cron find final NFL games missing player stats.
create index if not exists games_nfl_final_missing_pgs_idx
  on public.games (sport, status, kickoff)
  where sport = 'nfl' and status = 'final' and player_stats_ingested = false;
