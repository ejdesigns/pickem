import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNflverseWeek } from "@/lib/nflverse";

/**
 * Pull a week's NFL schedule/scores from nflverse and upsert every game
 * (schedule AND scores) into the DB. Idempotent: safe to run often.
 *
 * Omit `week` to ingest the current week.
 */
export async function ingestWeek(week?: number) {
  const admin = createAdminClient();
  const { games, season, week: resolvedWeek } = await fetchNflverseWeek(week);

  if (games.length === 0) {
    return { season, week: resolvedWeek, upserted: 0 };
  }

  const { error } = await admin.from("games").upsert(games, { onConflict: "id" });
  if (error) throw error;

  return { season, week: resolvedWeek, upserted: games.length };
}
