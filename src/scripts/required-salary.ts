import { wireShareButton } from '../lib/share';
import { fmtMoney } from '../lib/format';
import {
  computeBreakdown,
  solveRequiredSalary,
  computeSensitivityTable,
  getK401Cap,
  getHsaCap,
} from '../lib/salaryCalc';
import type { RequiredSalaryInputs, HsaCoverage } from '../lib/salaryCalc';
import { TAX_CONSTANTS_2026 } from '../lib/salaryTaxConstants2026';
import type { FilingStatus } from '../lib/salaryTaxConstants2026';

/* ============================================================
   Required Salary Calculator — DOM wiring.
   ============================================================
   Pure math lives in ../lib/salaryCalc.ts + ../lib/salaryTaxConstants2026.ts;
   this file only reads the form, resolves "contribute the max" into a
   concrete dollar figure, calls the solver, and renders the result.

   Standalone localStorage key (not the shared profile) — this tool's
   inputs (monthly expenses, savings goal, filing status, contribution
   elections) don't overlap with the annualIncome/otherDebts/accounts
   shape the other calculators share, so there's nothing meaningful to
   read from or write back to nyc_shared_profile.
   ============================================================ */

const LS_KEY = 'nyc_required_salary_inputs';
const CONSTANTS = TAX_CONSTANTS_2026;

interface FormInputs {
  monthlyExpenses: number;
  monthlySavingsGoal: number;
  filingStatus: FilingStatus;
  k401PercentOfGross: number;
  k401IsTraditional: boolean;
  employerMatchPercentOfGross: number;
  employerMatchCapDollars: number | null;
  hsaCoverage: HsaCoverage;
  hsaContribution: number;
  hsaUseMax: boolean;
  age50Plus: boolean;
}

const DEFAULTS: FormInputs = {
  monthlyExpenses: 5000,
  monthlySavingsGoal: 1000,
  filingStatus: 'single',
  k401PercentOfGross: 5,
  k401IsTraditional: true,
  employerMatchPercentOfGross: 0,
  employerMatchCapDollars: null,
  hsaCoverage: 'none',
  hsaContribution: 0,
  hsaUseMax: false,
  age50Plus: false,
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
  return {
    filingStatus: inputs.filingStatus,
    k401PercentOfGross: inputs.k401PercentOfGross,
    k401IsTraditional: inputs.k401IsTraditional,
    employerMatchPercentOfGross: inputs.employerMatchPercentOfGross,
    employerMatchCapDollars: inputs.employerMatchCapDollars ?? undefined,
    hsaCoverage: inputs.hsaCoverage,
    hsaContribution,
    age50Plus: inputs.age50Plus,
  };
}

function syncFields() {
  $input('rs-expenses')!.value = String(inputs.monthlyExpenses);
  $input('rs-savings-goal')!.value = String(inputs.monthlySavingsGoal);
  $select('rs-filing-status')!.value = inputs.filingStatus;
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
}

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  marriedFilingJointly: 'Married Filing Jointly',
  headOfHousehold: 'Head of Household',
};

