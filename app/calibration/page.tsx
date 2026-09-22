import { createAdminClient } from "@/lib/supabase/admin";
import { PageHero, RgNotice, EmptyState, SectionCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Model calibration — The Morning Line",
  description:
    "How the model's win probabilities have matched reality. Public, win or lose.",
};

interface Bin {
  lo: number;
  n: number;
  expected: number; // avg model prob
  actual: number; // home win rate
}

/**
 * Buckets graded predictions by model home-win probability (5% bins) and
 * compares expected vs actual home-win rate. Descriptive only.
 */
export default async function CalibrationPage() {
  const admin = createAdminClient();
  let bins: Bin[] = [];
  let total = 0;
  let loadError = false;

  try {
    const { data, error } = await admin
      .from("model_predictions")
      .select("home_win_prob, games!inner(home_score, away_score, status)");
    if (error) throw error;

    const graded = ((data ?? []) as unknown as {
      home_win_prob: number;
      games: { home_score: number | null; away_score: number | null; status: string };
    }[]).filter(
      (r) =>
        r.games.status === "final" &&
        r.games.home_score !== null &&
        r.games.away_score !== null
    );

    total = graded.length;
    const map = new Map<number, { n: number; expSum: number; wins: number }>();
    for (const r of graded) {
      const p = Number(r.home_win_prob);
      if (!Number.isFinite(p) || p < 0.3 || p > 1) continue;
      const lo = Math.floor(p * 20) / 20;
      const e = map.get(lo) ?? { n: 0, expSum: 0, wins: 0 };
      e.n++;
      e.expSum += p;
      if (r.games.home_score! > r.games.away_score!) e.wins++;
      map.set(lo, e);
    }
    bins = Array.from(map.entries())
      .map(([lo, e]) => ({
        lo,
        n: e.n,
        expected: e.expSum / e.n,
        actual: e.wins / e.n,
      }))
      .sort((a, b) => a.lo - b.lo);
  } catch {
    loadError = true;
  }

  return (
    <main>
      <PageHero
        eyebrow="Transparency · Win or lose"
        title={
          <>
            Model <span className="text-volt">calibration</span>
          </>
        }
        copy="When the model says a home team wins 65% of the time, does it happen about 65% of the time? Every graded prediction is counted here — no cherry-picking, no deleted misses."
      />

      {loadError ? (
        <EmptyState
          title="Calibration warming up"
          copy="Prediction history hasn't been recorded yet. Check back as the season progresses."
        />
      ) : total === 0 ? (
        <EmptyState
          title="No graded predictions yet"
          copy="Predictions are snapshotted before games and graded after. Check back as the season progresses."
        />
      ) : (
        <>
          {total < 50 && (
            <p className="mt-6 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm font-medium text-gold">
              Early days — only {total} graded predictions so far. Small
              samples bounce around; read this loosely until the sample grows.
            </p>
          )}
          <div className="mt-6">
            <SectionCard
              title="Calibration buckets"
              copy={`${total} graded predictions · Volt = actual within 8 points of expected. Calibration measures the numbers, not anyone's picks.`}
            >
              <div className="table-wrap !border-0 !bg-transparent !shadow-none">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Model range</th>
                      <th className="!text-right">Games</th>
                      <th className="!text-right">Expected</th>
                      <th className="!text-right">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bins.map((b) => (
                      <tr key={b.lo}>
                        <td className="tnum font-bold text-mist">
                          {(b.lo * 100).toFixed(0)}–{(b.lo * 100 + 5).toFixed(0)}%
                        </td>
                        <td className="tnum text-right">{b.n}</td>
                        <td className="tnum text-right text-fog">
                          {(b.expected * 100).toFixed(1)}%
                        </td>
                        <td
                          className={`tnum text-right font-bold ${
                            Math.abs(b.actual - b.expected) <= 0.08
                              ? "text-volt"
                              : "text-gold"
                          }`}
                        >
                          {(b.actual * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </>
      )}

      <RgNotice />
    </main>
  );
}
