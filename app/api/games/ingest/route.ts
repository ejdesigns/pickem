import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestWeek } from "@/lib/ingest";
import { parseSport } from "@/lib/sports";

/**
 * GET /api/games/ingest?sport=nfl&week=N — manual/dev trigger.
 * Requires a signed-in user (any user; it only refreshes public game data).
 * The automated path is /api/cron/score (Vercel Cron).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const sport = parseSport(params.get("sport"));
    const weekParam = params.get("week");
    const week = weekParam ? Number(weekParam) : undefined;
    if (weekParam && (!Number.isInteger(week) || week! < 1)) {
      return NextResponse.json(
        { error: "week must be a positive integer." },
        { status: 400 }
      );
    }

    const result = await ingestWeek(sport, week);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
