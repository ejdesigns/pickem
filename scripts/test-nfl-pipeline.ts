/**
 * NFL pipeline test: insert 2 real final 2025 NFL games, ingest player stats
 * from ESPN, verify row counts + column mapping, then clean up everything.
 *
 *   npx tsx scripts/test-nfl-pipeline.ts            # full test (DB writes)
 *   npx tsx scripts/test-nfl-pipeline.ts --dry-run  # parse-only: verifies the
 *       ESPN column mapping against live data, no Supabase writes.
 *
 * Full mode needs SUPABASE_SERVICE_ROLE_KEY in env/.env.local AND migration
 * 005_nfl_player_stats.sql applied. Dry-run needs neither.
 */
import { readFileSync } from "fs";
// Minimal .env.local loader (dotenv isn't a dependency).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* no .env.local */
}
import { createClient } from "@supabase/supabase-js";
import {
  ingestNflPlayerStatsForGame,
  toNflRow,
} from "../lib/player-ingest-nfl";
import {
  fetchEspnNflBoxscore,
  findNflEspnEventId,
} from "../lib/espn-nfl";

const DRY = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Super Bowl LIX (2025-02-09, PHI 40-22 KC) and the 2025 NFC Championship
// (2025-01-26, PHI 55-23 WAS). Both final; ESPN event ids resolved live.
const TEST_GAMES = [
  {
    id: "nfl_test_pipeline_1",
    sport: "nfl",
    season: 2024,
    week: 99,
    home_team: "PHI",
    home_team_name: "Philadelphia Eagles",
    away_team: "KC",
    away_team_name: "Kansas City Chiefs",
    kickoff: "2025-02-09T23:30:00Z",
    home_score: 40,
    away_score: 22,
    status: "final",
  },
  {
    id: "nfl_test_pipeline_2",
    sport: "nfl",
    season: 2024,
    week: 99,
    home_team: "PHI",
    home_team_name: "Philadelphia Eagles",
    away_team: "WAS",
    away_team_name: "Washington Commanders",
    kickoff: "2025-01-26T20:00:00Z",
    home_score: 55,
    away_score: 23,
    status: "final",
  },
];

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
}

function report(tag: string): never | void {
  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length === 0
      ? `${tag} PASSED`
      : `${tag} FAILED (${failed.length} checks)`
  );
  if (failed.length > 0) process.exit(1);
}

/**
 * Live mapping verification on parsed boxscores (no DB writes).
 * Super Bowl LIX known lines: Mahomes 21/32-257-3-2; Hurts 17/22-221-2-1;
 * Elliott 4/4 FG (long 50), 4/4 XP, 16 pts; DeJean 38-yd pick-six.
 */
async function verifyLiveMapping() {
  const sbEvent = await findNflEspnEventId(TEST_GAMES[0].kickoff, "PHI", "KC");
  check("sb-espn-event-found", sbEvent !== null, `event=${sbEvent}`);
  if (!sbEvent) throw new Error("no ESPN event for Super Bowl LIX");
  const sb = await fetchEspnNflBoxscore(sbEvent, "PHI", "KC");
  check("sb-completed", sb.completed === true, `players=${sb.players.length}`);
  check("sb-player-count", sb.players.length >= 50, `${sb.players.length} players`);

  const byId = new Map(sb.players.map((p) => [p.id, p]));
  const mahomes = byId.get("3139477");
  const mRow = mahomes ? toNflRow("x", mahomes) : null;
  check(
    "mahomes-passing",
    mRow?.pass_cmp === 21 &&
      mRow?.pass_att === 32 &&
      mRow?.pass_yds === 257 &&
      mRow?.pass_td === 3 &&
      mRow?.pass_int === 2,
    JSON.stringify(
      mRow && {
        cmp: mRow.pass_cmp,
        att: mRow.pass_att,
        yds: mRow.pass_yds,
        td: mRow.pass_td,
        int: mRow.pass_int,
      }
    )
  );
  check(
    "mahomes-rushing",
    mRow?.rush_att === 4 && mRow?.rush_yds === 25 && mRow?.rush_td === 0,
    `att=${mRow?.rush_att} yds=${mRow?.rush_yds} td=${mRow?.rush_td}`
  );
  const hurts = byId.get("4040715");
  check(
    "hurts-passing",
    hurts?.passYds === 221 && hurts?.passTd === 2,
    `yds=${hurts?.passYds} td=${hurts?.passTd}`
  );
  const elliott = byId.get("3050478");
  const eRow = elliott ? toNflRow("x", elliott) : null;
  check(
    "elliott-kicking",
    eRow?.fg_made === 4 &&
      eRow?.fg_att === 4 &&
      eRow?.fg_long === 50 &&
      eRow?.xp_made === 4 &&
      eRow?.kick_pts === 16,
    JSON.stringify(
      eRow && {
        fg: `${eRow.fg_made}/${eRow.fg_att}`,
        xp: eRow.xp_made,
        pts: eRow.kick_pts,
      }
    )
  );
  const dejean = byId.get("4682618");
  check(
    "dejean-pick-six",
    dejean?.defInt === 1 && dejean?.defIntYds === 38 && dejean?.defIntTd === 1,
    `int=${dejean?.defInt} yds=${dejean?.defIntYds} td=${dejean?.defIntTd}`
  );
  // Multi-group merge: Mahomes appears in passing+rushing+fumbles, one row.
  const mahomesRows = sb.players.filter((p) => p.id === "3139477");
  check("mahomes-merged-one-row", mahomesRows.length === 1, `rows=${mahomesRows.length}`);
  // Our abbr stored, not ESPN's.
  check(
    "team-abbr-ours",
    sb.players.every((p) => p.teamAbbr === "KC" || p.teamAbbr === "PHI"),
    `sample team=${mahomes?.teamAbbr}`
  );

  // Second game resolves too (NFC Championship).
  const nfcEvent = await findNflEspnEventId(
    TEST_GAMES[1].kickoff,
    "PHI",
    "WAS"
  );
  check("nfc-espn-event-found", nfcEvent !== null, `event=${nfcEvent}`);
  if (nfcEvent) {
    const nfc = await fetchEspnNflBoxscore(nfcEvent, "PHI", "WAS");
    check(
      "nfc-boxscore",
      nfc.completed && nfc.players.length >= 50,
      `${nfc.players.length} players`
    );
  }
}

