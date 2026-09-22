"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

interface Group {
  id: string;
  name: string;
  invite_code: string;
  member_count: number;
}

/**
 * /dashboard — the home base: your groups, create-a-group, join-with-code.
 */
export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/groups");
      const json = await res.json();
      setGroups(json.groups ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create group.");
      setNewName("");
      setMessage(`"${newName}" created! Share code ${json.group.invite_code}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not join group.");
      setInviteCode("");
      setMessage(`Joined "${json.group.name}"!`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <>
      <Header />
      <main>
        <h1 className="text-2xl font-extrabold">My groups</h1>

        {message && (
          <p className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-emerald-300">
            {message}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-slate-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="mt-6 rounded-xl bg-slate-900 p-5 text-sm text-slate-400">
            You&apos;re not in any groups yet. Create one below, or join with a
            friend&apos;s invite code.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="rounded-xl bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{g.name}</p>
                    <p className="text-xs text-slate-400">
                      {g.member_count} member{g.member_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => copyCode(g.invite_code)}
                    title="Copy invite code"
                    className="rounded-lg bg-slate-800 px-3 py-2 font-mono text-sm font-bold tracking-widest text-emerald-300 transition hover:bg-slate-700"
                  >
                    {copied === g.invite_code ? "Copied!" : g.invite_code}
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/groups/${g.id}`}
                    className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Make picks
                  </Link>
                  <Link
                    href={`/groups/${g.id}/leaderboard`}
                    className="flex-1 rounded-lg bg-slate-800 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-slate-700"
                  >
                    Leaderboard
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-4">
          <form
            onSubmit={createGroup}
            className="rounded-xl bg-slate-900 p-4"
          >
            <h2 className="font-bold">Create a group</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Sunday Crew"
                maxLength={60}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 outline-none placeholder:text-slate-600 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>

          <form onSubmit={joinGroup} className="rounded-xl bg-slate-900 p-4">
            <h2 className="font-bold">Join with invite code</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. KX7Q2M"
                maxLength={6}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 font-mono uppercase tracking-widest outline-none placeholder:text-slate-600 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || !inviteCode.trim()}
                className="rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-600 disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
