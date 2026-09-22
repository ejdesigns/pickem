import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, asResponse } from "@/lib/api-auth";

/**
 * GET /api/games/current-week
 * Returns the latest season/week present in the DB (drives the default
 * week shown in the UI). Falls back to week 1 when no games are loaded yet.
 */
export async function GET() {
  try {
    await requireUser();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("games")
      .select("season, week")
      .order("season", { ascending: false })
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      season: data?.season ?? null,
      week: data?.week ?? 1,
      hasGames: !!data,
    });
  } catch (e) {
    return asResponse(e);
  }
}
