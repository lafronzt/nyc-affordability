import { calculateCoop } from './engines/coop.ts';
import { calculateCondo } from './engines/condo.ts';
import { calculateRent } from './engines/rent.ts';
import { rentInputs, coopInputs, condoInputs, weightedAssets, type BaseInputs, type SharedAssumptions } from './housingOptions.ts';
import { scenarioModel, type ScenarioModel } from './scenarioCompare.ts';
import type { Snapshot } from './profileStore.ts';

/* ============================================================
   My NYC Plan: what sets each ceiling, and what would move it
   ============================================================
   For rent, co-op, and condo, using the /compare/ model (one saved
   profile plus the saved assumption sets, via lib/housingOptions):

   - the ceiling and which limit sets it (income or cash),
   - the ceiling the other side alone would allow,
   - how much more cash or income would bring the binding side up to
     the other one (past that, the other side becomes the limit),
   - a few one-change next steps, ranked by how far they move the
     ceiling.

   Every number comes from the same engines the calculators run, with one
   input changed at a time, so each can be reproduced on /coop/, /condo/,
   or /rent/. The sentences only describe those numbers; they don't add
   any. Pure and DOM-free; tested in test/plan.test.ts.
   ============================================================ */

export type PathId = 'rent' | 'coop' | 'condo';
export type Limit = 'income' | 'cash' | 'reserves';

export interface Ceiling {
  path: PathId;
  /** Max monthly rent, or max purchase price. */
  max: number;
  limit: Limit;
  /** What income alone would allow (cash unlimited). */
  incomeMax: number;
  /** What cash alone would allow (income unlimited). */
  cashMax: number;
  /** The cash the binding cash test counts: weighted for reserves and rent, closing accounts for a down payment. */
  cashCounted: number;
}

/** One change at a time, applied on top of the saved profile. */
export interface Change {
  extraCash?: number;
  extraIncome?: number;
  clearDebts?: boolean;
  rateDelta?: number;
}

function apply(base: BaseInputs, asmp: SharedAssumptions, c: Change): { base: BaseInputs; asmp: SharedAssumptions } {
  const accounts = c.extraCash ? [...base.accounts, { name: 'Extra savings', balance: c.extraCash, liquidity: 100, closing: true }] : base.accounts;
  const b = { annualIncome: base.annualIncome + (c.extraIncome ?? 0), otherDebts: c.clearDebts ? 0 : base.otherDebts, accounts };
  if (!c.rateDelta) return { base: b, asmp };
  return {
    base: b,
    asmp: {
      ...asmp,
      coop: { ...asmp.coop, mortgageRate: asmp.coop.mortgageRate + c.rateDelta },
      condo: { ...asmp.condo, mortgageRate: asmp.condo.mortgageRate + c.rateDelta },
    },
  };
}

const fin = (n: number | null | undefined) => (n === null || n === undefined || !isFinite(n) ? Infinity : Math.max(0, n));

export function ceiling(path: PathId, base0: BaseInputs, asmp0: SharedAssumptions, change: Change = {}): Ceiling {
  const { base, asmp } = apply(base0, asmp0, change);
  if (path === 'rent') {
    const r = calculateRent(rentInputs(base, asmp));
    return {
      path, max: r.maxRent, limit: r.binding.startsWith('Cash') ? 'cash' : 'income',
      incomeMax: fin(r.maxRent_income), cashMax: fin(r.maxRent_cash), cashCounted: r.weightedAssets,
    };
  }
  const r = path === 'coop' ? calculateCoop(coopInputs(base, asmp)) : calculateCondo(condoInputs(base, asmp));
  const limit: Limit = r.binding === 'DTI / Income' ? 'income' : r.binding === 'Cash / Reserves' ? 'reserves' : 'cash';
  const counted = path === 'coop'
    ? (limit === 'cash' ? (r as ReturnType<typeof calculateCoop>).totLiquid : (r as ReturnType<typeof calculateCoop>).avail)
    : (r as ReturnType<typeof calculateCondo>).weightedAssets;
  return { path, max: r.maxPrice, limit, incomeMax: fin(r.dtiMaxPrice), cashMax: fin(r.cashMax), cashCounted: counted };
}

