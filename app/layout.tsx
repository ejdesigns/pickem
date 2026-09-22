import type { Metadata } from "next";
import Link from "next/link";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const display = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Morning Line — NFL & NBA numbers vs the market",
  description:
    "Model numbers, projections, and line grades for every NFL and NBA game. Picks are opinions — we do numbers.",
  themeColor: "#04070d",
};

const NAV_LINKS = [
  { href: "/rundown", label: "Rundown" },
  { href: "/players", label: "Players" },
  { href: "/dashboard", label: "Pick'em" },
  { href: "/calibration", label: "Calibration" },
];

function Wordmark() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt font-display text-lg text-volt-ink shadow-glow-volt transition-transform duration-200 group-hover:-rotate-6">
        ML
      </span>
      <span className="hidden font-display text-xl uppercase tracking-wide text-mist min-[420px]:inline">
        The <span className="text-volt">Morning&nbsp;Line</span>
      </span>
    </Link>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-base font-sans text-mist">
        <header className="glass sticky top-0 z-40 border-b border-white/5">
          <nav className="mx-auto flex w-full max-w-shell items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
            <Wordmark />
            <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 text-sm sm:gap-2">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="whitespace-nowrap rounded-lg px-2.5 py-2 font-semibold text-fog transition hover:bg-white/5 hover:text-mist sm:px-3.5"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="btn-primary ml-1 shrink-0 !px-4 !py-2 !text-[13px]"
              >
                Sign in
              </Link>
            </div>
          </nav>
        </header>

        <div className="mx-auto w-full max-w-shell px-4 pb-20 sm:px-6 lg:px-10">
          {children}
        </div>

        <footer className="border-t border-white/5">
          <div className="mx-auto flex w-full max-w-shell flex-col items-center gap-2 px-4 py-8 text-center sm:px-6 lg:px-10">
            <p className="font-display text-sm uppercase tracking-[0.2em] text-smoke">
              The <span className="text-volt/80">Morning Line</span>
            </p>
            <p className="max-w-md text-xs leading-relaxed text-smoke">
              For information only — not financial or betting advice. 21+.
              If gambling stops being fun, call 1-800-GAMBLER.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
