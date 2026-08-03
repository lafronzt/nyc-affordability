export function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

/** Expects a whole-number percent (e.g. 45.2, not 0.452). */
export function fmtPercent(n: number): string {
  if (n < 10) return n.toFixed(1) + '%';
  return Math.round(n) + '%';
}
