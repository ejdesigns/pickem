import Link from "next/link";

/**
 * Public landing page. Explains the game in 10 seconds and funnels
 * visitors to sign up.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col justify-center py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
        NFL Pick&apos;em
      </p>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight">
        Pick winners.
        <br />
        Beat your friends.
      </h1>
      <p className="mt-4 text-slate-400">
        Make your picks before kickoff each week. Scores update automatically
        and the leaderboard keeps score all season long.
      </p>

      <ol className="mt-8 space-y-4">
        {[
          ["1", "Create a group", "Start a league and share the invite code."],
          ["2", "Pick winners", "Tap a team for every game before it kicks off."],
          ["3", "Climb the board", "Most correct picks takes the season."],
        ].map(([n, title, desc]) => (
          <li key={n} className="flex gap-4 rounded-xl bg-slate-900 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-bold text-slate-950">
              {n}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-slate-400">{desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/login"
        className="mt-8 rounded-xl bg-emerald-500 px-6 py-4 text-center text-lg font-bold text-slate-950 transition hover:bg-emerald-400"
      >
        Get started — it&apos;s free
      </Link>
      <p className="mt-3 text-center text-xs text-slate-500">
        Straight winner picks. No spreads, no money, just bragging rights.
      </p>
    </main>
  );
}
