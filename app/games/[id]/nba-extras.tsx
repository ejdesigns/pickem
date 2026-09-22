import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildGameNotes, type TeamBoxInput } from "@/lib/player-props";
import { SectionCard } from "@/components/ui";

/**
 * NBA-only additions to the game page: box score with player links, and each
 * team's last 5 games with scores plus auto-generated "why they won/lost"
 * notes. All derived from player_game_stats (team totals = sum of players).
 */

interface BoxRow {
  player_id: string;
  player_name: string;
  team_abbr: string;
  is_home: boolean;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  tpm: number | null;
  tpa: number | null;
}

interface LastFiveGame {
  id: string;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function teamInput(
  abbr: string,
  score: number | null,
  rows: BoxRow[]
): TeamBoxInput {
  const sum = (f: (r: BoxRow) => number | null) =>
    rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const tpm = sum((r) => r.tpm);
  const tpa = sum((r) => r.tpa);
  return {
    abbr,
    score,
    stats: {
      totalRebounds: String(sum((r) => r.rebounds)),
      totalTurnovers: String(sum((r) => r.turnovers)),
      threePointFieldGoalPct:
        tpa > 0 ? ((tpm / tpa) * 100).toFixed(1) : "",
      "threePointFieldGoalsMade-threePointFieldGoalsAttempted": `${tpm}-${tpa}`,
    },
  };
}

function topPerformer(rows: BoxRow[]): { name: string; line: string } | undefined {
  const played = rows.filter((r) => (r.minutes ?? 0) > 0);
  if (played.length === 0) return undefined;
  const top = played.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a));
  return {
    name: top.player_name,
    line: `${top.points ?? 0} PTS, ${top.rebounds ?? 0} REB, ${top.assists ?? 0} AST`,
  };
}

async function getBoxScore(gameId: string): Promise<BoxRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("player_game_stats")
    .select(
      "player_id, player_name, team_abbr, is_home, minutes, points, rebounds, assists, steals, blocks, turnovers, tpm, tpa"
    )
    .eq("game_id", gameId)
    .order("points", { ascending: false })
    .limit(60);
  return (data ?? []) as BoxRow[];
}

async function getLastFive(
  abbr: string,
  beforeKickoff: string
): Promise<{ game: LastFiveGame; rows: BoxRow[] }[]> {
  const admin = createAdminClient();
  const { data: games } = await admin
    .from("games")
    .select("id, kickoff, home_team, away_team, home_score, away_score")
    .eq("sport", "nba")
    .eq("status", "final")
    .lt("kickoff", beforeKickoff)
    .or(`home_team.eq.${abbr},away_team.eq.${abbr}`)
    .order("kickoff", { ascending: false })
    .limit(5);
  const list = (games ?? []) as LastFiveGame[];
  if (list.length === 0) return [];
  const { data: rows } = await admin
    .from("player_game_stats")
    .select(
      "player_id, player_name, team_abbr, is_home, minutes, points, rebounds, assists, steals, blocks, turnovers, tpm, tpa"
    )
    .in(
      "game_id",
      list.map((g) => g.id)
    );
  const byGame = new Map<string, BoxRow[]>();
  for (const r of (rows ?? []) as (BoxRow & { game_id: string })[]) {
    const arr = byGame.get(r.game_id) ?? [];
    arr.push(r);
    byGame.set(r.game_id, arr);
  }
  return list.map((g) => ({ game: g, rows: byGame.get(g.id) ?? [] }));
}

function BoxTable({ rows, teamAbbr }: { rows: BoxRow[]; teamAbbr: string }) {
  const team = rows.filter((r) => r.team_abbr === teamAbbr).slice(0, 8);
  if (team.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-display text-lg uppercase tracking-wide text-mist">
        {teamAbbr}
      </p>
      <div className="table-wrap !border-0 !bg-transparent !shadow-none">
        <table className="dtable">
          <thead>
            <tr>
              <th>Player</th>
              <th className="!text-right">MIN</th>
              <th className="!text-right">PTS</th>
              <th className="!text-right">REB</th>
              <th className="!text-right">AST</th>
              <th className="!text-right">STL/BLK</th>
            </tr>
          </thead>
          <tbody>
            {team.map((r) => (
              <tr key={r.player_id}>
                <td>
                  <Link
                    href={`/players/${r.player_id}`}
                    className="font-bold text-volt hover:underline"
                  >
                    {r.player_name}
                  </Link>
                </td>
                <td className="text-right text-fog">
                  {r.minutes !== null ? Math.round(r.minutes) : "—"}
                </td>
                <td className="text-right font-bold text-mist">
                  {r.points ?? "—"}
                </td>
                <td className="text-right">{r.rebounds ?? "—"}</td>
                <td className="text-right">{r.assists ?? "—"}</td>
                <td className="text-right text-fog">
                  {r.steals ?? 0}/{r.blocks ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LastFiveCard({
  abbr,
  items,
}: {
  abbr: string;
  items: { game: LastFiveGame; rows: BoxRow[] }[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-fog">
        No recent finals logged for {abbr} yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map(({ game: g, rows }) => {
        const isHome = g.home_team === abbr;
        const us = isHome ? g.home_score : g.away_score;
        const them = isHome ? g.away_score : g.home_score;
        const opp = isHome ? g.away_team : g.home_team;
        const won = us !== null && them !== null && us > them;
        const teamRows = rows.filter((r) => r.team_abbr === abbr);
        const oppRows = rows.filter((r) => r.team_abbr !== abbr);
        const notes =
          teamRows.length > 0 && oppRows.length > 0
            ? buildGameNotes(
                won
                  ? teamInput(abbr, us, teamRows)
                  : teamInput(opp, them, oppRows),
                won
                  ? teamInput(opp, them, oppRows)
                  : teamInput(abbr, us, teamRows),
                won ? topPerformer(teamRows) : topPerformer(teamRows)
              )
            : [];
        return (
          <div key={g.id} className="inset p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-mist">
                <span
                  className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-extrabold ${
                    won ? "bg-volt text-volt-ink" : "bg-surface-3 text-fog"
                  }`}
                >
                  {won ? "W" : "L"}
                </span>
                {isHome ? "vs" : "@"} {opp}
              </p>
              <p className="tnum text-sm font-bold text-mist">
                {us}–{them}
                <span className="ml-2 text-xs font-medium text-smoke">
                  {fmtDate(g.kickoff)}
                </span>
              </p>
            </div>
            {notes.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-fog">
                {notes.map((n, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-volt">▸</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export async function NbaExtras({
  gameId,
  homeAbbr,
  awayAbbr,
  kickoff,
}: {
  gameId: string;
  homeAbbr: string;
  awayAbbr: string;
  kickoff: string;
}) {
  const [box, awayFive, homeFive] = await Promise.all([
    getBoxScore(gameId),
    getLastFive(awayAbbr, kickoff),
    getLastFive(homeAbbr, kickoff),
  ]);

  return (
    <>
      {box.length > 0 && (
        <SectionCard
          title="Box score"
          copy="Tap a player for their game log, projections, and line grader."
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <BoxTable rows={box} teamAbbr={awayAbbr} />
            <BoxTable rows={box} teamAbbr={homeAbbr} />
          </div>
        </SectionCard>
      )}

      <div className="mt-6">
        <SectionCard title={`Last 5 — ${awayAbbr}`}>
          <LastFiveCard abbr={awayAbbr} items={awayFive} />
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`Last 5 — ${homeAbbr}`}>
          <LastFiveCard abbr={homeAbbr} items={homeFive} />
        </SectionCard>
      </div>
    </>
  );
}
