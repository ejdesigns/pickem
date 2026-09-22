import Link from "next/link";
import { getWeekRundown, type GameAnalysis } from "@/lib/model";
import { parseSport, SPORTS, type SportKey } from "@/lib/sports";
import {
  OddsFormatProvider,
  OddsFormatToggle,
  OddsPrice,
} from "@/app/components/odds-format";
import { LocalKickoff } from "@/app/components/local-kickoff";
import { EmptyState, PageHero, RgNotice } from "@/components/ui";

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
    return <span className="chip-muted">Odds post closer to kickoff</span>;
  }
  if (a.gapLevel === "none") {
    return <span className="chip-muted">Numbers and market agree</span>;
  }
  const side = a.gap > 0 ? "home" : "away";
  const pct = `${(Math.abs(a.gap) * 100).toFixed(1)}%`;
  const strong = a.gapLevel === "strong";
  return (
    <span className={strong ? "chip-gold" : "chip-ice"}>
      Numbers lean {side} · {pct}
    </span>
  );
}

function GameCard({ a, index }: { a: GameAnalysis; index: number }) {
  const g = a.game;
  const best = a.market.best;
  return (
    <Link
      href={`/games/${g.id}`}
      className={`card-hover rise rise-${(index % 4) + 1} block p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-mist">
            {g.away_team} <span className="text-smoke">@</span> {g.home_team}
          </p>
          <p className="mt-1 text-xs font-medium text-smoke">
            <LocalKickoff iso={g.kickoff} />
          </p>
        </div>
        <GapBadge a={a} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
        <div className="inset p-3.5">
          <p className="kicker">Market</p>
          <p className="tnum mt-1.5 font-bold text-mist">
            {g.home_team} {fmtSpread(a.market.spread)}
          </p>
          <p className="tnum text-fog">
            O/U {a.market.total !== null ? a.market.total.toFixed(1) : "—"}
          </p>
          <p className="tnum mt-1.5 text-[11px] text-smoke">
            {a.market.bookCount} book{a.market.bookCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="inset border-volt/20 bg-volt-soft/40 p-3.5">
          <p className="kicker-volt">Model</p>
          <p className="tnum mt-1.5 font-bold text-mist">
            {g.home_team} {fmtSpread(a.fairSpread)}
          </p>
          <p className="tnum text-volt">
            Win prob {(a.homeWinProb * 100).toFixed(1)}%
          </p>
          {best.homeMl && (
            <p className="tnum mt-1.5 text-[11px] text-smoke">
              Best {g.home_team} ML:{" "}
              <OddsPrice american={best.homeMl.price} /> ({best.homeMl.sportsbook})
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-right text-xs font-bold text-volt">
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
          className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            sport === s ? "tab-active" : "tab-idle"
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
      <main>
        <PageHero
          eyebrow={`The Morning Line · ${SPORTS[sport].name}`}
          title={
            <>
              Today&apos;s <span className="text-volt">numbers</span>
            </>
          }
          copy="The model's numbers next to the market's numbers. Where they disagree, you'll see it — what you do with that is up to you."
          actions={
            <>
              <SportToggle sport={sport} />
              <OddsFormatToggle />
            </>
          }
        />

        {rundown && (
          <p className="rise rise-1 mt-6 text-sm font-medium text-fog">
            {SPORTS[sport].name} Week {rundown.week} ·{" "}
            {SPORTS[sport].seasonLabel(rundown.season)} ·{" "}
            <span className="text-smoke">sorted by model-vs-market gap</span>
          </p>
        )}

        {sport === "nba" && (
          <div className="rise rise-2 mt-4">
            <Link
              href="/players"
              className="chip-volt !px-4 !py-2 !text-sm transition hover:bg-volt hover:text-volt-ink"
            >
              Find a player →
            </Link>
          </div>
        )}

        {!rundown || rundown.games.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Stats engine warming up"
              copy="Games and odds haven't been loaded yet. Check back soon."
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rundown.games.map((a, i) => (
              <GameCard key={a.game.id} a={a} index={i} />
            ))}
          </div>
        )}

        <RgNotice />
      </main>
    </OddsFormatProvider>
  );
}
