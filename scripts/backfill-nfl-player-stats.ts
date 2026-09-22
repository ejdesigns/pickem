/**
 * Backfill NFL player game stats.
 *
 * Two free sources, no keys:
 *   1. nflverse stats_player_week_2025.csv for the 2025 season (bulk CSV,
 *      no rate limit) + roster_2025.csv as the gsis_id -> espn_id crosswalk
 *      so 2025 rows share player_ids with the ESPN feed.
 *   2. ESPN summary API for 2026-season final games missing player stats
 *      (same path the daily cron uses).
 *
 * The 2025 game rows themselves are inserted first (from the nflverse
 * schedules release via lib/nflverse loadSeason) because player rows
 * reference games(id) and the last-10 log needs the game dates.
 *
 * Usage:
 *   npx tsx scripts/backfill-nfl-player-stats.ts                 # 2025 CSV + 2026 ESPN
 *   npx tsx scripts/backfill-nfl-player-stats.ts --nflverse-only # just the 2025 CSV
 *   npx tsx scripts/backfill-nfl-player-stats.ts --espn-only     # just 2026 ESPN
 *   npx tsx scripts/backfill-nfl-player-stats.ts --dry-run       # parse + report, no writes
 *
 * Resume-safe: game rows upsert on id; player rows upsert on
 * (game_id, player_id); ESPN side skips games already flagged
 * player_stats_ingested.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (falls back to
 * .env.local). Run AFTER migration 005_nfl_player_stats.sql.
 */
import { readFileSync } from "fs";
// Minimal .env.local loader (dotenv isn't a dependency).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* no .env.local — env must be set already */
}
import { createClient } from "@supabase/supabase-js";
import { toProviderGame, type RawGame } from "../lib/nflverse";
import { ingestRecentNflPlayerStats } from "../lib/player-ingest-nfl";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry-run");
const NFLVERSE_ONLY = process.argv.includes("--nflverse-only");
const ESPN_ONLY = process.argv.includes("--espn-only");

const STATS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv";
const ROSTER_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2025.csv";
const SCHEDULES_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

/** Minimal CSV parser that handles quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function int(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function flt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchText(u: string): Promise<string> {
  const res = await fetch(u, {
    headers: { "User-Agent": "TheMorningLine/1.0 (stats ingestion)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
  return res.text();
}

/**
 * 2025 season games, REGULAR SEASON + PLAYOFFS. (lib/nflverse loadSeason is
 * REG-only, but the stats CSV carries POST rows too, and the FK from
 * player_game_stats needs every game_id to exist.)
 */
async function loadSeasonAllTypes(season: number): Promise<RawGame[]> {
  const rows = parseCsv(await fetchText(SCHEDULES_URL));
  const h = rows[0];
  const idx = (n: string) => h.indexOf(n);
  const out: RawGame[] = [];
  for (const r of rows.slice(1)) {
    if (r.length < h.length) continue;
    if (Number(r[idx("season")]) !== season) continue;
    out.push({
      game_id: r[idx("game_id")],
      season: Number(r[idx("season")]),
      week: Number(r[idx("week")]),
      gameday: r[idx("gameday")],
      gametime: r[idx("gametime")],
      away_team: r[idx("away_team")],
      away_score: r[idx("away_score")],
      home_team: r[idx("home_team")],
      home_score: r[idx("home_score")],
      spread_line: r[idx("spread_line")] ?? "",
    });
  }
  out.sort((a, b) => a.week - b.week || a.game_id.localeCompare(b.game_id));
  return out;
}

