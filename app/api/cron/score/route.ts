import { NextResponse } from "next/server";
import { ingestWeek } from "@/lib/ingest";

/**
 * GET /api/cron/score — Vercel Cron hits this on a schedule (see vercel.json).
 *
 * Protected by CRON_SECRET: pass it as an `Authorization: Bearer` header
 * or as `?secret=`. Vercel Cron on Hobby can't send custom headers, so
 * requests bearing Vercel Cron's user agent are also accepted — the endpoint
 * is idempotent and only refreshes public game data, so the blast radius of
 * a spoofed UA is a harmless re-ingest.
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
  const userAgent = request.headers.get("user-agent") ?? "";
  const authorized =
    authHeader === `Bearer ${secret}` ||
    querySecret === secret ||
    userAgent.toLowerCase().includes("vercel-cron");

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
