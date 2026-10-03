import { calculateCoop } from './coop.ts';
import { calculateCondo } from './condo.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults } from './defaults.ts';
import { ASSUMPTIONS as A } from '../../data/assumptions.ts';

/* ============================================================
   Down payment / purchase savings planner (pure, DOM-free)
   ============================================================
   "How long until I can afford to buy?" The cash target comes from the
   shared co-op/condo engine at the target price (down payment, closing
   costs, mansion tax, mortgage recording tax for condos, and the co-op
   board's post-closing reserves), so it matches what /coop/ and /condo/
   say you need. The projection itself is plain compound savings.
   ============================================================ */

export type PropertyType = 'coop' | 'condo';

export interface SavingsInputs {
  propertyType: PropertyType;
  targetPrice: number;
  currentSavings: number;
  monthlyContribution: number;
  /** Annual yield on savings (APY-style), percent. */
  savingsYieldPct: number;
  annualIncome: number;
  monthlyDebts: number;
  /** Annual raise assumed for the income check, percent. */
  incomeGrowthPct: number;
  /** Annual home-price growth applied to the target price while you save, percent. */
  priceGrowthPct: number;
  /** Cash you want left over after closing, on top of anything the building requires. */
  emergencyFund: number;
  downPaymentPct: number;
  mortgageRate: number;
  /** Co-op maintenance or condo common charges. */
  buildingCharges: number;
  maxDtiPct: number;
  /** Co-op board post-closing reserves, in months. Ignored for condos. */
  reserveMonths: number;
}

export function defaultSavingsInputs(type: PropertyType, overrides: Partial<SavingsInputs> = {}): SavingsInputs {
  const coop = type === 'coop';
  return {
    propertyType: type,
    targetPrice: 0,
    currentSavings: 0,
    monthlyContribution: 0,
    savingsYieldPct: 0,
    annualIncome: 0,
    monthlyDebts: 0,
    incomeGrowthPct: 0,
    priceGrowthPct: 0,
    emergencyFund: 0,
    downPaymentPct: coop ? A.coopDownPaymentPct.value : A.condoDownPaymentPct.value,
    mortgageRate: A.mortgageRatePct.value,
    buildingCharges: coop ? A.coopMaintenanceMo.value : A.condoCommonChargesMo.value,
    maxDtiPct: coop ? A.coopMaxDtiPct.value : A.condoMaxDtiPct.value,
    reserveMonths: A.coopReserveMonths.value,
    ...overrides,
  };
}

export interface CashBreakdown {
  price: number;
  downPayment: number;
  /** Attorney, lender/bank, board or building fees, title, origination: everything except the taxes below. */
  closingCosts: number;
  mansionTax: number;
  /** Condos only (co-op loans aren't recorded mortgages). */
  mortgageRecordingTax: number;
  /** Co-op board post-closing liquidity: months x (mortgage + maintenance). 0 for condos. */
  reserves: number;
  emergencyFund: number;
  total: number;
  /** Gross income needed to clear the DTI limit at this price, with current debts. */
  incomeNeeded: number;
  monthlyHousingCost: number;
}

/** Everything you need in the bank to close on `price`, from the shared engine. */
export function cashNeeded(p: SavingsInputs, price = p.targetPrice): CashBreakdown {
  const common = { mortgageRate: p.mortgageRate, dpPct: p.downPaymentPct, targetOverride: price, otherDebts: p.monthlyDebts };
  if (p.propertyType === 'coop') {
    const r = calculateCoop(coopInputsFromDefaults({ ...common, maint: p.buildingCharges, maxDTIPct: p.maxDtiPct, reserveMo: p.reserveMonths }));
    const reserves = r.maintRes + r.mtgRes;
    const monthly = r.moTotal;
    return {
      price, downPayment: r.downPmt, closingCosts: r.fixedCC + r.varCC, mansionTax: r.mansion, mortgageRecordingTax: 0,
      reserves, emergencyFund: p.emergencyFund, total: r.totalCash + p.emergencyFund,
      incomeNeeded: r.dtiMax > 0 ? ((monthly + p.monthlyDebts) / r.dtiMax) * 12 : Infinity, monthlyHousingCost: monthly,
    };
  }
  const r = calculateCondo(condoInputsFromDefaults({ ...common, commonCharges: p.buildingCharges, maxDtiPct: p.maxDtiPct }));
  const monthly = r.moTotal;
  return {
    price, downPayment: r.downPmt, closingCosts: r.cc.fixed + r.cc.title, mansionTax: r.cc.mansion, mortgageRecordingTax: r.cc.mrt,
    reserves: r.resReq, emergencyFund: p.emergencyFund, total: r.totalCash + p.emergencyFund,
    incomeNeeded: r.dtiMax > 0 ? ((monthly + p.monthlyDebts) / r.dtiMax) * 12 : Infinity, monthlyHousingCost: monthly,
  };
}

