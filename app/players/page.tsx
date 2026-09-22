import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find a player — The Morning Line",
  description:
    "Search NFL and NBA players for game logs, projections, and line grades.",
};

type Sport = "nfl" | "nba";

interface PlayerHit {
  id: string;
  name: string;
  team: string;
  games: number;
}

async function searchPlayers(q: string, sport: Sport): Promise<PlayerHit[]> {
  if (q.trim().length < 2) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("player_game_stats")
    .select("player_id, player_name, team_abbr, kickoff:games!inner(kickoff)")
    .eq("games.sport", sport)
    .ilike("player_name", `%${q.trim()}%`)
    .limit(300);
  if (error || !data) return [];
  const byId = new Map<string, PlayerHit & { last: string }>();
  for (const r of data as any[]) {
    const cur = byId.get(r.player_id);
    if (!cur) {
      byId.set(r.player_id, {
        id: r.player_id,
        name: r.player_name,
        team: r.team_abbr,
        games: 1,
        last: r.kickoff?.kickoff ?? "",
      });
    } else {
      cur.games++;
      if ((r.kickoff?.kickoff ?? "") > cur.last) {
        cur.last = r.kickoff.kickoff;
        cur.team = r.team_abbr;
      }
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.games - a.games)
    .slice(0, 20)
    .map(({ last, ...rest }) => rest);
}

const SPORTS: { key: Sport; label: string }[] = [
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
];

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { q?: string; sport?: string };
}) {
  const q = searchParams.q ?? "";
  const sport: Sport = searchParams.sport === "nfl" ? "nfl" : "nba";
  const hits = await searchPlayers(q, sport);
  const league = sport === "nfl" ? "NFL" : "NBA";

  return (
    <main className="py-8">
      <Link href={`/rundown?sport=${sport}`} className="text-sm text-emerald-400">
        ← {league} numbers
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">Find a player</h1>
      <p className="mt-1 text-sm text-slate-400">
        Game logs, model projections, and hit rates — information only.
      </p>

      <div className="mt-4 flex gap-2">
        {SPORTS.map((s) => (
          <Link
            key={s.key}
            href={`/players?sport=${s.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${
              s.key === sport
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <form method="GET" className="mt-4 flex gap-2">
        <input type="hidden" name="sport" value={sport} />
        <input
          name="q"
          defaultValue={q}
          placeholder={sport === "nfl" ? "e.g. Patrick Mahomes" : "e.g. LeBron James"}
          autoComplete="off"
          className="w-full max-w-md rounded-lg bg-slate-900 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400"
        >
          Search
        </button>
      </form>

      {q.trim().length >= 2 && (
        <div className="mt-6">
          {hits.length === 0 ? (
            <p className="text-sm text-slate-400">
              No {league} players found for “{q}”. Player stats load as games
              complete — check back after the next slate.
            </p>
          ) : (
            <div className="space-y-2">
              {hits.map((p) => (
                <Link
                  key={p.id}
                  href={`/players/${p.id}?sport=${sport}`}
                  className="block rounded-xl bg-slate-900 p-4 transition hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold">
                      {p.name}{" "}
                      <span className="ml-1 text-sm font-semibold text-slate-400">
                        {p.team}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.games} game{p.games === 1 ? "" : "s"} logged
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">
        For information only — not betting advice. 21+.
      </p>
    </main>
  );
}
