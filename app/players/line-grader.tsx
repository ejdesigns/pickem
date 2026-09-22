"use client";

import { useMemo, useState } from "react";
import {
  PROP_STATS,
  hitRate,
  projectStat,
  type PlayerGame,
  type PropStat,
} from "@/lib/player-props";
import { SectionCard } from "@/components/ui";

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
    <SectionCard
      title="Line grader"
      copy="Type the line from your book — we'll stack our projection and the player's history against it."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-smoke">
            Stat
          </span>
          <select
            value={stat}
            onChange={(e) => setStat(e.target.value as PropStat)}
            className="input"
          >
            {statOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-smoke">
            Line
          </span>
          <input
            value={line}
            onChange={(e) => setLine(e.target.value)}
            inputMode="decimal"
            placeholder="Line, e.g. 24.5"
            className="input tnum"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="inset p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-smoke">
            Our projection
          </p>
          <p className="tnum mt-1 text-2xl font-extrabold text-volt">
            {proj.projection !== null ? proj.projection.toFixed(1) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-smoke">
            weighted last {proj.games}
          </p>
        </div>
        <div className="inset p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-smoke">
            Your line
          </p>
          <p className="tnum mt-1 text-2xl font-extrabold text-mist">
            {hr !== null ? hr.line : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-smoke">{label}</p>
        </div>
        <div className="inset p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-smoke">
            Hit rate
          </p>
          <p className="tnum mt-1 text-2xl font-extrabold text-mist">
            {hr !== null && hr.pct !== null
              ? `${hr.overs}–${hr.total - hr.overs}`
              : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-smoke">
            {hr !== null && hr.pct !== null
              ? `${hr.pct}% over last ${hr.total}`
              : "type a line"}
          </p>
        </div>
      </div>

      {edge !== null && (
        <p className="mt-3 rounded-xl border border-volt/20 bg-volt-soft p-4 text-sm">
          <span className="text-fog">Projection vs your line: </span>
          <span className="tnum font-extrabold text-volt">
            {edge > 0 ? "+" : ""}
            {edge.toFixed(1)}
          </span>{" "}
          <span className="text-smoke">
            (projection {edge > 0 ? "above" : edge < 0 ? "below" : "on"} the
            line — descriptive, not a recommendation)
          </span>
        </p>
      )}

      {hr !== null && hr.games.length > 0 && (
        <div className="mt-5">
          <p className="kicker">
            Game by game vs {hr.line} (most recent first)
          </p>
          <div className="mt-2 space-y-1.5">
            {hr.games.slice(0, 10).map((g) => (
              <div
                key={g.gameId}
                className="inset flex items-center justify-between px-3.5 py-2.5 text-sm"
              >
                <span className="text-fog">
                  {new Date(g.kickoff).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  vs {g.opponent}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tnum font-bold text-mist">{g.value}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      g.over
                        ? "bg-volt/15 text-volt"
                        : "bg-surface-3 text-fog"
                    }`}
                  >
                    {g.over
                      ? `over by ${g.margin}`
                      : `under by ${Math.abs(g.margin)}`}
                  </span>
                  {Math.abs(g.margin) <= 2 && (
                    <span className="text-[11px] font-semibold text-gold">
                      close
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
