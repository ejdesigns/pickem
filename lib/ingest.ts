import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEspnScoreboard } from "@/lib/espn";

/**
 * Pull a week's NFL scoreboard from ESPN and upsert every game
 * (schedule AND scores) into the DB. Idempotent: safe to run often.
 *
 * Omit `week` to ingest ESPN's current week.
 */
export async function ingestWeek(week?: number) {
  const admin = createAdminClient();
  const { games, season, week: resolvedWeek } = await fetchEspnScoreboard(week);

  if (games.length === 0) {
    return { season, week: resolvedWeek, upserted: 0 };
  }

  const { error } = await admin.from("games").upsert(games, { onConflict: "id" });
  if (error) throw error;

  return { season, week: resolvedWeek, upserted: games.length };
}
