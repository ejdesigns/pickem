/**
 * NFL schedule + score fetching via nflverse (free, no API key).
 *
 * Source: https://github.com/nflverse/nflverse-data (schedules release,
 * games.csv) — updated regularly through the season with kickoff times
 * and final scores. One CSV fetch covers the whole season, so ingest is
 * a single HTTP request instead of dozens of per-game API calls.
 *
 * (Previously this used ESPN's unofficial scoreboard endpoint, which now
 * 403s server-side requests. All ESPN knowledge was isolated here, so
 * only this file changed.)
 */

export type GameStatus = "scheduled" | "in_progress" | "final";

export interface GameRow {
  id: string;
  season: number;
  week: number;
  home_team: string;
  home_team_name: string;
  away_team: string;
  away_team_name: string;
  kickoff: string; // ISO string (UTC)
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
}

const SCHEDULES_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

/** Full team name -> abbreviation, e.g. "Green Bay Packers" -> "GB". */
export const TEAM_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LA",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};

const TEAM_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_ABBR).map(([name, abbr]) => [abbr, name])
);

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
  return rows;
}

/** Day-of-month of the nth Sunday of a month (month is 0-indexed). */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return 1 + offset + (n - 1) * 7;
}

/**
 * US Eastern UTC offset for a calendar date (gametime in the CSV is ET).
 * DST runs from the 2nd Sunday of March to the 1st Sunday of November.
 */
function easternOffset(gameday: string): string {
  const [y, m, d] = gameday.split("-").map(Number);
  const dstStart = nthSunday(y, 2, 2); // March
  const dstEnd = nthSunday(y, 10, 1); // November
  const isDst =
    (m > 3 || (m === 3 && d >= dstStart)) && (m < 11 || (m === 11 && d < dstEnd));
  return isDst ? "-04:00" : "-05:00";
}

/** Most recent NFL season year for "now" (season starts in August). */
export function currentSeason(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? year : year - 1;
}

export interface RawGame {
  game_id: string;
  season: number;
  week: number;
  gameday: string;
  gametime: string;
  away_team: string;
  away_score: string;
  home_team: string;
  home_score: string;
  spread_line: string; // nflverse convention: negative = home favored
}

// In-memory cache of the schedules CSV (it covers all seasons, so one
// fetch serves every caller for a while). 6h TTL.
let csvCache: { text: string; fetchedAt: number } | null = null;
const CSV_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchSchedulesCsv(): Promise<string> {
  if (csvCache && Date.now() - csvCache.fetchedAt < CSV_TTL_MS) {
    return csvCache.text;
  }
  const res = await fetch(SCHEDULES_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`nflverse schedules fetch failed: ${res.status}`);
  }
  const text = await res.text();
  csvCache = { text, fetchedAt: Date.now() };
  return text;
}

/** Load one season of regular-season games, chronological (week asc). */
export async function loadSeason(season: number): Promise<RawGame[]> {
  const text = await fetchSchedulesCsv();
  const rows = parseCsv(text);
  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);
  const out: RawGame[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length) continue;
    if (Number(r[idx("season")]) !== season) continue;
    if (r[idx("game_type")] !== "REG") continue;
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

/** First week that still has an unscored game (i.e. the current/upcoming week). */
function resolveCurrentWeek(games: RawGame[]): number {
  const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);
  for (const w of weeks) {
    const wg = games.filter((g) => g.week === w);
    if (wg.some((g) => g.home_score === "" || g.away_score === "")) return w;
  }
  return weeks[weeks.length - 1] ?? 1;
}

function toGameRow(g: RawGame): GameRow {
  const toScore = (s: string) => (s === "" ? null : Number(s));
  const homeScore = toScore(g.home_score);
  const awayScore = toScore(g.away_score);
  // nflverse only carries final scores, so a scored game is final.
  const status: GameStatus =
    homeScore === null || awayScore === null ? "scheduled" : "final";
  const kickoff = g.gametime
    ? `${g.gameday}T${g.gametime}:00${easternOffset(g.gameday)}`
    : `${g.gameday}T00:00:00${easternOffset(g.gameday)}`;
  return {
    id: g.game_id,
    season: g.season,
    week: g.week,
    home_team: g.home_team,
    home_team_name: TEAM_NAMES[g.home_team] ?? g.home_team,
    away_team: g.away_team,
    away_team_name: TEAM_NAMES[g.away_team] ?? g.away_team,
    kickoff: new Date(kickoff).toISOString(),
    home_score: homeScore,
    away_score: awayScore,
    status,
  };
}

/**
 * Fetch a week's NFL schedule/scores from nflverse.
 * Omit `week` to get the current week. `season` defaults to the current season.
 */
export async function fetchNflverseWeek(
  week?: number,
  season?: number
): Promise<{ games: GameRow[]; season: number; week: number }> {
  const s = season ?? currentSeason();
  const games = await loadSeason(s);
  const resolvedWeek = week ?? resolveCurrentWeek(games);
  return {
    games: games.filter((g) => g.week === resolvedWeek).map(toGameRow),
    season: s,
    week: resolvedWeek,
  };
}
