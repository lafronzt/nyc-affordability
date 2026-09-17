import type { FilingStatus, TaxBracket, TaxYearConstants } from './salaryTaxConstants2026';

/* ============================================================
   Required Salary Calculator — reverse paycheck math.
   ============================================================
   Normal calculators go salary -> take-home. This goes the other way:
   the user names a take-home number they need (expenses + savings goal)
   and we solve for the gross salary that produces it, after federal/
   state/local tax, FICA, 401(k), and HSA.

   Deliberately NOT inverted algebraically — federal/state/NYC brackets
   stack, HSA/401(k) shift both the FICA base and the income-tax base
   differently, and the Additional Medicare surtax has its own
   threshold. Closed-form inversion would mean re-deriving the formula
   every time a bracket or limit changes. Binary search over
   netTakeHomeForGross (monotonically increasing in gross for any
   sane input) is simpler and self-corrects when salaryTaxConstants*
   is updated for a new tax year.
   ============================================================ */

export type HsaCoverage = 'none' | 'selfOnly' | 'family';

export interface RequiredSalaryInputs {
  filingStatus: FilingStatus;
  /** 0-100. Also stands in for 403(b)/457(b)/NYC pension (NYCERS/TRS/BERS) —
      this model gives all of them the same Traditional/Roth tax treatment as
      a 401(k); see retirementCapApplies for the one place they differ. */
  k401PercentOfGross: number;
  k401IsTraditional: boolean;
  /** False for a mandatory pension (NYCERS/TRS/BERS): those are §414(h)(2)
      "picked-up" contributions, not elective deferrals, so they're NOT subject
      to the IRC §402(g) cap that applies to 401(k)/403(b)/457(b). Defaults to
      true (capped) when omitted. Note this model still can't represent
      contributing to two independently-capped plans at once (e.g. a 401(k)
      AND a 457(b) in the same year, which real 402(g)/457(b) rules allow) —
      only one plan type and one shared cap at a time. */
  retirementCapApplies?: boolean;
  /** Informational only — does NOT reduce required salary. 0-100. */
  employerMatchPercentOfGross?: number;
  /** Informational only — optional dollar cap on the employer match. */
  employerMatchCapDollars?: number;
  hsaCoverage: HsaCoverage;
  /** Requested annual HSA dollar contribution (already resolved from "max" by the caller). */
  hsaContribution: number;
  age50Plus: boolean;

  // ---- Other Section 125 cafeteria-plan deductions: pre-tax for BOTH
  // income tax and FICA, same as HSA. All optional, default 0. ----
  /** $/month. */
  healthPremiumMonthly?: number;
  /** $/month. */
  dentalVisionPremiumMonthly?: number;
  /** $/month, clamped to the IRS monthly transit limit. Separate bucket from parking. */
  commuterTransitMonthly?: number;
  /** $/month, clamped to the IRS monthly parking limit. Separate bucket from transit. */
  commuterParkingMonthly?: number;
  /** $/year, clamped to the IRS Healthcare FSA cap. Mutually exclusive with
      HSA enrollment under IRS rules — forced to $0 whenever hsaCoverage !== 'none'. */
  healthcareFsaAnnual?: number;
  /** $/year, clamped to the IRS Dependent Care FSA cap. Independent of HSA/Healthcare FSA. */
  dependentCareFsaAnnual?: number;

  // ---- Post-tax payroll deductions: reduce net take-home only, never
  // taxable income or FICA wages. No IRS cap on any of these three. ----
  /** $/month. Voluntary/supplemental life insurance. */
  lifeInsuranceMonthly?: number;
  /** $/month. Voluntary short/long-term disability — post-tax on purpose:
      pre-tax premiums would make any paid-out benefit taxable. */
  disabilityInsuranceMonthly?: number;
  /** $/month. */
  unionDuesMonthly?: number;
}

export interface PaycheckBreakdown {
  gross: number;
  k401Contribution: number;
  k401Clamped: boolean;
  hsaContribution: number;
  hsaClamped: boolean;

