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

/** 'standard'/'itemize' force that choice on BOTH federal and NY returns;
    'auto' (the default) lets federal and NY pick independently, since a
    taxpayer can itemize on one return and take the standard deduction on
    the other. */
export type ItemizeChoice = 'standard' | 'itemize' | 'auto';

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

  // ---- Itemized vs. standard deduction. Itemizing REPLACES the standard
  // deduction in the tax math (federal and NY are chosen independently —
  // see ItemizeChoice) rather than adding a new payroll line item. Defaults
  // to 'auto' when omitted. ----
  itemizeChoice?: ItemizeChoice;
  /** $/year. For a co-op, the shareholder's proportionate share of interest
      on the building's underlying mortgage. */
  mortgageInterestAnnual?: number;
  /** $/year. For a co-op, the shareholder's proportionate share of the
      building's real estate tax. Uncapped on the NY return; part of the
      capped federal SALT bucket. */
  propertyTaxAnnual?: number;
  /** $/year. Cash and non-cash combined. */
  charitableContributionsAnnual?: number;
  /** $/year, unreimbursed. Only the amount above 7.5% of AGI is deductible —
      the engine does that math, not the caller. */
  medicalExpensesAnnual?: number;
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

  /** True when the federal/NY return ends up itemizing (whether forced by
      itemizeChoice or picked by 'auto' because it beat the standard deduction). */
  fedItemized: boolean;
  nyItemized: boolean;
  /** Raw itemized totals BEFORE the standard-vs-itemized choice is applied —
      shown to the user even when the standard deduction was actually used,
      so "you're $412 short of itemizing" messaging is possible. */
  federalItemizedTotal: number;
  nyItemizedTotal: number;
  /** The deduction amount actually used in the tax math above (whichever of
      standard/itemized was chosen). */
  fedDeductionUsed: number;
  nyDeductionUsed: number;
  /** State/local tax paid eligible for the federal SALT bucket, before the
      cap; and whether the cap (or its MAGI phaseout) actually bound. */
  saltEligibleBeforeCap: number;
  saltCapApplied: boolean;
  /** OBBBA above-the-line charitable deduction — only applies when NOT
      itemizing federally, separate from and not part of federalItemizedTotal. */
  nonItemizerCharitableDeduction: number;
  /** What to tell the employer on Form W-4 Step 4(b): how much the federal
      deduction actually used exceeds the plain standard deduction. $0 when
      not itemizing federally. Doesn't change the solve — see required-salary.ts. */
  w4Step4bAmount: number;
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

/** OBBBA SALT cap after its MAGI phaseout — skips the phaseout math entirely
    below the threshold (the common case for this tool's users). */
export function saltCapAfterPhaseout(magi: number, constants: TaxYearConstants): number {
  const { cap, phaseoutStartMagi, phaseoutRate, floor } = constants.federal.salt;
  if (magi <= phaseoutStartMagi) return cap;
  return Math.max(floor, cap - (magi - phaseoutStartMagi) * phaseoutRate);
}

interface ItemizedResult {
  total: number;
  charitableAboveFloor: number;
  medicalAboveFloor: number;
}

/** Federal itemized total: SALT (state/local income tax + property tax,
    capped and phased out) + mortgage interest + charitable above the OBBBA
    0.5%-of-AGI floor (and under the 60%-of-AGI ceiling) + medical above the
    7.5%-of-AGI floor. Misc. itemized deductions (unreimbursed job expenses,
    tax prep fees) stay suspended and are left out of the model entirely. */
function calculateFederalItemized(
  inputs: RequiredSalaryInputs,
  approxAGI: number,
  stateIncomeTaxPaid: number,
  constants: TaxYearConstants,
): ItemizedResult & { saltEligibleBeforeCap: number; saltCapApplied: boolean } {
  const propertyTax = Math.max(0, inputs.propertyTaxAnnual ?? 0);
  const mortgageInterest = Math.max(0, inputs.mortgageInterestAnnual ?? 0);
  const charitable = Math.max(0, inputs.charitableContributionsAnnual ?? 0);
  const medical = Math.max(0, inputs.medicalExpensesAnnual ?? 0);

  const saltEligibleBeforeCap = propertyTax + Math.max(0, stateIncomeTaxPaid);
  const saltCap = saltCapAfterPhaseout(approxAGI, constants);
  const saltEligible = Math.min(saltEligibleBeforeCap, saltCap);

  const charitableEligible = Math.min(charitable, Math.max(0, constants.itemized.charitableAgiCeilingPct * approxAGI));
  const charitableAboveFloor = Math.max(0, charitableEligible - constants.itemized.charitableFloorPct * approxAGI);
  const medicalAboveFloor = Math.max(0, medical - constants.itemized.medicalFloorPct * approxAGI);

  return {
    total: saltEligible + mortgageInterest + charitableAboveFloor + medicalAboveFloor,
    charitableAboveFloor,
    medicalAboveFloor,
    saltEligibleBeforeCap,
    saltCapApplied: saltEligibleBeforeCap > saltCap + 1e-9,
  };
}

