"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { PageHero } from "@/components/ui";

interface Standing {
  user_id: string;
  display_name: string;
  wins: number;
  losses: number;
  streak: number;
}

/**
 * /groups/[id]/leaderboard — season standings by default,
 * or flip to any single week.
 */
export default function LeaderboardPage({ params }: { params: { id: string } }) {
  const groupId = params.id;
  const [week, setWeek] = useState<number | null>(null); // null = season
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (w: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const url =
          w === null
            ? `/api/groups/${groupId}/leaderboard`
            : `/api/groups/${groupId}/leaderboard?week=${w}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load standings.");
        setStandings(json.standings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [groupId]
  );

  useEffect(() => {
    load(week);
  }, [week, load]);

  const leader = standings[0];

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Pick'em · Standings"
          title={
            <>
              Leader<span className="text-volt">board</span>
            </>
          }
          actions={
            <Link href={`/groups/${groupId}`} className="btn-ghost">
              ← Picks
            </Link>
          }
        />

        {/* Season / week toggle */}
        <div className="rise rise-1 mt-8 flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/5 bg-surface p-2">
          <button
            onClick={() => setWeek(null)}
            className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
              week === null ? "tab-active" : "tab-idle"
            }`}
          >
            Season
          </button>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={`tnum shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                week === w ? "tab-active" : "tab-idle"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-rose-soft px-5 py-3.5 text-sm text-rose">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-6 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card h-16 animate-pulse" />
            ))}
          </div>
        ) : standings.length === 0 ? (
          <div className="card mt-6 px-6 py-12 text-center">
            <p className="font-display text-xl uppercase tracking-wide text-mist">
              No standings yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fog">
              Standings appear once games go final and the score updater has
              run.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <ol className="space-y-2.5">
              {standings.map((s, i) => {
                const isLeader = i === 0;
                return (
                  <li
                    key={s.user_id}
                    className={`flex items-center gap-4 rounded-2xl border px-5 py-4 transition ${
                      isLeader
                        ? "border-volt/30 bg-volt-soft/50 shadow-glow-volt"
                        : "border-white/5 bg-surface"
                    }`}
                  >
                    <span
                      className={`num-display w-10 shrink-0 text-center text-2xl ${
                        i === 0
                          ? "text-gold"
                          : i === 1
                            ? "text-mist"
                            : i === 2
                              ? "text-gold/60"
                              : "text-smoke"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold text-mist">
                      {s.display_name}
                      {isLeader && (
                        <span className="chip-volt ml-3 !text-[10px]">Leader</span>
                      )}
                    </span>
                    {s.streak >= 2 && (
                      <span className="chip-gold">🔥 {s.streak}</span>
                    )}
                    <span className="tnum text-lg font-bold text-mist">
                      {s.wins}
                      <span className="text-smoke">–{s.losses}</span>
                    </span>
                  </li>
                );
              })}
            </ol>

            {leader && (
              <aside className="card rise rise-2 h-fit p-6 lg:sticky lg:top-24">
                <p className="kicker-volt">Clubhouse leader</p>
                <p className="mt-2 truncate font-display text-3xl uppercase tracking-wide text-mist">
                  {leader.display_name}
                </p>
                <p className="num-display mt-2 text-6xl text-volt">
                  {leader.wins}
                  <span className="text-3xl text-smoke">–{leader.losses}</span>
                </p>
                {leader.streak >= 2 && (
                  <p className="mt-3 text-sm font-bold text-gold">
                    🔥 {leader.streak}-game streak
                  </p>
                )}
                <div className="divider mt-4 pt-4">
                  <p className="text-xs leading-relaxed text-smoke">
                    Only final games count. Ties award no win. Skipped games
                    don&apos;t hurt your streak.
                  </p>
                </div>
              </aside>
            )}
          </div>
        )}
      </main>
    </>
  );
}
