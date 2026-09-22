/**
 * ESPN scoreboard/summary client — free player box scores for the NFL.
 *
 * Mirrors lib/espn.ts (NBA). Key difference: the NFL summary returns player
 * stats as POSITIONAL string arrays with no per-stat key labels, so every
 * group is decoded by a fixed column order. Those orders were locked against
 * a live boxscore (Super Bowl LIX, event 401671889, 2025-02-09):
 *
 *   passing:       ["21/32","257","8.0","3","2","6-31","10.0","95.4"]
 *                  = CMP/ATT, YDS, AVG, TD, INT, SACKS-YDSLOST, QBR, RTG
 *   rushing:       ["4","25","6.3","0","8"]            = CAR, YDS, AVG, TD, LNG
 *   receiving:     ["8","157","19.6","2","50","8"]     = REC, YDS, AVG, TD, LNG, TGTS
 *   fumbles:       ["1","1","1"]                       = FUM, LOST, REC
 *   defensive:     ["11","7","1","2","0","1","0"]      = TOT, SOLO, SACKS, TFL, PD, QBH, TD
 *   interceptions: ["1","38","1"]                      = INT, YDS, TD
 *   kicking:       ["4/4","100.0","50","4/4","16"]     = FG, FG%, LNG, XP, PTS
 *
 * The same athlete appears in several groups (Mahomes: passing + rushing +
 * fumbles), so rows are merged by athlete id. NFL athletes carry no
 * starter/didNotPlay/position fields — only athlete + stats.
 *
 * Join strategy: our games are keyed by nflverse ids; ESPN has its own
 * event ids. We join on (US Eastern calendar date + home/away abbrs) via
 * the scoreboard endpoint, same as the NBA client.
 *
 * Polite: callers wait ~1.5s between games, 3 attempts with backoff here.
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

export interface EspnNflAthleteStat {
  id: string;
  name: string;
  teamAbbr: string; // OUR abbr (matches games.home_team, e.g. "LA")
  isHome: boolean;
  passCmp: number | null;
  passAtt: number | null;
  passYds: number | null;
  passTd: number | null;
  passInt: number | null;
  passSacks: number | null;
  passSackYds: number | null;
  rushAtt: number | null;
  rushYds: number | null;
  rushTd: number | null;
  rushLong: number | null;
  receptions: number | null;
  targets: number | null;
  recYds: number | null;
  recTd: number | null;
  recLong: number | null;
  fumbles: number | null;
  fumblesLost: number | null;
  tackles: number | null;
  tacklesSolo: number | null;
  sacks: number | null;
  tfl: number | null;
  defPd: number | null;
  defQbHits: number | null;
  defInt: number | null;
  defIntYds: number | null;
  defIntTd: number | null;
  fgMade: number | null;
  fgAtt: number | null;
  fgLong: number | null;
  xpMade: number | null;
  xpAtt: number | null;
  kickPts: number | null;
}

export interface EspnNflBoxscore {
  eventId: string;
  completed: boolean;
  players: EspnNflAthleteStat[];
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
    LA: "LAR", // nflverse/our DB says LA; ESPN says LAR
    WAS: "WSH", // our DB says WAS; ESPN says WSH
  };
  const u = a.trim().toUpperCase();
  return m[u] ?? u;
}

/** ESPN's scoreboard `dates` filter uses the US Eastern calendar date. */
function espnDateParam(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts.replace(/-/g, "");
}

interface EspnScoreboardEvent {
  id: string;
  homeAbbr: string;
  awayAbbr: string;
  completed: boolean;
}

/** All games on a US Eastern calendar date (YYYYMMDD). */
export async function fetchEspnNflScoreboard(
  date: string
): Promise<EspnScoreboardEvent[]> {
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
      homeAbbr: teams["home"] ?? "",
      awayAbbr: teams["away"] ?? "",
      completed: comp?.status?.type?.completed === true,
    };
  });
}

/**
 * Find the ESPN event id for one of our games by (Eastern date + teams).
 * Returns null when no match.
 */
export async function findNflEspnEventId(
  kickoffIso: string,
  homeAbbr: string,
  awayAbbr: string
): Promise<string | null> {
  const events = await fetchEspnNflScoreboard(espnDateParam(kickoffIso));
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
  // NFL uses "21/32" for completions/attempts and FG/XP, but "6-31" for sacks.
  if (!v) return [null, null];
  const sep = v.includes("/") ? "/" : v.includes("-") ? "-" : null;
  if (!sep) return [null, null];
  const [m, a] = v.split(sep);
  return [num(m), num(a)];
}

