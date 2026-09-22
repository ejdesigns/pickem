import Link from "next/link";
import { getWeekRundown, type GameAnalysis } from "@/lib/model";
import { parseSport, SPORTS, type SportKey } from "@/lib/sports";
import {
  OddsFormatProvider,
  OddsFormatToggle,
  OddsPrice,
} from "@/app/components/odds-format";
import { LocalKickoff } from "@/app/components/local-kickoff";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today's Numbers — The Morning Line",
  description:
    "Every game, the model's numbers vs the market. Information only — never picks.",
};

function fmtSpread(x: number | null): string {
  if (x === null) return "—";
  const r = Math.round(x * 2) / 2;
  if (r === 0) return "PK";
  return r > 0 ? `+${r}` : `${r}`;
}

function GapBadge({ a }: { a: GameAnalysis }) {
  if (a.gap === null) {
    return (
      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
        Odds post closer to kickoff
      </span>
    );
  }
  if (a.gapLevel === "none") {
    return (
      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
        Numbers and market agree
      </span>
    );
  }
  const side = a.gap > 0 ? "home" : "away";
  const pct = `${(Math.abs(a.gap) * 100).toFixed(1)}%`;
  const strong = a.gapLevel === "strong";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        strong
          ? "bg-amber-400 text-slate-950"
          : "bg-slate-700 text-slate-100"
      }`}
    >
      Numbers lean {side} by {pct}
    </span>
  );
}

function GameCard({ a }: { a: GameAnalysis }) {
  const g = a.game;
  const best = a.market.best;
  return (
    <Link
      href={`/games/${g.id}`}
      className="block rounded-xl bg-slate-900 p-4 transition hover:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">
            {g.away_team} <span className="text-slate-500">@</span> {g.home_team}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            <LocalKickoff iso={g.kickoff} />
          </p>
        </div>
        <GapBadge a={a} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Market</p>
          <p className="mt-1 font-semibold">
            {g.home_team} {fmtSpread(a.market.spread)}
          </p>
          <p className="text-slate-400">
            O/U {a.market.total !== null ? a.market.total.toFixed(1) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {a.market.bookCount} book{a.market.bookCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Model</p>
          <p className="mt-1 font-semibold">
            {g.home_team} {fmtSpread(a.fairSpread)}
          </p>
          <p className="text-slate-400">
            Win prob {(a.homeWinProb * 100).toFixed(1)}%
          </p>
          {best.homeMl && (
            <p className="mt-1 text-xs text-slate-500">
              Best {g.home_team} ML:{" "}
              <OddsPrice american={best.homeMl.price} />{" "}
              <span className="text-slate-600">({best.homeMl.sportsbook})</span>
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-right text-xs font-semibold text-emerald-400">
        Full numbers →
      </p>
    </Link>
  );
}

function SportToggle({ sport }: { sport: SportKey }) {
  return (
    <div className="flex gap-2">
      {(["nfl", "nba"] as SportKey[]).map((s) => (
        <Link
          key={s}
          href={`/rundown?sport=${s}`}
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${
            sport === s
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {SPORTS[s].name}
        </Link>
      ))}
    </div>
  );
}

export default async function RundownPage({
  searchParams,
}: {
  searchParams: { sport?: string };
}) {
  const sport = parseSport(searchParams.sport);
  let rundown;
  try {
    rundown = await getWeekRundown(sport);
  } catch {
    rundown = null;
  }

  return (
    <OddsFormatProvider>
      <main className="py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
              The Morning Line
            </p>
            <h1 className="mt-1 text-3xl font-extrabold">Today&apos;s Numbers</h1>
            {rundown && (
              <p className="mt-1 text-sm text-slate-400">
                {SPORTS[sport].name} Week {rundown.week} ·{" "}
                {SPORTS[sport].seasonLabel(rundown.season)} · sorted by
                model-vs-market gap
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SportToggle sport={sport} />
            <OddsFormatToggle />
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-400">
          The model&apos;s numbers next to the market&apos;s numbers. Where they
          disagree, you&apos;ll see it — what you do with that is up to you.
        </p>

        {!rundown || rundown.games.length === 0 ? (
          <div className="mt-8 rounded-xl bg-slate-900 p-6 text-center text-slate-400">
            <p className="font-semibold text-slate-200">Stats engine warming up</p>
            <p className="mt-1 text-sm">
              Games and odds haven&apos;t been loaded yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {rundown.games.map((a) => (
              <GameCard key={a.game.id} a={a} />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          For information only — not betting advice. 21+.
        </p>
      </main>
    </OddsFormatProvider>
  );
}
