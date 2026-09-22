import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Get the signed-in user or return a 401 response (as a thrown value). */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return { supabase, user };
}

/** Throw a 403 if the user is not a member of the group. */
export async function requireMember(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  groupId: string
) {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    throw NextResponse.json(
      { error: "You are not a member of this group." },
      { status: 403 }
    );
  }
}

/** Re-throw helper: NextResponse thrown above is returned as the response. */
export function asResponse(thrown: unknown): NextResponse {
  if (thrown instanceof NextResponse) return thrown;
  throw thrown;
}
