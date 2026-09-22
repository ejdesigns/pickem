import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestWeek } from "@/lib/ingest";

/**
 * GET /api/games/ingest?week=N — manual/dev trigger.
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

    const weekParam = new URL(request.url).searchParams.get("week");
    const week = weekParam ? Number(weekParam) : undefined;
    if (weekParam && (!Number.isInteger(week) || week! < 1 || week! > 18)) {
      return NextResponse.json(
        { error: "week must be an integer 1-18." },
        { status: 400 }
      );
    }

    const result = await ingestWeek(week);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