async function main() {
  await verifyLiveMapping();
  if (DRY) {
    report("NFL PIPELINE DRY-RUN");
    return;
  }

  if (!url || !key) {
    console.error(
      "Full mode needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env " +
        "(.env.local has an empty service role key — paste it from the " +
        "Supabase dashboard). Run with --dry-run for the parse-only check."
    );
    process.exit(1);
  }
  const admin: any = createClient(url, key);

  // Insert the test games.
  const { error: insErr } = await admin.from("games").upsert(TEST_GAMES, {
    onConflict: "id",
  });
  if (insErr) throw insErr;
  console.log("inserted 2 test games");

  // Full ingest.
  for (const g of TEST_GAMES) {
    const r = await ingestNflPlayerStatsForGame(admin, {
      id: g.id,
      kickoff: g.kickoff,
      home_team: g.home_team,
      away_team: g.away_team,
      status: g.status,
    });
    console.log(g.id, JSON.stringify(r));
    check(`${g.id}-ingest-ok`, r.ok && r.players >= 50, JSON.stringify(r));
  }

  const { count, error: cErr } = await admin
    .from("player_game_stats")
    .select("*", { count: "exact", head: true })
    .in("game_id", TEST_GAMES.map((g) => g.id));
  if (cErr) throw cErr;
  check("player-row-count", (count ?? 0) >= 100, `${count} rows`);

  // Spot-check a row through the DB: Mahomes 257 pass yards, 25 rush yards.
  const { data: pm } = await admin
    .from("player_game_stats")
    .select("player_name, pass_yds, rush_yds")
    .eq("game_id", "nfl_test_pipeline_1")
    .eq("player_id", "3139477")
    .single();
  check(
    "db-mahomes-row",
    pm?.pass_yds === 257 && pm?.rush_yds === 25,
    JSON.stringify(pm)
  );

  const { data: flags } = await admin
    .from("games")
    .select("id, player_stats_ingested")
    .in("id", TEST_GAMES.map((g) => g.id));
  check(
    "ingested-flags",
    (flags ?? []).every((f: any) => f.player_stats_ingested === true),
    JSON.stringify(flags)
  );

  // Cleanup: delete everything we inserted, verify zero remain.
  const { error: delP } = await admin
    .from("player_game_stats")
    .delete()
    .in("game_id", TEST_GAMES.map((g) => g.id));
  if (delP) throw delP;
  const { error: delG } = await admin
    .from("games")
    .delete()
    .in("id", TEST_GAMES.map((g) => g.id));
  if (delG) throw delG;
  const { count: gamesLeft } = await admin
    .from("games")
    .select("*", { count: "exact", head: true })
    .in("id", TEST_GAMES.map((g) => g.id));
  const { count: rowsLeft } = await admin
    .from("player_game_stats")
    .select("*", { count: "exact", head: true })
    .in("game_id", TEST_GAMES.map((g) => g.id));
  check("cleanup-games", gamesLeft === 0, `${gamesLeft} left`);
  check("cleanup-player-rows", rowsLeft === 0, `${rowsLeft} left`);

  report("NFL PIPELINE TEST");
}

main().catch((e) => {
  console.error("nfl pipeline test failed:", e);
  process.exit(1);
});
