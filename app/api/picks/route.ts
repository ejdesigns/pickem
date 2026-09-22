import { NextResponse } from "next/server";
import { requireUser, requireMember, asResponse } from "@/lib/api-auth";

/**
 * POST /api/picks { group_id, game_id, picked_team }
 * Upserts the user's pick. Enforced server-side:
 *  - user must be a group member
 *  - picked team must be one of the game's two teams
 *  - game must still be scheduled AND kickoff must be in the future
 *    (picks lock at kickoff; this check is authoritative, the UI
 *    disabling buttons is only cosmetic)
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { group_id, game_id, picked_team } = await request.json();

    if (!group_id || !game_id || !picked_team) {
      return NextResponse.json(
        { error: "group_id, game_id and picked_team are required." },
        { status: 400 }
      );
    }

    await requireMember(supabase, user.id, group_id);

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, home_team, away_team, kickoff, status")
      .eq("id", game_id)
      .single();
    if (gameError || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    if (
      picked_team !== game.home_team &&
      picked_team !== game.away_team
    ) {
      return NextResponse.json(
        { error: "Picked team is not playing in this game." },
        { status: 400 }
      );
    }

    // THE lock: reject anything at/after kickoff or not scheduled.
    if (game.status !== "scheduled" || new Date(game.kickoff).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Picks are locked for this game." },
        { status: 400 }
      );
    }

    const { data: pick, error: pickError } = await supabase
      .from("picks")
      .upsert(
        {
          group_id,
          user_id: user.id,
          game_id,
          picked_team,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "group_id,user_id,game_id" }
      )
      .select("game_id, picked_team")
      .single();
    if (pickError) throw pickError;

    return NextResponse.json({ pick });
  } catch (e) {
    return asResponse(e);
  }
}
