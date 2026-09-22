/**
 * Pure odds-format helpers — no server dependencies, safe for client bundles.
 * Prices are stored as American odds; these convert at render time.
 */

export type OddsFormat = "american" | "decimal" | "fractional";

/** +150 -> 2.5, -110 -> 1.909... */
export function americanToDecimal(american: number): number {
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Approximate a decimal fraction (e.g. 0.909) as a reduced "n/d" string.
 * Finds the closest fraction with denominator <= 50.
 */
function toFractionString(frac: number): string {
  let bestN = Math.round(frac);
  let bestD = 1;
  let bestErr = Math.abs(frac - bestN);
  for (let d = 1; d <= 50; d++) {
    const n = Math.round(frac * d);
    const err = Math.abs(frac - n / d);
    if (err < bestErr - 1e-9) {
      bestErr = err;
      bestN = n;
      bestD = d;
    }
  }
  const g = gcd(bestN, bestD) || 1;
  return `${bestN / g}/${bestD / g}`;
}

/** +150 -> "3/2", -110 -> "10/11". */
export function americanToFractional(american: number): string {
  return toFractionString(americanToDecimal(american) - 1);
}

/** Render one American-odds price in the requested format. */
export function formatPrice(american: number, format: OddsFormat): string {
  if (format === "decimal") {
    const d = americanToDecimal(american);
    return (Math.round(d * 100) / 100).toFixed(2);
  }
  if (format === "fractional") return americanToFractional(american);
  return american > 0 ? `+${american}` : `${american}`;
}
