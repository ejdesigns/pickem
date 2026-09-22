/**
 * ESPN scoreboard/summary client — free player box scores for the NBA.
 *
 * Why ESPN: balldontlie's free tier has no box scores or player game stats
 * (those start at $9.99/mo), while ESPN's public API exposes full box scores
 * with per-player lines at no cost and no key. Used for:
 *   - player game logs (points/rebounds/assists/…)
 *   - team "why they won/lost" notes (rebound/turnover/shooting margins)
 *
 * Join strategy: our games are keyed by balldontlie ids, ESPN has its own
 * event ids. We join on (UTC date + home/away abbreviations) via the
 * scoreboard endpoint, then cache event id -> boxscore per run.
 *
 * Server-side only in spirit (no secret involved, but keep fetching in
 * server code / scripts so the UI never depends on ESPN directly).
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

export interface EspnAthleteStat {
  id: string;
  name: string;
  teamAbbr: string;
  isHome: boolean;
  starter: boolean;
  didNotPlay: boolean;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fouls: number | null;
  plusMinus: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  oreb: number | null;
  dreb: number | null;
}

export interface EspnTeamStat {
  abbr: string;
  isHome: boolean;
  stats: Record<string, string>; // e.g. { totalRebounds: '56', threePointFieldGoalPct: '46', ... }
  score: number | null;
}

export interface EspnBoxscore {
  eventId: string;
  completed: boolean;
  players: EspnAthleteStat[];
  teams: EspnTeamStat[];
}

interface EspnScoreboardEvent {
  id: string;
  date: string; // ISO
  homeAbbr: string;
  awayAbbr: string;
  completed: boolean;
}

async function espnGet<T>(url: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
        headers: { "User-Agent": "TheMorningLine/1.0 (stats ingestion)" },
      });
      if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`ESPN fetch failed: ${url}`);
}

/** Normalize abbreviation variants between our registry and ESPN. */
function normAbbr(a: string): string {
  const m: Record<string, string> = {
    GS: "GSW",
    SA: "SAS",
    NY: "NYK",
    NO: "NOP",
    UTAH: "UTA",
    PHO: "PHX",
  };
  const u = a.trim().toUpperCase();
  return m[u] ?? u;
}

/**
 * ESPN's scoreboard `dates` filter uses the US Eastern calendar date, not
 * UTC — e.g. a game tipping at 2025-06-06T00:30Z is listed under 20250605.
 */
function espnDateParam(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts.replace(/-/g, "");
}

/** All games on a UTC date (YYYYMMDD). */
export async function fetchEspnScoreboard(date: string): Promise<EspnScoreboardEvent[]> {
  const d = (await espnGet<{ events?: any[] }>(
    `${ESPN_BASE}/scoreboard?dates=${date}`
  )).events ?? [];
  return d.map((e) => {
    const comp = e.competitions?.[0];
    const teams: Record<string, string> = {};
    for (const c of comp?.competitors ?? []) {
      teams[c.homeAway] = normAbbr(c.team?.abbreviation ?? "");
    }
    return {
      id: String(e.id),
      date: e.date as string,
      homeAbbr: teams["home"] ?? "",
      awayAbbr: teams["away"] ?? "",
      completed: comp?.status?.type?.completed === true,
    };
  });
}

/**
 * Find the ESPN event id for one of our games by (UTC date + teams).
 * Returns null when no match (e.g. preseason or a date with no scoreboard).
 */
export async function findEspnEventId(
  kickoffIso: string,
  homeAbbr: string,
  awayAbbr: string
): Promise<string | null> {
  const events = await fetchEspnScoreboard(espnDateParam(kickoffIso));
  const h = normAbbr(homeAbbr);
  const a = normAbbr(awayAbbr);
  const match = events.find((e) => e.homeAbbr === h && e.awayAbbr === a);
  return match ? match.id : null;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "" || v === "--") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitMade(v: string | undefined): [number | null, number | null] {
  if (!v || !v.includes("-")) return [null, null];
  const [m, a] = v.split("-");
  return [num(m), num(a)];
}

function parseMinutes(v: string | undefined): number | null {
  if (!v) return null;
  if (v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    if (!Number.isFinite(m)) return null;
    return m + (Number.isFinite(s) ? s / 60 : 0);
  }
  return num(v);
}

/** Full boxscore for an ESPN event id. */
export async function fetchEspnBoxscore(eventId: string): Promise<EspnBoxscore> {
  const d = await espnGet<any>(`${ESPN_BASE}/summary?event=${eventId}`);
  const comp = d?.header?.competitions?.[0];
  const completed = comp?.status?.type?.completed === true;

  const teams: EspnTeamStat[] = [];
  const players: EspnAthleteStat[] = [];

  for (const t of d?.boxscore?.teams ?? []) {
    const abbr = normAbbr(t.team?.abbreviation ?? "");
    const stats: Record<string, string> = {};
    for (const s of t.statistics ?? []) {
      if (s.name) stats[s.name] = s.displayValue ?? "";
    }
    const compTeam = (comp?.competitors ?? []).find(
      (c: any) => normAbbr(c.team?.abbreviation ?? "") === abbr
    );
    teams.push({
      abbr,
      isHome: compTeam?.homeAway === "home",
      stats,
      score: compTeam?.score !== undefined ? Number(compTeam.score) : null,
    });
  }

  for (const t of d?.boxscore?.players ?? []) {
    const abbr = normAbbr(t.team?.abbreviation ?? "");
    const isHome =
      teams.find((x) => x.abbr === abbr)?.isHome ?? false;
    const statGroup = t.statistics?.[0];
    if (!statGroup) continue;
    for (const a of statGroup.athletes ?? []) {
      const s: string[] = a.stats ?? [];
      const [fgm, fga] = splitMade(s[2]);
      const [tpm, tpa] = splitMade(s[3]);
      const [ftm, fta] = splitMade(s[4]);
      players.push({
        id: String(a.athlete?.id ?? ""),
        name: a.athlete?.displayName ?? "Unknown",
        teamAbbr: abbr,
        isHome,
        starter: a.starter === true,
        didNotPlay: a.didNotPlay === true,
        minutes: parseMinutes(s[0]),
        points: num(s[1]),
        fgm,
        fga,
        tpm,
        tpa,
        ftm,
        fta,
        rebounds: num(s[5]),
        assists: num(s[6]),
        turnovers: num(s[7]),
        steals: num(s[8]),
        blocks: num(s[9]),
        oreb: num(s[10]),
        dreb: num(s[11]),
        fouls: num(s[12]),
        plusMinus: num(s[13]),
      });
    }
  }

  return { eventId, completed, players, teams };
}