  healthPremium: number;
  dentalVisionPremium: number;
  commuterTransit: number;
  commuterTransitClamped: boolean;
  commuterParking: number;
  commuterParkingClamped: boolean;
  healthcareFsa: number;
  healthcareFsaClamped: boolean;
  dependentCareFsa: number;
  dependentCareFsaClamped: boolean;
  /** Sum of every Section 125 pre-tax item above, including hsaContribution — the
      amount subtracted from both the income-tax base and FICA wages. */
  cafeteria125Total: number;

  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  fica: number;

  /** Mandatory NY payroll deduction, flat-rate (not user-entered): 0.432% of gross, capped. */
  nyPFL: number;
  /** Mandatory NY payroll deduction, flat-rate (not user-entered): $0.60/week cap. */
  nySDI: number;
  lifeInsurance: number;
  disabilityInsurance: number;
  unionDues: number;
  /** Sum of lifeInsurance + disabilityInsurance + unionDues + nySDI + nyPFL. */
  postTaxTotal: number;

  netTakeHome: number;
  employerMatchDollars: number;
}

export interface SensitivityRow {
  deltaPct: number;
  monthlySavingsGoal: number;
  annualNetNeeded: number;
  requiredAnnualSalary: number;
  requiredMonthlySalary: number;
}

/** Applies a progressive marginal-bracket schedule to a taxable-income amount. */
export function applyBrackets(taxableIncome: number, brackets: TaxBracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let prevCap = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= prevCap) break;
    const taxedInThisBracket = Math.min(taxableIncome, bracket.upTo) - prevCap;
    tax += taxedInThisBracket * bracket.rate;
    prevCap = bracket.upTo;
  }
  return tax;
}

export function getK401Cap(age50Plus: boolean, constants: TaxYearConstants): number {
  return constants.contributionLimits.k401.standard + (age50Plus ? constants.contributionLimits.k401.catchUp50 : 0);
}

/** IRS HSA catch-up contributions are actually age-55+, not age-50+ — this tool
    uses a single "50+" toggle for both 401(k) and HSA catch-ups per the simplified
    input model, which slightly overstates HSA room for a user aged 50-54. */
export function getHsaCap(coverage: HsaCoverage, age50Plus: boolean, constants: TaxYearConstants): number {
  if (coverage === 'none') return 0;
  const base = coverage === 'family' ? constants.contributionLimits.hsa.family : constants.contributionLimits.hsa.selfOnly;
  return base + (age50Plus ? constants.contributionLimits.hsa.catchUp55 : 0);
}

export function getCommuterCap(kind: 'transit' | 'parking', constants: TaxYearConstants): number {
  return (kind === 'transit' ? constants.commuterBenefit.transitMonthly : constants.commuterBenefit.parkingMonthly) * 12;
}

export function getHealthcareFsaCap(constants: TaxYearConstants): number {
  return constants.fsa.healthcareAnnual;
}

export function getDependentCareFsaCap(constants: TaxYearConstants): number {
  return constants.fsa.dependentCareAnnual;
}

/** Shared by every capped pre-tax deduction below (HSA, commuter transit/parking,
    both FSAs) so the clamp-and-flag logic isn't hand-copied per deduction type. */
function clampToCap(requested: number, cap: number): { value: number; clamped: boolean } {
  return { value: Math.min(requested, cap), clamped: requested > cap + 1e-9 };
}

