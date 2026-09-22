/**
 * One-time NBA history backfill — seeds the games table with past NBA
 * regular seasons from balldontlie.io (free tier) so the NBA Elo model
 * has history to learn from on day one.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the
 * environment (export them or prefix the command):
 *   SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=yyy \
 *     BALLDONTLIE_API_KEY=zzz npx tsx scripts/backfill-nba.ts 2021 2025
 * (backfills seasons 2021..2025; each season ≈ 13 requests ≈ 3 min at the
 *  free tier's 5 req/min throttle — the throttle lives in lib/nba.ts.)
 *
 * Idempotent: upserts on game id, so re-running is safe. After the backfill,
 * the daily cron keeps NBA games fresh going forward.
 */
import { createAdminClient } from "../lib/supabase/admin";
import { loadNbaSeason } from "../lib/nba";

async function main() {
  const from = Number(process.argv[2] ?? "2021");
  const to = Number(process.argv[3] ?? "2025");
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
    throw new Error("usage: npx tsx scripts/backfill-nba.ts <fromSeason> <toSeason>");
  }
  if (!process.env.BALLDONTLIE_API_KEY) {
    throw new Error("BALLDONTLIE_API_KEY not configured");
  }

  const admin = createAdminClient();
  let total = 0;
  for (let season = from; season <= to; season++) {
    console.log(`Loading NBA season ${season}…`);
    const games = await loadNbaSeason(season);
    const rows = games.map((g) => ({
      id: g.id,
      sport: "nba",
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
    total += rows.length;
    console.log(`  upserted ${rows.length} games (total ${total})`);
  }
  console.log(`Done. ${total} NBA games backfilled.`);
}

main().catch((e) => {
  console.error("BACKFILL FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
