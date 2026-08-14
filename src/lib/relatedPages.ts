/** Picks the closest value in `options` to `value`, for linking a computed
 * figure (e.g. "income needed for this price") to the nearest generated
 * landing page in a sibling family (e.g. /income/[amount]/). */
export function nearest(value: number, options: readonly number[]): number {
  return options.reduce((best, cur) =>
    Math.abs(cur - value) < Math.abs(best - value) ? cur : best
  );
}