function render() {
  const calcInputs = toCalcInputs();
  const annualNetNeeded = (inputs.monthlyExpenses + inputs.monthlySavingsGoal) * 12;
  const requiredAnnual = solveRequiredSalary(annualNetNeeded, calcInputs, CONSTANTS);
  const breakdown = computeBreakdown(requiredAnnual, calcInputs, CONSTANTS);

  setText('rs-required-annual', fmtMoney(requiredAnnual) + '/yr');
  setText('rs-required-monthly', fmtMonthly(requiredAnnual / 12));

  const rows: [string, number][] = [
    ['rs-bd-gross', breakdown.gross],
    ['rs-bd-401k', -breakdown.k401Contribution],
    ['rs-bd-hsa', -breakdown.hsaContribution],
    ['rs-bd-fed', -breakdown.federalTax],
    ['rs-bd-state', -breakdown.stateTax],
    ['rs-bd-local', -breakdown.localTax],
    ['rs-bd-fica', -breakdown.fica],
    ['rs-bd-net', breakdown.netTakeHome],
    ['rs-bd-spend', -annualNetNeeded],
    ['rs-bd-leftover', breakdown.netTakeHome - annualNetNeeded],
  ];
  for (const [id, annual] of rows) {
    setText(id, fmtSigned(annual));
    setText(id + '-mo', fmtSigned(annual / 12));
  }

  // Clamp warnings
  const k401Warn = $('rs-401k-warn')!;
  if (breakdown.k401Clamped) {
    k401Warn.textContent = `Your 401(k) % would exceed the ${inputs.age50Plus ? 'age 50+ ' : ''}annual dollar cap of ${fmtMoney(getK401Cap(inputs.age50Plus, CONSTANTS))} at this salary — contribution capped at that dollar amount instead.`;
    k401Warn.hidden = false;
    k401Warn.classList.add('warn');
  } else {
    k401Warn.hidden = true;
    k401Warn.classList.remove('warn');
  }

  const hsaCap = getHsaCap(inputs.hsaCoverage, inputs.age50Plus, CONSTANTS);
  setText('rs-hsa-max-hint', inputs.hsaCoverage === 'none' ? '' : ` (up to ${fmtMoney(hsaCap)})`);

  const hsaWarn = $('rs-hsa-warn')!;
  if (breakdown.hsaClamped) {
    hsaWarn.textContent = `Your HSA contribution was capped at ${fmtMoney(hsaCap)}, the ${inputs.hsaCoverage === 'family' ? 'family' : 'self-only'} coverage limit${inputs.age50Plus ? ' (including the 55+ catch-up)' : ''}.`;
    hsaWarn.hidden = false;
    hsaWarn.classList.add('warn');
  } else {
    hsaWarn.hidden = true;
    hsaWarn.classList.remove('warn');
  }

  // Sensitivity table
  const sensitivityRows = computeSensitivityTable(inputs.monthlyExpenses, inputs.monthlySavingsGoal, calcInputs, CONSTANTS);
  const tbody = $('rs-sensitivity-body')!;
  tbody.innerHTML = '';
  for (const row of sensitivityRows) {
    const tr = document.createElement('tr');
    if (row.deltaPct === 0) tr.className = 'row-total';
    const label = row.deltaPct === 0 ? 'Your goal' : `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`;
    tr.innerHTML = `<td>${label}</td><td>${fmtMonthly(row.monthlySavingsGoal)}</td><td>${fmtMoney(row.requiredAnnualSalary)}/yr</td>`;
    tbody.appendChild(tr);
  }

  // Assumptions panel
  const assumptions: [string, string][] = [
    ['Tax year', String(CONSTANTS.year)],
    ['Filing status', FILING_STATUS_LABELS[inputs.filingStatus]],
    ['Tax jurisdiction', 'NYC resident'],
  ];
  assumptions.push(
    ['401(k) contribution', `${inputs.k401PercentOfGross}% of gross, ${inputs.k401IsTraditional ? 'Traditional' : 'Roth'}`],
    ['401(k) annual cap used', fmtMoney(getK401Cap(inputs.age50Plus, CONSTANTS)) + (inputs.age50Plus ? ' (incl. 50+ catch-up)' : '')],
  );
  if (inputs.employerMatchPercentOfGross > 0) {
    assumptions.push(['Employer match (informational)', `${inputs.employerMatchPercentOfGross}% of gross${inputs.employerMatchCapDollars != null ? `, capped at ${fmtMoney(inputs.employerMatchCapDollars)}` : ''} = ${fmtMoney(breakdown.employerMatchDollars)}`]);
  }
  assumptions.push(['HSA enrollment', inputs.hsaCoverage === 'none' ? 'None' : inputs.hsaCoverage === 'family' ? 'Family' : 'Self-only']);
  if (inputs.hsaCoverage !== 'none') {
    assumptions.push(['HSA annual cap used', fmtMoney(hsaCap) + (inputs.age50Plus ? ' (incl. 55+ catch-up)' : '')]);
  }
  assumptions.push(['Age 50+ catch-up', inputs.age50Plus ? 'Yes' : 'No']);
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
