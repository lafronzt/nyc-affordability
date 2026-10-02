import { calculateCoop, type CoopAccount } from './coop.ts';
import { calculateCondo } from './condo.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults } from './defaults.ts';
import { ASSUMPTIONS as A } from '../../data/assumptions.ts';

/* ============================================================
   "How do I afford more?" — lever analysis (pure, DOM-free)
   ============================================================
   Runs the shared co-op/condo engine once for the visitor's situation,
   then once per lever with exactly one input changed, and reports how
   the maximum price moves. No new formulas: every number here is the
   same calculateCoop()/calculateCondo() the calculators run, so a lever
   result can be reproduced on /coop/ or /condo/ by making that one
   change there.
   ============================================================ */

export type PropertyType = 'coop' | 'condo';

export interface PlanInputs {
  propertyType: PropertyType;
  annualIncome: number;
  /** Car, student loan, card minimums, etc. Counts against DTI. */
  monthlyDebts: number;
  /** Fully liquid and usable at closing (checking, savings, HYSA). */
  cash: number;
  /** Brokerage and similar: usable at closing, counted at investmentsLiquidityPct toward liquidity/reserves. */
  investments: number;
  investmentsLiquidityPct: number;
  mortgageRate: number;
  downPaymentPct: number;
  /** Co-op maintenance, or condo common charges (property tax and insurance are separate). */
  buildingCharges: number;
  condoPropertyTax: number;
  condoInsurance: number;
  maxDtiPct: number;
  /** Co-op post-closing liquidity requirement, in months. Ignored for condos. */
  reserveMonths: number;
}

export function defaultPlanInputs(type: PropertyType, overrides: Partial<PlanInputs> = {}): PlanInputs {
  const coop = type === 'coop';
  return {
    propertyType: type,
    annualIncome: 0,
    monthlyDebts: 0,
    cash: 0,
    investments: 0,
    investmentsLiquidityPct: 80,
    mortgageRate: A.mortgageRatePct.value,
    downPaymentPct: coop ? A.coopDownPaymentPct.value : A.condoDownPaymentPct.value,
    buildingCharges: coop ? A.coopMaintenanceMo.value : A.condoCommonChargesMo.value,
    condoPropertyTax: A.condoPropertyTaxMo.value,
    condoInsurance: A.condoInsuranceMo.value,
    maxDtiPct: coop ? A.coopMaxDtiPct.value : A.condoMaxDtiPct.value,
    reserveMonths: A.coopReserveMonths.value,
    ...overrides,
  };
}

export type Binding = 'DTI / Income' | 'DP / Closing Costs' | 'Cash / Reserves';

export interface PlanResult {
  maxPrice: number;
  binding: Binding;
  /** Ceiling from income alone (null only if the loan factor is 0). */
  dtiMaxPrice: number;
  /** Ceiling from cash alone (the tighter of down payment + closing and, for co-ops, reserves). */
  cashMax: number;
  monthlyHousingCost: number;
  cashAtClosing: number;
  totalCashNeeded: number;
}

function accounts(p: PlanInputs): CoopAccount[] {
  return [
    { name: 'Cash', balance: Math.max(0, p.cash), liquidity: 100, closing: true },
    { name: 'Investments', balance: Math.max(0, p.investments), liquidity: p.investmentsLiquidityPct, closing: true },
  ];
}

/** Max price and binding constraint for one situation, via the shared engines. */
export function evaluatePlan(p: PlanInputs, targetOverride: number | null = null): PlanResult {
  const base = { accounts: accounts(p), annualIncome: p.annualIncome, otherDebts: p.monthlyDebts, mortgageRate: p.mortgageRate, dpPct: p.downPaymentPct, targetOverride };
  if (p.propertyType === 'coop') {
    const r = calculateCoop(coopInputsFromDefaults({ ...base, maint: p.buildingCharges, maxDTIPct: p.maxDtiPct, reserveMo: p.reserveMonths }));
    return {
      maxPrice: r.maxPrice, binding: r.binding as Binding, dtiMaxPrice: r.dtiMaxPrice ?? 0, cashMax: r.cashMax,
      monthlyHousingCost: r.moTotal, cashAtClosing: r.totalAtClose, totalCashNeeded: r.totalCash,
    };
  }
  const r = calculateCondo(condoInputsFromDefaults({
    ...base, commonCharges: p.buildingCharges, propTaxes: p.condoPropertyTax, hoInsurance: p.condoInsurance, maxDtiPct: p.maxDtiPct,
  }));
  return {
    maxPrice: r.maxPrice, binding: r.binding as Binding, dtiMaxPrice: r.dtiMaxPrice ?? 0, cashMax: r.cashMax,
    monthlyHousingCost: r.moTotal, cashAtClosing: r.totalAtClose, totalCashNeeded: r.totalCash,
  };
}

