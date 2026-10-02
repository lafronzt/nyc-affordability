import { calcPmiRate, calcPmiMonthly, calcMansionTax, calcMortgageRecordingTax } from './calc.ts';
import { ASSUMPTIONS } from '../data/assumptions.ts';

/* ============================================================
   Build-time affordability math for salary/price landing pages
   (/income/[amount]/, /buy/[price]/, homepage scenario table).
   ============================================================
   Mirrors — does NOT import — the pure calculate()/priceAtDp() logic in
   src/scripts/{rent,coop,condo,affordable}.ts, the same way compare.ts
   mirrors those same formulas for its own dashboard (see compare.ts's own
   header comment for that precedent). Kept as a separate DOM-free module
   because those scripts are compiled as client bundles that read inputs
   via document.getElementById(), which doesn't exist at Astro build time
   (Node, getStaticPaths()). If a calculator's formula changes, this file
   must be updated to match — there is no automated sync.

   NOTE: this intentionally does NOT mirror coop.ts's/condo.ts's full
   computeOptimizer()/computeAffordTarget() lever-search machinery (rate
   search, dp sensitivity, cash x income grid) — that's UI-optimizer logic
   built for an interactive slider page, with no static-content use case.
   Only the direct price<->income<->cash inversions needed for landing
   pages are reproduced here.

   NOTE on the cash/reserve constraint: unlike the live calculators, these
   functions have no real account data to weigh against a cash ceiling —
   a landing page visitor hasn't entered their accounts. So maxAffordablePrice()
   below is DTI-only (the income constraint), and requiredIncomeForPrice()
   reports an *estimated* cash requirement without checking it against any
   real assets. Every page that renders these numbers must say so explicitly
   and link to the live calculator, where the cash/reserve constraint is
   actually enforced against the visitor's own accounts.
   ============================================================ */

// ---- Sourced default assumptions ----
// Values come from src/data/assumptions.ts, the single registry that also
// records each default's source, basis, and verification date. The calculator
// pages' <input value> defaults are checked against the same registry by
// test/defaultsParity.test.ts, so this engine and the live calculators start
// from identical numbers.
const A = ASSUMPTIONS;
export const DEFAULT_ASSUMPTIONS = {
  rentIncomeMultiplier: A.rentIncomeMultiplier.value,

  // Co-op
  coopMortgageRatePct: A.mortgageRatePct.value,
  coopLoanTermYears: A.loanTermYears.value,
  coopDownPaymentPct: A.coopDownPaymentPct.value,
  coopMaxDtiPct: A.coopMaxDtiPct.value,
  coopReserveMonths: A.coopReserveMonths.value,
  coopMaintenanceMo: A.coopMaintenanceMo.value,
  // Same five fees as the /coop/ calculator's "Total Fixed" (coop.ts calculate()).
  coopFixedClosingCosts:
    A.coopAttorneyFee.value + A.coopBankAttorneyFee.value + A.coopBoardFee.value +
    A.coopMoveInDeposit.value + A.coopOtherFixedFees.value,
  coopVariableClosingPct: A.coopVariableClosingPct.value, // loan origination; mansion tax is separate

  // Condo
  condoMortgageRatePct: A.mortgageRatePct.value,
  condoLoanTermYears: A.loanTermYears.value,
  condoDownPaymentPct: A.condoDownPaymentPct.value,
  condoMaxDtiPct: A.condoMaxDtiPct.value,
  condoCommonChargesMo: A.condoCommonChargesMo.value,
  condoPropTaxesMo: A.condoPropertyTaxMo.value,
  condoHoInsuranceMo: A.condoInsuranceMo.value,
  // Same five fees as condo.ts computeCC() (working capital off by default).
  condoFixedClosingCosts:
    A.condoAttorneyFee.value + A.condoLenderFees.value + A.condoAppraisalFee.value +
    A.condoRecordingFees.value + A.condoBuildingFees.value,
  condoTitlePricePct: A.condoOwnerTitlePct.value,
  condoTitleLoanPct: A.condoLenderTitlePct.value,
  // Condo reserves are off by default in the live calculator (state.reservesEnabled = false
  // in condo.ts) — no post-close liquidity requirement is assumed here either.

  // Affordable housing / AMI — see src/lib/amiTable.ts for the HUD table itself.
} as const;

const PMAX = 20000000;

function pmtFactor(annualRatePct: number, termYears: number): number {
  const rm = annualRatePct / 100 / 12;
  const nMo = termYears * 12;
  if (nMo <= 0) return 0;
  return rm === 0 ? 1 / nMo : rm / (1 - Math.pow(1 + rm, -nMo));
}

// ---- Rent: income -> max affordable rent (40x rule only; no account/cash data on landing pages) ----
export interface RentAffordInputs {
  annualIncome: number;
  incomeMultiplier?: number;
}
export interface RentAffordResult {
  maxRent: number;
  binding: string;
}
export function maxAffordableRent(inp: RentAffordInputs): RentAffordResult {
  const mult = inp.incomeMultiplier ?? DEFAULT_ASSUMPTIONS.rentIncomeMultiplier;
  const maxRent = mult > 0 ? Math.max(0, inp.annualIncome / mult) : 0;
  return { maxRent, binding: `Income (${mult}× rule)` };
}

