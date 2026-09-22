import { NextResponse } from "next/server";
import { ingestWeek } from "@/lib/ingest";
import { refreshOdds } from "@/lib/odds";
import {
  planBoostOddsRefresh,
  markBoostDone,
} from "@/lib/refresh-policy";
import { SPORT_KEYS } from "@/lib/sports";

/**
 * GET /api/cron/refresh — the frequent lightweight cron (see vercel.json:
 * 08:00 and 18:00 UTC daily; Vercel Hobby allows 2 cron jobs and this is #2).
 *
 * Same protection as /api/cron/score: Bearer CRON_SECRET, ?secret=, or the
 * Vercel Cron user agent.
 *
 * Each run:
 *  1. Re-ingests scores for every sport from the FREE schedule sources
 *     (nflverse CSV, balldontlie) — $0, so finals land within hours instead
 *     of waiting for the next daily run.
 *  2. Applies the quota-policy game-window odds boost: US books only
 *     (3 credits per sport), only while a game is about to tip or recently
 *     started, at most once per 10h per sport.
 *
 * A sport whose source isn't configured reports an error for that sport
 * only and never breaks the others.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const querySecret = new URL(request.url).searchParams.get("secret");
  const userAgent = request.headers.get("user-agent") ?? "";
  return (
    authHeader === `Bearer ${secret}` ||
    querySecret === secret ||
    userAgent.toLowerCase().includes("vercel-cron")
  );
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const ingest: unknown[] = [];
    for (const sport of SPORT_KEYS) {
      try {
        ingest.push(await ingestWeek(sport));
      } catch (e) {
        ingest.push({
          sport,
          error: e instanceof Error ? e.message : "Ingest failed.",
        });
      }
    }

    const odds: unknown[] = [];
    for (const plan of await planBoostOddsRefresh()) {
      try {
        const r = await refreshOdds(
          plan.sport,
          undefined,
          undefined,
          plan.regions
        );
        odds.push({ sport: plan.sport, regions: plan.regions, ...r });
        await markBoostDone(plan.sport);
      } catch (e) {
        odds.push({
          sport: plan.sport,
          error: e instanceof Error ? e.message : "Odds boost failed.",
        });
      }
    }

    return NextResponse.json({ ok: true, ingest, odds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refresh run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