async function main() {
  if (!DRY && (!url || !key)) {
    console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }
  // Lazy client: dry-run never touches the DB.
  const admin: any = DRY ? null : createClient(url!, key!);

  // ---- 1. 2025 game rows (nflverse schedules release) ----
  let gameIds2025: string[] = [];
  if (!ESPN_ONLY) {
    console.log("loading 2025 season (reg + playoffs) from nflverse schedules...");
    const all = (await loadSeasonAllTypes(2025)).map(toProviderGame);
    const finals = all.filter((g) => g.status === "final");
    console.log(`2025 games: ${all.length} total, ${finals.length} final`);
    const rows = finals.map((p) => ({
      id: p.id,
      sport: "nfl",
      season: p.season,
      week: p.week,
      home_team: p.homeTeam,
      home_team_name: p.homeTeamName,
      away_team: p.awayTeam,
      away_team_name: p.awayTeamName,
      kickoff: p.kickoff,
      home_score: p.homeScore,
      away_score: p.awayScore,
      status: p.status,
    }));
    gameIds2025 = rows.map((r) => r.id);
    if (!DRY) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin
          .from("games")
          .upsert(rows.slice(i, i + 200), { onConflict: "id" });
        if (error) throw error;
      }
      console.log(`upserted ${rows.length} 2025 game rows`);
    } else {
      console.log(`[dry-run] would upsert ${rows.length} 2025 game rows`);
    }
  }

  // ---- 2. 2025 player stats (nflverse CSV + roster crosswalk) ----
  if (!ESPN_ONLY) {
    console.log("downloading roster crosswalk...");
    const rosterRows = parseCsv(await fetchText(ROSTER_URL));
    const rh = rosterRows[0];
    const rIdx = (n: string) => rh.indexOf(n);
    const espnByGsis = new Map<string, string>();
    for (const r of rosterRows.slice(1)) {
      const gsis = r[rIdx("gsis_id")];
      const espn = r[rIdx("espn_id")];
      if (gsis && espn && !espnByGsis.has(gsis)) espnByGsis.set(gsis, espn);
    }
    console.log(`crosswalk: ${espnByGsis.size} gsis -> espn ids`);

    console.log("downloading 2025 player-week stats...");
    const statRows = parseCsv(await fetchText(STATS_URL));
    const h = statRows[0];
    const idx = (n: string) => h.indexOf(n);
    console.log(`stats CSV: ${statRows.length - 1} rows, ${h.length} cols`);

    const byKey = new Map<string, Record<string, unknown>>();
    let skippedNoEspn = 0;
    let skippedType = 0;
    for (const r of statRows.slice(1)) {
      const seasonType = r[idx("season_type")];
      if (seasonType !== "REG" && seasonType !== "POST") {
        skippedType++;
        continue;
      }
      const gsis = r[idx("player_id")];
      const espnId = espnByGsis.get(gsis);
      if (!espnId) {
        skippedNoEspn++;
        continue;
      }
      const gameId = r[idx("game_id")];
      const team = r[idx("team")];
      // nflverse game_id = {season}_{week}_{away}_{home}
      const parts = gameId.split("_");
      const home = parts[3] ?? "";
      const sackYds = int(r[idx("sack_yards_lost")]);
      byKey.set(`${gameId}|${espnId}`, {
        game_id: gameId,
        player_id: espnId,
        player_name:
          r[idx("player_display_name")] || r[idx("player_name")] || "Unknown",
        team_abbr: team,
        is_home: team === home,
        starter: false,
        did_not_play: false,
        minutes: null,
        position: r[idx("position")] || null,
        pass_cmp: int(r[idx("completions")]),
        pass_att: int(r[idx("attempts")]),
        pass_yds: int(r[idx("passing_yards")]),
        pass_td: int(r[idx("passing_tds")]),
        pass_int: int(r[idx("passing_interceptions")]),
        pass_sacks: int(r[idx("sacks_suffered")]),
        pass_sack_yds: sackYds === null ? null : Math.abs(sackYds),
        rush_att: int(r[idx("carries")]),
        rush_yds: int(r[idx("rushing_yards")]),
        rush_td: int(r[idx("rushing_tds")]),
        rush_long: null,
        receptions: int(r[idx("receptions")]),
        targets: int(r[idx("targets")]),
        rec_yds: int(r[idx("receiving_yards")]),
        rec_td: int(r[idx("receiving_tds")]),
        rec_long: null,
        fumbles: int(r[idx("fumbles_total")]),
        fumbles_lost: int(r[idx("fumbles_lost_total")]),
        tackles:
          (int(r[idx("def_tackles_solo")]) ?? 0) +
          (int(r[idx("def_tackles_with_assist")]) ?? 0) || null,
        tackles_solo: int(r[idx("def_tackles_solo")]),
        sacks: flt(r[idx("def_sacks")]),
        tfl: int(r[idx("def_tackles_for_loss")]),
        def_pd: int(r[idx("def_pass_defended")]),
        def_qb_hits: int(r[idx("def_qb_hits")]),
        def_int: int(r[idx("def_interceptions")]),
        def_int_yds: int(r[idx("def_interception_yards")]),
        def_int_td: null,
        fg_made: int(r[idx("fg_made")]),
        fg_att: int(r[idx("fg_att")]),
        fg_long: int(r[idx("fg_long")]),
        xp_made: int(r[idx("pat_made")]),
        xp_att: int(r[idx("pat_att")]),
        kick_pts: null, // derived below
      });
    }
    // kick_pts = 3*fg + xp (nflverse has no combined column)
    for (const row of Array.from(byKey.values())) {
      const r = row as Record<string, number | null>;
      if (r.fg_made !== null || r.xp_made !== null) {
        r.kick_pts = (r.fg_made ?? 0) * 3 + (r.xp_made ?? 0);
      }
    }
    const playerRows = Array.from(byKey.values());
    console.log(
      `built ${playerRows.length} player rows ` +
        `(skipped: ${skippedNoEspn} no-espn-id, ${skippedType} non REG/POST)`
    );

    if (!DRY) {
      for (let i = 0; i < playerRows.length; i += 200) {
        const { error } = await admin
          .from("player_game_stats")
          .upsert(playerRows.slice(i, i + 200), {
            onConflict: "game_id,player_id",
          });
        if (error) throw error;
        if (i % 2000 === 0) console.log(`  upserted ${i}/${playerRows.length}`);
      }
      console.log(`upserted ${playerRows.length} 2025 player rows`);
      // Flag the 2025 games as ingested (ESPN side skips them from now on).
      for (let i = 0; i < gameIds2025.length; i += 200) {
        const { error } = await admin
          .from("games")
          .update({ player_stats_ingested: true })
          .in("id", gameIds2025.slice(i, i + 200));
        if (error) throw error;
      }
      console.log(`flagged ${gameIds2025.length} 2025 games ingested`);
    } else {
      console.log(
        `[dry-run] would upsert ${playerRows.length} player rows + flag ${gameIds2025.length} games`
      );
    }
  }

  // ---- 3. 2026-season finals via ESPN (same as the cron) ----
  if (!NFLVERSE_ONLY) {
    console.log("ESPN ingest for 2026 finals missing player stats...");
    if (DRY) {
      console.log("[dry-run] skipping ESPN ingest");
    } else {
      const s = await ingestRecentNflPlayerStats(admin, {
        all: true,
        limit: 500,
      });
      console.log("ESPN 2026:", JSON.stringify(s));
    }
  }

  console.log("DONE");
}

main().catch((e) => {
  console.error("backfill-nfl-player-stats failed:", e);
  process.exit(1);
});
