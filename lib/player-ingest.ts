/**
 * Player-stats ingestion: ESPN boxscores -> public.player_game_stats.
 *
 * ESPN is free with no key and no meaningful rate limit, so unlike the odds
 * and balldontlie pulls this one doesn't touch any quota. Still polite:
 * small delay between games, resume-safe via games.player_stats_ingested.
 */

import {
  fetchEspnBoxscore,
  findEspnEventId,
  type EspnAthleteStat,
} from "./espn";

type Admin = ReturnType<
  typeof import("./supabase/admin").createAdminClient
>;

interface GameRow {
  id: string;
  kickoff: string;
  home_team: string;
  away_team: string;
  status: string;
}

function toRow(gameId: string, p: EspnAthleteStat) {
  return {
    game_id: gameId,
    player_id: p.id,
    player_name: p.name,
    team_abbr: p.teamAbbr,
    is_home: p.isHome,
    starter: p.starter,
    did_not_play: p.didNotPlay,
    minutes: p.minutes,
    points: p.points,
    rebounds: p.rebounds,
    assists: p.assists,
    steals: p.steals,
    blocks: p.blocks,
    turnovers: p.turnovers,
    fouls: p.fouls,
    plus_minus: p.plusMinus,
    fgm: p.fgm,
    fga: p.fga,
    tpm: p.tpm,
    tpa: p.tpa,
    ftm: p.ftm,
    fta: p.fta,
    oreb: p.oreb,
    dreb: p.dreb,
  };
}

export interface IngestResult {
  gameId: string;
  ok: boolean;
  players: number;
  skipped?: string; // reason when not ok
}

/**
 * Ingest player stats for a single final NBA game. Idempotent — re-running
 * just upserts the same rows and re-marks the game.
 */
export async function ingestPlayerStatsForGame(
  admin: Admin,
  game: GameRow
): Promise<IngestResult> {
  try {
    const eventId = await findEspnEventId(
      game.kickoff,
      game.home_team,
      game.away_team
    );
    if (!eventId) {
      return { gameId: game.id, ok: false, players: 0, skipped: "no-espn-event" };
    }
    const box = await fetchEspnBoxscore(eventId);
    if (!box.completed || box.players.length === 0) {
      return { gameId: game.id, ok: false, players: 0, skipped: "no-boxscore" };
    }
    const rows = box.players
      .filter((p) => p.id)
      .map((p) => toRow(game.id, p));

    // Upsert in chunks to stay well under payload limits.
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin
        .from("player_game_stats")
        .upsert(rows.slice(i, i + 100), { onConflict: "game_id,player_id" });
      if (error) throw error;
    }
    const { error: flagErr } = await admin
      .from("games")
      .update({ player_stats_ingested: true })
      .eq("id", game.id);
    if (flagErr) throw flagErr;
    return { gameId: game.id, ok: true, players: rows.length };
  } catch (e) {
    return {
      gameId: game.id,
      ok: false,
      players: 0,
      skipped: e instanceof Error ? e.message.slice(0, 120) : "error",
    };
  }
}

export interface RecentIngestSummary {
  checked: number;
  ok: number;
  failed: number;
  players: number;
}

/**
 * Ingest player stats for recent final NBA games that don't have them yet.
 * Used by the daily cron (small limit) and by the backfill script (no limit).
 */
export async function ingestRecentPlayerStats(
  admin: Admin,
  opts: { daysBack?: number; limit?: number; gameIds?: string[]; all?: boolean } = {}
): Promise<RecentIngestSummary> {
  const { daysBack = 4, limit = 15, gameIds, all = false } = opts;
  let query = admin
    .from("games")
    .select("id, kickoff, home_team, away_team, status")
    .eq("sport", "nba")
    .eq("status", "final")
    .eq("player_stats_ingested", false)
    .order("kickoff", { ascending: false });

  if (gameIds) {
    query = query.in("id", gameIds);
  } else if (!all) {
    const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    query = query.gte("kickoff", since).limit(limit);
  } else {
    query = query.limit(limit);
  }

  const { data: games, error } = await query;
  if (error) throw error;

  const summary: RecentIngestSummary = { checked: 0, ok: 0, failed: 0, players: 0 };
  for (const g of (games ?? []) as GameRow[]) {
    summary.checked++;
    const r = await ingestPlayerStatsForGame(admin, g);
    if (r.ok) {
      summary.ok++;
      summary.players += r.players;
    } else {
      summary.failed++;
    }
    // Be polite to ESPN even though there's no quota.
    await new Promise((r2) => setTimeout(r2, 1_500));
  }
  return summary;
}
