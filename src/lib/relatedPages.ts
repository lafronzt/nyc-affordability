/** Picks the closest value in `options` to `value`, for linking a computed
 * figure (e.g. "income needed for this price") to the nearest generated
 * landing page in a sibling family (e.g. /income/[amount]/). */
export function nearest(value: number, options: readonly number[]): number {
  return options.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best
  );
}

/** The /income/[amount]/ page for a salary: the same amount when it has one,
 * otherwise the nearest (salary pages go lower than income pages). */
export function incomePageFor(amount: number, incomeAmounts: readonly number[]): number {
  return incomeAmounts.includes(amount) ? amount : nearest(amount, incomeAmounts);
}
