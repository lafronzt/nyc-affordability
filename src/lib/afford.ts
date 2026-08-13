import { calcPmiRate, calcPmiMonthly, calcMansionTax, calcMortgageRecordingTax } from './calc';

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
// Each constant mirrors the <input value="..."> default on the corresponding
// calculator page, with the same citation shown in that page's <small> note.
export const DEFAULT_ASSUMPTIONS = {
  // Rent — src/pages/rent/index.astro:129-130
  // "Landlords typically require 40x monthly rent" (NYC market convention).
  rentIncomeMultiplier: 40,

  // Co-op — src/pages/coop/index.astro
  coopMortgageRatePct: 6.25,   // line 258: Freddie Mac (6.23%) / Bankrate (6.40%) consensus, Apr 2026
  coopLoanTermYears: 30,
  coopDownPaymentPct: 20,      // line 268: minimum for most buildings (Skybriz, Prevu 2025)
  coopMaxDtiPct: 28,           // line 287: long-standing NYC board standard (Prevu, YRE 2025)
  coopReserveMonths: 12,       // line 281: most common standard for typical buildings (Prevu, Compass 2026)
  coopMaintenanceMo: 1200,     // line 293: mid-range city-wide estimate (Elliman/Miller Samuel Q4 2024)
  coopFixedClosingCosts: 4000 + 1500 + 750, // fc-atty + fc-bank-atty + fc-coop defaults, coop/index.astro:308-316
  coopVariableClosingPct: 0.5, // line 338: covers loan origination fees; mansion tax is separate

  // Condo — src/pages/condo/index.astro
  condoMortgageRatePct: 6.30,  // line 137: Freddie Mac PMMS, Apr 30 2026, 30-yr FRM conventional/conforming/20% down
  condoLoanTermYears: 30,
  condoDownPaymentPct: 20,     // line 149
  condoMaxDtiPct: 43,          // line 162: CFPB/Fannie Mae qualified-mortgage back-end DTI limit
  condoCommonChargesMo: 1000,  // line 170: illustrative citywide estimate (Manhattan often $1.5-3k+, Bklyn/Queens often $500-900)
  condoPropTaxesMo: 1250,      // line 179 default
  condoHoInsuranceMo: 75,      // line 186 default
  condoFixedClosingCosts: 5000 + 3500 + 1000 + 750 + 1500, // fc-atty..fc-building defaults, condo/index.astro:216-232
  condoTitlePricePct: 0.45,    // line 258: mid-range NYC resale condo estimate
  condoTitleLoanPct: 0.10,     // line 266 default
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
export { AMI_BASE, AMI_SOURCE_URL, getBandClass } from './amiTable';
