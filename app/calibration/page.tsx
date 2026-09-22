import { createAdminClient } from "@/lib/supabase/admin";

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
    <main className="py-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
        The Morning Line
      </p>
      <h1 className="mt-1 text-3xl font-extrabold">Model calibration</h1>
      <p className="mt-3 text-sm text-slate-400">
        When the model says a home team wins 65% of the time, does it happen
        about 65% of the time? Every graded prediction is counted here —
        no cherry-picking, no deleted misses.
      </p>

      {loadError ? (
        <div className="mt-8 rounded-xl bg-slate-900 p-6 text-center text-slate-400">
          <p className="font-semibold text-slate-200">Calibration warming up</p>
          <p className="mt-1 text-sm">
            Prediction history hasn&apos;t been recorded yet. Check back as
            the season progresses.
          </p>
        </div>
      ) : total === 0 ? (
        <div className="mt-8 rounded-xl bg-slate-900 p-6 text-center text-slate-400">
          <p className="font-semibold text-slate-200">No graded predictions yet</p>
          <p className="mt-1 text-sm">
            Predictions are snapshotted before games and graded after. Check
            back as the season progresses.
          </p>
        </div>
      ) : (
        <>
          {total < 50 && (
            <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
              Early days — only {total} graded predictions so far. Small
              samples bounce around; read this loosely until the sample grows.
            </p>
          )}
          <div className="mt-6 overflow-x-auto rounded-xl bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Model range</th>
                  <th className="px-4 py-2">Games</th>
                  <th className="px-4 py-2">Expected</th>
                  <th className="px-4 py-2">Actual</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b) => (
                  <tr key={b.lo} className="border-t border-slate-800">
                    <td className="px-4 py-2 font-semibold">
                      {(b.lo * 100).toFixed(0)}–{(b.lo * 100 + 5).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2">{b.n}</td>
                    <td className="px-4 py-2 text-slate-400">
                      {(b.expected * 100).toFixed(1)}%
                    </td>
                    <td
                      className={`px-4 py-2 font-semibold ${
                        Math.abs(b.actual - b.expected) <= 0.08
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }`}
                    >
                      {(b.actual * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {total} graded predictions · Green = actual within 8 points of
            expected. Calibration measures the numbers, not anyone&apos;s
            picks.
          </p>
        </>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">
        For information only — not betting advice. 21+.
      </p>
    </main>
  );
}
