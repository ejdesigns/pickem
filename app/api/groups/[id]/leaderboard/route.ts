import { NextResponse } from "next/server";
import { requireUser, requireMember, asResponse } from "@/lib/api-auth";
import { computeStandings } from "@/lib/pickem";

/**
 * GET /api/groups/[id]/leaderboard?week=N
 * Season standings by default; pass week for that week's standings.
 * Wins come from final games only (graded by the score ingest job).
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, user } = await requireUser();
    const groupId = params.id;
    await requireMember(supabase, user.id, groupId);

    const weekParam = new URL(request.url).searchParams.get("week");
    const week = weekParam ? Number(weekParam) : null;
    if (weekParam && (!Number.isInteger(week!) || week! < 1 || week! > 18)) {
      return NextResponse.json(
        { error: "Query param week must be an integer 1-18." },
        { status: 400 }
      );
    }

    const [membersRes, gamesRes, picksRes] = await Promise.all([
      supabase
        .from("group_members")
        .select("user_id, profiles ( display_name )")
        .eq("group_id", groupId),
      (() => {
        const q = supabase.from("games").select("*").order("kickoff", { ascending: true });
        return week ? q.eq("week", week) : q;
      })(),
      supabase.from("picks").select("game_id, user_id, picked_team").eq("group_id", groupId),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (gamesRes.error) throw gamesRes.error;
    if (picksRes.error) throw picksRes.error;

    const members = (membersRes.data ?? []).map((m) => ({
      user_id: m.user_id,
      display_name:
        (m.profiles as unknown as { display_name: string | null } | null)
          ?.display_name ?? "Player",
    }));

    const standings = computeStandings(members, gamesRes.data ?? [], picksRes.data ?? []);

    return NextResponse.json({ week, standings });
  } catch (e) {
    return asResponse(e);
  }
}
