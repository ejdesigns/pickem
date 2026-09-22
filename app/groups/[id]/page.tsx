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
        <div className="rise flex flex-wrap items-center justify-between gap-4 pt-8">
          <div>
            <p className="kicker-volt">Pick&apos;em · Week {week ?? "…"}</p>
            <h1 className="mt-1 truncate font-display text-4xl uppercase tracking-wide text-mist sm:text-5xl">
              {groupName || "…"}
            </h1>
            {week !== null && games.length > 0 && (
              <p className="tnum mt-2 text-sm text-fog">
                <span className="font-bold text-volt">{pickedCount}</span> of{" "}
                {games.length} picked
              </p>
            )}
          </div>
          <Link href={`/groups/${groupId}/leaderboard`} className="btn-ghost">
            🏆 Board
          </Link>
        </div>

        {/* Week selector */}
        <div className="rise rise-1 mt-6 flex items-center justify-between rounded-2xl border border-white/5 bg-surface px-2 py-2">
          <button
            disabled={week === null || week <= 1}
            onClick={() => setWeek((w) => (w !== null && w > 1 ? w - 1 : w))}
            className="rounded-xl px-5 py-2.5 text-lg font-bold text-fog transition hover:bg-white/5 hover:text-mist disabled:opacity-30"
          >
            ←
          </button>
          <span className="num-display text-xl uppercase tracking-wider text-mist">
            Week {week ?? "…"}
          </span>
          <button
            disabled={week === null || week >= 18}
            onClick={() => setWeek((w) => (w !== null && w < 18 ? w + 1 : w))}
            className="rounded-xl px-5 py-2.5 text-lg font-bold text-fog transition hover:bg-white/5 hover:text-mist disabled:opacity-30"
          >
            →
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-rose-soft px-5 py-3.5 text-sm text-rose">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="card h-52 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="card mt-6 px-6 py-12 text-center">
            <p className="font-display text-xl uppercase tracking-wide text-mist">
              No games yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fog">
              No games loaded for Week {week} yet. Games are pulled from
              nflverse automatically — check back soon.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {games.map((g, i) => {
              const locked = isLocked(g);
              const result = pickResult(g, picks[g.id]);
              const statusChip =
                g.status === "final" ? (
                  <span className="chip-muted tnum">
                    Final {g.away_score}–{g.home_score}
                  </span>
                ) : g.status === "in_progress" ? (
                  <span className="chip-gold tnum animate-pulse-soft">
                    Live {g.away_score}–{g.home_score}
                  </span>
                ) : locked ? (
                  <span className="chip-muted">Locked</span>
                ) : (
                  <span className="chip-volt">Open</span>
                );
              return (
                <li key={g.id} className={`card-hover rise rise-${(i % 4) + 1} p-5`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-smoke">
                      {formatKickoff(g.kickoff)}
                    </span>
                    {statusChip}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5">
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
                          className={`rounded-xl border-2 px-3 py-3.5 text-left transition-all duration-150 ${
                            selected
                              ? "border-volt bg-volt-soft shadow-glow-volt"
                              : "border-line bg-surface-2 hover:-translate-y-0.5 hover:border-fog/40"
                          } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <span
                            className={`num-display block text-2xl ${
                              selected ? "text-volt" : "text-mist"
                            }`}
                          >
                            {t.abbr}
                          </span>
                          <span className="block truncate text-xs text-fog">
                            {t.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {result && (
                    <p
                      className={`tnum mt-3 text-sm font-bold ${
                        result === "W" ? "text-volt" : "text-rose"
                      }`}
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