/** NY itemized total (IT-196): unlike the federal side, NY disallows
    deducting state/local INCOME tax from its own return, and applies no
    SALT cap at all — property tax is deductible in full. NY largely
    conforms to the federal charitable/medical floors and ceiling. */
function calculateNYItemized(inputs: RequiredSalaryInputs, approxAGI: number, constants: TaxYearConstants): ItemizedResult {
  const propertyTax = Math.max(0, inputs.propertyTaxAnnual ?? 0);
  const mortgageInterest = Math.max(0, inputs.mortgageInterestAnnual ?? 0);
  const charitable = Math.max(0, inputs.charitableContributionsAnnual ?? 0);
  const medical = Math.max(0, inputs.medicalExpensesAnnual ?? 0);

  const charitableEligible = Math.min(charitable, Math.max(0, constants.itemized.charitableAgiCeilingPct * approxAGI));
  const charitableAboveFloor = Math.max(0, charitableEligible - constants.itemized.charitableFloorPct * approxAGI);
  const medicalAboveFloor = Math.max(0, medical - constants.itemized.medicalFloorPct * approxAGI);

  return {
    total: propertyTax + mortgageInterest + charitableAboveFloor + medicalAboveFloor,
    charitableAboveFloor,
    medicalAboveFloor,
  };
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

  // ---- Itemized vs. standard deduction ----
  // Rough AGI stand-in good enough for the SALT phaseout and the charitable/
  // medical floors — doesn't need to be IRS-exact. Computed before either
  // return's taxable income so it doesn't depend on which deduction wins.
  const approxAGI = Math.max(0, g - incomeTaxDeduction - cafeteria125Total);
  const itemizeChoice = inputs.itemizeChoice ?? 'auto';

  // NY side first: NY's own itemized total doesn't depend on NY state tax
  // paid (NY disallows deducting its own income tax), so there's no
  // circularity computing it before stateTax below.
  const nyItemizedResult = calculateNYItemized(inputs, approxAGI, constants);
  const nyStandardDeduction = constants.nyState.standardDeduction[status];
  const nyItemized = itemizeChoice === 'itemize' || (itemizeChoice === 'auto' && nyItemizedResult.total > nyStandardDeduction);
  const nyDeductionUsed = itemizeChoice === 'standard' ? nyStandardDeduction : (nyItemized ? nyItemizedResult.total : nyStandardDeduction);

  // NYC residents only: NY State tax plus the NYC resident local surcharge always apply.
  const stateTaxable = Math.max(0, g - incomeTaxDeduction - cafeteria125Total - nyDeductionUsed);
  const stateTax = applyBrackets(stateTaxable, constants.nyState.brackets[status]);
  const localTax = applyBrackets(stateTaxable, constants.nycLocal.brackets[status]);

  // Federal side: SALT includes the NY state income tax just computed above
  // (pre-filled from the tool's own state-tax calculation, not a separate
  // user input) plus property tax, capped and phased out by MAGI.
  const federalItemizedResult = calculateFederalItemized(inputs, approxAGI, stateTax, constants);
  const federalStandardDeduction = constants.federal.standardDeduction[status];
  const fedItemized = itemizeChoice === 'itemize' || (itemizeChoice === 'auto' && federalItemizedResult.total > federalStandardDeduction);
  const fedDeductionUsed = itemizeChoice === 'standard' ? federalStandardDeduction : (fedItemized ? federalItemizedResult.total : federalStandardDeduction);

  // OBBBA above-the-line charitable deduction — only when NOT itemizing federally.
  const nonItemizerCharitableDeduction = fedItemized
    ? 0
    : Math.min(Math.max(0, inputs.charitableContributionsAnnual ?? 0), constants.federal.nonItemizerCharitableCap[status]);

  const w4Step4bAmount = Math.max(0, fedDeductionUsed - federalStandardDeduction);

  // ---- Income tax ----
  const fedTaxable = Math.max(0, g - incomeTaxDeduction - cafeteria125Total - fedDeductionUsed - nonItemizerCharitableDeduction);
  const federalTax = applyBrackets(fedTaxable, constants.federal.brackets[status]);

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
    fedItemized,
    nyItemized,
    federalItemizedTotal: federalItemizedResult.total,
    nyItemizedTotal: nyItemizedResult.total,
    fedDeductionUsed,
    nyDeductionUsed,
    saltEligibleBeforeCap: federalItemizedResult.saltEligibleBeforeCap,
    saltCapApplied: federalItemizedResult.saltCapApplied,
    nonItemizerCharitableDeduction,
    w4Step4bAmount,
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
