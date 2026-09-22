import type { ReactNode } from "react";

/** Big page header: eyebrow kicker + display headline + supporting copy. */
export function PageHero({
  eyebrow,
  title,
  copy,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4 pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <p className="kicker-volt">{eyebrow}</p>
        <h1 className="mt-3 font-display text-5xl uppercase leading-[0.95] text-mist sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {copy && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fog">{copy}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** One big-number tile for projections / stats. */
export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="card-hover p-5">
      <p className="kicker">{label}</p>
      <p
        className={`num-display mt-2 text-4xl sm:text-5xl ${
          accent ? "text-volt" : "text-mist"
        }`}
      >
        {value}
      </p>
      {sub && <p className="tnum mt-2 text-xs text-smoke">{sub}</p>}
    </div>
  );
}

/** Card with a labeled section head. */
export function SectionCard({
  title,
  copy,
  action,
  children,
  className = "",
}: {
  title: string;
  copy?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="kicker">{title}</h2>
          {copy && <p className="mt-1.5 text-xs leading-relaxed text-smoke">{copy}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Friendly empty / warming-up state. */
export function EmptyState({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-volt-soft font-display text-xl text-volt">
        ML
      </span>
      <p className="mt-4 font-display text-xl uppercase tracking-wide text-mist">
        {title}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-fog">{copy}</p>
    </div>
  );
}

/** Responsible-gambling notice — keep on every numbers surface. */
export function RgNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`text-center text-xs leading-relaxed text-smoke ${
        compact ? "mt-6" : "mt-10"
      }`}
    >
      For information only — not betting advice. 21+. If gambling stops being
      fun, call 1-800-GAMBLER.
    </p>
  );
}
