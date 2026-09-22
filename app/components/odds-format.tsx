"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { formatPrice, type OddsFormat } from "@/lib/odds-format";

const STORAGE_KEY = "tml-odds-format";

const OddsFormatContext = createContext<{
  format: OddsFormat;
  setFormat: (f: OddsFormat) => void;
}>({ format: "american", setFormat: () => {} });

/** Provides the viewer's chosen odds format. Wrap page content in this. */
export function OddsFormatProvider({ children }: { children: ReactNode }) {
  const [format, setFormatState] = useState<OddsFormat>("american");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "decimal" || saved === "fractional" || saved === "american") {
        setFormatState(saved);
      }
    } catch {
      /* storage unavailable — stay on American */
    }
  }, []);

  const setFormat = (f: OddsFormat) => {
    setFormatState(f);
    try {
      localStorage.setItem(STORAGE_KEY, f);
    } catch {
      /* ignore */
    }
  };

  return (
    <OddsFormatContext.Provider value={{ format, setFormat }}>
      {children}
    </OddsFormatContext.Provider>
  );
}

export function useOddsFormat() {
  return useContext(OddsFormatContext);
}

const FORMATS: { key: OddsFormat; label: string }[] = [
  { key: "american", label: "American" },
  { key: "decimal", label: "Decimal" },
  { key: "fractional", label: "Fractional" },
];

/** Segmented control to switch odds display format. Client-side only. */
export function OddsFormatToggle() {
  const { format, setFormat } = useOddsFormat();
  return (
    <div
      className="inline-flex rounded-xl border border-line bg-surface-2 p-1 shadow-card"
      role="group"
      aria-label="Odds format"
    >
      {FORMATS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => setFormat(f.key)}
          aria-pressed={format === f.key}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            format === f.key
              ? "bg-volt text-volt-ink shadow-glow-volt"
              : "text-fog hover:text-mist"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Renders an American-odds price in the viewer's chosen format. */
export function OddsPrice({ american }: { american: number }) {
  const { format } = useOddsFormat();
  return <span>{formatPrice(american, format)}</span>;
}
