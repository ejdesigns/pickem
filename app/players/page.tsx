import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHero, RgNotice, EmptyState } from "@/components/ui";

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
    <main>
      <Link href={`/rundown?sport=${sport}`} className="link-back pt-8">
        ← {league} numbers
      </Link>

      <PageHero
        eyebrow={`${league} · Player engine`}
        title={
          <>
            Find a <span className="text-volt">player</span>
          </>
        }
        copy="Game logs, model projections, and hit rates — information only."
      />

      <div className="rise rise-1 mt-8 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {SPORTS.map((s) => (
            <Link
              key={s.key}
              href={`/players?sport=${s.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                s.key === sport ? "tab-active" : "tab-idle"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <form method="GET" className="rise rise-2 mt-4 flex gap-2">
        <input type="hidden" name="sport" value={sport} />
        <input
          name="q"
          defaultValue={q}
          placeholder={sport === "nfl" ? "e.g. Patrick Mahomes" : "e.g. LeBron James"}
          autoComplete="off"
          className="input !py-4 !text-base"
        />
        <button type="submit" className="btn-primary shrink-0 !px-7">
          Search
        </button>
      </form>

      {q.trim().length >= 2 && (
        <div className="mt-8">
          {hits.length === 0 ? (
            <EmptyState
              title="No players found"
              copy={`No ${league} players found for "${q}". Player stats load as games complete — check back after the next slate.`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hits.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/players/${p.id}?sport=${sport}`}
                  className={`card-hover rise rise-${(i % 4) + 1} group flex items-center justify-between gap-3 p-5`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-mist">
                      {p.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-smoke">
                      <span className="chip-volt !px-2 !py-0.5 !text-[10px]">
                        {p.team}
                      </span>
                      <span className="tnum">
                        {p.games} game{p.games === 1 ? "" : "s"} logged
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xl text-smoke transition group-hover:translate-x-1 group-hover:text-volt">
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {q.trim().length < 2 && (
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["◎", "Game logs", "Every logged game, newest first, with the numbers that matter."],
            ["⬔", "Projections", "Recency-weighted averages over the last 10 played games."],
            ["◈", "Line grader", "Stack our projection and the player's history against your book's line."],
          ].map(([glyph, title, desc], i) => (
            <div key={title} className={`card rise rise-${i + 1} p-6`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-volt-soft text-lg text-volt">
                {glyph}
              </span>
              <p className="mt-3 font-bold text-mist">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-fog">{desc}</p>
            </div>
          ))}
        </div>
      )}

      <RgNotice />
    </main>
  );
}
