import { evaluatePlan, type PlanInputs, type Binding } from './levers.ts';

/* ============================================================
   Rate and maintenance sensitivity (pure, DOM-free)
   ============================================================
   "What happens to my budget if rates move?" and "How much does a
   building's maintenance or common charge cost me in buying power?"
   Both are one sweep: change one input across a range, rerun the shared
   co-op/condo engine (via evaluatePlan) at each value, and report the
   income ceiling, the cash ceiling, the max price (the lower of the two),
   and, if there's a target price, the monthly cost and income needed
   there. No new formulas.
   ============================================================ */

export type SweepVariable = 'rate' | 'charges';

export interface SweepPoint {
  /** The swept value: a mortgage rate (%) or monthly building charges ($). */
  x: number;
  maxPrice: number;
  binding: Binding;
  /** Price ceiling from income/DTI alone. */
  incomeLimit: number;
  /** Price ceiling from cash alone (down payment + closing; co-op reserves). */
  cashLimit: number;
  /** Monthly housing cost at the target price (null without a target). */
  monthlyAtTarget: number | null;
  /** Gross annual income needed to clear the DTI limit at the target price (null without a target). */
  incomeNeededAtTarget: number | null;
}

const withX = (p: PlanInputs, v: SweepVariable, x: number): PlanInputs =>
  v === 'rate' ? { ...p, mortgageRate: x } : { ...p, buildingCharges: x };

export function pointAt(p: PlanInputs, v: SweepVariable, x: number, targetPrice: number | null = null): SweepPoint {
  const q = withX(p, v, x);
  const r = evaluatePlan(q);
  let monthlyAtTarget: number | null = null;
  let incomeNeededAtTarget: number | null = null;
  if (targetPrice && targetPrice > 0) {
    monthlyAtTarget = evaluatePlan(q, targetPrice).monthlyHousingCost;
    incomeNeededAtTarget = q.maxDtiPct > 0 ? ((monthlyAtTarget + q.monthlyDebts) / (q.maxDtiPct / 100)) * 12 : Infinity;
  }
  return { x, maxPrice: r.maxPrice, binding: r.binding, incomeLimit: r.dtiMaxPrice, cashLimit: r.cashMax, monthlyAtTarget, incomeNeededAtTarget };
}

export function sweep(p: PlanInputs, v: SweepVariable, values: number[], targetPrice: number | null = null): SweepPoint[] {
  return values.map((x) => pointAt(p, v, x, targetPrice));
}

const round = (n: number, step: number) => Math.round(n / step) * step;

/** Rates from 3% below to 3% above the current one, in quarter points, never below 1%. Always includes the current rate. */
export function rateRange(current: number): number[] {
  const lo = Math.max(1, round(current - 3, 0.25));
  const hi = round(current + 3, 0.25);
  const out: number[] = [];
  for (let r = lo; r <= hi + 1e-9; r += 0.25) out.push(Number(r.toFixed(2)));
  if (!out.some((r) => Math.abs(r - current) < 1e-9)) out.push(current);
  return out.sort((a, b) => a - b);
}

/** Charges from $1,000 below to $1,000 above the current amount, in $100 steps, never below $0. Always includes the current amount. */
export function chargesRange(current: number): number[] {
  const lo = Math.max(0, round(current - 1000, 100));
  const hi = round(current + 1000, 100);
  const out: number[] = [];
  for (let c = lo; c <= hi; c += 100) out.push(c);
  if (!out.includes(current)) out.push(current);
  return out.sort((a, b) => a - b);
}

export interface Impact {
  /** Change in the income ceiling per +1 unit step (1 point of rate, or $100/month of charges). Negative. */
  incomeLimitPerStep: number;
  /** Change in max price per +1 unit step, from where you are now. */
  maxPricePerStep: number;
  /** Change in monthly cost at the target per step (null without a target). */
  monthlyPerStep: number | null;
}

/**
 * The effect of one step up from the current value: +1 percentage point
 * of rate, or +$100/month of building charges. Measured as a symmetric
 * difference (half a step each way) so it reads as "about this much per step".
 */
export function impactPerStep(p: PlanInputs, v: SweepVariable, targetPrice: number | null = null): Impact {
  const x = v === 'rate' ? p.mortgageRate : p.buildingCharges;
  const half = v === 'rate' ? 0.5 : 50;
  const loX = Math.max(0, x - half);
  const hiX = x + half;
  const lo = pointAt(p, v, loX, targetPrice);
  const hi = pointAt(p, v, hiX, targetPrice);
  const scale = (2 * half) / (hiX - loX); // 1 unless clamped at 0
  return {
    incomeLimitPerStep: (hi.incomeLimit - lo.incomeLimit) * scale,
    maxPricePerStep: (hi.maxPrice - lo.maxPrice) * scale,
    monthlyPerStep: hi.monthlyAtTarget !== null && lo.monthlyAtTarget !== null ? (hi.monthlyAtTarget - lo.monthlyAtTarget) * scale : null,
  };
}

/**
 * How many points of mortgage rate cost the same income-limited buying
 * power as $100/month more in building charges. Lets the page say
 * "$100/month of maintenance is worth about 0.3 points of rate".
 */
export function chargesInRatePoints(p: PlanInputs): number {
  const perRatePoint = impactPerStep(p, 'rate').incomeLimitPerStep;
  const per100 = impactPerStep(p, 'charges').incomeLimitPerStep;
  return perRatePoint !== 0 ? per100 / perRatePoint : 0;
}

/**
 * The highest swept value (rate or charges) at which the max price still
 * reaches the target, scanning a sweep sorted ascending. null if the
 * target is out of reach everywhere in the sweep; Infinity-free.
 */
export function highestReaching(points: SweepPoint[], targetPrice: number): number | null {
  let best: number | null = null;
  for (const pt of points) if (pt.maxPrice >= targetPrice) best = pt.x;
  return best;
}