export interface ProjectionPoint { month: number; balance: number; required: number; income: number; incomeNeeded: number }

export interface SavingsPlan {
  needNow: CashBreakdown;
  gapNow: number;
  /** First month (0 = today) when savings cover the cash target. null if not within the horizon. */
  cashReadyMonth: number | null;
  /** First month when income (with raises) clears the DTI limit at the then-current price. */
  incomeReadyMonth: number | null;
  /** Both ready. */
  readyMonth: number | null;
  /** Cash target and income needed at readyMonth (prices may have grown). */
  needAtReady: CashBreakdown | null;
  savingsAtReady: number | null;
  /** Savings left after closing beyond everything required (0 when exactly ready). */
  leftOverAtReady: number | null;
  points: ProjectionPoint[];
}

export const HORIZON_MONTHS = 360;

const grow = (pct: number, months: number) => Math.pow(1 + pct / 100, months / 12);
/** Monthly rate equivalent to an annual percentage yield. */
const monthlyRate = (apyPct: number) => Math.pow(1 + apyPct / 100, 1 / 12) - 1;

/** Income in month m: raises arrive once a year, on each anniversary. */
function incomeAt(p: SavingsInputs, m: number) {
  return p.annualIncome * Math.pow(1 + p.incomeGrowthPct / 100, Math.floor(m / 12));
}

export function planSavings(p: SavingsInputs, horizon = HORIZON_MONTHS): SavingsPlan {
  const needNow = cashNeeded(p);
  const i = monthlyRate(p.savingsYieldPct);
  const points: ProjectionPoint[] = [];
  let balance = p.currentSavings;
  let cashReadyMonth: number | null = null;
  let incomeReadyMonth: number | null = null;
  let readyMonth: number | null = null;
  let needAtReady: CashBreakdown | null = null;
  for (let m = 0; m <= horizon; m++) {
    const need = p.priceGrowthPct === 0 ? needNow : cashNeeded(p, p.targetPrice * grow(p.priceGrowthPct, m));
    const income = incomeAt(p, m);
    points.push({ month: m, balance, required: need.total, income, incomeNeeded: need.incomeNeeded });
    if (cashReadyMonth === null && balance >= need.total) cashReadyMonth = m;
    if (incomeReadyMonth === null && income >= need.incomeNeeded) incomeReadyMonth = m;
    if (readyMonth === null && balance >= need.total && income >= need.incomeNeeded) {
      readyMonth = m;
      needAtReady = need;
    }
    balance = balance * (1 + i) + p.monthlyContribution;
  }
  const savingsAtReady = readyMonth === null ? null : points[readyMonth].balance;
  return {
    needNow,
    gapNow: Math.max(0, needNow.total - p.currentSavings),
    cashReadyMonth,
    incomeReadyMonth,
    readyMonth,
    needAtReady,
    savingsAtReady,
    leftOverAtReady: savingsAtReady === null || !needAtReady ? null : savingsAtReady - needAtReady.total,
    points,
  };
}

/** Monthly contribution needed to have the cash target `months` from now (price growth included). 0 if already covered. */
export function monthlyNeededFor(p: SavingsInputs, months: number): number {
  if (months <= 0) return Math.max(0, cashNeeded(p).total - p.currentSavings) > 0 ? Infinity : 0;
  const need = cashNeeded(p, p.targetPrice * grow(p.priceGrowthPct, months)).total;
  const i = monthlyRate(p.savingsYieldPct);
  const fvSavings = p.currentSavings * Math.pow(1 + i, months);
  const shortfall = need - fvSavings;
  if (shortfall <= 0) return 0;
  // Contributions at the end of each month: FV = c * ((1+i)^n - 1) / i.
  const annuity = i === 0 ? months : (Math.pow(1 + i, months) - 1) / i;
  return shortfall / annuity;
}
