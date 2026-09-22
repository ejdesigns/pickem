/**
 * ESPN scoreboard fetching + normalization.
 *
 * NOTE: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
 * is an unofficial, free ESPN endpoint (no API key). It is widely used but
 * could change without notice; the ingest route isolates all ESPN knowledge
 * here so only this file needs updating if the shape changes.
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
  kickoff: string; // ISO string
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  winner?: boolean;
  score?: string;
  team: { abbreviation: string; displayName: string };
}

interface EspnEvent {
  id: string;
  date: string;
  status: { type: { state: string } };
  competitions: [{ competitors: EspnCompetitor[] }];
}

function mapStatus(state: string): GameStatus {
  if (state === "post") return "final";
  if (state === "in") return "in_progress";
  return "scheduled";
}

/**
 * Fetch the NFL scoreboard from ESPN.
 * Omit `week` to get ESPN's current week. `season` defaults to the current season.
 */
export async function fetchEspnScoreboard(
  week?: number,
  season?: number
): Promise<{ games: GameRow[]; season: number; week: number }> {
  const url = new URL(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
  );
  url.searchParams.set("seasontype", "2"); // regular season
  if (week) url.searchParams.set("week", String(week));
  if (season) url.searchParams.set("dates", String(season));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "pickem-mvp/0.1" },
    // ESPN data changes constantly; never cache scoreboard fetches.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ESPN scoreboard fetch failed: ${res.status}`);
  }

  const json = await res.json();
  const seasonYear: number = json?.season?.year ?? season ?? new Date().getFullYear();
  const weekNum: number = json?.week?.number ?? week ?? 1;

  const games: GameRow[] = (json?.events ?? []).map((event: EspnEvent) => {
    const competitors = event.competitions[0].competitors;
    const home = competitors.find((c) => c.homeAway === "home")!;
    const away = competitors.find((c) => c.homeAway === "away")!;

    const parseScore = (s?: string) =>
      s === undefined || s === "" ? null : Number(s);

    return {
      id: event.id,
      season: seasonYear,
      week: weekNum,
      home_team: home.team.abbreviation,
      home_team_name: home.team.displayName,
      away_team: away.team.abbreviation,
      away_team_name: away.team.displayName,
      kickoff: new Date(event.date).toISOString(),
      home_score: parseScore(home.score),
      away_score: parseScore(away.score),
      status: mapStatus(event.status.type.state),
    };
  });

  return { games, season: seasonYear, week: weekNum };
}