/** Full payslip-style breakdown of a given gross salary under the supplied inputs. */
export function computeBreakdown(gross: number, inputs: RequiredSalaryInputs, constants: TaxYearConstants): PaycheckBreakdown {
  const status = inputs.filingStatus;
  const g = Math.max(0, gross);

  // ---- Section 125 pre-tax cafeteria bucket (reduces BOTH income tax and FICA) ----
  const healthPremium = Math.max(0, inputs.healthPremiumMonthly ?? 0) * 12;
  const dentalVisionPremium = Math.max(0, inputs.dentalVisionPremiumMonthly ?? 0) * 12;

  const transitCap = getCommuterCap('transit', constants);
  const requestedTransit = Math.max(0, inputs.commuterTransitMonthly ?? 0) * 12;
  const { value: commuterTransit, clamped: commuterTransitClamped } = clampToCap(requestedTransit, transitCap);

  const parkingCap = getCommuterCap('parking', constants);
  const requestedParking = Math.max(0, inputs.commuterParkingMonthly ?? 0) * 12;
  const { value: commuterParking, clamped: commuterParkingClamped } = clampToCap(requestedParking, parkingCap);

  // Healthcare FSA and HSA are mutually exclusive under IRS rules — HSA enrollment
  // wins regardless of what the caller passed for healthcareFsaAnnual.
  const healthcareFsaCap = getHealthcareFsaCap(constants);
  const requestedHealthcareFsa = inputs.hsaCoverage === 'none' ? Math.max(0, inputs.healthcareFsaAnnual ?? 0) : 0;
  const { value: healthcareFsa, clamped: healthcareFsaClamped } = clampToCap(requestedHealthcareFsa, healthcareFsaCap);

  const dependentCareFsaCap = getDependentCareFsaCap(constants);
  const requestedDependentCareFsa = Math.max(0, inputs.dependentCareFsaAnnual ?? 0);
  const { value: dependentCareFsa, clamped: dependentCareFsaClamped } = clampToCap(requestedDependentCareFsa, dependentCareFsaCap);

  const hsaCap = getHsaCap(inputs.hsaCoverage, inputs.age50Plus, constants);
  const requestedHsa = inputs.hsaCoverage === 'none' ? 0 : Math.max(0, inputs.hsaContribution);
  const { value: hsaContribution, clamped: hsaClamped } = clampToCap(requestedHsa, hsaCap);

  const cafeteria125Total = healthPremium + dentalVisionPremium + commuterTransit + commuterParking
    + healthcareFsa + dependentCareFsa + hsaContribution;

  // ---- Retirement (401(k)/403(b)/457(b)/pension, all modeled identically except
  // for whether the 402(g) elective-deferral cap applies — see retirementCapApplies) ----
  const k401Cap = inputs.retirementCapApplies === false ? Infinity : getK401Cap(inputs.age50Plus, constants);
  const requestedK401 = g * (inputs.k401PercentOfGross / 100);
  const { value: k401Contribution, clamped: k401Clamped } = clampToCap(requestedK401, k401Cap);
  // Traditional reduces taxable income; Roth does not. Neither ever reduces FICA wages.
  const incomeTaxDeduction = inputs.k401IsTraditional ? k401Contribution : 0;

  // ---- FICA: the Section 125 bucket reduces FICA wages; retirement never does ----
  const ficaWages = Math.max(0, g - cafeteria125Total);
  const socialSecurity = Math.min(ficaWages, constants.fica.socialSecurityWageBase) * constants.fica.socialSecurityRate;
  const medicare = ficaWages * constants.fica.medicareRate;
  const additionalMedicareThreshold = constants.fica.additionalMedicareThreshold[status];
  const additionalMedicare = Math.max(0, ficaWages - additionalMedicareThreshold) * constants.fica.additionalMedicareRate;
  const fica = socialSecurity + medicare + additionalMedicare;

  // ---- Income tax ----
  const fedTaxable = Math.max(0, g - incomeTaxDeduction - cafeteria125Total - constants.federal.standardDeduction[status]);
  const federalTax = applyBrackets(fedTaxable, constants.federal.brackets[status]);

  // NYC residents only: NY State tax plus the NYC resident local surcharge always apply.
  const stateTaxable = Math.max(0, g - incomeTaxDeduction - cafeteria125Total - constants.nyState.standardDeduction[status]);
  const stateTax = applyBrackets(stateTaxable, constants.nyState.brackets[status]);
  const localTax = applyBrackets(stateTaxable, constants.nycLocal.brackets[status]);

  // ---- Mandatory NY post-tax payroll deductions (not user-entered) ----
  const nySDI = constants.ny.sdiAnnualCap;
  const nyPFL = Math.min(g * constants.ny.pflRate, constants.ny.pflAnnualCap);

  // ---- Other post-tax deductions: no tax effect, straight subtraction from net ----
  const lifeInsurance = Math.max(0, inputs.lifeInsuranceMonthly ?? 0) * 12;
  const disabilityInsurance = Math.max(0, inputs.disabilityInsuranceMonthly ?? 0) * 12;
  const unionDues = Math.max(0, inputs.unionDuesMonthly ?? 0) * 12;
  const postTaxTotal = lifeInsurance + disabilityInsurance + unionDues + nySDI + nyPFL;

  const netTakeHome = g - cafeteria125Total - k401Contribution - federalTax - stateTax - localTax - fica - postTaxTotal;

  const employerMatchRaw = g * (Math.max(0, inputs.employerMatchPercentOfGross ?? 0) / 100);
  const employerMatchDollars = inputs.employerMatchCapDollars != null
    ? Math.min(employerMatchRaw, Math.max(0, inputs.employerMatchCapDollars))
    : employerMatchRaw;

  return {
    gross: g,
    k401Contribution,
    k401Clamped,
    hsaContribution,
    hsaClamped,
    healthPremium,
    dentalVisionPremium,
    commuterTransit,
    commuterTransitClamped,
    commuterParking,
    commuterParkingClamped,
    healthcareFsa,
    healthcareFsaClamped,
    dependentCareFsa,
    dependentCareFsaClamped,
    cafeteria125Total,
    federalTax,
    stateTax,
    localTax,
    socialSecurity,
    medicare,
    additionalMedicare,
    fica,
    nyPFL,
    nySDI,
    lifeInsurance,
    disabilityInsurance,
    unionDues,
    postTaxTotal,
    netTakeHome,
    employerMatchDollars,
  };
}

