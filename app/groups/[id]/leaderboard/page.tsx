"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

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

  return (
    <>
      <Header />
      <main>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">Leaderboard</h1>
          <Link
            href={`/groups/${groupId}`}
            className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold transition hover:bg-slate-700"
          >
            ← Picks
          </Link>
        </div>

        {/* Season / week toggle */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto rounded-xl bg-slate-900 p-2">
          <button
            onClick={() => setWeek(null)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
              week === null ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            Season
          </button>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition ${
                week === w ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-slate-400">Loading…</p>
        ) : standings.length === 0 ? (
          <p className="mt-6 rounded-xl bg-slate-900 p-5 text-sm text-slate-400">
            No standings yet. Standings appear once games go final and the
            score updater has run.
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {standings.map((s, i) => (
              <li
                key={s.user_id}
                className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3"
              >
                <span
                  className={`w-7 text-center text-lg font-extrabold ${
                    i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {s.display_name}
                </span>
                {s.streak >= 2 && (
                  <span className="rounded-full bg-orange-950 px-2 py-0.5 text-xs font-bold text-orange-300">
                    🔥 {s.streak}
                  </span>
                )}
                <span className="font-mono text-sm text-slate-300">
                  {s.wins}–{s.losses}
                </span>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-6 text-xs text-slate-500">
          Only final games count. Ties award no win. Skipped games don&apos;t
          hurt your streak.
        </p>
      </main>
    </>
  );
}
