/**
 * The Morning Line stats engine — no picks, just numbers.
 *
 * Elo power ratings (seasons 2020..current, regular season only) drive:
 *   - home_win_prob  — model P(home team wins)
 *   - fair_spread    — home-perspective fair line (negative = home favored)
 *   - fair_total     — blended pace/scoring expectation
 *
 * Those are compared against the market (The Odds API consensus) to produce
 * "numbers mismatches" — descriptive model-vs-market gaps, never picks.
 *
 * Never import the admin client pieces in client components.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { loadSeason, currentSeason, type RawGame } from "@/lib/nflverse";
import {
  DEFAULT_SPORT,
  SPORTS,
  type SportKey,
} from "@/lib/sports";

/** One decided game feeding the Elo ratings. */
interface FinalGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  /** Closing spread, home perspective (negative = home favored), if known. */
  spreadLine: number | null;
}

/** NFL finals: nflverse schedules CSV, seasons 2020..current (unchanged). */
async function loadNflFinals(): Promise<FinalGame[]> {
  const out: FinalGame[] = [];
  for (let s = 2020; s <= currentSeason(); s++) {
    for (const g of await loadSeason(s)) {
      const hs = g.home_score === "" ? null : Number(g.home_score);
      const as = g.away_score === "" ? null : Number(g.away_score);
      if (hs === null || as === null) continue;
      out.push({
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        homeScore: hs,
        awayScore: as,
        spreadLine: g.spread_line === "" ? null : Number(g.spread_line),
      });
    }
  }
  return out;
}

/**
 * NBA finals: read from our own games table, which the daily cron fills
 * from balldontlie (plus the one-time backfill in scripts/backfill-nba.ts).
 * The free balldontlie tier carries no closing lines, so spreadLine is
 * always null for NBA and ATS reads "—".
 */
async function loadNbaFinals(): Promise<FinalGame[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("games")
    .select("home_team, away_team, home_score, away_score, kickoff")
    .eq("sport", "nba")
    .eq("status", "final")
    .order("kickoff", { ascending: true })
    .limit(8000);
  return ((data ?? []) as {
    home_team: string;
    away_team: string;
    home_score: number;
    away_score: number;
  }[]).map((r) => ({
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: r.home_score,
    awayScore: r.away_score,
    spreadLine: null,
  }));
}