/** Baseline scenario shared by every /salary/ page (the hub table, each
    /salary/[amount]/ detail page, and that page's live mini-calc widget) so
    the three can't silently drift apart: single filer, no 401(k)/HSA/other
    deductions — the cleanest gross-to-net comparison point. */
export const SALARY_LANDING_PAGE_BASELINE: RequiredSalaryInputs = {
  filingStatus: 'single',
  k401PercentOfGross: 0,
  k401IsTraditional: true,
  hsaCoverage: 'none',
  hsaContribution: 0,
  age50Plus: false,
};

export function netTakeHomeForGross(gross: number, inputs: RequiredSalaryInputs, constants: TaxYearConstants): number {
  return computeBreakdown(gross, inputs, constants).netTakeHome;
}

/** Binary search for the gross salary whose net take-home equals annualNetNeeded.
    Assumes netTakeHomeForGross is monotonically non-decreasing in gross, which
    holds as long as k401% + top marginal tax rate stays under 100%. */
export function solveRequiredSalary(annualNetNeeded: number, inputs: RequiredSalaryInputs, constants: TaxYearConstants): number {
  const target = Math.max(0, annualNetNeeded);
  let lo = 0;
  let hi = 50000000;
  while (netTakeHomeForGross(hi, inputs, constants) < target && hi < 1e12) {
    hi *= 2;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const net = netTakeHomeForGross(mid, inputs, constants);
    if (net < target) lo = mid; else hi = mid;
  }
  return hi;
}

/** Required salary at the target savings goal plus +-5%/+-10% variations, so a user
    can see the marginal cost of saving more.
    baseRequiredAnnualSalary, if provided, is reused for the deltaPct===0 row instead
    of re-running a full binary search for a value the caller (render()) already
    solved moments earlier for the same inputs. */
export function computeSensitivityTable(
  monthlyExpenses: number,
  monthlySavingsGoal: number,
  inputs: RequiredSalaryInputs,
  constants: TaxYearConstants,
  deltasPct: number[] = [-10, -5, 0, 5, 10],
  baseRequiredAnnualSalary?: number,
): SensitivityRow[] {
  return deltasPct.map((deltaPct) => {
    const adjustedSavingsGoal = monthlySavingsGoal * (1 + deltaPct / 100);
    const annualNetNeeded = (monthlyExpenses + adjustedSavingsGoal) * 12;
    const requiredAnnualSalary = deltaPct === 0 && baseRequiredAnnualSalary !== undefined
      ? baseRequiredAnnualSalary
      : solveRequiredSalary(annualNetNeeded, inputs, constants);
    return {
      deltaPct,
      monthlySavingsGoal: adjustedSavingsGoal,
      annualNetNeeded,
      requiredAnnualSalary,
      requiredMonthlySalary: requiredAnnualSalary / 12,
    };
  });
}
