"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

interface Game {
  id: string;
  week: number;
  home_team: string;
  home_team_name: string;
  away_team: string;
  away_team_name: string;
  kickoff: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "in_progress" | "final";
}

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isLocked(game: Game) {
  return game.status !== "scheduled" || new Date(game.kickoff).getTime() <= Date.now();
}

function pickResult(game: Game, picked: string | undefined) {
  if (!picked || game.status !== "final") return null;
  if (game.home_score === null || game.away_score === null) return null;
  const winner = game.home_score > game.away_score ? game.home_team : game.away_team;
  return picked === winner ? "W" : "L";
}

/**
 * /groups/[id] — this week's slate. Tap a team to pick it; tap again to
 * switch. Picks lock at each game's kickoff (enforced by /api/picks).
 */
export default function GroupPage({ params }: { params: { id: string } }) {
  const groupId = params.id;
  const [groupName, setGroupName] = useState("");
  const [week, setWeek] = useState<number | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWeek = useCallback(
    async (w: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/groups/${groupId}/games?week=${w}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load games.");
        setGroupName(json.group.name);
        setGames(json.games);
        setPicks(json.picks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [groupId]
  );

  // Default to the latest week that has games in the DB.
  useEffect(() => {
    fetch("/api/games/current-week")
      .then((r) => r.json())
      .then((json) => setWeek(json.week ?? 1))
      .catch(() => setWeek(1));
  }, []);

  useEffect(() => {
    if (week !== null) loadWeek(week);
  }, [week, loadWeek]);

  async function makePick(game: Game, team: string) {
    if (isLocked(game) || picks[game.id] === team) return;
    setSaving(game.id);
    setError(null);
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, game_id: game.id, picked_team: team }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save pick.");
      setPicks((p) => ({ ...p, [game.id]: team }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(null);
    }
  }

  const pickedCount = games.filter((g) => picks[g.id]).length;

  return (
    <>
      <Header />
      <main>
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-extrabold">{groupName || "…"}</h1>
          <Link
            href={`/groups/${groupId}/leaderboard`}
            className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold transition hover:bg-slate-700"
          >
            🏆 Board
          </Link>
        </div>

        {/* Week selector */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 px-2 py-2">
          <button
            disabled={week === null || week <= 1}
            onClick={() => setWeek((w) => (w !== null && w > 1 ? w - 1 : w))}
            className="rounded-lg px-4 py-2 font-bold text-slate-300 transition hover:bg-slate-800 disabled:opacity-30"
          >
            ←
          </button>
          <span className="font-bold">Week {week ?? "…"}</span>
          <button
            disabled={week === null || week >= 18}
            onClick={() => setWeek((w) => (w !== null && w < 18 ? w + 1 : w))}
            className="rounded-lg px-4 py-2 font-bold text-slate-300 transition hover:bg-slate-800 disabled:opacity-30"
          >
            →
          </button>
        </div>

        {week !== null && games.length > 0 && (
          <p className="mt-3 text-sm text-slate-400">
            {pickedCount} of {games.length} picked
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-slate-400">Loading games…</p>
        ) : games.length === 0 ? (
          <p className="mt-6 rounded-xl bg-slate-900 p-5 text-sm text-slate-400">
            No games loaded for Week {week} yet. Games are pulled from nflverse
            automatically — check back soon, or ask the group admin to run the
            ingest.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {games.map((g) => {
              const locked = isLocked(g);
              const result = pickResult(g, picks[g.id]);
              return (
                <li key={g.id} className="rounded-xl bg-slate-900 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatKickoff(g.kickoff)}</span>
                    <span
                      className={
                        g.status === "final"
                          ? "font-semibold text-slate-300"
                          : g.status === "in_progress"
                            ? "font-semibold text-amber-300"
                            : locked
                              ? "text-slate-500"
                              : "text-emerald-300"
                      }
                    >
                      {g.status === "final"
                        ? `Final ${g.away_score}–${g.home_score}`
                        : g.status === "in_progress"
                          ? `Live ${g.away_score}–${g.home_score}`
                          : locked
                            ? "Locked"
                            : "Open"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { abbr: g.away_team, name: g.away_team_name },
                      { abbr: g.home_team, name: g.home_team_name },
                    ].map((t) => {
                      const selected = picks[g.id] === t.abbr;
                      return (
                        <button
                          key={t.abbr}
                          disabled={locked || saving === g.id}
                          onClick={() => makePick(g, t.abbr)}
                          className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                            selected
                              ? "border-emerald-500 bg-emerald-950"
                              : "border-slate-800 bg-slate-950 hover:border-slate-600"
                          } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <span className="block text-lg font-extrabold">
                            {t.abbr}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {t.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {result && (
                    <p
                      className={`mt-2 text-sm font-bold ${result === "W" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {result === "W" ? "✓ Correct" : "✗ Missed"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
