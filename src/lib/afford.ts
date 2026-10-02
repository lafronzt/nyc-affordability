import { calculateCoop } from './engines/coop.ts';
import { calculateCondo } from './engines/condo.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults } from './engines/defaults.ts';
import { ASSUMPTIONS } from '../data/assumptions.ts';

/* ============================================================
   Build-time affordability math for the landing pages
   (/income/[amount]/, /buy/[price]/, /rent/[price]/, neighborhoods,
   homepage scenario table, and the MiniCalcWidget).
   ============================================================
   A thin layer over the shared engines in ./engines/, the same code the
   /coop/, /condo/ and /rent/ calculators run, fed with the sourced defaults
   from src/data/assumptions.ts. There is no second copy of the formulas to
   keep in sync: change an engine and these pages follow.

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
  const base = { annualIncome: inp.annualIncome, otherDebts: inp.otherDebts ?? 0 };
  // No accounts: only the DTI ceiling is meaningful here (see header note).
  const dtiMaxPrice = inp.propertyType === 'coop'
    ? calculateCoop(coopInputsFromDefaults(base)).dtiMaxPrice
    : calculateCondo(condoInputsFromDefaults(base)).dtiMaxPrice;
  const carrying = inp.propertyType === 'coop'
    ? a.coopMaintenanceMo
    : a.condoCommonChargesMo + a.condoPropTaxesMo + a.condoHoInsuranceMo;
  return { maxPrice: Math.max(0, dtiMaxPrice ?? 0), binding: 'DTI / Income', monthlyCarrying: carrying };
}

// ---- Co-op / condo: target price -> required income + estimated cash (the engine's
// snapshot at that price, inverted through the DTI limit) ----
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
  const price = Math.max(0, inp.targetPrice);
  if (inp.propertyType === 'coop') {
    const r = calculateCoop(coopInputsFromDefaults({ targetOverride: price }));
    return {
      annualIncomeNeeded: r.dtiMax > 0 ? (r.moTotal / r.dtiMax) * 12 : Infinity,
      monthlyPI: r.moMtg,
      monthlyCarrying: r.maintMo,
      mansionTax: r.mansion,
      downPayment: r.downPmt,
      estimatedClosingCosts: r.fixedCC + r.varCC + r.mansion, // co-ops: no mortgage recording tax
      estimatedReserves: r.maintRes + r.mtgRes,
      estimatedCashNeeded: r.totalCash,
    };
  }
  // Condo reserves are off by default, same as the /condo/ calculator.
  const r = calculateCondo(condoInputsFromDefaults({ targetOverride: price }));
  return {
    annualIncomeNeeded: r.dtiMax > 0 ? (r.moTotal / r.dtiMax) * 12 : Infinity,
    monthlyPI: r.moMtg,
    monthlyCarrying: r.carrying,
    mansionTax: r.cc.mansion,
    downPayment: r.downPmt,
    estimatedClosingCosts: r.cc.total,
    estimatedReserves: r.resReq,
    estimatedCashNeeded: r.totalCash,
  };
}

// ---- Affordable housing: income + household size -> AMI % + band ----
export { AMI_BASE, AMI_SOURCE_URL, getBandClass } from './amiTable.ts';
