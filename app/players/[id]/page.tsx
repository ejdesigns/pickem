import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  projectStat,
  PROP_STATS,
  type PlayerGame,
  type PropStat,
} from "@/lib/player-props";
import { LineGrader } from "../line-grader";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  return { title: "Player numbers — The Morning Line" };
}

interface Row {
  player_id: string;
  player_name: string;
  team_abbr: string;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  games: {
    id: string;
    kickoff: string;
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default async function PlayerPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("player_game_stats")
    .select(
      "player_id, player_name, team_abbr, minutes, points, rebounds, assists, steals, blocks, turnovers, fgm, fga, tpm, tpa, games!inner(id, kickoff, home_team, away_team, home_score, away_score)"
    )
    .eq("player_id", params.id)
    .order("kickoff", { ascending: true, foreignTable: "games" })
    .limit(500);

  if (error || !data || data.length === 0) notFound();
  const rows = data as unknown as Row[];

  const name = rows[0].player_name;
  const team = rows[rows.length - 1].team_abbr; // most recent team

  // Oldest -> newest for the projection math.
  const log: PlayerGame[] = rows
    .filter((r) => (r.minutes ?? 0) > 0)
    .map((r) => {
      const g = r.games;
      const isHome = g.home_team === r.team_abbr;
      return {
        gameId: g.id,
        kickoff: g.kickoff,
        opponent: isHome ? g.away_team : g.home_team,
        isHome,
        minutes: r.minutes,
        points: r.points,
        rebounds: r.rebounds,
        assists: r.assists,
        steals: r.steals,
        blocks: r.blocks,
        turnovers: r.turnovers,
      };
    });

  const featured: PropStat[] = ["points", "rebounds", "assists", "pra"];
  const projs = featured.map((s) => ({
    stat: PROP_STATS.find((p) => p.key === s)!,
    ...projectStat(log, s),
  }));

  const display = [...rows].reverse(); // newest first

  return (
    <main className="py-8">
      <Link href="/players" className="text-sm text-emerald-400">
        ← Find a player
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-extrabold">{name}</h1>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold text-slate-200">
          {team}
        </span>
        <span className="text-sm text-slate-500">
          {log.length} games logged
        </span>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Model projections
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Recency-weighted averages over the last 10 played games — descriptive,
          not a recommendation.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {projs.map((p) => (
            <div key={p.stat.key} className="rounded-xl bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {p.stat.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-400">
                {p.projection !== null ? p.projection.toFixed(1) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Last 5: {p.last5Avg !== null ? p.last5Avg.toFixed(1) : "—"} ·
                Season: {p.seasonAvg !== null ? p.seasonAvg.toFixed(1) : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <LineGrader log={log} />
      </section>

      <section className="mt-6 rounded-xl bg-slate-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Game log
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Opp</th>
                <th className="py-1 pr-2 text-right">MIN</th>
                <th className="py-1 pr-2 text-right">PTS</th>
                <th className="py-1 pr-2 text-right">REB</th>
                <th className="py-1 pr-2 text-right">AST</th>
                <th className="py-1 pr-2 text-right">STL</th>
                <th className="py-1 pr-2 text-right">BLK</th>
                <th className="py-1 pr-2 text-right">TOV</th>
                <th className="py-1 pr-2 text-right">FG</th>
                <th className="py-1 text-right">3PT</th>
              </tr>
            </thead>
            <tbody>
              {display.map((r) => {
                const g = r.games;
                const isHome = g.home_team === r.team_abbr;
                return (
                  <tr key={g.id} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2 text-slate-400">
                      {fmtDate(g.kickoff)}
                    </td>
                    <td className="py-1.5 pr-2 font-semibold">
                      {isHome ? "vs" : "@"} {isHome ? g.away_team : g.home_team}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">
                      {r.minutes !== null ? Math.round(r.minutes) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-bold">
                      {r.points ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{r.rebounds ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{r.assists ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{r.steals ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{r.blocks ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {r.turnovers ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">
                      {r.fgm !== null && r.fga !== null
                        ? `${r.fgm}/${r.fga}`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right text-slate-400">
                      {r.tpm !== null && r.tpa !== null
                        ? `${r.tpm}/${r.tpa}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-slate-500">
        For information only — not betting advice. 21+. If gambling stops being
        fun, call 1-800-GAMBLER.
      </p>
    </main>
  );
}
