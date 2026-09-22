import Link from "next/link";

/**
 * The Morning Line — public landing page.
 * Stats engine for bettors: model numbers vs the market. No picks, ever.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col justify-center py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
        The Morning Line
      </p>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight">
        Picks are opinions.
        <br />
        We do numbers.
      </h1>
      <p className="mt-4 text-slate-400">
        Every NFL game, every day: the model&apos;s fair line and win
        probability next to the market&apos;s odds from books around the
        world. Where the numbers disagree with the books, you&apos;ll see it.
        What you do with that is up to you — we don&apos;t sell picks.
      </p>

      <ol className="mt-8 space-y-4">
        {[
          ["1", "Read the numbers", "Model win probability, fair spread and fair total for every game."],
          ["2", "Compare the market", "Live odds from US, UK and EU books, side by side. Shop the best number."],
          ["3", "Spot the mismatches", "The daily rundown flags where the numbers and the market disagree most."],
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
        href="/rundown"
        className="mt-8 rounded-xl bg-emerald-500 px-6 py-4 text-center text-lg font-bold text-slate-950 transition hover:bg-emerald-400"
      >
        See today&apos;s numbers
      </Link>

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Free forever
        </p>
        <p className="mt-2 font-bold">The Pick&apos;em Game</p>
        <p className="mt-1 text-sm text-slate-400">
          Our free NFL pick&apos;em game — create a group, invite friends,
          climb the leaderboard. It&apos;s our funnel and your game.
        </p>
        <Link
          href="/dashboard"
          className="mt-3 inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
        >
          Play free →
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
          Coming soon
        </p>
        <p className="mt-2 font-bold">Morning Line Pro — $19/mo</p>
        <p className="mt-1 text-sm text-slate-400">
          College football and more sports, line-movement alerts, and the full
          numbers archive. The rundown stays honest either way.
        </p>
      </div>

      <footer className="mt-10 border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
        <p>
          For information only — not financial or betting advice. 21+.
        </p>
        <p className="mt-1">
          If gambling stops being fun, call 1-800-GAMBLER.
        </p>
      </footer>
    </main>
  );
}
