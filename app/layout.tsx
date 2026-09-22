import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Morning Line — NFL numbers vs the market",
  description:
    "Model win probabilities, fair lines and live odds for every NFL game. Picks are opinions — we do numbers.",
};

const NAV_LINKS = [
  { href: "/rundown", label: "Rundown" },
  { href: "/calibration", label: "Calibration" },
  { href: "/dashboard", label: "Pick'em Game" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <header className="border-b border-slate-800">
          <nav className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-extrabold tracking-tight">
              The <span className="text-emerald-400">Morning Line</span>
            </Link>
            <div className="flex items-center gap-1 text-sm">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-md px-2 py-1 font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="ml-1 rounded-md bg-slate-800 px-3 py-1 font-semibold text-slate-100 transition hover:bg-slate-700"
              >
                Sign in
              </Link>
            </div>
          </nav>
        </header>
        <div className="mx-auto w-full max-w-2xl px-4 pb-16">{children}</div>
      </body>
    </html>
  );
}
