"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for Client Components (login form, etc).
 * Uses the public anon key; RLS policies in the DB still apply.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
