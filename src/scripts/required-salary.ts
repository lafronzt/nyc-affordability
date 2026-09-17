import { wireShareButton } from '../lib/share';
import { fmtMoney } from '../lib/format';
import {
  computeBreakdown,
  solveRequiredSalary,
  computeSensitivityTable,
  getK401Cap,
  getHsaCap,
  getCommuterCap,
  getDependentCareFsaCap,
} from '../lib/salaryCalc';
import type { RequiredSalaryInputs, HsaCoverage } from '../lib/salaryCalc';
import { TAX_CONSTANTS_2026 } from '../lib/salaryTaxConstants2026';
import type { FilingStatus } from '../lib/salaryTaxConstants2026';

/* ============================================================
   Required Salary Calculator — DOM wiring.
   ============================================================
   Pure math lives in ../lib/salaryCalc.ts + ../lib/salaryTaxConstants2026.ts;
   this file only reads the form, resolves "use max" toggles into concrete
   dollar figures, calls the solver, and renders the result.

   Standalone localStorage key (not the shared profile) — this tool's
   inputs (monthly expenses, savings goal, filing status, contribution
   elections) don't overlap with the annualIncome/otherDebts/accounts
   shape the other calculators share, so there's nothing meaningful to
   read from or write back to nyc_shared_profile.

   retirementPlanType is UI-label-only — it never reaches RequiredSalaryInputs.
   401(k)/403(b)/457(b)/pension all get identical tax treatment in the calc
   engine (see salaryCalc.ts's RequiredSalaryInputs.k401PercentOfGross doc
   comment); this field only changes what the form/table call it.
   ============================================================ */

const LS_KEY = 'nyc_required_salary_inputs';
const CONSTANTS = TAX_CONSTANTS_2026;

type RetirementPlanType = 'k401' | 'k403b' | 'k457b' | 'pension';

interface FormInputs {
  monthlyExpenses: number;
  monthlySavingsGoal: number;
  filingStatus: FilingStatus;
  retirementPlanType: RetirementPlanType;
  k401PercentOfGross: number;
  k401IsTraditional: boolean;
  employerMatchPercentOfGross: number;
  employerMatchCapDollars: number | null;
  hsaCoverage: HsaCoverage;
  hsaContribution: number;
  hsaUseMax: boolean;
  age50Plus: boolean;

  healthPremiumMonthly: number;
  dentalVisionPremiumMonthly: number;
  commuterTransitMonthly: number;
  commuterTransitUseMax: boolean;
  commuterParkingMonthly: number;
  commuterParkingUseMax: boolean;
  healthcareFsaAnnual: number;
  healthcareFsaUseMax: boolean;
  dependentCareFsaAnnual: number;
  dependentCareFsaUseMax: boolean;

  lifeInsuranceMonthly: number;
  disabilityInsuranceMonthly: number;
  unionDuesMonthly: number;
}

const DEFAULTS: FormInputs = {
  monthlyExpenses: 5000,
  monthlySavingsGoal: 1000,
  filingStatus: 'single',
  retirementPlanType: 'k401',
  k401PercentOfGross: 5,
  k401IsTraditional: true,
  employerMatchPercentOfGross: 0,
  employerMatchCapDollars: null,
  hsaCoverage: 'none',
  hsaContribution: 0,
  hsaUseMax: false,
  age50Plus: false,

  healthPremiumMonthly: 0,
  dentalVisionPremiumMonthly: 0,
  commuterTransitMonthly: 0,
  commuterTransitUseMax: false,
  commuterParkingMonthly: 0,
  commuterParkingUseMax: false,
  healthcareFsaAnnual: 0,
  healthcareFsaUseMax: false,
  dependentCareFsaAnnual: 0,
  dependentCareFsaUseMax: false,

  lifeInsuranceMonthly: 0,
  disabilityInsuranceMonthly: 0,
  unionDuesMonthly: 0,
};

