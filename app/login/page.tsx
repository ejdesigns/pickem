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
    <main className="relative flex min-h-[82vh] items-center justify-center py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 340px at 50% 20%, rgba(201,247,58,0.10), transparent 65%)",
        }}
      />
      <div className="rise relative w-full max-w-md">
        <Link href="/" className="link-back">
          ← Back
        </Link>

        <div className="card mt-4 p-7 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt font-display text-lg text-volt-ink shadow-glow-volt">
              ML
            </span>
            <div>
              <p className="kicker-volt">The Morning Line</p>
              <h1 className="font-display text-2xl uppercase tracking-wide text-mist">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-lg py-2.5 text-sm font-bold transition ${
                  mode === m ? "tab-active" : "text-fog hover:text-mist"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-sm font-semibold text-fog">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="For the leaderboard"
                  className="input mt-1.5"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-fog">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-fog">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input mt-1.5"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full !py-4">
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-smoke">
          For information only — not betting advice. 21+.
        </p>
      </div>
    </main>
  );
}
