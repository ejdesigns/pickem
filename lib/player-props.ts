/**
 * Player prop math — projections, hit rates, and auto game notes.
 *
 * Pure functions only (no server imports) so the same code runs in server
 * components and in the client-side line grader. Everything is informational:
 * projections are descriptive stats, never directives.
 */

export type PropStat =
  | "points"
  | "rebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "turnovers"
  | "pra" // points + rebounds + assists
  | "minutes";

export const PROP_STATS: { key: PropStat; label: string; short: string }[] = [
  { key: "points", label: "Points", short: "PTS" },
  { key: "rebounds", label: "Rebounds", short: "REB" },
  { key: "assists", label: "Assists", short: "AST" },
  { key: "pra", label: "Pts+Reb+Ast", short: "PRA" },
  { key: "steals", label: "Steals", short: "STL" },
  { key: "blocks", label: "Blocks", short: "BLK" },
  { key: "turnovers", label: "Turnovers", short: "TOV" },
  { key: "minutes", label: "Minutes", short: "MIN" },
];

/** One row of a player's game log (oldest -> newest order expected). */
export interface PlayerGame {
  gameId: string;
  kickoff: string; // ISO
  opponent: string; // abbr
  isHome: boolean;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
}

export function statValue(g: PlayerGame, stat: PropStat): number | null {
  switch (stat) {
    case "points":
      return g.points;
    case "rebounds":
      return g.rebounds;
    case "assists":
      return g.assists;
    case "steals":
      return g.steals;
    case "blocks":
      return g.blocks;
    case "turnovers":
      return g.turnovers;
    case "minutes":
      return g.minutes;
    case "pra":
      return g.points !== null && g.rebounds !== null && g.assists !== null
        ? g.points + g.rebounds + g.assists
        : null;
  }
}

export interface Projection {
  projection: number | null; // recency-weighted mean, rounded to 1 decimal
  games: number; // games used
  last5Avg: number | null;
  seasonAvg: number | null;
}

/**
 * Recency-weighted projection: exponential decay over the last `n` played
 * games (most recent counts most). Simple, explainable, no black box.
 */
export function projectStat(
  log: PlayerGame[],
  stat: PropStat,
  n = 10
): Projection {
  const played = log.filter(
    (g) => (g.minutes ?? 0) > 0 && statValue(g, stat) !== null
  );
  const seasonAvg =
    played.length > 0
      ? played.reduce((s, g) => s + (statValue(g, stat) ?? 0), 0) / played.length
      : null;
  const recent = played.slice(-n);
  if (recent.length === 0) {
    return { projection: null, games: 0, last5Avg: null, seasonAvg };
  }
  // Exponential weights: most recent game weight 1, decay 0.85 per game back.
  let wSum = 0;
  let vSum = 0;
  for (let i = 0; i < recent.length; i++) {
    const w = Math.pow(0.85, recent.length - 1 - i);
    wSum += w;
    vSum += w * (statValue(recent[i], stat) ?? 0);
  }
  const last5 = recent.slice(-5);
  const last5Avg =
    last5.length > 0
      ? last5.reduce((s, g) => s + (statValue(g, stat) ?? 0), 0) / last5.length
      : null;
  return {
    projection: Math.round((vSum / wSum) * 10) / 10,
    games: recent.length,
    last5Avg: last5Avg !== null ? Math.round(last5Avg * 10) / 10 : null,
    seasonAvg: seasonAvg !== null ? Math.round(seasonAvg * 10) / 10 : null,
  };
}

export interface HitGame {
  gameId: string;
  kickoff: string;
  opponent: string;
  value: number;
  over: boolean;
  margin: number; // value - line (positive = cleared by this much)
}

export interface HitRate {
  line: number;
  overs: number;
  total: number;
  pct: number | null;
  avgMargin: number | null; // average (value - line)
  closeCalls: HitGame[]; // |margin| <= 2, most recent first
  games: HitGame[]; // most recent first
}

