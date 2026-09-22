/**
 * Phase 1 smoke test — run with: npx tsx scripts/smoke.ts
 * Checks Elo ratings, fair lines for a 2026 Week 3 game, odds-format
 * helpers, and the no-key graceful path of refreshOdds.
 */
import {
  computeModel,
  homeWinProb,
  fairSpread,
  fairTotal,
  teamTrends,
} from "../lib/model";
import { fetchNflverseWeek } from "../lib/nflverse";
import { formatPrice } from "../lib/odds-format";
import { refreshOdds } from "../lib/odds";

async function main() {
  const state = await computeModel();
  const top5 = Object.entries(state.ratings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  console.log(
    "Top 5 Elo:",
    top5.map(([t, e]) => `${t} ${Math.round(e)}`).join(", ")
  );
  console.log("League avg total:", state.leagueAvgTotal.toFixed(1));

  const { games } = await fetchNflverseWeek(3, 2026);
  const g =
    games.find((x) => x.away_team === "ATL" && x.home_team === "GB") ??
    games[0];
  console.log(`\n${g.away_team} @ ${g.home_team} (${g.id})`);
  console.log(
    "homeWinProb:",
    homeWinProb(state, g.home_team, g.away_team).toFixed(3)
  );
  console.log(
    "fairSpread:",
    fairSpread(state, g.home_team, g.away_team).toFixed(1)
  );
  console.log(
    "fairTotal:",
    fairTotal(state, g.home_team, g.away_team).toFixed(1)
  );
  console.log("home trends:", JSON.stringify(teamTrends(state, g.home_team)));
  console.log("away trends:", JSON.stringify(teamTrends(state, g.away_team)));

  // Plausibility: most favorites should sit in the -3..-7 range.
  const spreads = games.map((x) =>
    Math.abs(fairSpread(state, x.home_team, x.away_team))
  );
  const inRange = spreads.filter((s) => s >= 1 && s <= 10).length;
  console.log(
    `\nWeek 3 fair spreads: ${inRange}/${spreads.length} between 1 and 10 pts`
  );

  console.log("\n+150 ->", formatPrice(150, "decimal"), "/", formatPrice(150, "fractional"));
  console.log("-110 ->", formatPrice(-110, "decimal"), "/", formatPrice(-110, "fractional"));

  try {
    await refreshOdds(2026, 3);
    console.log("refreshOdds: unexpected success (key set?)");
  } catch (e) {
    console.log("refreshOdds no-key path:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
