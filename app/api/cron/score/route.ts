import { NextResponse } from "next/server";
import { ingestWeek } from "@/lib/ingest";
import { refreshOdds } from "@/lib/odds";
import { ensurePredictions } from "@/lib/model";
import {
  planDailyOddsRefresh,
  markGlobalDone,
} from "@/lib/refresh-policy";
import { SPORT_KEYS } from "@/lib/sports";

/**
 * GET /api/cron/score — Vercel Cron hits this daily at 12:00 UTC
 * (see vercel.json).
 *
 * Protected by CRON_SECRET: pass it as an `Authorization: Bearer` header
 * or as `?secret=`. Vercel Cron on Hobby can't send custom headers, so
 * requests bearing Vercel Cron's user agent are also accepted — the endpoint
 * is idempotent and only refreshes public game data, so the blast radius of
 * a spoofed UA is a harmless re-ingest.
 *
 * Per sport: ingests the current week plus the previous week (so games that
 * finish late still get final scores), snapshots model predictions, and
 * refreshes odds through the quota policy in lib/refresh-policy.ts
 * (free tier: 500 credits/month — the policy keeps us near ~375 worst case).
 *
 * A sport whose data source isn't configured (e.g. NBA before the free
 * balldontlie key is set) reports an error for that sport only — it never
 * breaks the other sports' pipelines.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const querySecret = new URL(request.url).searchParams.get("secret");
  const userAgent = request.headers.get("user-agent") ?? "";
  const authorized =
    authHeader === `Bearer ${secret}` ||
    querySecret === secret ||
    userAgent.toLowerCase().includes("vercel-cron");

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const results: unknown[] = [];
    const predictions: unknown[] = [];

    for (const sport of SPORT_KEYS) {
      try {
        // Current week first (also resolves what "current" is per source).
        const current = await ingestWeek(sport);
        results.push(current);

        // Previous week too, to catch late-finishing games.
        if (current.week > 1) {
          results.push(await ingestWeek(sport, current.week - 1));
        }

        try {
          predictions.push({
            sport,
            ...(await ensurePredictions(sport, current.season, current.week)),
          });
        } catch (e) {
          predictions.push({
            sport,
            error:
              e instanceof Error ? e.message : "Prediction snapshot failed.",
          });
        }
      } catch (e) {
        results.push({
          sport,
          error: e instanceof Error ? e.message : "Ingest failed.",
        });
      }
    }

    // Market odds through the quota policy. Odds failures never break scoring.
    const odds: unknown[] = [];
    for (const plan of await planDailyOddsRefresh()) {
      try {
        const r = await refreshOdds(
          plan.sport,
          undefined,
          undefined,
          plan.regions
        );
        odds.push({ sport: plan.sport, regions: plan.regions, ...r });
        if (plan.regions === "us,uk,eu") await markGlobalDone(plan.sport);
      } catch (e) {
        odds.push({
          sport: plan.sport,
          error: e instanceof Error ? e.message : "Odds refresh failed.",
        });
      }
    }

    return NextResponse.json({ ok: true, results, odds, predictions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