export interface Lever {
  id: string;
  label: string;
  /** Plain-English caveat shown with the result. */
  note?: string;
  apply: (p: PlanInputs) => PlanInputs;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** The levers that make sense for this situation (some only apply to co-ops, or need debts to exist). */
export function leversFor(p: PlanInputs): Lever[] {
  const coop = p.propertyType === 'coop';
  const charges = coop ? 'maintenance' : 'common charges';
  const out: Lever[] = [
    { id: 'save-10k', label: 'Save another $10,000', apply: (q) => ({ ...q, cash: q.cash + 10_000 }) },
    { id: 'save-25k', label: 'Save another $25,000', apply: (q) => ({ ...q, cash: q.cash + 25_000 }) },
    { id: 'raise-10k', label: 'Earn $10,000 more per year', apply: (q) => ({ ...q, annualIncome: q.annualIncome + 10_000 }) },
  ];
  if (p.monthlyDebts > 0) {
    out.push({
      id: 'clear-debt', label: `Pay off your ${money(p.monthlyDebts)}/month in other debts`,
      note: 'Shown as if the debt simply disappears. Paying it off early also takes cash, which this lever doesn\'t subtract.',
      apply: (q) => ({ ...q, monthlyDebts: 0 }),
    });
    if (p.monthlyDebts > 300) {
      out.push({ id: 'cut-debt-300', label: 'Cut $300/month of debt payments', apply: (q) => ({ ...q, monthlyDebts: q.monthlyDebts - 300 }) });
    }
  }
  if (p.downPaymentPct <= 45) {
    out.push({
      id: 'dp-up-5', label: `Put ${p.downPaymentPct + 5}% down instead of ${p.downPaymentPct}%`,
      note: 'A bigger down payment shrinks the loan (helps income) but needs more cash up front (hurts savings).',
      apply: (q) => ({ ...q, downPaymentPct: q.downPaymentPct + 5 }),
    });
  }
  if (!coop && p.downPaymentPct >= 10) {
    out.push({
      id: 'dp-down-5', label: `Put ${p.downPaymentPct - 5}% down instead of ${p.downPaymentPct}%`,
      note: p.downPaymentPct - 5 < 20 ? 'Below 20% down, PMI is added to the monthly cost, and some condo lenders and buildings require more.' : undefined,
      apply: (q) => ({ ...q, downPaymentPct: q.downPaymentPct - 5 }),
    });
  }
  if (p.buildingCharges >= 300) {
    out.push({
      id: 'charges-300', label: `Choose a building with $300/month lower ${charges}`,
      note: `Same price, lower monthly ${charges}: every $100/month of building charges uses DTI room that could have carried roughly $${Math.round(100 / monthlyFactor(p) / (1 - p.downPaymentPct / 100) / 1000)}K of price.`,
      apply: (q) => ({ ...q, buildingCharges: q.buildingCharges - 300 }),
    });
  }
  if (p.mortgageRate > 0.5) {
    out.push({ id: 'rate-down-50', label: `Mortgage rates fall half a point (to ${(p.mortgageRate - 0.5).toFixed(2)}%)`, apply: (q) => ({ ...q, mortgageRate: q.mortgageRate - 0.5 }) });
  }
  if (coop && p.reserveMonths > 6) {
    out.push({
      id: 'reserves-6', label: `Target buildings requiring 6 months of reserves instead of ${p.reserveMonths}`,
      note: 'Post-closing liquidity rules are set building by building; ask the managing agent before you bid.',
      apply: (q) => ({ ...q, reserveMonths: 6 }),
    });
  }
  out.push(coop
    ? {
        id: 'switch-condo', label: 'Buy a condo instead',
        note: `At typical condo assumptions: ${A.condoMaxDtiPct.value}% lender DTI, ${money(A.condoCommonChargesMo.value)} common charges + ${money(A.condoPropertyTaxMo.value)} property tax a month, and mortgage recording tax at closing, but no board reserve requirement.`,
        apply: (q) => ({ ...defaultPlanInputs('condo', { annualIncome: q.annualIncome, monthlyDebts: q.monthlyDebts, cash: q.cash, investments: q.investments, investmentsLiquidityPct: q.investmentsLiquidityPct, mortgageRate: q.mortgageRate }) }),
      }
    : {
        id: 'switch-coop', label: 'Buy a co-op instead',
        note: `At typical co-op assumptions: ${A.coopMaxDtiPct.value}% board DTI, ${money(A.coopMaintenanceMo.value)} maintenance, and ${A.coopReserveMonths.value} months of post-closing reserves, but no mortgage recording tax.`,
        apply: (q) => ({ ...defaultPlanInputs('coop', { annualIncome: q.annualIncome, monthlyDebts: q.monthlyDebts, cash: q.cash, investments: q.investments, investmentsLiquidityPct: q.investmentsLiquidityPct, mortgageRate: q.mortgageRate }) }),
      });
  return out;
}

function monthlyFactor(p: PlanInputs): number {
  const m = p.mortgageRate / 1200;
  const n = A.loanTermYears.value * 12;
  return m === 0 ? 1 / n : m / (1 - Math.pow(1 + m, -n));
}

export interface LeverResult {
  lever: Lever;
  before: PlanResult;
  after: PlanResult;
  delta: number;
  explanation: string;
}

export function constraintPhrase(b: Binding, p: PlanInputs): string {
  if (b === 'DTI / Income') return `income (the ${p.maxDtiPct}% debt-to-income limit)`;
  if (b === 'DP / Closing Costs') return 'cash for the down payment and closing costs';
  return p.propertyType === 'coop' ? `post-closing reserves (${p.reserveMonths} months)` : 'post-closing reserves';
}

/** Below this, a change is rounding noise from the binary search, not a real effect. */
const NOISE = 50;

function explain(before: PlanResult, after: PlanResult, p: PlanInputs, q: PlanInputs, delta: number): string {
  const was = constraintPhrase(before.binding, p);
  if (Math.abs(delta) < NOISE) {
    return `No effect: your limit is ${was}, and this doesn't change it.`;
  }
  if (p.propertyType !== q.propertyType) {
    return `Different rules entirely: the limit becomes ${constraintPhrase(after.binding, q)}.`;
  }
  if (delta < 0) {
    return `Lowers your ceiling: your limit becomes ${constraintPhrase(after.binding, q)}.`;
  }
  if (after.binding === before.binding) return `Your limit is still ${was}, so this lever keeps paying off.`;
  return `Helps until ${constraintPhrase(after.binding, q)} becomes the limit instead; past that point, work on that side.`;
}

/** Every applicable lever, ranked by how much it raises the maximum price. */
export function rankLevers(p: PlanInputs): { base: PlanResult; results: LeverResult[] } {
  const base = evaluatePlan(p);
  const results = leversFor(p).map((lever) => {
    const q = lever.apply(p);
    const after = evaluatePlan(q);
    const delta = after.maxPrice - base.maxPrice;
    return { lever, before: base, after, delta, explanation: explain(base, after, p, q, delta) };
  });
  results.sort((a, b) => b.delta - a.delta);
  return { base, results };
}

export interface TargetGap {
  target: number;
  reachable: boolean;
  /** Extra cash (added to the fully liquid pool) needed so cash no longer blocks the target. */
  extraCash: number;
  /** Extra annual income needed so DTI no longer blocks the target. */
  extraIncome: number;
  /** The same DTI room expressed as monthly debt payments you'd need to eliminate. 0 if debts can't cover it. */
  debtCutEquivalent: number;
}

/** Smallest x (to the dollar) for which ok(x) holds, given ok is false at 0 and monotone in x. Infinity if even $20M isn't enough. */
function smallestExtra(ok: (x: number) => boolean, hi = 20_000_000): number {
  if (!ok(hi)) return Infinity;
  let lo = 0; // invariant: ok(lo) false, ok(hi) true
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

/** What it would take to reach a specific price. Cash and income limits are independent, so each gap is solved on its own. */
export function gapToTarget(p: PlanInputs, target: number): TargetGap {
  const base = evaluatePlan(p);
  const reachable = base.maxPrice >= target - 1;
  const extraCash = base.cashMax >= target - 1
    ? 0
    : smallestExtra((x) => evaluatePlan({ ...p, cash: p.cash + x }).cashMax >= target - 1);
  const extraIncome = base.dtiMaxPrice >= target - 1
    ? 0
    : smallestExtra((x) => evaluatePlan({ ...p, annualIncome: p.annualIncome + x }).dtiMaxPrice >= target - 1);
  const monthlyRoom = (extraIncome / 12) * (p.maxDtiPct / 100);
  const debtCutEquivalent = extraIncome > 0 && monthlyRoom <= p.monthlyDebts ? Math.ceil(monthlyRoom) : 0;
  return { target, reachable, extraCash, extraIncome, debtCutEquivalent };
}
