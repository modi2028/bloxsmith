/**
 * Format a (possibly fractional) credit amount for display.
 *   20      -> "20"
 *   4.875   -> "4.88"
 *   0.1275  -> "0.13"
 *   0.004   -> "<0.01"
 *   0       -> "0"
 * Credits are ~$1 each and requests cost fractions of a credit, so we show up
 * to 2 decimals and floor tiny non-zero amounts to "<0.01" rather than "0".
 */
export function formatCredits(value: number): string {
  const n = Number(value) || 0;
  if (n === 0) return "0";
  if (n > 0 && n < 0.01) return "<0.01";
  if (n < 0 && n > -0.01) return ">-0.01";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
