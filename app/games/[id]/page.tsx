import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGameAnalysis, type TeamTrends } from "@/lib/model";
import {
  OddsFormatProvider,
  OddsFormatToggle,
  OddsPrice,
} from "@/app/components/odds-format";
import { LocalKickoff } from "@/app/components/local-kickoff";
import { NbaExtras } from "./nba-extras";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Game numbers — The Morning Line" };
}

function fmtSpread(x: number | null): string {
  if (x === null) return "—";
  const r = Math.round(x * 2) / 2;
  if (r === 0) return "PK";
  return r > 0 ? `+${r}` : `${r}`;
}

function prettyBook(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl bg-slate-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TrendRow({
  abbr,
  name,
  t,
  align = "left",
}: {
  abbr: string;
  name: string;
  t: TeamTrends;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="font-bold">
        {abbr} <span className="font-normal text-slate-400">{name}</span>
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Last 5</dt>
          <dd className="font-mono font-semibold">{t.form}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">PF / PA (last 8)</dt>
          <dd className="font-semibold">
            {t.pfAvg !== null ? t.pfAvg.toFixed(1) : "—"} /{" "}
            {t.paAvg !== null ? t.paAvg.toFixed(1) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">ATS (last 10)</dt>
          <dd className="font-semibold">{t.ats}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Power rating</dt>
          <dd className="font-semibold">{Math.round(t.elo)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default async function GameHubPage({
  params,
}: {
  params: { id: string };
}) {
  let analysis;
  try {
    analysis = await getGameAnalysis(params.id);
  } catch {
    return (
      <main className="py-16 text-center">
        <p className="text-xl font-bold">Game not found</p>
        <Link href="/rundown" className="mt-4 inline-block text-emerald-400">
          ← Back to today&apos;s numbers
        </Link>
      </main>
    );
  }

  const { game: g, market } = analysis;
  const admin = createAdminClient();
  const { data: snaps } = await admin
    .from("odds_snapshots")
    .select("sportsbook, spread_point, total_point, captured_at")
    .eq("game_id", g.id)
    .order("captured_at", { ascending: false })
    .limit(12);

  const homePct = analysis.homeWinProb * 100;
  const hasMarket = market.bookCount > 0;

  return (
    <OddsFormatProvider>
      <main className="py-8">
        <Link href="/rundown" className="text-sm text-emerald-400">
          ← Today&apos;s numbers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">
              {g.away_team_name} @ {g.home_team_name}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              <LocalKickoff iso={g.kickoff} /> ·{" "}
              <span className="capitalize">{g.status.replace("_", " ")}</span>
              {g.status === "final" &&
                g.home_score !== null &&
                ` · Final ${g.away_team} ${g.away_score} – ${g.home_team} ${g.home_score}`}
            </p>
          </div>
          <OddsFormatToggle />
        </div>

        <Section title="The numbers">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{g.away_team}</span>
            <span>{(100 - homePct).toFixed(1)}%</span>
          </div>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-slate-700">
            <div
              className="bg-sky-400"
              style={{ width: `${100 - homePct}%` }}
            />
            <div
              className="bg-emerald-400"
              style={{ width: `${homePct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-sm font-semibold">
            <span className="text-slate-500">Model win probability</span>
            <span>
              {g.home_team} {homePct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-950 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Fair spread
              </p>
              <p className="mt-1 text-lg font-bold">
                {g.home_team} {fmtSpread(analysis.fairSpread)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-950 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Fair total
              </p>
              <p className="mt-1 text-lg font-bold">
                {analysis.fairTotal.toFixed(1)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            From Elo power ratings over every regular-season game since 2020,
            adjusted for home field.
          </p>
        </Section>

        <Section title="The market">
          {!hasMarket ? (
            <p className="text-sm text-slate-400">
              Odds post closer to kickoff — check back soon.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2">Book</th>
                      <th className="py-1 pr-2">Spread</th>
                      <th className="py-1 pr-2">Total</th>
                      <th className="py-1">Moneyline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.books.map((b) => {
                      const isBestSpread =
                        market.best.homeSpread?.sportsbook === b.sportsbook;
                      const isBestMl =
                        market.best.homeMl?.sportsbook === b.sportsbook;
                      return (
                        <tr
                          key={b.sportsbook}
                          className="border-t border-slate-800"
                        >
                          <td className="py-2 pr-2 font-semibold">
                            {prettyBook(b.sportsbook)}
                          </td>
                          <td className="py-2 pr-2">
                            {b.spread !== null && b.spreadPrice !== null ? (
                              <>
                                {g.home_team} {fmtSpread(b.spread)}{" "}
                                <span
                                  className={
                                    isBestSpread
                                      ? "font-bold text-emerald-400"
                                      : "text-slate-400"
                                  }
                                >
                                  (<OddsPrice american={b.spreadPrice} />)
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            {b.total !== null ? (
                              <>
                                O/U {b.total.toFixed(1)}{" "}
                                {b.totalPrice !== null && (
                                  <span className="text-slate-400">
                                    (<OddsPrice american={b.totalPrice} />)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            {b.homeMl !== null ? (
                              <span
                                className={
                                  isBestMl
                                    ? "font-bold text-emerald-400"
                                    : undefined
                                }
                              >
                                {g.home_team}{" "}
                                <OddsPrice american={b.homeMl} />
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Consensus: {g.home_team} {fmtSpread(market.spread)} · O/U{" "}
                {market.total !== null ? market.total.toFixed(1) : "—"} ·{" "}
                {market.bookCount} book{market.bookCount === 1 ? "" : "s"}.
                Best available price highlighted.
              </p>
            </>
          )}
        </Section>

        <Section title="Line movement">
          {!snaps || snaps.length === 0 ? (
            <p className="text-sm text-slate-400">
              No movement recorded yet — snapshots appear once odds start
              shifting.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2">When</th>
                    <th className="py-1 pr-2">Book</th>
                    <th className="py-1 pr-2">Spread</th>
                    <th className="py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {snaps.map((s, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-400">
                        <LocalKickoff iso={s.captured_at} />
                      </td>
                      <td className="py-1.5 pr-2">{prettyBook(s.sportsbook)}</td>
                      <td className="py-1.5 pr-2">
                        {g.home_team} {fmtSpread(s.spread_point)}
                      </td>
                      <td className="py-1.5">
                        {s.total_point !== null
                          ? Number(s.total_point).toFixed(1)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Team trends">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <TrendRow
              abbr={g.away_team}
              name={g.away_team_name}
              t={analysis.awayTrends}
            />
            <TrendRow
              abbr={g.home_team}
              name={g.home_team_name}
              t={analysis.homeTrends}
            />
          </div>
        </Section>

        {g.sport === "nba" && (
          <NbaExtras
            gameId={g.id}
            homeAbbr={g.home_team}
            awayAbbr={g.away_team}
            kickoff={g.kickoff}
          />
        )}

        <Section title="Model vs market">
          <p className="text-sm leading-relaxed text-slate-200">
            {analysis.gapText}
          </p>
          {analysis.gap !== null && analysis.gapLevel !== "none" && (
            <p className="mt-2 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">
              Numbers lean {analysis.gap > 0 ? "home" : "away"} by{" "}
              {(Math.abs(analysis.gap) * 100).toFixed(1)}%
            </p>
          )}
        </Section>

        <p className="mt-8 text-center text-xs text-slate-500">
          For information only — not betting advice. 21+. If gambling stops
          being fun, call 1-800-GAMBLER.
        </p>
      </main>
    </OddsFormatProvider>
  );
}
