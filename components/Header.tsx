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
    <header className="flex items-center justify-between gap-3 py-6">
      <Link href="/dashboard" className="group flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt font-display text-lg text-volt-ink shadow-glow-volt transition-transform duration-200 group-hover:-rotate-6">
          ML
        </span>
        <span className="font-display text-xl uppercase tracking-wide text-mist">
          Pick&apos;em{" "}
          <span className="hidden text-smoke min-[420px]:inline">
            / The Morning Line
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/rundown"
          className="rounded-lg px-3 py-2 text-sm font-semibold text-fog transition hover:bg-white/5 hover:text-mist"
        >
          Numbers
        </Link>
        <button
          onClick={signOut}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-fog transition hover:bg-white/5 hover:text-mist"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