// ---- Rent: target rent -> required income (inverse of maxAffordableRent, for
// "what income do you need for this rent" content like neighborhood pages) ----
export interface RequiredIncomeForRentInputs {
  targetRent: number;
  incomeMultiplier?: number;
}
export function requiredIncomeForRent(inp: RequiredIncomeForRentInputs): { annualIncomeNeeded: number } {
  const mult = inp.incomeMultiplier ?? DEFAULT_ASSUMPTIONS.rentIncomeMultiplier;
  return { annualIncomeNeeded: Math.max(0, inp.targetRent) * mult };
}

// ---- Co-op / condo: income -> max purchase price (DTI ceiling only) ----
export interface PurchaseAffordInputs {
  annualIncome: number;
  propertyType: 'coop' | 'condo';
  otherDebts?: number;
}
export interface PurchaseAffordResult {
  maxPrice: number;
  binding: string;
  monthlyCarrying: number;
}
export function maxAffordablePrice(inp: PurchaseAffordInputs): PurchaseAffordResult {
  const a = DEFAULT_ASSUMPTIONS;
  const oDebts = inp.otherDebts ?? 0;
  const moInc = inp.annualIncome / 12;

  const isCoop = inp.propertyType === 'coop';
  const dp = (isCoop ? a.coopDownPaymentPct : a.condoDownPaymentPct) / 100;
  const dtiMax = (isCoop ? a.coopMaxDtiPct : a.condoMaxDtiPct) / 100;
  const carrying = isCoop
    ? a.coopMaintenanceMo
    : a.condoCommonChargesMo + a.condoPropTaxesMo + a.condoHoInsuranceMo;
  const K = pmtFactor(isCoop ? a.coopMortgageRatePct : a.condoMortgageRatePct, isCoop ? a.coopLoanTermYears : a.condoLoanTermYears);
  const effK = K + calcPmiRate(dp) / 12;

  const budgetForMtg = dtiMax * moInc - carrying - oDebts;
  if (budgetForMtg <= 0 || effK <= 0) {
    return { maxPrice: 0, binding: 'DTI / Income', monthlyCarrying: carrying };
  }
  const maxLoan = budgetForMtg / effK;
  const maxPrice = Math.max(0, maxLoan / (1 - dp));
  return { maxPrice, binding: 'DTI / Income', monthlyCarrying: carrying };
}

// ---- Co-op / condo: target price -> required income + estimated cash (direct inversion,
// mirrors the at-target-price snapshot math in coop.ts calculate()/condo.ts calculate(),
// not the full computeAffordTarget() lever search) ----
export interface RequiredIncomeInputs {
  targetPrice: number;
  propertyType: 'coop' | 'condo';
}
export interface RequiredIncomeResult {
  annualIncomeNeeded: number;
  monthlyPI: number;
  monthlyCarrying: number;
  mansionTax: number;
  downPayment: number;
  estimatedClosingCosts: number;
  estimatedReserves: number;
  estimatedCashNeeded: number;
}
export function requiredIncomeForPrice(inp: RequiredIncomeInputs): RequiredIncomeResult {
  const a = DEFAULT_ASSUMPTIONS;
  const isCoop = inp.propertyType === 'coop';
  const price = Math.max(0, inp.targetPrice);
  const dp = (isCoop ? a.coopDownPaymentPct : a.condoDownPaymentPct) / 100;
  const dtiMax = (isCoop ? a.coopMaxDtiPct : a.condoMaxDtiPct) / 100;
  const carrying = isCoop
    ? a.coopMaintenanceMo
    : a.condoCommonChargesMo + a.condoPropTaxesMo + a.condoHoInsuranceMo;
  const K = pmtFactor(isCoop ? a.coopMortgageRatePct : a.condoMortgageRatePct, isCoop ? a.coopLoanTermYears : a.condoLoanTermYears);

  const downPayment = price * dp;
  const loanAmt = price - downPayment;
  const monthlyPI = loanAmt * K;
  const monthlyPmi = calcPmiMonthly(loanAmt, dp);
  const monthlyTotal = monthlyPI + monthlyPmi + carrying;
  const annualIncomeNeeded = dtiMax > 0 ? (monthlyTotal / dtiMax) * 12 : Infinity;

  const mansionTax = calcMansionTax(price);
  const fixedCC = isCoop ? a.coopFixedClosingCosts : a.condoFixedClosingCosts;
  const variableCC = isCoop
    ? price * (a.coopVariableClosingPct / 100)
    : price * (a.condoTitlePricePct / 100) + loanAmt * (a.condoTitleLoanPct / 100);
  const mortgageRecordingTax = isCoop ? 0 : calcMortgageRecordingTax(loanAmt); // coops are personal property, not subject to NYC/NYS MRT
  const estimatedClosingCosts = fixedCC + variableCC + mortgageRecordingTax + mansionTax;

  const reserveMonths = isCoop ? a.coopReserveMonths : 0; // condo reserves off by default, matches condo.ts state.reservesEnabled
  const estimatedReserves = reserveMonths * (monthlyPI + monthlyPmi + carrying);

  const estimatedCashNeeded = downPayment + estimatedClosingCosts + estimatedReserves;

  return {
    annualIncomeNeeded,
    monthlyPI,
    monthlyCarrying: carrying,
    mansionTax,
    downPayment,
    estimatedClosingCosts,
    estimatedReserves,
    estimatedCashNeeded,
  };
}

// ---- Affordable housing: income + household size -> AMI % + band ----
export { AMI_BASE, AMI_SOURCE_URL, getBandClass } from './amiTable.ts';
