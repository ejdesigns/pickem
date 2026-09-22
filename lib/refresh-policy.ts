/**
 * Quota-aware odds refresh policy — The Odds API free tier: 500 credits/month.
 *
 * Verified cost model (Sept 2026): one /odds request costs
 * (#regions) × (#markets). We always request markets=h2h,spreads,totals (3):
 *   US-only refresh ("us")          = 1 × 3 = 3 credits
 *   Global refresh ("us,uk,eu")     = 3 × 3 = 9 credits
 * Fixture listings (/sports, /events) are free; we never buy historical
 * odds snapshots (10× multiplier).
 *
 * Two cron jobs (Vercel Hobby max):
 *   /api/cron/score   daily 12:00 UTC — planDailyOddsRefresh()
 *   /api/cron/refresh 08:00 + 18:00 UTC — planBoostOddsRefresh()
 *
 * Worst-case month (October: NFL + NBA both active):
 *   daily:   2 sports × (25×3 + ~6×9 global)          ≈ 258 credits
 *   boosts:  NFL ~13 game-days × 3 + NBA ~26 × 3     ≈ 117 credits
 *   total ≈ 375 credits — ~25% headroom under the 500 cap.
 * Offseason / single sport: ~129 credits. A sport with no games in the
 * next 14 days costs 0 (skipped entirely).
 *
 * State lives in the refresh_state table (migration 003). If the table
 * doesn't exist yet the policy fails open to a global refresh.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { SPORT_KEYS, type SportKey } from "@/lib/sports";

export interface OddsRefreshPlan {
  sport: SportKey;
  regions: "us" | "us,uk,eu";
  reason: string;
}

const GLOBAL_EVERY_MS = 5 * 24 * 60 * 60 * 1000; // full books ~weekly
const BOOST_EVERY_MS = 10 * 60 * 60 * 1000; // at most one boost per 10h/sport

async function sportHasUpcomingGames(
  sport: SportKey,
  daysAhead: number
): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date();
  const { count } = await admin
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("sport", sport)
    .gte("kickoff", now.toISOString())
    .lte("kickoff", new Date(now.getTime() + daysAhead * 86_400_000).toISOString());
  return (count ?? 0) > 0;
}

/** A game tipping off within 8h, or started in the last 6h and not final. */
async function sportInGameWindow(sport: SportKey): Promise<boolean> {
  const admin = createAdminClient();
  const now = Date.now();
  const { data } = await admin
    .from("games")
    .select("id")
    .eq("sport", sport)
    .gte("kickoff", new Date(now - 6 * 3600_000).toISOString())
    .lte("kickoff", new Date(now + 8 * 3600_000).toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

interface RefreshStateRow {
  sport: string;
  last_global_odds: string | null;
  last_boost_odds: string | null;
}

async function getRefreshState(sport: SportKey): Promise<RefreshStateRow | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("refresh_state")
      .select("sport, last_global_odds, last_boost_odds")
      .eq("sport", sport)
      .maybeSingle();
    if (error || !data) return null;
    return data as RefreshStateRow;
  } catch {
    return null; // table missing (migration not applied yet) — fail open
  }
}

async function touchRefreshState(
  sport: SportKey,
  field: "last_global_odds" | "last_boost_odds"
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("refresh_state")
      .upsert(
        {
          sport,
          [field]: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sport" }
      );
  } catch {
    // table missing — the next run will retry; harmless
  }
}

/** Mark a successful global refresh (called by the cron after refreshOdds). */
export async function markGlobalDone(sport: SportKey): Promise<void> {
  await touchRefreshState(sport, "last_global_odds");
}

/** Mark a successful game-window boost (called by the cron after refreshOdds). */
export async function markBoostDone(sport: SportKey): Promise<void> {
  await touchRefreshState(sport, "last_boost_odds");
}

/**
 * Daily cron plan: skip sports with nothing scheduled in the next 14 days
 * (offseason = 0 credits); full global books about weekly; US-only otherwise.
 */
export async function planDailyOddsRefresh(): Promise<OddsRefreshPlan[]> {
  const plans: OddsRefreshPlan[] = [];
  for (const sport of SPORT_KEYS) {
    if (!(await sportHasUpcomingGames(sport, 14))) continue;
    const st = await getRefreshState(sport);
    const lastGlobal = st?.last_global_odds
      ? new Date(st.last_global_odds).getTime()
      : 0;
    plans.push(
      Date.now() - lastGlobal >= GLOBAL_EVERY_MS
        ? { sport, regions: "us,uk,eu", reason: "weekly global refresh" }
        : { sport, regions: "us", reason: "daily US refresh" }
    );
  }
  return plans;
}

/**
 * Game-window boost plan for the frequent cron: US-only refresh while
 * games are about to tip or recently started, at most one per 10h per sport.
 */
export async function planBoostOddsRefresh(): Promise<OddsRefreshPlan[]> {
  const plans: OddsRefreshPlan[] = [];
  for (const sport of SPORT_KEYS) {
    const st = await getRefreshState(sport);
    const lastBoost = st?.last_boost_odds
      ? new Date(st.last_boost_odds).getTime()
      : 0;
    if (Date.now() - lastBoost < BOOST_EVERY_MS) continue;
    if (!(await sportInGameWindow(sport))) continue;
    plans.push({ sport, regions: "us", reason: "game-window boost" });
  }
  return plans;
}
