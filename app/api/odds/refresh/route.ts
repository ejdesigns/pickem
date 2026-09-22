import { NextResponse } from "next/server";
import { refreshOdds } from "@/lib/odds";

/**
 * GET /api/odds/refresh — pull the latest NFL odds from The Odds API
 * (US + UK + EU books, one request) and store them in game_odds.
 *
 * Same protection as /api/cron/score: Bearer CRON_SECRET, ?secret=, or the
 * Vercel Cron user agent. Returns 500 with a clear message when
 * ODDS_API_KEY is not configured.
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
    const result = await refreshOdds();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Odds refresh failed.";
    const status = message.includes("ODDS_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
