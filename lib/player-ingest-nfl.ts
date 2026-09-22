/**
 * NFL player-stats ingestion: ESPN boxscores -> public.player_game_stats.
 *
 * Mirrors lib/player-ingest.ts (NBA). ESPN is free with no key and no
 * meaningful rate limit; still polite: small delay between games,
 * resume-safe via games.player_stats_ingested.
 */

import {
  fetchEspnNflBoxscore,
  findNflEspnEventId,
  type EspnNflAthleteStat,
} from "./espn-nfl";

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

export function toNflRow(gameId: string, p: EspnNflAthleteStat) {
  return {
    game_id: gameId,
    player_id: p.id,
    player_name: p.name,
    team_abbr: p.teamAbbr,
    is_home: p.isHome,
    starter: false, // ESPN's NFL feed doesn't report starters
    did_not_play: false,
    minutes: null, // no minutes in NFL boxscores
    pass_cmp: p.passCmp,
    pass_att: p.passAtt,
    pass_yds: p.passYds,
    pass_td: p.passTd,
    pass_int: p.passInt,
    pass_sacks: p.passSacks,
    pass_sack_yds: p.passSackYds,
    rush_att: p.rushAtt,
    rush_yds: p.rushYds,
    rush_td: p.rushTd,
    rush_long: p.rushLong,
    receptions: p.receptions,
    targets: p.targets,
    rec_yds: p.recYds,
    rec_td: p.recTd,
    rec_long: p.recLong,
    fumbles: p.fumbles,
    fumbles_lost: p.fumblesLost,
    tackles: p.tackles,
    tackles_solo: p.tacklesSolo,
    sacks: p.sacks,
    tfl: p.tfl,
    def_pd: p.defPd,
    def_qb_hits: p.defQbHits,
    def_int: p.defInt,
    def_int_yds: p.defIntYds,
    def_int_td: p.defIntTd,
    fg_made: p.fgMade,
    fg_att: p.fgAtt,
    fg_long: p.fgLong,
    xp_made: p.xpMade,
    xp_att: p.xpAtt,
    kick_pts: p.kickPts,
  };
}

export interface IngestResult {
  gameId: string;
  ok: boolean;
  players: number;
  skipped?: string; // reason when not ok
}

/**
 * Ingest player stats for a single final NFL game. Idempotent — re-running
 * just upserts the same rows and re-marks the game.
 */
export async function ingestNflPlayerStatsForGame(
  admin: Admin,
  game: GameRow
): Promise<IngestResult> {
  try {
    const eventId = await findNflEspnEventId(
      game.kickoff,
      game.home_team,
      game.away_team
    );
    if (!eventId) {
      return { gameId: game.id, ok: false, players: 0, skipped: "no-espn-event" };
    }
    const box = await fetchEspnNflBoxscore(
      eventId,
      game.home_team,
      game.away_team
    );
    if (!box.completed || box.players.length === 0) {
      return { gameId: game.id, ok: false, players: 0, skipped: "no-boxscore" };
    }
    const rows = box.players
      .filter((p) => p.id)
      .map((p) => toNflRow(game.id, p));

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
 * Ingest player stats for recent final NFL games that don't have them yet.
 * Used by the daily cron (small limit) and by the backfill script (no limit).
 */
export async function ingestRecentNflPlayerStats(
  admin: Admin,
  opts: { daysBack?: number; limit?: number; gameIds?: string[]; all?: boolean } = {}
): Promise<RecentIngestSummary> {
  const { daysBack = 4, limit = 15, gameIds, all = false } = opts;
  let query = admin
    .from("games")
    .select("id, kickoff, home_team, away_team, status")
    .eq("sport", "nfl")
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
    const r = await ingestNflPlayerStatsForGame(admin, g);
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
