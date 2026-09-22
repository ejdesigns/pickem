import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNflProviderWeek } from "@/lib/nflverse";
import { fetchNbaWeek } from "@/lib/nba";
import { DEFAULT_SPORT, type SportKey } from "@/lib/sports";

/**
 * Pull a week's schedule/scores for a sport and upsert every game
 * (schedule AND scores) into the DB. Idempotent: safe to run often.
 *
 * NFL reads from nflverse (free CSV, no key). NBA reads from balldontlie
 * (free tier, BALLDONTLIE_API_KEY required) — without the key it throws
 * and the caller treats NBA as unavailable; NFL is unaffected.
 *
 * Omit `week` to ingest the current week.
 */
export async function ingestWeek(sport: SportKey = DEFAULT_SPORT, week?: number) {
  const admin = createAdminClient();
  const { games, season, week: resolvedWeek } =
    sport === "nba"
      ? await fetchNbaWeek(week)
      : await fetchNflProviderWeek(week);

  if (games.length === 0) {
    return { sport, season, week: resolvedWeek, upserted: 0 };
  }

  const rows = games.map((g) => ({
    id: g.id,
    sport,
    season: g.season,
    week: g.week,
    home_team: g.homeTeam,
    home_team_name: g.homeTeamName,
    away_team: g.awayTeam,
    away_team_name: g.awayTeamName,
    kickoff: g.kickoff,
    home_score: g.homeScore,
    away_score: g.awayScore,
    status: g.status,
  }));

  const { error } = await admin.from("games").upsert(rows, { onConflict: "id" });
  if (error) throw error;

  return { sport, season, week: resolvedWeek, upserted: games.length };
}
