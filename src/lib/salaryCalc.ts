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
  /** 0-100. */
  k401PercentOfGross: number;
  k401IsTraditional: boolean;
  /** Informational only — does NOT reduce required salary. 0-100. */
  employerMatchPercentOfGross?: number;
  /** Informational only — optional dollar cap on the employer match. */
  employerMatchCapDollars?: number;
  hsaCoverage: HsaCoverage;
  /** Requested annual HSA dollar contribution (already resolved from "max" by the caller). */
  hsaContribution: number;
  age50Plus: boolean;
}

export interface PaycheckBreakdown {
  gross: number;
  k401Contribution: number;
  k401Clamped: boolean;
  hsaContribution: number;
  hsaClamped: boolean;
  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  fica: number;
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

/** Full payslip-style breakdown of a given gross salary under the supplied inputs. */
export function computeBreakdown(gross: number, inputs: RequiredSalaryInputs, constants: TaxYearConstants): PaycheckBreakdown {
  const status = inputs.filingStatus;
  const g = Math.max(0, gross);

  const k401Cap = getK401Cap(inputs.age50Plus, constants);
  const requestedK401 = g * (inputs.k401PercentOfGross / 100);
  const k401Contribution = Math.min(requestedK401, k401Cap);
  const k401Clamped = requestedK401 > k401Cap + 1e-9;

  const hsaCap = getHsaCap(inputs.hsaCoverage, inputs.age50Plus, constants);
  const requestedHsa = inputs.hsaCoverage === 'none' ? 0 : Math.max(0, inputs.hsaContribution);
  const hsaContribution = Math.min(requestedHsa, hsaCap);
  const hsaClamped = requestedHsa > hsaCap + 1e-9;

  // HSA is exempt from FICA wages too; 401(k) (Traditional or Roth) is NOT.
  const ficaWages = Math.max(0, g - hsaContribution);
  const socialSecurity = Math.min(ficaWages, constants.fica.socialSecurityWageBase) * constants.fica.socialSecurityRate;
  const medicare = ficaWages * constants.fica.medicareRate;
  const additionalMedicareThreshold = constants.fica.additionalMedicareThreshold[status];
  const additionalMedicare = Math.max(0, ficaWages - additionalMedicareThreshold) * constants.fica.additionalMedicareRate;
  const fica = socialSecurity + medicare + additionalMedicare;

  // Traditional 401(k) reduces taxable income; Roth does not. HSA reduces both, always.
  const incomeTaxDeduction = inputs.k401IsTraditional ? k401Contribution : 0;

  const fedTaxable = Math.max(0, g - incomeTaxDeduction - hsaContribution - constants.federal.standardDeduction[status]);
  const federalTax = applyBrackets(fedTaxable, constants.federal.brackets[status]);

  // NYC residents only: NY State tax plus the NYC resident local surcharge always apply.
  const stateTaxable = Math.max(0, g - incomeTaxDeduction - hsaContribution - constants.nyState.standardDeduction[status]);
  const stateTax = applyBrackets(stateTaxable, constants.nyState.brackets[status]);
  const localTax = applyBrackets(stateTaxable, constants.nycLocal.brackets[status]);

  const netTakeHome = g - k401Contribution - hsaContribution - federalTax - stateTax - localTax - fica;

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
    federalTax,
    stateTax,
    localTax,
    socialSecurity,
    medicare,
    additionalMedicare,
    fica,
    netTakeHome,
    employerMatchDollars,
  };
}

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
    can see the marginal cost of saving more. */
export function computeSensitivityTable(
  monthlyExpenses: number,
  monthlySavingsGoal: number,
  inputs: RequiredSalaryInputs,
  constants: TaxYearConstants,
  deltasPct: number[] = [-10, -5, 0, 5, 10],
): SensitivityRow[] {
  return deltasPct.map((deltaPct) => {
    const adjustedSavingsGoal = monthlySavingsGoal * (1 + deltaPct / 100);
    const annualNetNeeded = (monthlyExpenses + adjustedSavingsGoal) * 12;
    const requiredAnnualSalary = solveRequiredSalary(annualNetNeeded, inputs, constants);
    return {
      deltaPct,
      monthlySavingsGoal: adjustedSavingsGoal,
      annualNetNeeded,
      requiredAnnualSalary,
      requiredMonthlySalary: requiredAnnualSalary / 12,
    };
  });
}
