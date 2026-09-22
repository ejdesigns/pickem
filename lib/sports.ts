/**
 * Multi-sport registry — The Morning Line's sport-agnostic data layer.
 *
 * NFL is sport #1; NBA plugs in as sport #2. MLB / NHL / soccer follow the
 * same pattern later: add a SportConfig, a schedule/scores provider that
 * implements SportProvider, and the ingest / odds / model layers work
 * unchanged.
 *
 * Everything here is informational-stats plumbing. No picks, no directives.
 */

export type SportKey = "nfl" | "nba";

/** Per-sport Elo model parameters (initial values; calibrated over time). */
export interface EloParams {
  k: number; // rating update factor
  init: number; // starting rating for every team
  hfa: number; // home advantage, in Elo points
  perPoint: number; // ~Elo points per 1 point of fair spread
  seasonsBack: number; // how many past seasons feed the model
}

export interface SportConfig {
  key: SportKey;
  name: string; // "NFL" — display name
  oddsSportKey: string; // The Odds API sport key, e.g. "americanfootball_nfl"
  teamAbbr: Record<string, string>; // full team name -> abbreviation
  elo: EloParams;
  typicalTotal: number; // fallback league-average total (fair total prior)
  seasonLabel: (season: number) => string; // e.g. 2026 -> "2026" (NFL) or "2026-27" (NBA)
}

/**
 * One normalized game, whatever the source league. Providers (nflverse,
 * NBA source, …) map their native feed into this shape.
 */
export interface ProviderGame {
  id: string;
  season: number;
  week: number; // league week number (NBA: weeks since season start)
  homeTeam: string; // abbreviation, e.g. "GB" / "LAL"
  awayTeam: string;
  homeTeamName: string; // full name, e.g. "Green Bay Packers"
  awayTeamName: string;
  kickoff: string; // ISO string (UTC)
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_progress" | "final";
  /** Closing spread, home perspective (negative = home favored), if known. */
  spreadLine?: number | null;
}

/** A league's schedule + scores feed. */
export interface SportProvider {
  loadSeason(season: number): Promise<ProviderGame[]>;
  currentSeason(): number;
}

const NFL_ABBR: Record<string, string> = {
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

const NBA_ABBR: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

export const SPORTS: Record<SportKey, SportConfig> = {
  nfl: {
    key: "nfl",
    name: "NFL",
    oddsSportKey: "americanfootball_nfl",
    teamAbbr: NFL_ABBR,
    elo: { k: 24, init: 1500, hfa: 55, perPoint: 25, seasonsBack: 6 },
    typicalTotal: 44,
    seasonLabel: (s) => `${s}`,
  },
  nba: {
    key: "nba",
    name: "NBA",
    oddsSportKey: "basketball_nba",
    teamAbbr: NBA_ABBR,
    // Initial NBA Elo parameters (tunable): home court is worth more in
    // the NBA than home field in the NFL, and scoring is ~5x higher.
    elo: { k: 20, init: 1500, hfa: 100, perPoint: 28, seasonsBack: 5 },
    typicalTotal: 224,
    seasonLabel: (s) => `${s}-${String(s + 1).slice(2)}`,
  },
};

export const SPORT_KEYS: SportKey[] = ["nfl", "nba"];

export const DEFAULT_SPORT: SportKey = "nfl";

/** Normalize a query/body value to a known sport; unknown -> default. */
export function parseSport(value: unknown): SportKey {
  return value === "nba" ? "nba" : "nfl";
}

export function teamAbbrFor(sport: SportKey, fullName: string): string | undefined {
  return SPORTS[sport].teamAbbr[fullName];
}

const nameByAbbrCache = new Map<SportKey, Record<string, string>>();
export function teamNameFor(sport: SportKey, abbr: string): string {
  let rev = nameByAbbrCache.get(sport);
  if (!rev) {
    rev = Object.fromEntries(
      Object.entries(SPORTS[sport].teamAbbr).map(([name, a]) => [a, name])
    );
    nameByAbbrCache.set(sport, rev);
  }
  return rev[abbr] ?? abbr;
}

/** First week that still has an unscored game (the current/upcoming week). */
export function resolveCurrentWeek(games: ProviderGame[]): number {
  const weeks = Array.from(new Set(games.map((g) => g.week))).sort(
    (a, b) => a - b
  );
  for (const w of weeks) {
    const wg = games.filter((g) => g.week === w);
    if (wg.some((g) => g.homeScore === null || g.awayScore === null)) return w;
  }
  return weeks[weeks.length - 1] ?? 1;
}
