import { NextResponse } from "next/server";
import { requireUser, requireMember } from "@/lib/api-auth";
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

    const [membersRes, profilesRes, gamesRes, picksRes] = await Promise.all([
      supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId),
      // NOTE: group_members.user_id references auth.users, not profiles,
      // so PostgREST can't embed profiles here — fetch them separately.
      supabase.from("profiles").select("id, display_name"),
      (() => {
        const q = supabase.from("games").select("*").order("kickoff", { ascending: true });
        return week ? q.eq("week", week) : q;
      })(),
      supabase.from("picks").select("game_id, user_id, picked_team").eq("group_id", groupId),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (gamesRes.error) throw gamesRes.error;
    if (picksRes.error) throw picksRes.error;

    const names = new Map(
      (profilesRes.data ?? []).map((p) => [p.id as string, p.display_name as string | null])
    );
    const members = (membersRes.data ?? []).map((m) => ({
      user_id: m.user_id,
      display_name: names.get(m.user_id) ?? "Player",
    }));

    const standings = computeStandings(members, gamesRes.data ?? [], picksRes.data ?? []);

    return NextResponse.json({ week, standings });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("leaderboard error", e);
    return NextResponse.json(
      { error: "Could not load standings." },
      { status: 500 }
    );
  }
}
