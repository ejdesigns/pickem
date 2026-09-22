/**
 * Pipeline test: insert 2 real final NBA games, ingest player stats from
 * ESPN, verify rows, then clean up. Run with env from .env.local.
 */
import { readFileSync } from "fs";
// Minimal .env.local loader (dotenv isn't a dependency).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
import { createClient } from "@supabase/supabase-js";
import { ingestPlayerStatsForGame } from "../lib/player-ingest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Test uses the anon key + temporary permissive RLS policies (created and
// dropped via the Supabase dashboard around this test run).
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const TEST_GAMES = [
  {
    id: "nba_test_pipeline_1",
    sport: "nba",
    season: 2024,
    week: 99,
    home_team: "OKC",
    home_team_name: "Oklahoma City Thunder",
    away_team: "IND",
    away_team_name: "Indiana Pacers",
    kickoff: "2025-06-06T00:30:00Z",
    home_score: 110,
    away_score: 111,
    status: "final",
  },
  {
    id: "nba_test_pipeline_2",
    sport: "nba",
    season: 2024,
    week: 99,
    home_team: "OKC",
    home_team_name: "Oklahoma City Thunder",
    away_team: "IND",
    away_team_name: "Indiana Pacers",
    kickoff: "2025-06-09T00:00:00Z",
    home_score: 123,
    away_score: 107,
    status: "final",
  },
];

async function main() {
  const admin: any = createClient(url, key);

  // Test games are inserted by the setup SQL (dashboard); this script only
  // ingests + verifies. Cleanup (delete + drop temp policies) also runs
  // via the dashboard afterward.
  console.log("ingesting player stats from ESPN...");

  for (const g of TEST_GAMES) {
    const r = await ingestPlayerStatsForGame(admin, {
      id: g.id,
      kickoff: g.kickoff,
      home_team: g.home_team,
      away_team: g.away_team,
      status: g.status,
    });
    console.log(g.id, JSON.stringify(r));
  }

  const { count, error: cErr } = await admin
    .from("player_game_stats")
    .select("*", { count: "exact", head: true })
    .in("game_id", TEST_GAMES.map((g) => g.id));
  if (cErr) throw cErr;
  console.log("player rows for test games:", count);

  // Spot-check a star's line from game 1.
  const { data: sga } = await admin
    .from("player_game_stats")
    .select("player_name, points, rebounds, assists, team_abbr")
    .eq("game_id", "nba_test_pipeline_1")
    .order("points", { ascending: false })
    .limit(3);
  console.log("top scorers game 1:", JSON.stringify(sga));

  // games.player_stats_ingested should now be true for both.
  const { data: flags } = await admin
    .from("games")
    .select("id, player_stats_ingested")
    .in("id", TEST_GAMES.map((g) => g.id));
  console.log("ingested flags:", JSON.stringify(flags));

  const ok =
    count !== null &&
    count >= 40 &&
    (flags ?? []).every((f: any) => f.player_stats_ingested === true);
  console.log(
    ok
      ? "PIPELINE TEST PASSED"
      : "PIPELINE TEST FAILED — inspect output above"
  );
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("pipeline test failed:", e);
  process.exit(1);
});
