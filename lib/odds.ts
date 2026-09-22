/**
 * The Odds API v4 client (https://the-odds-api.com) — free tier, no key cost.
 *
 * Pulls US + UK + EU sportsbooks in ONE request (regions=us,uk,eu) so the
 * market view is global, not US-only. Prices are stored as American odds;
 * display conversion to Decimal / Fractional happens at render time via
 * the helpers below (used by the client-side odds-format toggle).
 *
 * Never import this in client components — it reads ODDS_API_KEY.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { TEAM_ABBR } from "@/lib/nflverse";
import { resolveSeasonWeek } from "@/lib/model";

// Re-exported so callers can use one import for odds helpers.
export {
  americanToDecimal,
  americanToFractional,
  formatPrice,
  type OddsFormat,
} from "@/lib/odds-format";

const ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/";

interface OddsOutcome {
  name: string;
  price: number; // american
  point?: number;
}

interface OddsMarket {
  key: string; // "h2h" | "spreads" | "totals"
  outcomes: OddsOutcome[];
}

interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string; // full name, e.g. "Green Bay Packers"
  away_team: string;
  bookmakers: Bookmaker[];
}

// ---------------------------------------------------------------------------
// Format conversion lives in lib/odds-format.ts (client-safe); re-exported
// at the top of this file.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Refresh: fetch events, match to our games, upsert odds + movement snapshots.
// ---------------------------------------------------------------------------

interface DbGame {
  id: string;
  home_team: string;
  away_team: string;
  kickoff: string;
}

function sameCalendarDate(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 10) === bIso.slice(0, 10);
}

function homeSpreadPoint(bm: Bookmaker, homeName: string): number | null {
  const m = bm.markets.find((mk) => mk.key === "spreads");
  const o = m?.outcomes.find((oc) => oc.name === homeName);
  return o?.point ?? null;
}

function totalPoint(bm: Bookmaker): number | null {
  const m = bm.markets.find((mk) => mk.key === "totals");
  return m?.outcomes[0]?.point ?? null;
}

function homeMl(bm: Bookmaker, homeName: string): number | null {
  const m = bm.markets.find((mk) => mk.key === "h2h");
  const o = m?.outcomes.find((oc) => oc.name === homeName);
  return o?.price ?? null;
}

/**
 * Refresh NFL odds for a season/week (defaults: current season, current week
 * as stored in the DB). Matches each Odds API event to a games-table row by
 * home/away abbreviations + same kickoff calendar date.
 *
 * Throws "ODDS_API_KEY not configured" when the key is missing.
 */
export async function refreshOdds(
  season?: number,
  week?: number
): Promise<{ events: number; upserted: number; snapshots: number }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY not configured");

  const admin = createAdminClient();

  // Resolve season/week from the DB when not given.
  const resolved = await resolveSeasonWeek();
  const s = season ?? resolved.season;
  const w = week ?? resolved.week;

  const { data: dbGames } = await admin
    .from("games")
    .select("id, home_team, away_team, kickoff")
    .eq("season", s)
    .eq("week", w);
  const games: DbGame[] = (dbGames ?? []) as DbGame[];
  if (games.length === 0) return { events: 0, upserted: 0, snapshots: 0 };

  const url = new URL(ODDS_URL);
  url.searchParams.set("apiKey", apiKey);
  // One request, global books: US + UK + EU regions.
  url.searchParams.set("regions", "us,uk,eu");
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`The Odds API fetch failed: ${res.status}`);
  }
  const events: OddsEvent[] = await res.json();

  let upserted = 0;
  let snapshots = 0;

  for (const ev of events) {
    const homeAbbr = TEAM_ABBR[ev.home_team];
    const awayAbbr = TEAM_ABBR[ev.away_team];
    if (!homeAbbr || !awayAbbr) continue;
    const game = games.find(
      (g) =>
        g.home_team === homeAbbr &&
        g.away_team === awayAbbr &&
        sameCalendarDate(g.kickoff, ev.commence_time)
    );
    if (!game) continue;

    const oddsRows: {
      game_id: string;
      sportsbook: string;
      market: string;
      outcomes: OddsOutcome[];
    }[] = [];

    for (const bm of ev.bookmakers ?? []) {
      for (const mk of bm.markets ?? []) {
        if (!["h2h", "spreads", "totals"].includes(mk.key)) continue;
        oddsRows.push({
          game_id: game.id,
          sportsbook: bm.key,
          market: mk.key,
          outcomes: mk.outcomes,
        });
      }

      // Movement snapshot: record when this book's numbers change.
      const spread = homeSpreadPoint(bm, ev.home_team);
      const total = totalPoint(bm);
      const ml = homeMl(bm, ev.home_team);
      const { data: last } = await admin
        .from("odds_snapshots")
        .select("spread_point, total_point, home_ml")
        .eq("game_id", game.id)
        .eq("sportsbook", bm.key)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const changed =
        !last ||
        last.spread_point !== spread ||
        last.total_point !== total ||
        last.home_ml !== ml;
      if (changed) {
        const { error: snapErr } = await admin.from("odds_snapshots").insert({
          game_id: game.id,
          sportsbook: bm.key,
          spread_point: spread,
          total_point: total,
          home_ml: ml,
        });
        if (!snapErr) snapshots++;
      }
    }

    if (oddsRows.length > 0) {
      const { error } = await admin
        .from("game_odds")
        .upsert(oddsRows, { onConflict: "game_id,sportsbook,market" });
      if (error) throw error;
      upserted += oddsRows.length;
    }
  }

  return { events: events.length, upserted, snapshots };
}
