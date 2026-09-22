import { NextResponse } from "next/server";
import { generateInviteCode } from "@/lib/pickem";
import { requireUser, asResponse } from "@/lib/api-auth";

/**
 * GET /api/groups — list groups the signed-in user belongs to,
 * including each group's invite code and member count.
 */
export async function GET() {
  try {
    const { supabase, user } = await requireUser();

    const { data, error } = await supabase
      .from("group_members")
      .select("joined_at, groups ( id, name, invite_code, created_at )")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });
    if (error) throw error;

    const groups = (data ?? []).map((row) => ({
      ...(row.groups as unknown as {
        id: string;
        name: string;
        invite_code: string;
        created_at: string;
      }),
      joined_at: row.joined_at,
    }));

    // Member counts, one query for all groups (skipped when there are none).
    const countByGroup = new Map<string, number>();
    if (groups.length > 0) {
      const { data: counts } = await supabase
        .from("group_members")
        .select("group_id")
        .in(
          "group_id",
          groups.map((g) => g.id)
        );
      for (const c of counts ?? []) {
        countByGroup.set(c.group_id, (countByGroup.get(c.group_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      groups: groups.map((g) => ({
        ...g,
        member_count: countByGroup.get(g.id) ?? 1,
      })),
    });
  } catch (e) {
    return asResponse(e);
  }
}

/**
 * POST /api/groups { name } — create a group. The creator is
 * automatically added as its first member.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { name } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Group name is required." },
        { status: 400 }
      );
    }

    // Invite codes are unique; retry a few times on collision.
    let group: { id: string; invite_code: string } | null = null;
    for (let attempt = 0; attempt < 5 && !group; attempt++) {
      const { data, error } = await supabase
        .from("groups")
        .insert({
          name: name.trim().slice(0, 60),
          invite_code: generateInviteCode(),
          created_by: user.id,
        })
        .select("id, invite_code")
        .single();
      if (!error && data) group = data;
      else if (error && error.code !== "23505") throw error;
    }
    if (!group) {
      return NextResponse.json(
        { error: "Could not create group, please try again." },
        { status: 500 }
      );
    }

    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: user.id });
    if (memberError) throw memberError;

    return NextResponse.json({ group });
  } catch (e) {
    return asResponse(e);
  }
}