const RETIREMENT_PLAN_LABELS: Record<RetirementPlanType, string> = {
  k401: '401(k)',
  k403b: '403(b)',
  k457b: '457(b)',
  pension: 'Pension',
};

/* ── DOM helpers ── */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }
function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0; }
function setText(id: string, value: string) { const el = $(id); if (el) el.textContent = value; }
function fmtMonthly(n: number): string { return fmtMoney(n) + '/mo'; }
/** fmtMoney puts the minus sign after the "$" for negatives (and can render "-0" as
    "$-0"); the breakdown table wants conventional "-$X" signed amounts instead. */
function fmtSigned(n: number): string {
  if (Math.abs(n) < 0.5) return fmtMoney(0);
  return n < 0 ? '-' + fmtMoney(-n) : fmtMoney(n);
}

let inputs: FormInputs = { ...DEFAULTS };
let hasSaved = false;

function loadInputs(): FormInputs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { hasSaved = true; return { ...DEFAULTS, ...JSON.parse(raw) }; }
  } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}

function isSaveEnabled(): boolean {
  const el = $input('save-toggle-cb');
  return !!(el && el.checked);
}

function persist() {
  if (!isSaveEnabled()) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(inputs));
    hasSaved = true;
  } catch (e) { /* ignore — best-effort persistence only */ }
}

function toCalcInputs(): RequiredSalaryInputs {
  const hsaCap = getHsaCap(inputs.hsaCoverage, inputs.age50Plus, CONSTANTS);
  const hsaContribution = inputs.hsaCoverage === 'none'
    ? 0
    : inputs.hsaUseMax
      ? hsaCap
      : inputs.hsaContribution;

  const commuterTransitMonthly = inputs.commuterTransitUseMax ? CONSTANTS.commuterBenefit.transitMonthly : inputs.commuterTransitMonthly;
  const commuterParkingMonthly = inputs.commuterParkingUseMax ? CONSTANTS.commuterBenefit.parkingMonthly : inputs.commuterParkingMonthly;
  const healthcareFsaAnnual = inputs.hsaCoverage !== 'none'
    ? 0
    : inputs.healthcareFsaUseMax ? CONSTANTS.fsa.healthcareAnnual : inputs.healthcareFsaAnnual;
  const dependentCareFsaAnnual = inputs.dependentCareFsaUseMax ? CONSTANTS.fsa.dependentCareAnnual : inputs.dependentCareFsaAnnual;

  return {
    filingStatus: inputs.filingStatus,
    k401PercentOfGross: inputs.k401PercentOfGross,
    k401IsTraditional: inputs.k401IsTraditional,
    employerMatchPercentOfGross: inputs.employerMatchPercentOfGross,
    employerMatchCapDollars: inputs.employerMatchCapDollars ?? undefined,
    hsaCoverage: inputs.hsaCoverage,
    hsaContribution,
    age50Plus: inputs.age50Plus,
    healthPremiumMonthly: inputs.healthPremiumMonthly,
    dentalVisionPremiumMonthly: inputs.dentalVisionPremiumMonthly,
    commuterTransitMonthly,
    commuterParkingMonthly,
    healthcareFsaAnnual,
    dependentCareFsaAnnual,
    lifeInsuranceMonthly: inputs.lifeInsuranceMonthly,
    disabilityInsuranceMonthly: inputs.disabilityInsuranceMonthly,
    unionDuesMonthly: inputs.unionDuesMonthly,
  };
}