/** How a player has fared against a line, game by game. */
export function hitRate(
  log: PlayerGame[],
  stat: PropStat,
  line: number,
  n = 20
): HitRate {
  const played = log
    .filter((g) => (g.minutes ?? 0) > 0 && statValue(g, stat) !== null)
    .slice(-n)
    .reverse(); // most recent first
  const games: HitGame[] = played.map((g) => {
    const v = statValue(g, stat) ?? 0;
    return {
      gameId: g.gameId,
      kickoff: g.kickoff,
      opponent: g.opponent,
      value: v,
      over: v > line,
      margin: Math.round((v - line) * 10) / 10,
    };
  });
  const overs = games.filter((g) => g.over).length;
  return {
    line,
    overs,
    total: games.length,
    pct: games.length > 0 ? Math.round((overs / games.length) * 1000) / 10 : null,
    avgMargin:
      games.length > 0
        ? Math.round(
            (games.reduce((s, g) => s + g.margin, 0) / games.length) * 10
          ) / 10
        : null,
    closeCalls: games.filter((g) => Math.abs(g.margin) <= 2),
    games,
  };
}

// ---------------------------------------------------------------------------
// Auto game notes — "why they won/lost" from box-score team stats.
// Template-driven and factual; no narrative invention.
// ---------------------------------------------------------------------------

export interface TeamBoxInput {
  abbr: string;
  score: number | null;
  stats: Record<string, string>;
}

function tnum(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build 2-5 factual bullets explaining a final game: shooting, glass,
 * turnovers, and the most productive player when provided.
 */
export function buildGameNotes(
  winner: TeamBoxInput,
  loser: TeamBoxInput,
  topPerformer?: { name: string; line: string }
): string[] {
  const notes: string[] = [];
  const w = winner.stats;
  const l = loser.stats;

  const wReb = tnum(w.totalRebounds);
  const lReb = tnum(l.totalRebounds);
  if (wReb !== null && lReb !== null && Math.abs(wReb - lReb) >= 5) {
    notes.push(
      `Won the glass ${wReb}–${lReb} (${wReb > lReb ? "+" : ""}${wReb - lReb}).`
    );
  }

  const wTo = tnum(w.totalTurnovers ?? w.turnovers);
  const lTo = tnum(l.totalTurnovers ?? l.turnovers);
  if (wTo !== null && lTo !== null && Math.abs(wTo - lTo) >= 4) {
    const diff = lTo - wTo; // positive = winner took better care of the ball
    notes.push(
      diff > 0
        ? `Took care of the ball: ${wTo} turnovers vs ${lTo} (${diff > 0 ? "+" : ""}${diff} margin).`
        : `Sloppy with it: ${wTo} turnovers vs ${lTo} — won anyway.`
    );
  }

  const w3 = tnum(w.threePointFieldGoalPct);
  const l3 = tnum(l.threePointFieldGoalPct);
  if (w3 !== null && l3 !== null && Math.abs(w3 - l3) >= 6) {
    const made = (
      w["threePointFieldGoalsMade-threePointFieldGoalsAttempted"] ?? ""
    ).split("-");
    notes.push(
      `Shot ${w3}% from three${made[0] ? ` (${made[0]}–${made[1]})` : ""} vs ${l3}% — ${
        w3 > l3 ? "the difference from deep" : "cold from deep, won inside instead"
      }.`
    );
  }

  const wPip = tnum(w.pointsInPaint);
  const lPip = tnum(l.pointsInPaint);
  if (wPip !== null && lPip !== null && Math.abs(wPip - lPip) >= 10) {
    notes.push(
      `Dominated the paint ${wPip}–${lPip} (${wPip > lPip ? "+" : ""}${wPip - lPip}).`
    );
  }

  const wFb = tnum(w.fastBreakPoints);
  const lFb = tnum(l.fastBreakPoints);
  if (wFb !== null && lFb !== null && Math.abs(wFb - lFb) >= 8) {
    notes.push(
      `Ran them off the floor: ${wFb} fast-break points vs ${lFb}.`
    );
  }

  const lead = tnum(w.largestLead);
  if (lead !== null && lead >= 18) {
    notes.push(`Led by as many as ${lead} — never really threatened.`);
  }

  if (topPerformer) {
    notes.push(`Most productive: ${topPerformer.name} — ${topPerformer.line}.`);
  }

  if (notes.length === 0) {
    notes.push("A grind — no single stat swung it; check the box score.");
  }
  return notes;
}