/** Smallest whole-dollar x with ok(x), given ok(0) is false and ok is monotone. Infinity past `hi`. */
function smallest(ok: (x: number) => boolean, hi: number): number {
  if (!ok(hi)) return Infinity;
  let lo = 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

export interface Lift {
  /** Which side to work on, and how much more of it brings this side up to the other. */
  side: 'cash' | 'income';
  amount: number;
  /** The ceiling once that's done: the other side's limit. */
  reaches: number;
}

/**
 * How much more cash (or yearly income) would raise the binding side to
 * meet the other side. Null when the sides are already level, or when it
 * would take more than doubling income (or over $20M of savings).
 */
export function liftToOtherSide(path: PathId, base: BaseInputs, asmp: SharedAssumptions): Lift | null {
  const c = ceiling(path, base, asmp);
  const tol = path === 'rent' ? 1 : 100;
  if (c.limit === 'income') {
    if (!isFinite(c.cashMax) || c.cashMax - c.incomeMax < tol) return null;
    // A raise that more than doubles income isn't a plan; don't quote it.
    const amount = smallest((x) => ceiling(path, base, asmp, { extraIncome: x }).incomeMax >= c.cashMax - tol, Math.max(base.annualIncome, 1));
    return isFinite(amount) ? { side: 'income', amount, reaches: c.cashMax } : null;
  }
  if (!isFinite(c.incomeMax) || c.incomeMax - c.cashMax < tol) return null;
  const amount = smallest((x) => ceiling(path, base, asmp, { extraCash: x }).cashMax >= c.incomeMax - tol, 20_000_000);
  return isFinite(amount) ? { side: 'cash', amount, reaches: c.incomeMax } : null;
}

export interface Step {
  id: 'save-10k' | 'raise-10k' | 'clear-debts' | 'rate-down-50';
  label: string;
  /** Change in the ceiling (monthly rent, or price). */
  delta: number;
  after: number;
  /** The step lifts the ceiling all the way to the other limit, which then takes over. */
  capped: boolean;
}

/** One-change next steps that actually move this ceiling, best first. */
export function nextSteps(path: PathId, base: BaseInputs, asmp: SharedAssumptions): Step[] {
  const start = ceiling(path, base, asmp);
  const now = start.max;
  const otherMax = start.limit === 'income' ? start.cashMax : start.incomeMax;
  const noise = path === 'rent' ? 5 : 50;
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  const candidates: { id: Step['id']; label: string; change: Change }[] = [
    { id: 'save-10k', label: 'Save another $10,000', change: { extraCash: 10_000 } },
    { id: 'raise-10k', label: 'Earn $10,000 more a year', change: { extraIncome: 10_000 } },
  ];
  if (base.otherDebts > 0) candidates.push({ id: 'clear-debts', label: `Pay off your ${money(base.otherDebts)}/mo of other debts`, change: { clearDebts: true } });
  if (path !== 'rent') candidates.push({ id: 'rate-down-50', label: 'Rates fall half a point', change: { rateDelta: -0.5 } });
  return candidates
    .map(({ id, label, change }) => {
      const after = ceiling(path, base, asmp, change).max;
      // Rate and debt changes can move both limits; capped means this
      // step ran into the other side's unchanged ceiling.
      return { id, label, delta: after - now, after, capped: isFinite(otherMax) && Math.abs(after - otherMax) < 1 };
    })
    .filter((s) => s.delta >= noise)
    .sort((a, b) => b.delta - a.delta);
}

// ---- Sentences ----

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const usdRound = (n: number, to: number) => '$' + (Math.ceil(n / to) * to).toLocaleString('en-US');

export interface PathPlan {
  path: PathId;
  title: string;
  ceiling: Ceiling;
  /** What sets the ceiling. */
  why: string;
  /** What the other side alone would allow. */
  other: string | null;
  /** How far working on the binding side gets you. */
  lift: string | null;
  steps: Step[];
}

const TITLES: Record<PathId, string> = { rent: 'Renting', coop: 'Buying a co-op', condo: 'Buying a condo' };

function why(c: Ceiling, m: ScenarioModel): string {
  const debts = m.base.otherDebts > 0 ? ` plus your ${usd(m.base.otherDebts)}/mo of other debts` : '';
  if (c.path === 'rent') {
    const mult = m.asmp.rent.incomeMult;
    if (c.limit === 'income') return `Income sets it. Landlords usually want yearly income of ${mult}× the monthly rent, and ${usd(m.base.annualIncome)} ÷ ${mult} is ${usd(c.max)}.`;
    return `Cash sets it. The first month, a security deposit, application fees, and a ${m.asmp.rent.reserveMonths}-month cushion would use the ${usd(c.cashCounted)} you can count.`;
  }
  const kind = c.path === 'coop' ? 'co-op' : 'condo';
  const dti = c.path === 'coop' ? m.asmp.coop.maxDTIPct : m.asmp.condo.maxDtiPct;
  const who = c.path === 'coop' ? 'the board\'s' : 'the lender\'s';
  const dp = c.path === 'coop' ? m.asmp.coop.dpPct : m.asmp.condo.dpPct;
  if (c.limit === 'income') return `Income sets it. At ${usd(c.max)}, the ${kind}'s monthly cost${debts} reaches ${who} ${dti}% debt-to-income limit.`;
  if (c.limit === 'reserves') {
    const months = c.path === 'coop' ? m.asmp.coop.reserveMo : 0;
    return `Cash sets it. The ${dp}% down payment, closing costs, and ${months ? `${months} months of post-closing reserves the board wants to see` : 'post-closing reserves'} use the ${usd(c.cashCounted)} you can count.`;
  }
  return `Cash sets it. The ${dp}% down payment and closing costs use the ${usd(c.cashCounted)} in accounts you can spend at closing.`;
}

/**
 * Rent only: the cash side of a rent ceiling is a multiple of move-in
 * costs, so with real savings it's often absurdly high ("cash would cover
 * $100,000/mo"). Past this many times the ceiling, say it's not close
 * instead of quoting it. For buying, the gap is a real savings goal, so
 * it's always shown.
 */
const FAR = 2;
const otherMax = (c: Ceiling) => (c.limit === 'income' ? c.cashMax : c.incomeMax);
const far = (c: Ceiling) => !isFinite(otherMax(c)) || (c.path === 'rent' && otherMax(c) > FAR * c.max);

function other(c: Ceiling): string | null {
  const unit = c.path === 'rent' ? '/mo' : '';
  if (far(c)) return c.limit === 'income'
    ? 'Cash isn\'t close to limiting this: it would cover more than twice as much.'
    : 'Income isn\'t close to limiting this: it would support more than twice as much.';
  if (c.limit === 'income') return `Your cash alone would cover up to ${usd(c.cashMax)}${unit}.`;
  return `Your income alone would support up to ${usd(c.incomeMax)}${unit}.`;
}

function liftSentence(l: Lift | null, c: Ceiling): string | null {
  const unit = c.path === 'rent' ? '/mo' : '';
  if (!l || far(c)) return null;
  if (l.side === 'cash') return `About ${usdRound(l.amount, c.path === 'rent' ? 100 : 1000)} more saved would let cash keep up with your income, up to ${usd(l.reaches)}${unit}. Past that, income is the limit.`;
  return `About ${usdRound(l.amount, 1000)} more a year in income would let it keep up with your cash, up to ${usd(l.reaches)}${unit}. Past that, cash is the limit.`;
}

export interface Plan {
  model: ScenarioModel;
  cash: number;
  paths: PathPlan[];
}

export function buildPlan(data: Snapshot): Plan {
  const model = scenarioModel(data);
  const paths = (['rent', 'coop', 'condo'] as const).map((path): PathPlan => {
    const c = ceiling(path, model.base, model.asmp);
    return {
      path,
      title: TITLES[path],
      ceiling: c,
      why: why(c, model),
      other: other(c),
      lift: liftSentence(liftToOtherSide(path, model.base, model.asmp), c),
      steps: nextSteps(path, model.base, model.asmp).slice(0, 3),
    };
  });
  return { model, cash: weightedAssets(model.base.accounts), paths };
}
