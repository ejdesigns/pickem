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
import { RgNotice, SectionCard } from "@/components/ui";

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
      <p className="font-display text-xl uppercase tracking-wide text-mist">
        {abbr} <span className="font-sans text-sm font-normal normal-case text-fog">{name}</span>
      </p>
      <dl className="tnum mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-smoke">Last 5</dt>
          <dd className="font-bold text-mist">{t.form}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-smoke">PF / PA (last 8)</dt>
          <dd className="font-bold text-mist">
            {t.pfAvg !== null ? t.pfAvg.toFixed(1) : "—"} /{" "}
            {t.paAvg !== null ? t.paAvg.toFixed(1) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-smoke">ATS (last 10)</dt>
          <dd className="font-bold text-mist">{t.ats}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-smoke">Power rating</dt>
          <dd className="font-bold text-mist">{Math.round(t.elo)}</dd>
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
        <p className="font-display text-2xl uppercase text-mist">Game not found</p>
        <Link href="/rundown" className="link-back mt-4">
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
  const isFinal = g.status === "final";

  return (
    <OddsFormatProvider>
      <main>
        <Link href="/rundown" className="link-back pt-8">
          ← Today&apos;s numbers
        </Link>

        {/* ============ SCOREBOARD HERO ============ */}
        <section className="rise relative mt-4 overflow-hidden rounded-3xl border border-white/5 bg-surface p-6 shadow-card sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 260px at 50% -10%, rgba(201,247,58,0.10), transparent 65%)",
            }}
          />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="kicker-volt">
                <LocalKickoff iso={g.kickoff} /> ·{" "}
                <span className="capitalize">{g.status.replace("_", " ")}</span>
              </p>
              <OddsFormatToggle />
            </div>

            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
              <div className="text-center">
                <p className="font-display text-3xl uppercase text-mist sm:text-5xl">
                  {g.away_team}
                </p>
                <p className="mt-1 hidden truncate text-sm text-fog sm:block">
                  {g.away_team_name}
                </p>
                {isFinal && g.away_score !== null && (
                  <p className="num-display mt-2 text-6xl text-mist sm:text-8xl">
                    {g.away_score}
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className="num-display text-xl text-smoke sm:text-2xl">
                  {isFinal ? "FINAL" : "VS"}
                </p>
              </div>
              <div className="text-center">
                <p className="font-display text-3xl uppercase text-mist sm:text-5xl">
                  {g.home_team}
                </p>
                <p className="mt-1 hidden truncate text-sm text-fog sm:block">
                  {g.home_team_name}
                </p>
                {isFinal && g.home_score !== null && (
                  <p className="num-display mt-2 text-6xl text-volt sm:text-8xl">
                    {g.home_score}
                  </p>
                )}
              </div>
            </div>

            {/* Win probability bar */}
            <div className="mt-8">
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="text-ice">{g.away_team}</span>
                <span className="kicker">Model win probability</span>
                <span className="text-volt">{g.home_team}</span>
              </div>
              <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="bg-gradient-to-r from-ice/70 to-ice transition-all duration-700"
                  style={{ width: `${100 - homePct}%` }}
                />
                <div
                  className="bg-gradient-to-r from-volt-deep to-volt shadow-glow-volt transition-all duration-700"
                  style={{ width: `${homePct}%` }}
                />
              </div>
              <div className="tnum mt-2 flex items-center justify-between text-sm font-bold">
                <span className="text-ice">{(100 - homePct).toFixed(1)}%</span>
                <span className="text-volt">{homePct.toFixed(1)}%</span>
              </div>
            </div>

            <div className="tnum mt-6 grid grid-cols-2 gap-2.5">
              <div className="inset p-4 text-center">
                <p className="kicker">Fair spread</p>
                <p className="num-display mt-1.5 text-3xl text-mist">
                  {g.home_team} {fmtSpread(analysis.fairSpread)}
                </p>
              </div>
              <div className="inset p-4 text-center">
                <p className="kicker">Fair total</p>
                <p className="num-display mt-1.5 text-3xl text-mist">
                  {analysis.fairTotal.toFixed(1)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-smoke">
              From Elo power ratings over every regular-season game since 2020,
              adjusted for home field.
            </p>
          </div>
        </section>

        {/* ============ MARKET + MOVEMENT ============ */}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="The market"
            copy={
              hasMarket
                ? `Consensus: ${g.home_team} ${fmtSpread(market.spread)} · O/U ${market.total !== null ? market.total.toFixed(1) : "—"} · ${market.bookCount} book${market.bookCount === 1 ? "" : "s"}. Best available price highlighted.`
                : undefined
            }
          >
            {!hasMarket ? (
              <p className="text-sm text-fog">
                Odds post closer to kickoff — check back soon.
              </p>
            ) : (
              <div className="table-wrap !border-0 !bg-transparent !shadow-none">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Spread</th>
                      <th>Total</th>
                      <th className="!text-right">Moneyline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.books.map((b) => {
                      const isBestSpread =
                        market.best.homeSpread?.sportsbook === b.sportsbook;
                      const isBestMl =
                        market.best.homeMl?.sportsbook === b.sportsbook;
                      return (
                        <tr key={b.sportsbook}>
                          <td className="font-bold text-mist">
                            {prettyBook(b.sportsbook)}
                          </td>
                          <td>
                            {b.spread !== null && b.spreadPrice !== null ? (
                              <>
                                {g.home_team} {fmtSpread(b.spread)}{" "}
                                <span
                                  className={
                                    isBestSpread
                                      ? "font-bold text-volt"
                                      : "text-smoke"
                                  }
                                >
                                  (<OddsPrice american={b.spreadPrice} />)
                                </span>
                              </>
                            ) : (
                              <span className="text-smoke">—</span>
                            )}
                          </td>
                          <td>
                            {b.total !== null ? (
                              <>
                                O/U {b.total.toFixed(1)}{" "}
                                {b.totalPrice !== null && (
                                  <span className="text-smoke">
                                    (<OddsPrice american={b.totalPrice} />)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-smoke">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            {b.homeMl !== null ? (
                              <span
                                className={
                                  isBestMl ? "font-bold text-volt" : undefined
                                }
                              >
                                {g.home_team}{" "}
                                <OddsPrice american={b.homeMl} />
                              </span>
                            ) : (
                              <span className="text-smoke">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Line movement">
            {!snaps || snaps.length === 0 ? (
              <p className="text-sm text-fog">
                No movement recorded yet — snapshots appear once odds start
                shifting.
              </p>
            ) : (
              <div className="table-wrap !border-0 !bg-transparent !shadow-none">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Book</th>
                      <th>Spread</th>
                      <th className="!text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snaps.map((s, i) => (
                      <tr key={i}>
                        <td className="text-fog">
                          <LocalKickoff iso={s.captured_at} />
                        </td>
                        <td className="font-semibold text-mist">
                          {prettyBook(s.sportsbook)}
                        </td>
                        <td>
                          {g.home_team} {fmtSpread(s.spread_point)}
                        </td>
                        <td className="text-right">
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
          </SectionCard>
        </div>

        {/* ============ TRENDS ============ */}
        <div className="mt-6">
          <SectionCard title="Team trends">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              <TrendRow
                abbr={g.away_team}
                name={g.away_team_name}
                t={analysis.awayTrends}
              />
              <div className="sm:border-l sm:border-white/5 sm:pl-8">
                <TrendRow
                  abbr={g.home_team}
                  name={g.home_team_name}
                  t={analysis.homeTrends}
                  align="left"
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {g.sport === "nba" && (
          <div className="mt-6">
            <NbaExtras
              gameId={g.id}
              homeAbbr={g.home_team}
              awayAbbr={g.away_team}
              kickoff={g.kickoff}
            />
          </div>
        )}

        <div className="mt-6">
          <SectionCard title="Model vs market">
            <p className="max-w-3xl text-[15px] leading-relaxed text-mist">
              {analysis.gapText}
            </p>
            {analysis.gap !== null && analysis.gapLevel !== "none" && (
              <p className="mt-4">
                <span className="chip-gold !px-4 !py-1.5 !text-sm">
                  Numbers lean {analysis.gap > 0 ? "home" : "away"} by{" "}
                  {(Math.abs(analysis.gap) * 100).toFixed(1)}%
                </span>
              </p>
            )}
          </SectionCard>
        </div>

        <RgNotice />
      </main>
    </OddsFormatProvider>
  );
}
