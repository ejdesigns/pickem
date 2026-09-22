import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  NFL_PROP_STATS,
  projectStat,
  statValue,
  type PlayerGame,
  type PropStat,
} from "@/lib/player-props";
import { LineGrader } from "../line-grader";

interface Row {
  player_id: string;
  player_name: string;
  team_abbr: string;
  position: string | null;
  pass_cmp: number | null;
  pass_att: number | null;
  pass_yds: number | null;
  pass_td: number | null;
  pass_int: number | null;
  rush_att: number | null;
  rush_yds: number | null;
  rush_td: number | null;
  receptions: number | null;
  targets: number | null;
  rec_yds: number | null;
  rec_td: number | null;
  tackles: number | null;
  sacks: number | null;
  def_int: number | null;
  fg_made: number | null;
  fg_att: number | null;
  xp_made: number | null;
  xp_att: number | null;
  kick_pts: number | null;
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

type Role = "qb" | "skill" | "kicker" | "defense";

/** Infer a role from season totals — drives which table columns render. */
function detectRole(rows: Row[]): Role {
  const tot = (f: (r: Row) => number | null) =>
    rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  if (tot((r) => r.fg_att) + tot((r) => r.xp_att) > 0) return "kicker";
  if (tot((r) => r.pass_att) >= 10) return "qb";
  if (
    tot((r) => r.tackles) > 0 &&
    tot((r) => r.pass_att) === 0 &&
    tot((r) => r.rush_att) === 0 &&
    tot((r) => r.receptions) === 0
  )
    return "defense";
  return "skill";
}

const ROLE_LABEL: Record<Role, string> = {
  qb: "QB",
  skill: "RB/WR/TE",
  kicker: "K",
  defense: "DEF",
};

function hasStats(r: Row): boolean {
  return (
    [
      r.pass_att,
      r.rush_att,
      r.receptions,
      r.targets,
      r.tackles,
      r.fg_att,
      r.xp_att,
      r.def_int,
    ].some((v) => v !== null && v !== 0) ||
    [r.pass_yds, r.rush_yds, r.rec_yds].some((v) => v !== null)
  );
}

function toLog(r: Row): PlayerGame {
  const g = r.games;
  const isHome = g.home_team === r.team_abbr;
  return {
    gameId: g.id,
    kickoff: g.kickoff,
    opponent: isHome ? g.away_team : g.home_team,
    isHome,
    minutes: null,
    points: null,
    rebounds: null,
    assists: null,
    steals: null,
    blocks: null,
    turnovers: null,
    played: hasStats(r),
    passYds: r.pass_yds,
    passAtt: r.pass_att,
    passTd: r.pass_td,
    rushYds: r.rush_yds,
    rushAtt: r.rush_att,
    receptions: r.receptions,
    targets: r.targets,
    recYds: r.rec_yds,
    tackles: r.tackles,
    fgMade: r.fg_made,
  };
}

function dash(v: number | null): string {
  return v === null ? "—" : String(v);
}

export async function NflPlayerPage({ id }: { id: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("player_game_stats")
    .select(
      "player_id, player_name, team_abbr, position, pass_cmp, pass_att, pass_yds, pass_td, pass_int, rush_att, rush_yds, rush_td, receptions, targets, rec_yds, rec_td, tackles, sacks, def_int, fg_made, fg_att, xp_made, xp_att, kick_pts, games!inner(id, kickoff, home_team, away_team, home_score, away_score)"
    )
    .eq("player_id", id)
    .eq("games.sport", "nfl")
    .order("kickoff", { ascending: true, foreignTable: "games" })
    .limit(500);

  if (error || !data || data.length === 0) notFound();
  const rows = data as unknown as Row[];

  const name = rows[0].player_name;
  const team = rows[rows.length - 1].team_abbr; // most recent team
  const listedPos = rows.find((r) => r.position)?.position ?? null;
  const role = detectRole(rows);

  // Oldest -> newest for the projection math.
  const log: PlayerGame[] = rows.map(toLog).filter((g) => g.played);

  // Featured: NFL stat types that actually have data, up to 4.
  const featured: PropStat[] = NFL_PROP_STATS.map((s) => s.key).filter((k) =>
    log.some((g) => statValue(g, k) !== null)
  ).slice(0, 4);
  const projs = featured.map((s) => ({
    stat: NFL_PROP_STATS.find((p) => p.key === s)!,
    ...projectStat(log, s),
  }));

  const last10 = [...rows].reverse().slice(0, 10); // newest first, last 10
  const graderStats = NFL_PROP_STATS.filter((s) =>
    featured.includes(s.key)
  );

  return (
    <main className="py-8">
      <Link href="/players?sport=nfl" className="text-sm text-emerald-400">
        ← Find a player
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-extrabold">{name}</h1>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold text-slate-200">
          {team}
        </span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-400">
          {listedPos ?? ROLE_LABEL[role]}
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
        {projs.length > 0 ? (
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
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Not enough logged games for projections yet.
          </p>
        )}
      </section>

      <section className="mt-6">
        <LineGrader
          log={log}
          statOptions={graderStats.length > 0 ? graderStats : NFL_PROP_STATS}
          defaultStat={featured[0]}
        />
      </section>

      <section className="mt-6 rounded-xl bg-slate-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Last 10 games
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Opp</th>
                {role === "qb" && (
                  <>
                    <th className="py-1 pr-2 text-right">Cmp/Att</th>
                    <th className="py-1 pr-2 text-right">Yds</th>
                    <th className="py-1 pr-2 text-right">TD</th>
                    <th className="py-1 text-right">Int</th>
                  </>
                )}
                {role === "skill" && (
                  <>
                    <th className="py-1 pr-2 text-right">Rush (att-yds-td)</th>
                    <th className="py-1 text-right">Rec (rec-tgt-yds-td)</th>
                  </>
                )}
                {role === "kicker" && (
                  <>
                    <th className="py-1 pr-2 text-right">FG</th>
                    <th className="py-1 pr-2 text-right">XP</th>
                    <th className="py-1 text-right">Pts</th>
                  </>
                )}
                {role === "defense" && (
                  <>
                    <th className="py-1 pr-2 text-right">Tkl</th>
                    <th className="py-1 pr-2 text-right">Sack</th>
                    <th className="py-1 text-right">Int</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {last10.map((r) => {
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
                    {role === "qb" && (
                      <>
                        <td className="py-1.5 pr-2 text-right text-slate-400">
                          {dash(r.pass_cmp)}/{dash(r.pass_att)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold">
                          {dash(r.pass_yds)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {dash(r.pass_td)}
                        </td>
                        <td className="py-1.5 text-right">{dash(r.pass_int)}</td>
                      </>
                    )}
                    {role === "skill" && (
                      <>
                        <td className="py-1.5 pr-2 text-right text-slate-400">
                          {dash(r.rush_att)}-{dash(r.rush_yds)}-{dash(r.rush_td)}
                        </td>
                        <td className="py-1.5 text-right font-bold">
                          {dash(r.receptions)}/{dash(r.targets)}-{dash(r.rec_yds)}-
                          {dash(r.rec_td)}
                        </td>
                      </>
                    )}
                    {role === "kicker" && (
                      <>
                        <td className="py-1.5 pr-2 text-right font-bold">
                          {dash(r.fg_made)}/{dash(r.fg_att)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {dash(r.xp_made)}/{dash(r.xp_att)}
                        </td>
                        <td className="py-1.5 text-right">{dash(r.kick_pts)}</td>
                      </>
                    )}
                    {role === "defense" && (
                      <>
                        <td className="py-1.5 pr-2 text-right font-bold">
                          {dash(r.tackles)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {dash(r.sacks)}
                        </td>
                        <td className="py-1.5 text-right">{dash(r.def_int)}</td>
                      </>
                    )}
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