export interface DbGame {
  id: string;
  sport: string;
  season: number;
  week: number;
  home_team: string;
  home_team_name: string;
  away_team: string;
  away_team_name: string;
  kickoff: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

interface TeamFinal {
  pf: number;
  pa: number;
  won: boolean;
  pushed: boolean;
  atsWin: boolean | null; // null = push or no line
}

interface ModelState {
  ratings: Record<string, number>;
  finals: Record<string, TeamFinal[]>; // chronological, per team
  leagueAvgTotal: number;
  hfa: number; // home advantage in Elo points (per sport)
  perPoint: number; // ~Elo points per 1 point of fair spread (per sport)
}

function expectedHome(homeElo: number, awayElo: number, hfa: number): number {
  return 1 / (1 + Math.pow(10, -((homeElo - awayElo + hfa) / 400)));
}

/** Run Elo over a sport's finals. Cached per sport per process. */
const modelCache = new Map<SportKey, { state: ModelState; at: number }>();
const MODEL_TTL_MS = 6 * 60 * 60 * 1000;

export async function computeModel(
  sport: SportKey = DEFAULT_SPORT
): Promise<ModelState> {
  const cached = modelCache.get(sport);
  if (cached && Date.now() - cached.at < MODEL_TTL_MS) {
    return cached.state;
  }
  const cfg = SPORTS[sport];
  const { k, init, hfa, perPoint } = cfg.elo;
  const ratings: Record<string, number> = {};
  const finals: Record<string, TeamFinal[]> = {};
  const eloOf = (t: string) => ratings[t] ?? init;

  let totalSum = 0;
  let totalN = 0;

  const games = sport === "nba" ? await loadNbaFinals() : await loadNflFinals();
  for (const g of games) {
    const hs = g.homeScore;
    const as = g.awayScore;

    const exp = expectedHome(eloOf(g.homeTeam), eloOf(g.awayTeam), hfa);
    const actual = hs > as ? 1 : hs < as ? 0 : 0.5;
    const delta = k * (actual - exp);
    ratings[g.homeTeam] = eloOf(g.homeTeam) + delta;
    ratings[g.awayTeam] = eloOf(g.awayTeam) - delta;

    totalSum += hs + as;
    totalN++;

    // Spread cover (home perspective: negative line = home favored).
    // Null when the line is unknown (all NBA games on the free tier).
    const line = g.spreadLine;
    let homeAts: boolean | null = null;
    if (line !== null) {
      const margin = hs + line - as;
      homeAts = margin > 0 ? true : margin < 0 ? false : null;
    }

    const homeFinal: TeamFinal = {
      pf: hs,
      pa: as,
      won: hs > as,
      pushed: hs === as,
      atsWin: homeAts,
    };
    const awayFinal: TeamFinal = {
      pf: as,
      pa: hs,
      won: as > hs,
      pushed: hs === as,
      atsWin: homeAts === null ? null : !homeAts,
    };
    (finals[g.homeTeam] ??= []).push(homeFinal);
    (finals[g.awayTeam] ??= []).push(awayFinal);
  }

  const state: ModelState = {
    ratings,
    finals,
    leagueAvgTotal: totalN > 0 ? totalSum / totalN : cfg.typicalTotal,
    hfa,
    perPoint,
  };
  modelCache.set(sport, { state, at: Date.now() });
  return state;
}

export function homeWinProb(
  state: ModelState,
  home: string,
  away: string
): number {
  return expectedHome(state.ratings[home] ?? 1500, state.ratings[away] ?? 1500, state.hfa);
}

/** Home-perspective fair spread; negative = home favored. */
export function fairSpread(state: ModelState, home: string, away: string): number {
  const diff =
    (state.ratings[home] ?? 1500) - (state.ratings[away] ?? 1500) + state.hfa;
  return -(diff / state.perPoint);
}

function avgTotal(state: ModelState, team: string, n: number): number | null {
  const f = state.finals[team];
  if (!f || f.length < 3) return null;
  const last = f.slice(-n);
  return last.reduce((s, x) => s + x.pf + x.pa, 0) / last.length;
}

export function fairTotal(state: ModelState, home: string, away: string): number {
  const h = avgTotal(state, home, 8) ?? state.leagueAvgTotal;
  const a = avgTotal(state, away, 8) ?? state.leagueAvgTotal;
  return 0.6 * ((h + a) / 2) + 0.4 * state.leagueAvgTotal;
}

export interface TeamTrends {
  form: string; // last-5 W/L, e.g. "W W L W W" (most recent last)
  pfAvg: number | null; // last 8
  paAvg: number | null; // last 8
  ats: string; // last 10, e.g. "6-4"
  elo: number;
}

export function teamTrends(state: ModelState, team: string): TeamTrends {
  const f = state.finals[team] ?? [];
  const last5 = f.slice(-5);
  const form =
    last5.length > 0
      ? last5.map((x) => (x.pushed ? "T" : x.won ? "W" : "L")).join(" ")
      : "—";
  const last8 = f.slice(-8);
  const pfAvg =
    last8.length >= 3
      ? last8.reduce((s, x) => s + x.pf, 0) / last8.length
      : null;
  const paAvg =
    last8.length >= 3
      ? last8.reduce((s, x) => s + x.pa, 0) / last8.length
      : null;
  const atsGames = f.slice(-10).filter((x) => x.atsWin !== null);
  const atsW = atsGames.filter((x) => x.atsWin).length;
  const ats = atsGames.length > 0 ? `${atsW}-${atsGames.length - atsW}` : "—";
  return { form, pfAvg, paAvg, ats, elo: state.ratings[team] ?? 1500 };
}

// ---------------------------------------------------------------------------
// Market consensus + analysis
// ---------------------------------------------------------------------------

function americanToProb(p: number): number {
  return p > 0 ? 100 / (p + 100) : -p / (-p + 100);
}

interface MarketBook {
  sportsbook: string;
  spread: number | null; // home-team point
  spreadPrice: number | null; // home-team spread price (american)
  total: number | null;
  totalPrice: number | null; // over price (american)
  homeMl: number | null; // american
  awayMl: number | null;
  homeProbNoVig: number | null;
}

export interface MarketConsensus {
  books: MarketBook[];
  bookCount: number;
  spread: number | null; // avg home spread
  total: number | null; // avg total
  homeProb: number | null; // avg no-vig home win prob
  best: {
    homeSpread: { price: number; sportsbook: string } | null;
    awaySpread: { price: number; sportsbook: string } | null;
    homeMl: { price: number; sportsbook: string } | null;
    awayMl: { price: number; sportsbook: string } | null;
    over: { price: number; sportsbook: string } | null;
    under: { price: number; sportsbook: string } | null;
  };
}

interface OddsRow {
  sportsbook: string;
  market: string;
  outcomes: { name: string; price: number; point?: number }[];
}

function buildConsensus(
  rows: OddsRow[],
  homeName: string,
  awayName: string
): MarketConsensus {
  const byBook = new Map<string, MarketBook>();
  const get = (sb: string): MarketBook => {
    let b = byBook.get(sb);
    if (!b) {
      b = {
        sportsbook: sb,
        spread: null,
        spreadPrice: null,
        total: null,
        totalPrice: null,
        homeMl: null,
        awayMl: null,
        homeProbNoVig: null,
      };
      byBook.set(sb, b);
    }
    return b;
  };

  const best = {
    homeSpread: null as MarketConsensus["best"]["homeSpread"],
    awaySpread: null as MarketConsensus["best"]["awaySpread"],
    homeMl: null as MarketConsensus["best"]["homeMl"],
    awayMl: null as MarketConsensus["best"]["awayMl"],
    over: null as MarketConsensus["best"]["over"],
    under: null as MarketConsensus["best"]["under"],
  };
  const better = (
    cur: { price: number; sportsbook: string } | null,
    price: number,
    sportsbook: string
  ) => (!cur || price > cur.price ? { price, sportsbook } : cur);

  for (const r of rows) {
    const b = get(r.sportsbook);
    if (r.market === "spreads") {
      for (const o of r.outcomes) {
        if (o.name === homeName && o.point !== undefined) {
          b.spread = o.point;
          b.spreadPrice = o.price;
          best.homeSpread = better(best.homeSpread, o.price, r.sportsbook);
        } else if (o.name === awayName && o.point !== undefined) {
          best.awaySpread = better(best.awaySpread, o.price, r.sportsbook);
        }
      }
    } else if (r.market === "totals") {
      const pt = r.outcomes[0]?.point;
      if (pt !== undefined) {
        b.total = pt;
        for (const o of r.outcomes) {
          if (o.name === "Over") {
            if (b.totalPrice === null) b.totalPrice = o.price;
            best.over = better(best.over, o.price, r.sportsbook);
          } else if (o.name === "Under")
            best.under = better(best.under, o.price, r.sportsbook);
        }
      }
    } else if (r.market === "h2h") {
      let hp: number | null = null;
      let ap: number | null = null;
      for (const o of r.outcomes) {
        if (o.name === homeName) {
          hp = o.price;
          b.homeMl = o.price;
          best.homeMl = better(best.homeMl, o.price, r.sportsbook);
        } else if (o.name === awayName) {
          ap = o.price;
          b.awayMl = o.price;
          best.awayMl = better(best.awayMl, o.price, r.sportsbook);
        }
      }
      if (hp !== null && ap !== null) {
        const ph = americanToProb(hp);
        b.homeProbNoVig = ph / (ph + americanToProb(ap));
      }
    }
  }

  const books = Array.from(byBook.values());
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  return {
    books,
    bookCount: books.length,
    spread: avg(books.map((b) => b.spread)),
    total: avg(books.map((b) => b.total)),
    homeProb: avg(books.map((b) => b.homeProbNoVig)),
    best,
  };
}

export type GapLevel = "strong" | "notable" | "none";

export interface GameAnalysis {
  game: DbGame;
  homeWinProb: number;
  fairSpread: number;
  fairTotal: number;
  homeTrends: TeamTrends;
  awayTrends: TeamTrends;
  market: MarketConsensus;
  /** model prob minus market no-vig prob (positive = model higher on home) */
  gap: number | null;
  gapLevel: GapLevel;
  spreadGap: boolean; // |fair - market spread| >= 2
  gapText: string; // plain-English, descriptive only — never a pick
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtSpread(x: number): string {
  const r = Math.round(x * 2) / 2;
  if (r === 0) return "PK";
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * Full model-vs-market analysis for one game. Descriptive only — the
 * returned text never tells anyone what to bet.
 */
export async function getGameAnalysis(gameId: string): Promise<GameAnalysis> {
  const admin = createAdminClient();
  const { data: game, error } = await admin
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (error || !game) throw new Error(`Game not found: ${gameId}`);
  const g = game as DbGame;
  const sport = (g.sport === "nba" ? "nba" : "nfl") as SportKey;

  const state = await computeModel(sport);
  const prob = homeWinProb(state, g.home_team, g.away_team);
  const fs = fairSpread(state, g.home_team, g.away_team);
  const ft = fairTotal(state, g.home_team, g.away_team);

  const { data: oddsRows } = await admin
    .from("game_odds")
    .select("sportsbook, market, outcomes")
    .eq("game_id", gameId);
  const market = buildConsensus(
    ((oddsRows ?? []) as OddsRow[]),
    g.home_team_name,
    g.away_team_name
  );

  const gap = market.homeProb !== null ? prob - market.homeProb : null;
  const absGap = gap !== null ? Math.abs(gap) : 0;
  const gapLevel: GapLevel =
    absGap >= 0.06 ? "strong" : absGap >= 0.03 ? "notable" : "none";
  const spreadGap =
    market.spread !== null && Math.abs(fs - market.spread) >= 2;

  // Plain-English, descriptive only.
  let gapText: string;
  if (gap === null) {
    gapText = `The model gives ${g.home_team_name} a ${fmtPct(prob)} chance at home. Market odds haven't posted yet — check back closer to kickoff.`;
  } else {
    const side = gap > 0 ? g.home_team_name : g.away_team_name;
    const lean =
      gapLevel === "none"
        ? "The numbers and the market are in close agreement on this one."
        : `The numbers lean ${gap > 0 ? "toward the home side" : "toward the away side"} — ${side} rates ${fmtPct(absGap)} ${gap > 0 ? "higher" : "lower"} by the model than the market implies.`;
    const spreadNote =
      market.spread !== null
        ? ` Model fair line is ${g.home_team} ${fmtSpread(fs)} vs market ${fmtSpread(market.spread)}${spreadGap ? " — a 2+ point gap between the numbers and the books." : "."}`
        : "";
    gapText = `${lean}${spreadNote} Information only — not a pick.`;
  }

  return {
    game: g,
    homeWinProb: prob,
    fairSpread: fs,
    fairTotal: ft,
    homeTrends: teamTrends(state, g.home_team),
    awayTrends: teamTrends(state, g.away_team),
    market,
    gap,
    gapLevel,
    spreadGap,
    gapText,
  };
}

/** Resolve the current season/week from the DB (latest week with a future game). */
export async function resolveSeasonWeek(
  sport: SportKey = DEFAULT_SPORT
): Promise<{ season: number; week: number }> {
  const admin = createAdminClient();
  const { data: latest } = await admin
    .from("games")
    .select("season")
    .eq("sport", sport)
    .order("kickoff", { ascending: false })
    .limit(1)
    .single();
  const season = (latest as { season: number } | null)?.season ?? currentSeason();
  const { data: weeks } = await admin
    .from("games")
    .select("week, kickoff")
    .eq("sport", sport)
    .eq("season", season)
    .order("week", { ascending: true });
  const now = new Date().toISOString();
  const upcoming = (weeks ?? []).filter((g) => g.kickoff >= now);
  const week =
    upcoming.length > 0 ? upcoming[0].week : (weeks ?? []).at(-1)?.week ?? 1;
  return { season, week };
}

/** Every game of a week with analysis, sorted by |model-vs-market gap| desc. */
export async function getWeekRundown(
  sport: SportKey = DEFAULT_SPORT,
  week?: number
): Promise<{
  season: number;
  week: number;
  games: GameAnalysis[];
}> {
  const admin = createAdminClient();
  const { season, week: cur } = await resolveSeasonWeek(sport);
  const w = week ?? cur;
  const { data } = await admin
    .from("games")
    .select("id")
    .eq("sport", sport)
    .eq("season", season)
    .eq("week", w)
    .order("kickoff", { ascending: true });
  const analyses: GameAnalysis[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    analyses.push(await getGameAnalysis(row.id));
  }
  analyses.sort(
    (a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0)
  );
  return { season, week: w, games: analyses };
}

/**
 * Snapshot model numbers into model_predictions. Insert-only
 * (ignore conflicts) so the pre-game numbers stay frozen for calibration.
 */
export async function ensurePredictions(
  sport: SportKey,
  season: number,
  week: number
): Promise<{ upserted: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("games")
    .select("id")
    .eq("sport", sport)
    .eq("season", season)
    .eq("week", week);
  const state = await computeModel(sport);
  const rows = ((data ?? []) as { id: string }[]).map((r) => r.id);
  let upserted = 0;
  for (const id of rows) {
    const { data: g } = await admin
      .from("games")
      .select("home_team, away_team")
      .eq("id", id)
      .single();
    if (!g) continue;
    const row = {
      game_id: id,
      season,
      week,
      home_win_prob: homeWinProb(state, g.home_team, g.away_team),
      fair_spread: fairSpread(state, g.home_team, g.away_team),
      fair_total: fairTotal(state, g.home_team, g.away_team),
    };
    const { error } = await admin
      .from("model_predictions")
      .upsert(row, { onConflict: "game_id", ignoreDuplicates: true });
    if (error) throw error;
    upserted++;
  }
  return { upserted };
}

// Re-exported for the smoke test / debugging.
export type { RawGame };
