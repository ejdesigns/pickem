import Link from "next/link";
import { RgNotice } from "@/components/ui";

/**
 * The Morning Line — public landing page.
 * Stats engine for bettors: model numbers vs the market. No picks, ever.
 */
const STEPS: [string, string, string][] = [
  ["01", "Read the numbers", "Model win probability, fair spread and fair total for every game."],
  ["02", "Compare the market", "Live odds from US, UK and EU books, side by side. Shop the best number."],
  ["03", "Spot the mismatches", "The daily rundown flags where the numbers and the market disagree most."],
];

const FEATURES: [string, string, string][] = [
  ["◈", "Model vs market", "Fair lines and win probabilities next to live odds from books around the world."],
  ["◎", "Player engine", "Game logs, recency-weighted projections, and hit rates for NFL and NBA players."],
  ["⬔", "Line grader", "Type the line from your book — see our projection and the player's history stacked against it."],
  ["✦", "Pick'em game", "Free NFL pick'em. Create a group, invite friends, climb the leaderboard."],
];

export default function Home() {
  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="relative flex min-h-[88vh] flex-col justify-center overflow-hidden py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 380px at 20% 30%, rgba(201,247,58,0.10), transparent 65%), radial-gradient(700px 500px at 85% 70%, rgba(87,199,255,0.09), transparent 65%)",
          }}
        />
        <div className="rise relative">
          <p className="kicker-volt">The Morning Line · NFL + NBA</p>
          <h1 className="mt-5 max-w-5xl font-display text-[17vw] uppercase leading-[0.88] text-mist sm:text-8xl lg:text-[9rem]">
            Picks are opinions.
            <br />
            <span className="text-volt drop-shadow-[0_0_28px_rgba(201,247,58,0.35)]">
              We do numbers.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fog sm:text-lg">
            Every game, every day: the model&apos;s fair line and win
            probability next to the market&apos;s odds. Where the numbers
            disagree with the books, you&apos;ll see it. What you do with that
            is up to you — we don&apos;t sell picks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/rundown" className="btn-primary !px-8 !py-4 !text-base">
              See today&apos;s numbers →
            </Link>
            <Link href="/players" className="btn-ghost !px-8 !py-4 !text-base">
              Find a player
            </Link>
          </div>
        </div>

        {/* Stat strip */}
        <div className="rise rise-2 relative mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Every game", "NFL + NBA slates", "modeled daily"],
            ["Every player", "Game logs", "recency-weighted"],
            ["Every line", "Market odds", "side by side"],
            ["$0", "Free data", "free-tier infra"],
          ].map(([big, mid, small]) => (
            <div key={big} className="inset p-4">
              <p className="num-display text-2xl text-volt">{big}</p>
              <p className="mt-1 text-sm font-semibold text-mist">{mid}</p>
              <p className="text-xs text-smoke">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="py-10">
        <p className="kicker">How it works</p>
        <h2 className="mt-2 font-display text-4xl uppercase text-mist sm:text-5xl">
          Three steps. <span className="text-fog">Zero opinions.</span>
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(([n, title, desc], i) => (
            <li key={n} className={`card-hover rise rise-${i + 1} p-6`}>
              <span className="num-display text-5xl text-volt/90">{n}</span>
              <p className="mt-4 font-display text-xl uppercase tracking-wide text-mist">
                {title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fog">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ============ FEATURE GRID ============ */}
      <section className="py-10">
        <p className="kicker">Inside the engine</p>
        <h2 className="mt-2 font-display text-4xl uppercase text-mist sm:text-5xl">
          Built for the <span className="text-volt">numbers</span> people
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(([glyph, title, desc], i) => (
            <div key={title} className={`card-hover rise rise-${(i % 4) + 1} p-6`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt-soft text-xl text-volt">
                {glyph}
              </span>
              <p className="mt-4 text-lg font-bold text-mist">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-fog">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PICK'EM + PRO ============ */}
      <section className="grid gap-4 py-10 lg:grid-cols-2">
        <div className="card-hover relative overflow-hidden p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(87,199,255,0.18), transparent 70%)" }}
          />
          <p className="kicker-volt">Free forever</p>
          <p className="mt-3 font-display text-3xl uppercase text-mist">
            The Pick&apos;em Game
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-fog">
            Our free NFL pick&apos;em game — create a group, invite friends,
            climb the leaderboard. It&apos;s our funnel and your game.
          </p>
          <Link href="/dashboard" className="btn-ghost mt-5">
            Play free →
          </Link>
        </div>

        <div className="card-hover relative overflow-hidden p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(201,247,58,0.16), transparent 70%)" }}
          />
          <p className="kicker-volt">Coming soon</p>
          <p className="mt-3 font-display text-3xl uppercase text-mist">
            Morning Line <span className="text-volt">Pro</span>
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-fog">
            <span className="font-bold text-mist">$12/mo or $99/yr.</span>{" "}
            College football and more sports, line-movement alerts, and the
            full numbers archive. The rundown stays honest either way.
          </p>
          <span className="chip-volt mt-5">Waitlist — not yet open</span>
        </div>
      </section>

      <RgNotice />
    </main>
  );
}
