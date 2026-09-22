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
import { NflPlayerPage } from "./nfl-player";
import { RgNotice, SectionCard, StatTile } from "@/components/ui";

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
  searchParams,
}: {
  params: { id: string };
  searchParams: { sport?: string };
}) {
  // NFL profiles live in nfl-player.tsx; default stays NBA so existing links
  // keep working.
  if (searchParams.sport === "nfl") {
    return <NflPlayerPage id={params.id} />;
  }

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
    <main>
      <Link href="/players" className="link-back pt-8">
        ← Find a player
      </Link>

      {/* ============ PROFILE HERO ============ */}
      <div className="rise mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker-volt">NBA · Player engine</p>
          <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-mist sm:text-6xl">
            {name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="chip-volt">{team}</span>
            <span className="tnum text-sm text-smoke">
              {log.length} games logged
            </span>
          </div>
        </div>
      </div>

      {/* ============ PROJECTIONS ============ */}
      <section className="mt-8">
        <p className="kicker">Model projections</p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-smoke">
          Recency-weighted averages over the last 10 played games — descriptive,
          not a recommendation.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {projs.map((p, i) => (
            <div key={p.stat.key} className={`rise rise-${i + 1}`}>
              <StatTile
                label={p.stat.label}
                value={p.projection !== null ? p.projection.toFixed(1) : "—"}
                sub={`Last 5: ${p.last5Avg !== null ? p.last5Avg.toFixed(1) : "—"} · Season: ${p.seasonAvg !== null ? p.seasonAvg.toFixed(1) : "—"}`}
                accent={i === 0}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6">
        <LineGrader log={log} />
      </div>

      <div className="mt-6">
        <SectionCard title="Game log" copy="Newest first.">
          <div className="table-wrap !border-0 !bg-transparent !shadow-none">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opp</th>
                  <th className="!text-right">MIN</th>
                  <th className="!text-right">PTS</th>
                  <th className="!text-right">REB</th>
                  <th className="!text-right">AST</th>
                  <th className="!text-right">STL</th>
                  <th className="!text-right">BLK</th>
                  <th className="!text-right">TOV</th>
                  <th className="!text-right">FG</th>
                  <th className="!text-right">3PT</th>
                </tr>
              </thead>
              <tbody>
                {display.map((r) => {
                  const g = r.games;
                  const isHome = g.home_team === r.team_abbr;
                  return (
                    <tr key={g.id}>
                      <td className="whitespace-nowrap text-fog">
                        {fmtDate(g.kickoff)}
                      </td>
                      <td className="whitespace-nowrap font-bold text-mist">
                        {isHome ? "vs" : "@"} {isHome ? g.away_team : g.home_team}
                      </td>
                      <td className="text-right text-fog">
                        {r.minutes !== null ? Math.round(r.minutes) : "—"}
                      </td>
                      <td className="text-right font-bold text-volt">
                        {r.points ?? "—"}
                      </td>
                      <td className="text-right">{r.rebounds ?? "—"}</td>
                      <td className="text-right">{r.assists ?? "—"}</td>
                      <td className="text-right">{r.steals ?? "—"}</td>
                      <td className="text-right">{r.blocks ?? "—"}</td>
                      <td className="text-right">{r.turnovers ?? "—"}</td>
                      <td className="text-right text-fog">
                        {r.fgm !== null && r.fga !== null
                          ? `${r.fgm}/${r.fga}`
                          : "—"}
                      </td>
                      <td className="text-right text-fog">
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
        </SectionCard>
      </div>

      <RgNotice />
    </main>
  );
}
