import { NextResponse } from "next/server";
import { requireUser, requireMember, asResponse } from "@/lib/api-auth";

/**
 * GET /api/groups/[id]/games?week=N
 * Returns the group's info, that week's games (chronological),
 * and the signed-in user's picks for those games.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, user } = await requireUser();
    const groupId = params.id;
    await requireMember(supabase, user.id, groupId);

    const week = Number(new URL(request.url).searchParams.get("week"));
    if (!Number.isInteger(week) || week < 1 || week > 18) {
      return NextResponse.json(
        { error: "Query param week must be an integer 1-18." },
        { status: 400 }
      );
    }

    const [{ data: group, error: groupError }, { data: games, error: gamesError }] =
      await Promise.all([
        supabase
          .from("groups")
          .select("id, name, invite_code")
          .eq("id", groupId)
          .single(),
        supabase
          .from("games")
          .select("*")
          .eq("week", week)
          .order("kickoff", { ascending: true }),
      ]);
    if (groupError) throw groupError;
    if (gamesError) throw gamesError;

    const gameIds = (games ?? []).map((g) => g.id);
    let picks: Record<string, string> = {};
    if (gameIds.length > 0) {
      const { data: pickRows, error: picksError } = await supabase
        .from("picks")
        .select("game_id, picked_team")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .in("game_id", gameIds);
      if (picksError) throw picksError;
      picks = Object.fromEntries(
        (pickRows ?? []).map((p) => [p.game_id, p.picked_team])
      );
    }

    return NextResponse.json({ group, week, games: games ?? [], picks });
  } catch (e) {
    return asResponse(e);
  }
}