function syncFields() {
  $input('rs-expenses')!.value = String(inputs.monthlyExpenses);
  $input('rs-savings-goal')!.value = String(inputs.monthlySavingsGoal);
  $select('rs-filing-status')!.value = inputs.filingStatus;

  $select('rs-retirement-type')!.value = inputs.retirementPlanType;
  const planLabel = RETIREMENT_PLAN_LABELS[inputs.retirementPlanType];
  setText('rs-401k-pct-label', `${planLabel} contribution`);
  setText('rs-match-plan-label', planLabel);
  $input('rs-401k-pct')!.value = String(inputs.k401PercentOfGross);
  $select('rs-401k-type')!.value = inputs.k401IsTraditional ? 'traditional' : 'roth';
  $input('rs-age50')!.checked = inputs.age50Plus;
  $input('rs-match-pct')!.value = String(inputs.employerMatchPercentOfGross);
  $input('rs-match-cap')!.value = inputs.employerMatchCapDollars != null ? String(inputs.employerMatchCapDollars) : '';

  $select('rs-hsa-coverage')!.value = inputs.hsaCoverage;
  $input('rs-hsa-amount')!.value = String(inputs.hsaContribution);
  $input('rs-hsa-max')!.checked = inputs.hsaUseMax;
  $input('rs-hsa-amount')!.disabled = inputs.hsaCoverage === 'none' || inputs.hsaUseMax;
  $input('rs-hsa-max')!.disabled = inputs.hsaCoverage === 'none';

  $input('rs-health-premium')!.value = String(inputs.healthPremiumMonthly);
  $input('rs-dental-vision-premium')!.value = String(inputs.dentalVisionPremiumMonthly);

  $input('rs-commuter-transit')!.value = String(inputs.commuterTransitMonthly);
  $input('rs-commuter-transit-max')!.checked = inputs.commuterTransitUseMax;
  $input('rs-commuter-transit')!.disabled = inputs.commuterTransitUseMax;
  $input('rs-commuter-parking')!.value = String(inputs.commuterParkingMonthly);
  $input('rs-commuter-parking-max')!.checked = inputs.commuterParkingUseMax;
  $input('rs-commuter-parking')!.disabled = inputs.commuterParkingUseMax;

  const hsaEnrolled = inputs.hsaCoverage !== 'none';
  $input('rs-healthcare-fsa')!.value = String(inputs.healthcareFsaAnnual);
  $input('rs-healthcare-fsa-max')!.checked = inputs.healthcareFsaUseMax;
  $input('rs-healthcare-fsa')!.disabled = hsaEnrolled || inputs.healthcareFsaUseMax;
  $input('rs-healthcare-fsa-max')!.disabled = hsaEnrolled;
  $('rs-healthcare-fsa-hsa-note')!.hidden = !hsaEnrolled;

  $input('rs-dependent-care-fsa')!.value = String(inputs.dependentCareFsaAnnual);
  $input('rs-dependent-care-fsa-max')!.checked = inputs.dependentCareFsaUseMax;
  $input('rs-dependent-care-fsa')!.disabled = inputs.dependentCareFsaUseMax;

  $input('rs-life-insurance')!.value = String(inputs.lifeInsuranceMonthly);
  $input('rs-disability-insurance')!.value = String(inputs.disabilityInsuranceMonthly);
  $input('rs-union-dues')!.value = String(inputs.unionDuesMonthly);
}

/** Shows a "N active" badge on the collapsed "Other paycheck deductions" summary
    so a user who entered values and collapsed the section can still tell at a
    glance that something's in there, without re-expanding it. */