function emptyStat(): EspnNflAthleteStat {
  return {
    id: "",
    name: "Unknown",
    teamAbbr: "",
    isHome: false,
    passCmp: null,
    passAtt: null,
    passYds: null,
    passTd: null,
    passInt: null,
    passSacks: null,
    passSackYds: null,
    rushAtt: null,
    rushYds: null,
    rushTd: null,
    rushLong: null,
    receptions: null,
    targets: null,
    recYds: null,
    recTd: null,
    recLong: null,
    fumbles: null,
    fumblesLost: null,
    tackles: null,
    tacklesSolo: null,
    sacks: null,
    tfl: null,
    defPd: null,
    defQbHits: null,
    defInt: null,
    defIntYds: null,
    defIntTd: null,
    fgMade: null,
    fgAtt: null,
    fgLong: null,
    xpMade: null,
    xpAtt: null,
    kickPts: null,
  };
}

/** Full boxscore for an ESPN event id, merged to one row per athlete. */
export async function fetchEspnNflBoxscore(
  eventId: string,
  homeAbbr: string,
  awayAbbr: string
): Promise<EspnNflBoxscore> {
  const d = await espnGet<any>(`${ESPN_BASE}/summary?event=${eventId}`);
  const comp = d?.header?.competitions?.[0];
  const completed = comp?.status?.type?.completed === true;

  const byId = new Map<string, EspnNflAthleteStat>();

  for (const t of d?.boxscore?.players ?? []) {
    const espnAbbr = normAbbr(t.team?.abbreviation ?? "");
    // Store OUR abbr so team_abbr matches games.home_team / away_team.
    const isHome = espnAbbr === normAbbr(homeAbbr);
    const ourAbbr = isHome ? homeAbbr : awayAbbr;

    for (const group of t.statistics ?? []) {
      const gname: string = group.name ?? "";
      for (const a of group.athletes ?? []) {
        const id = String(a.athlete?.id ?? "");
        if (!id) continue;
        const s: string[] = a.stats ?? [];
        if (s.length === 0) continue;
        let p = byId.get(id);
        if (!p) {
          p = emptyStat();
          p.id = id;
          p.name = a.athlete?.displayName ?? "Unknown";
          p.teamAbbr = ourAbbr;
          p.isHome = isHome;
          byId.set(id, p);
        }
        switch (gname) {
          case "passing": {
            const [cmp, att] = splitMade(s[0]);
            const [sacks, sackYds] = splitMade(s[5]);
            p.passCmp = cmp;
            p.passAtt = att;
            p.passYds = num(s[1]);
            p.passTd = num(s[3]);
            p.passInt = num(s[4]);
            p.passSacks = sacks;
            p.passSackYds = sackYds;
            break;
          }
          case "rushing":
            p.rushAtt = num(s[0]);
            p.rushYds = num(s[1]);
            p.rushTd = num(s[3]);
            p.rushLong = num(s[4]);
            break;
          case "receiving":
            p.receptions = num(s[0]);
            p.recYds = num(s[1]);
            p.recTd = num(s[3]);
            p.recLong = num(s[4]);
            p.targets = num(s[5]);
            break;
          case "fumbles":
            p.fumbles = num(s[0]);
            p.fumblesLost = num(s[1]);
            break;
          case "defensive":
            p.tackles = num(s[0]);
            p.tacklesSolo = num(s[1]);
            p.sacks = num(s[2]);
            p.tfl = num(s[3]);
            p.defPd = num(s[4]);
            p.defQbHits = num(s[5]);
            break;
          case "interceptions":
            p.defInt = num(s[0]);
            p.defIntYds = num(s[1]);
            p.defIntTd = num(s[2]);
            break;
          case "kicking": {
            const [fgm, fga] = splitMade(s[0]);
            const [xpm, xpa] = splitMade(s[3]);
            p.fgMade = fgm;
            p.fgAtt = fga;
            p.fgLong = num(s[2]);
            p.xpMade = xpm;
            p.xpAtt = xpa;
            p.kickPts = num(s[4]);
            break;
          }
          // kickReturns / puntReturns / punting: not stored (no projection use).
          default:
            break;
        }
      }
    }
  }

  return { eventId, completed, players: Array.from(byId.values()) };
}
