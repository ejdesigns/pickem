import { NextResponse } from "next/server";
import { ingestWeek } from "@/lib/ingest";

/**
 * GET /api/cron/score — Vercel Cron hits this on a schedule (see vercel.json).
 *
 * Protected by CRON_SECRET. In the Vercel dashboard, add an Authorization
 * header `Bearer <CRON_SECRET>` to the cron job (Project Settings -> Cron
 * Jobs), or call it manually with ?secret=<CRON_SECRET>.
 *
 * Each run ingests the current week plus the previous week, so games that
 * finish late (e.g. Monday night) still get their final scores.
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
  const authorized =
    authHeader === `Bearer ${secret}` || querySecret === secret;

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // Current week first (also resolves what "current" is per nflverse).
    const current = await ingestWeek();
    const results = [current];

    // Previous week too, to catch late-finishing games.
    if (current.week > 1) {
      results.push(await ingestWeek(current.week - 1));
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