function updateActiveDeductionsCount() {
  // A "use max" toggle counts as active even while its raw stored amount is
  // still $0 — the resolved calc input (via toCalcInputs()) is the IRS cap, not $0.
  const activeCount = [
    inputs.healthPremiumMonthly > 0,
    inputs.dentalVisionPremiumMonthly > 0,
    inputs.commuterTransitMonthly > 0 || inputs.commuterTransitUseMax,
    inputs.commuterParkingMonthly > 0 || inputs.commuterParkingUseMax,
    inputs.healthcareFsaAnnual > 0 || inputs.healthcareFsaUseMax,
    inputs.dependentCareFsaAnnual > 0 || inputs.dependentCareFsaUseMax,
    inputs.lifeInsuranceMonthly > 0,
    inputs.disabilityInsuranceMonthly > 0,
    inputs.unionDuesMonthly > 0,
  ].filter(Boolean).length;
  const badge = $('rs-other-deductions-count')!;
  if (activeCount > 0) {
    badge.textContent = `${activeCount} active`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  marriedFilingJointly: 'Married Filing Jointly',
  headOfHousehold: 'Head of Household',
};

/** Appends a breakdown-table row. Rows with skipIfZero=true are omitted entirely
    (not shown as $0) when their annual amount rounds to zero — keeps the table
    from cluttering up with deductions nobody entered. */
function addBreakdownRow(
  tbody: HTMLElement,
  label: string,
  annual: number,
  opts: { total?: boolean; skipIfZero?: boolean; ariaLive?: boolean } = {},
) {
  if (opts.skipIfZero && Math.abs(annual) < 0.5) return;
  const tr = document.createElement('tr');
  if (opts.total) tr.className = 'row-total';
  const live = opts.ariaLive ? ' aria-live="polite"' : '';
  tr.innerHTML = `<td>${label}</td><td${live}>${fmtSigned(annual)}</td><td${live}>${fmtSigned(annual / 12)}</td>`;
  tbody.appendChild(tr);
}

function render() {
  const calcInputs = toCalcInputs();
  const annualNetNeeded = (inputs.monthlyExpenses + inputs.monthlySavingsGoal) * 12;
  const requiredAnnual = solveRequiredSalary(annualNetNeeded, calcInputs, CONSTANTS);
  const breakdown = computeBreakdown(requiredAnnual, calcInputs, CONSTANTS);

  setText('rs-required-annual', fmtMoney(requiredAnnual) + '/yr');
  setText('rs-required-monthly', fmtMonthly(requiredAnnual / 12));
  updateActiveDeductionsCount();

  // Breakdown table — built dynamically so zero-value optional deductions can be
  // skipped instead of cluttering the table with rows nobody entered.
  const planLabel = RETIREMENT_PLAN_LABELS[inputs.retirementPlanType];
  const tbody = $('rs-breakdown-body')!;
  tbody.innerHTML = '';
  addBreakdownRow(tbody, 'Gross salary', breakdown.gross);
  addBreakdownRow(tbody, `${planLabel} contribution`, -breakdown.k401Contribution);
  addBreakdownRow(tbody, 'HSA contribution', -breakdown.hsaContribution);
  addBreakdownRow(tbody, 'Health insurance premium', -breakdown.healthPremium, { skipIfZero: true });
  addBreakdownRow(tbody, 'Dental / vision premium', -breakdown.dentalVisionPremium, { skipIfZero: true });
  addBreakdownRow(tbody, 'Commuter benefit — transit', -breakdown.commuterTransit, { skipIfZero: true });
  addBreakdownRow(tbody, 'Commuter benefit — parking', -breakdown.commuterParking, { skipIfZero: true });
  addBreakdownRow(tbody, 'Healthcare FSA', -breakdown.healthcareFsa, { skipIfZero: true });
  addBreakdownRow(tbody, 'Dependent Care FSA', -breakdown.dependentCareFsa, { skipIfZero: true });
  addBreakdownRow(tbody, 'Federal income tax', -breakdown.federalTax);
  addBreakdownRow(tbody, 'State income tax', -breakdown.stateTax);
  addBreakdownRow(tbody, 'Local (NYC) tax', -breakdown.localTax);
  addBreakdownRow(tbody, 'FICA (Social Security + Medicare)', -breakdown.fica);
  addBreakdownRow(tbody, 'NY Paid Family Leave (PFL)', -breakdown.nyPFL);
  addBreakdownRow(tbody, 'NY State Disability Insurance (SDI)', -breakdown.nySDI);
  addBreakdownRow(tbody, 'Life insurance', -breakdown.lifeInsurance, { skipIfZero: true });
  addBreakdownRow(tbody, 'Disability insurance', -breakdown.disabilityInsurance, { skipIfZero: true });
  addBreakdownRow(tbody, 'Union dues', -breakdown.unionDues, { skipIfZero: true });
  addBreakdownRow(tbody, 'Net take-home', breakdown.netTakeHome, { total: true, ariaLive: true });
  addBreakdownRow(tbody, 'Your expenses + savings goal', -annualNetNeeded);
  addBreakdownRow(tbody, 'Leftover', breakdown.netTakeHome - annualNetNeeded, { ariaLive: true });

  // Clamp warnings
  const k401Warn = $('rs-401k-warn')!;
  if (breakdown.k401Clamped) {
    k401Warn.textContent = `Your ${planLabel} % would exceed the ${inputs.age50Plus ? 'age 50+ ' : ''}annual dollar cap of ${fmtMoney(getK401Cap(inputs.age50Plus, CONSTANTS))} at this salary — contribution capped at that dollar amount instead.`;
    k401Warn.hidden = false;
    k401Warn.classList.add('warn');
  } else {
    k401Warn.hidden = true;
    k401Warn.classList.remove('warn');
  }

  const hsaCap = getHsaCap(inputs.hsaCoverage, inputs.age50Plus, CONSTANTS);
  setText('rs-hsa-max-hint', inputs.hsaCoverage === 'none' ? '' : `up to ${fmtMoney(hsaCap)}`);

  const hsaWarn = $('rs-hsa-warn')!;
  if (breakdown.hsaClamped) {
    hsaWarn.textContent = `Your HSA contribution was capped at ${fmtMoney(hsaCap)}, the ${inputs.hsaCoverage === 'family' ? 'family' : 'self-only'} coverage limit${inputs.age50Plus ? ' (including the 55+ catch-up)' : ''}.`;
    hsaWarn.hidden = false;
    hsaWarn.classList.add('warn');
  } else {
    hsaWarn.hidden = true;
    hsaWarn.classList.remove('warn');
  }

  // Other-deductions clamp warnings, consolidated into one line
  const deductionWarnings: string[] = [];
  if (breakdown.commuterTransitClamped) {
    deductionWarnings.push(`Transit capped at ${fmtMoney(getCommuterCap('transit', CONSTANTS))}/yr.`);
  }
  if (breakdown.commuterParkingClamped) {
    deductionWarnings.push(`Parking capped at ${fmtMoney(getCommuterCap('parking', CONSTANTS))}/yr.`);
  }
  if (breakdown.dependentCareFsaClamped) {
    deductionWarnings.push(`Dependent Care FSA capped at ${fmtMoney(getDependentCareFsaCap(CONSTANTS))}/yr.`);
  }
  const deductionsWarn = $('rs-deductions-warn')!;
  if (deductionWarnings.length) {
    deductionsWarn.textContent = deductionWarnings.join(' ');
    deductionsWarn.hidden = false;
    deductionsWarn.classList.add('warn');
  } else {
    deductionsWarn.hidden = true;
    deductionsWarn.classList.remove('warn');
  }

  // Sensitivity table
  const sensitivityRows = computeSensitivityTable(inputs.monthlyExpenses, inputs.monthlySavingsGoal, calcInputs, CONSTANTS);
  const sensitivityBody = $('rs-sensitivity-body')!;
  sensitivityBody.innerHTML = '';
  for (const row of sensitivityRows) {
    const tr = document.createElement('tr');
    if (row.deltaPct === 0) tr.className = 'row-total';
    const label = row.deltaPct === 0 ? 'Your goal' : `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`;
    tr.innerHTML = `<td>${label}</td><td>${fmtMonthly(row.monthlySavingsGoal)}</td><td>${fmtMoney(row.requiredAnnualSalary)}/yr</td>`;
    sensitivityBody.appendChild(tr);
  }

  // Assumptions panel
  const assumptions: [string, string][] = [
    ['Tax year', String(CONSTANTS.year)],
    ['Filing status', FILING_STATUS_LABELS[inputs.filingStatus]],
    ['Tax jurisdiction', 'NYC resident'],
  ];
  assumptions.push(
    [`${planLabel} contribution`, `${inputs.k401PercentOfGross}% of gross, ${inputs.k401IsTraditional ? 'Traditional' : 'Roth'}`],
    [`${planLabel} annual cap used`, fmtMoney(getK401Cap(inputs.age50Plus, CONSTANTS)) + (inputs.age50Plus ? ' (incl. 50+ catch-up)' : '')],
  );
  if (inputs.employerMatchPercentOfGross > 0) {
    assumptions.push(['Employer match (informational)', `${inputs.employerMatchPercentOfGross}% of gross${inputs.employerMatchCapDollars != null ? `, capped at ${fmtMoney(inputs.employerMatchCapDollars)}` : ''} = ${fmtMoney(breakdown.employerMatchDollars)}`]);
  }
  assumptions.push(['HSA enrollment', inputs.hsaCoverage === 'none' ? 'None' : inputs.hsaCoverage === 'family' ? 'Family' : 'Self-only']);
  if (inputs.hsaCoverage !== 'none') {
    assumptions.push(['HSA annual cap used', fmtMoney(hsaCap) + (inputs.age50Plus ? ' (incl. 55+ catch-up)' : '')]);
  }
  assumptions.push(['Age 50+ catch-up', inputs.age50Plus ? 'Yes' : 'No']);
  assumptions.push(['NY Paid Family Leave', `${(CONSTANTS.ny.pflRate * 100).toFixed(3)}% of gross, capped at ${fmtMoney(CONSTANTS.ny.pflAnnualCap)}/yr`]);
  assumptions.push(['NY State Disability Insurance', fmtMoney(CONSTANTS.ny.sdiAnnualCap) + '/yr (fixed statutory cap)']);
  assumptions.push(['Social Security wage base', fmtMoney(CONSTANTS.fica.socialSecurityWageBase)]);

  const list = $('rs-assumptions-list')!;
  list.innerHTML = assumptions.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('');
}

function attachFieldListeners() {
  $input('rs-expenses')!.addEventListener('input', () => {
    inputs.monthlyExpenses = num($input('rs-expenses')!.value);
    persist();
    render();
  });
  $input('rs-savings-goal')!.addEventListener('input', () => {
    inputs.monthlySavingsGoal = num($input('rs-savings-goal')!.value);
    persist();
    render();
  });
  $select('rs-filing-status')!.addEventListener('change', () => {
    inputs.filingStatus = $select('rs-filing-status')!.value as FilingStatus;
    persist();
    render();
  });
  $select('rs-retirement-type')!.addEventListener('change', () => {
    inputs.retirementPlanType = $select('rs-retirement-type')!.value as RetirementPlanType;
    syncFields();
    persist();
    render();
  });
  $input('rs-401k-pct')!.addEventListener('input', () => {
    inputs.k401PercentOfGross = Math.min(100, Math.max(0, num($input('rs-401k-pct')!.value)));
    persist();
    render();
  });
  $select('rs-401k-type')!.addEventListener('change', () => {
    inputs.k401IsTraditional = $select('rs-401k-type')!.value === 'traditional';
    persist();
    render();
  });
  $input('rs-age50')!.addEventListener('change', () => {
    inputs.age50Plus = $input('rs-age50')!.checked;
    persist();
    render();
  });
  $input('rs-match-pct')!.addEventListener('input', () => {
    inputs.employerMatchPercentOfGross = num($input('rs-match-pct')!.value);
    persist();
    render();
  });
  $input('rs-match-cap')!.addEventListener('input', () => {
    const raw = $input('rs-match-cap')!.value;
    inputs.employerMatchCapDollars = raw === '' ? null : num(raw);
    persist();
    render();
  });
  $select('rs-hsa-coverage')!.addEventListener('change', () => {
    inputs.hsaCoverage = $select('rs-hsa-coverage')!.value as HsaCoverage;
    if (inputs.hsaCoverage === 'none') { inputs.hsaContribution = 0; inputs.hsaUseMax = false; }
    syncFields();
    persist();
    render();
  });
  $input('rs-hsa-amount')!.addEventListener('input', () => {
    inputs.hsaContribution = num($input('rs-hsa-amount')!.value);
    persist();
    render();
  });
  $input('rs-hsa-max')!.addEventListener('change', () => {
    inputs.hsaUseMax = $input('rs-hsa-max')!.checked;
    syncFields();
    persist();
    render();
  });

  $input('rs-health-premium')!.addEventListener('input', () => {
    inputs.healthPremiumMonthly = num($input('rs-health-premium')!.value);
    persist();
    render();
  });
  $input('rs-dental-vision-premium')!.addEventListener('input', () => {
    inputs.dentalVisionPremiumMonthly = num($input('rs-dental-vision-premium')!.value);
    persist();
    render();
  });

  $input('rs-commuter-transit')!.addEventListener('input', () => {
    inputs.commuterTransitMonthly = num($input('rs-commuter-transit')!.value);
    persist();
    render();
  });
  $input('rs-commuter-transit-max')!.addEventListener('change', () => {
    inputs.commuterTransitUseMax = $input('rs-commuter-transit-max')!.checked;
    syncFields();
    persist();
    render();
  });
  $input('rs-commuter-parking')!.addEventListener('input', () => {
    inputs.commuterParkingMonthly = num($input('rs-commuter-parking')!.value);
    persist();
    render();
  });
  $input('rs-commuter-parking-max')!.addEventListener('change', () => {
    inputs.commuterParkingUseMax = $input('rs-commuter-parking-max')!.checked;
    syncFields();
    persist();
    render();
  });

  $input('rs-healthcare-fsa')!.addEventListener('input', () => {
    inputs.healthcareFsaAnnual = num($input('rs-healthcare-fsa')!.value);
    persist();
    render();
  });
  $input('rs-healthcare-fsa-max')!.addEventListener('change', () => {
    inputs.healthcareFsaUseMax = $input('rs-healthcare-fsa-max')!.checked;
    syncFields();
    persist();
    render();
  });
  $input('rs-dependent-care-fsa')!.addEventListener('input', () => {
    inputs.dependentCareFsaAnnual = num($input('rs-dependent-care-fsa')!.value);
    persist();
    render();
  });
  $input('rs-dependent-care-fsa-max')!.addEventListener('change', () => {
    inputs.dependentCareFsaUseMax = $input('rs-dependent-care-fsa-max')!.checked;
    syncFields();
    persist();
    render();
  });

  $input('rs-life-insurance')!.addEventListener('input', () => {
    inputs.lifeInsuranceMonthly = num($input('rs-life-insurance')!.value);
    persist();
    render();
  });
  $input('rs-disability-insurance')!.addEventListener('input', () => {
    inputs.disabilityInsuranceMonthly = num($input('rs-disability-insurance')!.value);
    persist();
    render();
  });
  $input('rs-union-dues')!.addEventListener('input', () => {
    inputs.unionDuesMonthly = num($input('rs-union-dues')!.value);
    persist();
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  inputs = loadInputs();
  syncFields();
  ($input('save-toggle-cb'))!.checked = hasSaved;
  render();

  wireShareButton('rs-share', () => {
    const calcInputs = toCalcInputs();
    const annualNetNeeded = (inputs.monthlyExpenses + inputs.monthlySavingsGoal) * 12;
    const requiredAnnual = solveRequiredSalary(annualNetNeeded, calcInputs, CONSTANTS);
    const text = `To take home ${fmtMoney(inputs.monthlyExpenses + inputs.monthlySavingsGoal)}/mo after tax in NYC, I'd need a gross salary of ${fmtMoney(requiredAnnual)}/yr.`;
    return { title: 'Required Salary Calculator', text, url: 'https://www.nyc-affordability.com/required-salary/' };
  });

  $input('save-toggle-cb')!.addEventListener('change', e => {
    if ((e.target as HTMLInputElement).checked) persist();
  });

  attachFieldListeners();
});
