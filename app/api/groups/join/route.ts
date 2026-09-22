import { NextResponse } from "next/server";
import { requireUser, asResponse } from "@/lib/api-auth";

/**
 * POST /api/groups/join { invite_code } — join a group with its code.
 * Idempotent: joining twice returns the existing membership.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { invite_code } = await request.json();

    if (!invite_code || typeof invite_code !== "string") {
      return NextResponse.json(
        { error: "Invite code is required." },
        { status: 400 }
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", invite_code.trim().toUpperCase())
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) {
      return NextResponse.json(
        { error: "No group found with that code." },
        { status: 404 }
      );
    }

    const { error: joinError } = await supabase
      .from("group_members")
      .upsert(
        { group_id: group.id, user_id: user.id },
        { onConflict: "group_id,user_id", ignoreDuplicates: true }
      );
    if (joinError) throw joinError;

    return NextResponse.json({ group });
  } catch (e) {
    return asResponse(e);
  }
}
