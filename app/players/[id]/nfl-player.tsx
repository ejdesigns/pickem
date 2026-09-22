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
import { RgNotice, SectionCard, StatTile } from "@/components/ui";

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
    <main>
      <Link href="/players?sport=nfl" className="link-back pt-8">
        ← Find a player
      </Link>

      {/* ============ PROFILE HERO ============ */}
      <div className="rise mt-4">
        <p className="kicker-volt">NFL · Player engine</p>
        <h1 className="mt-2 font-display text-5xl uppercase leading-[0.95] text-mist sm:text-6xl">
          {name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="chip-volt">{team}</span>
          <span className="chip-muted">{listedPos ?? ROLE_LABEL[role]}</span>
          <span className="tnum text-sm text-smoke">
            {log.length} games logged
          </span>
        </div>
      </div>

      {/* ============ PROJECTIONS ============ */}
      <section className="mt-8">
        <p className="kicker">Model projections</p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-smoke">
          Recency-weighted averages over the last 10 played games — descriptive,
          not a recommendation.
        </p>
        {projs.length > 0 ? (
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
        ) : (
          <p className="mt-4 text-sm text-fog">
            Not enough logged games for projections yet.
          </p>
        )}
      </section>

      <div className="mt-6">
        <LineGrader
          log={log}
          statOptions={graderStats.length > 0 ? graderStats : NFL_PROP_STATS}
          defaultStat={featured[0]}
        />
      </div>

      <div className="mt-6">
        <SectionCard title="Last 10 games" copy="Newest first.">
          <div className="table-wrap !border-0 !bg-transparent !shadow-none">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opp</th>
                  {role === "qb" && (
                    <>
                      <th className="!text-right">Cmp/Att</th>
                      <th className="!text-right">Yds</th>
                      <th className="!text-right">TD</th>
                      <th className="!text-right">Int</th>
                    </>
                  )}
                  {role === "skill" && (
                    <>
                      <th className="!text-right">Rush (att-yds-td)</th>
                      <th className="!text-right">Rec (rec-tgt-yds-td)</th>
                    </>
                  )}
                  {role === "kicker" && (
                    <>
                      <th className="!text-right">FG</th>
                      <th className="!text-right">XP</th>
                      <th className="!text-right">Pts</th>
                    </>
                  )}
                  {role === "defense" && (
                    <>
                      <th className="!text-right">Tkl</th>
                      <th className="!text-right">Sack</th>
                      <th className="!text-right">Int</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {last10.map((r) => {
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
                      {role === "qb" && (
                        <>
                          <td className="text-right text-fog">
                            {dash(r.pass_cmp)}/{dash(r.pass_att)}
                          </td>
                          <td className="text-right font-bold text-volt">
                            {dash(r.pass_yds)}
                          </td>
                          <td className="text-right">{dash(r.pass_td)}</td>
                          <td className="text-right">{dash(r.pass_int)}</td>
                        </>
                      )}
                      {role === "skill" && (
                        <>
                          <td className="text-right text-fog">
                            {dash(r.rush_att)}-{dash(r.rush_yds)}-{dash(r.rush_td)}
                          </td>
                          <td className="text-right font-bold text-volt">
                            {dash(r.receptions)}/{dash(r.targets)}-
                            {dash(r.rec_yds)}-{dash(r.rec_td)}
                          </td>
                        </>
                      )}
                      {role === "kicker" && (
                        <>
                          <td className="text-right font-bold text-volt">
                            {dash(r.fg_made)}/{dash(r.fg_att)}
                          </td>
                          <td className="text-right">
                            {dash(r.xp_made)}/{dash(r.xp_att)}
                          </td>
                          <td className="text-right">{dash(r.kick_pts)}</td>
                        </>
                      )}
                      {role === "defense" && (
                        <>
                          <td className="text-right font-bold text-volt">
                            {dash(r.tackles)}
                          </td>
                          <td className="text-right">{dash(r.sacks)}</td>
                          <td className="text-right">{dash(r.def_int)}</td>
                        </>
                      )}
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
