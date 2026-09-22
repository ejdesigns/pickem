"use client";

import { useMemo, useState } from "react";
import {
  PROP_STATS,
  hitRate,
  projectStat,
  type PlayerGame,
  type PropStat,
} from "@/lib/player-props";

/**
 * Line grader — the user types the line they see at their book; we show our
 * projection next to it plus the player's game-by-game record at that number.
 * Informational only: never says what to do with the comparison.
 *
 * `statOptions` lets NFL profiles offer NFL stat types (defaults to the NBA
 * list so existing usage is unchanged).
 */
export function LineGrader({
  log,
  statOptions = PROP_STATS,
  defaultStat,
}: {
  log: PlayerGame[];
  statOptions?: { key: PropStat; label: string; short: string }[];
  defaultStat?: PropStat;
}) {
  const [stat, setStat] = useState<PropStat>(
    defaultStat ?? statOptions[0]?.key ?? "points"
  );
  const [line, setLine] = useState("");

  const proj = useMemo(() => projectStat(log, stat), [log, stat]);
  const lineNum = line.trim() === "" ? null : Number(line);
  const hr = useMemo(
    () =>
      lineNum !== null && Number.isFinite(lineNum)
        ? hitRate(log, stat, lineNum)
        : null,
    [log, stat, lineNum]
  );

  const label = statOptions.find((s) => s.key === stat)?.label ?? stat;
  const edge =
    hr !== null && proj.projection !== null
      ? Math.round((proj.projection - hr.line) * 10) / 10
      : null;

  return (
    <div className="rounded-xl bg-slate-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
        Line grader
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Type the line from your book — we&apos;ll stack our projection and the
        player&apos;s history against it.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={stat}
          onChange={(e) => setStat(e.target.value as PropStat)}
          className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {statOptions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          inputMode="decimal"
          placeholder={`Line, e.g. 24.5`}
          className="w-36 rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Our projection
          </p>
          <p className="mt-1 text-xl font-extrabold text-emerald-400">
            {proj.projection !== null ? proj.projection.toFixed(1) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            weighted last {proj.games}
          </p>
        </div>
        <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Your line
          </p>
          <p className="mt-1 text-xl font-extrabold">
            {hr !== null ? hr.line : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
        </div>
        <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Hit rate
          </p>
          <p className="mt-1 text-xl font-extrabold">
            {hr !== null && hr.pct !== null ? `${hr.overs}–${hr.total - hr.overs}` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {hr !== null && hr.pct !== null
              ? `${hr.pct}% over last ${hr.total}`
              : "type a line"}
          </p>
        </div>
      </div>

      {edge !== null && (
        <p className="mt-3 rounded-lg bg-slate-950 p-3 text-sm">
          <span className="text-slate-400">Projection vs your line: </span>
          <span className="font-bold">
            {edge > 0 ? "+" : ""}
            {edge.toFixed(1)}
          </span>{" "}
          <span className="text-slate-500">
            (projection {edge > 0 ? "above" : edge < 0 ? "below" : "on"} the
            line — descriptive, not a recommendation)
          </span>
        </p>
      )}

      {hr !== null && hr.games.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Game by game vs {hr.line} (most recent first)
          </p>
          <div className="mt-2 space-y-1">
            {hr.games.slice(0, 10).map((g) => (
              <div
                key={g.gameId}
                className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-1.5 text-sm"
              >
                <span className="text-slate-400">
                  {new Date(g.kickoff).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  vs {g.opponent}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-bold">{g.value}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      g.over
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {g.over ? `over by ${g.margin}` : `under by ${Math.abs(g.margin)}`}
                  </span>
                  {Math.abs(g.margin) <= 2 && (
                    <span className="text-[11px] font-semibold text-amber-400">
                      close
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
