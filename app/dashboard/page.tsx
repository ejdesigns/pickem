"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { PageHero } from "@/components/ui";

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
        <PageHero
          eyebrow="Pick'em · Free forever"
          title={
            <>
              My <span className="text-volt">groups</span>
            </>
          }
          copy="Your crews, your codes, your boards. Create a group and send the code — friends join in seconds."
        />

        {message && (
          <p className="rise mt-6 rounded-2xl border border-volt/25 bg-volt-soft px-5 py-3.5 text-sm font-semibold text-volt">
            {message}
          </p>
        )}

        {loading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card h-44 animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-volt-soft font-display text-xl text-volt">
              ✦
            </span>
            <p className="mt-4 font-display text-xl uppercase tracking-wide text-mist">
              No groups yet
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-fog">
              Create one below, or join with a friend&apos;s invite code. Your
              first board is thirty seconds away.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <li key={g.id} className={`card-hover rise rise-${(i % 4) + 1} flex flex-col p-6`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-xl uppercase tracking-wide text-mist">
                      {g.name}
                    </p>
                    <p className="tnum mt-1 text-xs text-smoke">
                      {g.member_count} member{g.member_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => copyCode(g.invite_code)}
                    title="Copy invite code"
                    className="shrink-0 rounded-xl border border-volt/25 bg-volt-soft px-3 py-2 font-mono text-sm font-bold tracking-[0.2em] text-volt transition hover:bg-volt hover:text-volt-ink"
                  >
                    {copied === g.invite_code ? "Copied!" : g.invite_code}
                  </button>
                </div>
                <div className="mt-5 flex gap-2 pt-1">
                  <Link
                    href={`/groups/${g.id}`}
                    className="btn-primary flex-1 !py-2.5 !text-sm"
                  >
                    Make picks
                  </Link>
                  <Link
                    href={`/groups/${g.id}/leaderboard`}
                    className="btn-ghost flex-1 !py-2.5 !text-sm"
                  >
                    Leaderboard
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <form onSubmit={createGroup} className="card p-6">
            <p className="kicker-volt">New crew</p>
            <h2 className="mt-1 font-display text-2xl uppercase tracking-wide text-mist">
              Create a group
            </h2>
            <div className="mt-4 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Sunday Crew"
                maxLength={60}
                className="input min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="btn-primary shrink-0"
              >
                Create
              </button>
            </div>
          </form>

          <form onSubmit={joinGroup} className="card p-6">
            <p className="kicker-volt">Got a code?</p>
            <h2 className="mt-1 font-display text-2xl uppercase tracking-wide text-mist">
              Join with invite code
            </h2>
            <div className="mt-4 flex gap-2">
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. KX7Q2M"
                maxLength={6}
                className="input min-w-0 flex-1 font-mono uppercase tracking-[0.25em]"
              />
              <button
                type="submit"
                disabled={busy || !inviteCode.trim()}
                className="btn-ghost shrink-0"
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
