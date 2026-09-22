"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

/**
 * Email + password auth. On signup we also store a display name
 * (used on the leaderboard) via user_metadata.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Created here (not at module render) so static prerendering
    // never needs Supabase env vars.
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() || undefined } },
        });
        if (error) throw error;
        // With "Confirm email" disabled in Supabase Auth settings (see README),
        // signUp signs the user in immediately.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-center py-12">
      <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
        {(["signin", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === m ? "bg-slate-700" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="text-sm font-medium text-slate-300">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="For the leaderboard"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none placeholder:text-slate-600 focus:border-emerald-500"
            />
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none placeholder:text-slate-600 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none placeholder:text-slate-600 focus:border-emerald-500"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-emerald-500 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </main>
  );
}
