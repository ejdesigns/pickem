/**
 * NBA schedule + score fetching via balldontlie.io (free tier, API key).
 *
 * Why balldontlie: documented REST JSON, per-game final scores with full
 * team identity, historical seasons back to 1946 — all on the $0 tier
 * (5 req/min). No paid plan needed, which keeps Ethan's zero-spend rule.
 *
 * What the free tier does NOT include: box scores, standings, betting odds.
 * Odds come from The Odds API (same free quota as NFL); history for the
 * model comes from our own DB once ingested.
 *
 * Setup: create a free account at https://app.balldontlie.io and set
 * BALLDONTLIE_API_KEY in .env.local and in Vercel env vars. Until the key
 * is set, every function here throws a clear "not configured" error and
 * callers treat NBA as unavailable — NFL keeps working untouched.
 *
 * Never import this in client components — it reads BALLDONTLIE_API_KEY.
 */

import { resolveCurrentWeek, type ProviderGame } from "@/lib/sports";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

// Free tier: 5 requests/minute. Throttle so paginated backfills stay
// inside the limit; a daily ingest (1-2 requests) is unaffected.
let lastCallAt = 0;
const MIN_GAP_MS = 13_000;

async function throttle(): Promise<void> {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

interface BdlTeam {
  id: number;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  name: string;
}

interface BdlGame {
  id: number;
  date: string; // ISO UTC
  season: number; // year the season started, e.g. 2024 = 2024-25
  status: string; // "Final" when done
  postseason: boolean;
  home_team_score: number;
  visitor_team_score: number;
  home_team: BdlTeam;
  visitor_team: BdlTeam;
}

function apiKey(): string {
  const k = process.env.BALLDONTLIE_API_KEY;
  if (!k) throw new Error("BALLDONTLIE_API_KEY not configured");
  return k;
}

async function bdlGet(
  path: string,
  params: Record<string, string | string[]>
): Promise<{ data: BdlGame[]; meta: { next_cursor: number | null } }> {
  const url = new URL(BDL_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, x));
    else url.searchParams.set(k, v);
  }
  await throttle();
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Authorization: apiKey() },
  });
  if (!res.ok) {
    throw new Error(`balldontlie fetch failed: ${res.status} ${path}`);
  }
  return res.json();
}

/** Fetch every page of a games query (regular season only). */
async function fetchAllGames(
  params: Record<string, string | string[]>
): Promise<BdlGame[]> {
  const out: BdlGame[] = [];
  let cursor: number | null = 0;
  const base = { ...params, per_page: "100", postseason: "false" };
  while (cursor !== null) {
    const q = cursor ? { ...base, cursor: String(cursor) } : base;
    const { data, meta } = await bdlGet("/games", q);
    out.push(...data);
    cursor = meta.next_cursor;
  }
  return out;
}

const DAY_MS = 86_400_000;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** Week anchor: Oct 1 of the season's start year (NBA tips mid-October). */
function seasonAnchor(season: number): Date {
  return new Date(Date.UTC(season, 9, 1));
}

function weekOf(dateIso: string, season: number): number {
  const d = new Date(dateIso).getTime();
  return Math.max(1, 1 + Math.floor((d - seasonAnchor(season).getTime()) / (7 * DAY_MS)));
}

function toProviderGame(g: BdlGame): ProviderGame {
  const final = g.status === "Final";
  return {
    id: `nba_${g.id}`,
    season: g.season,
    week: weekOf(g.date, g.season),
    homeTeam: g.home_team.abbreviation,
    awayTeam: g.visitor_team.abbreviation,
    homeTeamName: g.home_team.full_name,
    awayTeamName: g.visitor_team.full_name,
    kickoff: new Date(g.date).toISOString(),
    homeScore: final ? g.home_team_score : null,
    awayScore: final ? g.visitor_team_score : null,
    status: final ? "final" : "scheduled",
    spreadLine: null, // free tier has no closing lines; ATS shows "—" for NBA
  };
}

/**
 * Most recent NBA season year for "now". September onward belongs to the
 * upcoming season (preseason); Jan–Aug belongs to the season in progress.
 */
export function currentNbaSeason(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 8 ? year : year - 1;
}

/**
 * Full regular season of NBA games, chronological. Throttled for the
 * 5 req/min free tier (~13 requests ≈ 3 min per season). Used by the
 * one-time backfill script — NOT by the daily cron.
 */
export async function loadNbaSeason(season: number): Promise<ProviderGame[]> {
  const games = await fetchAllGames({ seasons: [String(season)] });
  return games
    .map(toProviderGame)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/**
 * Fetch NBA games in a date window — the cheap call the cron uses
 * (one request for up to ~10 days of games).
 */
export async function fetchNbaWindow(
  daysBack = 2,
  daysAhead = 14,
  season?: number
): Promise<{ games: ProviderGame[]; season: number }> {
  const s = season ?? currentNbaSeason();
  const now = Date.now();
  const dates: string[] = [];
  for (let d = -daysBack; d <= daysAhead; d++) {
    dates.push(fmtDate(new Date(now + d * DAY_MS)));
  }
  const { data } = await bdlGet("/games", {
    dates,
    per_page: "100",
    postseason: "false",
  });
  const games = data
    .filter((g) => g.season === s)
    .map(toProviderGame)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return { games, season: s };
}

/**
 * Fetch one NBA "week" (7-day block from the Oct 1 anchor). Omit `week`
 * for the current/upcoming week relative to today.
 */
export async function fetchNbaWeek(
  week?: number,
  season?: number
): Promise<{ games: ProviderGame[]; season: number; week: number }> {
  const s = season ?? currentNbaSeason();
  if (week !== undefined) {
    const start = new Date(seasonAnchor(s).getTime() + (week - 1) * 7 * DAY_MS);
    const dates: string[] = [];
    for (let d = -1; d <= 8; d++) {
      dates.push(fmtDate(new Date(start.getTime() + d * DAY_MS)));
    }
    const { data } = await bdlGet("/games", {
      dates,
      per_page: "100",
      postseason: "false",
    });
    const games = data
      .filter((g) => g.season === s && weekOf(g.date, s) === week)
      .map(toProviderGame)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    return { games, season: s, week };
  }

  const { games } = await fetchNbaWindow(2, 14, s);
  const resolvedWeek = resolveCurrentWeek(games);
  return {
    games: games.filter((g) => g.week === resolvedWeek),
    season: s,
    week: resolvedWeek,
  };
}
