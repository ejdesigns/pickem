"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Top bar shown on every signed-in page. */
export default function Header() {
  const router = useRouter();

  async function signOut() {
    // Created on click so static prerendering never needs Supabase env vars.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between py-5">
      <Link href="/dashboard" className="text-xl font-extrabold">
        🏈 Pick&apos;em
      </Link>
      <button
        onClick={signOut}
        className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
      >
        Sign out
      </button>
    </header>
  );
}
