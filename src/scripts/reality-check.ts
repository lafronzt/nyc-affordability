import { loadSharedProfile, saveSharedProfile, SHARED_KEY } from '../lib/sharedProfile';
import { amiPercent, getBandClass } from '../lib/amiTable';
import { wireShareButton } from '../lib/share';

/* ============================================================
   NYC Housing Reality Check — TypeScript port
   ============================================================
   A lighter sibling of compare.ts, not a replacement: same underlying
   rent/co-op/condo math (mirrored here, not imported — see compare.ts's
   own header for why formula duplication is this repo's convention), but
   a single "liquid savings" number instead of compare.ts's full
   multi-account editor. This page is meant as a fast triage tool, not the
   power-user dashboard.

   Storage: annualIncome/otherDebts are read from and (when Save is on)
   written to the shared profile (nyc_shared_profile), same as every other
   calculator — safe, since those are scalar fields. liquidSavings and
   householdSize are NOT written into the shared profile's `accounts`
   array, though — this page's single-number simplification would
   silently flatten a richer multi-account breakdown a user already built
   on /coop/, /condo/, or /compare/. Instead they live in their own
   page-local key, exactly like each calculator's own LS_KEY. On first
   load with no saved Reality Check inputs, liquidSavings is pre-filled
   from the shared profile's weighted accounts (read-only sum) so the
   numbers still line up, but editing and saving here never overwrites
   the shared accounts array.
   ============================================================ */

const LS_KEY = 'nyc_reality_check_inputs';
const ASMP_RENT_KEY = 'nyc_shared_assumptions_rent';
const ASMP_COOP_KEY = 'nyc_shared_assumptions_coop';
const ASMP_CONDO_KEY = 'nyc_shared_assumptions_condo';

interface Account { name: string; balance: number; liquidity: number; closing: boolean; [k: string]: unknown; }
interface Inputs { annualIncome: number; otherDebts: number; liquidSavings: number; householdSize: number; }

const DEFAULTS: Inputs = { annualIncome: 150000, otherDebts: 0, liquidSavings: 120000, householdSize: 2 };

const ASMP = {
  rent: { incomeMult: 40, rentersInsurance: 15, reserveMonths: 2 },
  coop: { mortgageRate: 6.25, dpPct: 20, maint: 1200, maxDTIPct: 28, reserveMo: 12 },
  condo: { mortgageRate: 6.30, dpPct: 20, commonCharges: 1000, propTaxes: 1250, hoInsurance: 75, maxDtiPct: 43 },
};

/* ── DOM helpers ── */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }
function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0; }
function money(n: number): string { return isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '-'; }
function monthly(n: number): string { return isFinite(n) ? money(n) + '/mo' : '-'; }
function setText(id: string, value: string) { const el = $(id); if (el) el.textContent = value; }

/* ── shared math helpers (mirrors compare.ts / rent.ts / coop.ts / condo.ts) ── */
function pmtFactor(ratePct: number, years: number): number {
  const rm = ratePct / 100 / 12;
  const n = years * 12;
  if (n <= 0) return 0;
  return rm === 0 ? 1 / n : rm / (1 - Math.pow(1 + rm, -n));
}
function calcMortgageRecordingTax(loanAmt: number): number {
  if (loanAmt <= 0) return 0;
  return loanAmt < 500000 ? loanAmt * 0.018 : loanAmt * 0.01925;
}
function calcMansionTax(price: number): number {
  if (price < 1000000) return 0;
  if (price < 2000000) return price * 0.0100;
  if (price < 3000000) return price * 0.0125;
  if (price < 5000000) return price * 0.0150;
  if (price < 10000000) return price * 0.0225;
  if (price < 15000000) return price * 0.0325;
  if (price < 20000000) return price * 0.0350;
  if (price < 25000000) return price * 0.0375;
  return price * 0.039;
}
function bsearchMaxPrice(testFn: (p: number) => boolean, hi: number): number {
  if (!testFn(0)) return 0;
  if (testFn(hi)) return hi;
  let lo = 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (testFn(mid)) lo = mid; else hi = mid;
    if (hi - lo < 1) break;
  }
  return lo;
}

function accountsFrom(savings: number): Account[] {
  return [{ name: 'Liquid savings', balance: Math.max(0, savings), liquidity: 100, closing: true }];
}
function weightedAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + a.balance * a.liquidity / 100, 0);
}
function closingAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + (a.closing ? a.balance : 0), 0);
}

interface Base { annualIncome: number; otherDebts: number; accounts: Account[]; }

function calcRent(base: Base) {
  const incomeMult = ASMP.rent.incomeMult;
  const rentersInsurance = ASMP.rent.rentersInsurance;
  const reserveMonths = ASMP.rent.reserveMonths;
  const assets = weightedAssets(base.accounts);
  const fixedMovein = 20 + 500 + 250; // app fee + building fee + utility setup (no pet fee, no broker fee assumed)
  const fixedReserve = reserveMonths * (rentersInsurance + base.otherDebts);
  const maxMovein = Math.max(0, (assets - fixedMovein) / 2); // 1 month rent + 1 month security deposit
  const maxReserve = reserveMonths > 0 ? Math.max(0, (assets - fixedReserve) / reserveMonths) : Infinity;
  const cashMax = Math.min(maxMovein, maxReserve);
  const incomeMax = base.annualIncome / incomeMult;
  const maxRent = Math.min(cashMax, incomeMax);
  const binding = cashMax <= incomeMax ? 'Cash / Move-In' : `Income (${incomeMult}× rule)`;
  let verdict: 'Comfortable' | 'Stretch' | 'Unlikely';
  if (maxRent <= 0) verdict = 'Unlikely';
  else if (binding !== 'Cash / Move-In') verdict = 'Comfortable';
  else {
    const ratio = incomeMax > 0 ? cashMax / incomeMax : 0;
    verdict = ratio < 0.5 ? 'Unlikely' : ratio < 0.85 ? 'Stretch' : 'Comfortable';
  }
  return { maxRent, binding, verdict };
}

function calcCoop(base: Base) {
  const { mortgageRate, dpPct, maint, maxDTIPct, reserveMo } = ASMP.coop;
  const avail = weightedAssets(base.accounts);
  const totLiquid = closingAssets(base.accounts);
  const moInc = base.annualIncome / 12;
  const K = pmtFactor(mortgageRate, 30);
  const dp = dpPct / 100;
  const dtiMax = maxDTIPct / 100;
  const fixedCC = 4000 + 1500 + 750 + 1000 + 800;
  const varFrac = 0.005;
  const ccAtP = (p: number) => p * varFrac + calcMansionTax(p);
  const reserveMax = reserveMo > 0
    ? bsearchMaxPrice(p => p * dp + fixedCC + ccAtP(p) + reserveMo * (maint + p * (1 - dp) * K) <= avail, 50000000)
    : Infinity;
  const dpCCBudget = totLiquid - fixedCC;
  const dpCCMax = dpCCBudget <= 0 ? 0 : bsearchMaxPrice(p => p * dp + ccAtP(p) <= dpCCBudget, 50000000);
  const cashMax = Math.min(reserveMax, dpCCMax);
  const maxMoMtg = dtiMax * moInc - maint - base.otherDebts;
  const maxLoan = K > 0 ? Math.max(0, maxMoMtg) / K : Infinity;
  const dtiMaxPrice = (1 - dp) > 0 ? Math.max(0, maxLoan / (1 - dp)) : Infinity;
  const maxPrice = Math.min(cashMax, dtiMaxPrice);
  const binding = cashMax <= dtiMaxPrice ? (dpCCMax <= reserveMax ? 'DP / Closing Costs' : 'Cash / Reserves') : 'DTI / Income';
  return { maxPrice, binding };
}

function calcCondo(base: Base) {
  const { mortgageRate, dpPct, commonCharges, propTaxes, hoInsurance, maxDtiPct } = ASMP.condo;
  const assets = weightedAssets(base.accounts);
  const moInc = base.annualIncome / 12;
  const K = pmtFactor(mortgageRate, 30);
  const dp = dpPct / 100;
  const dtiMax = maxDtiPct / 100;
  const carrying = commonCharges + propTaxes + hoInsurance;
  const A = dtiMax * moInc - carrying - base.otherDebts;
  const dtiDenom = (1 - dp) * K;
  const pDti = dtiDenom > 0 && A > 0 ? A / dtiDenom : (A > 0 ? Infinity : 0);
  const computeCC = (price: number) => {
    const loan = price * (1 - dp);
    const fixed = 5000 + 3500 + 1000 + 750 + 1500;
    const title = price * 0.0045 + loan * 0.0010;
    return fixed + title + calcMortgageRecordingTax(loan) + calcMansionTax(price);
  };
  const pDpCC = bsearchMaxPrice(p => assets >= dp * p + computeCC(p), 20000000);
  const maxPrice = Math.max(0, Math.min(pDpCC, isFinite(pDti) ? pDti : pDpCC));
  const binding = pDpCC <= (isFinite(pDti) ? pDti : Infinity) ? 'DP / Closing Costs' : 'DTI / Income';
  return { maxPrice, binding };
}

const BINDING_EXPLANATIONS: Record<string, string> = {
  'DTI / Income': 'Your income is the limit — your savings comfortably cover the rest.',
  'Cash / Reserves': 'Your reserves are the limit — your income would support more.',
  'DP / Closing Costs': 'Your available cash for down payment and closing costs is the limit.',
  'Cash / Move-In': 'Your move-in cash is the limit — your income would support more.',
};
function bindingExplanation(binding: string): string {
  return BINDING_EXPLANATIONS[binding] ?? 'Landlord income screening is the limit — your savings comfortably cover move-in.';
}

/* ── AMI eligibility ── */
const AMI_BANDS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130];
function calcAmi(income: number, hhSize: number) {
  const pct = amiPercent(income, hhSize);
  const bandClass = getBandClass(pct);
  const eligibleBands = AMI_BANDS.filter(b => pct <= b);
  return { pct, bandClass, eligibleBands };
}

/* ── state ── */
let inputs: Inputs = { ...DEFAULTS };
let hasSaved = false;
let lastResults: {
  rent: ReturnType<typeof calcRent>;
  coop: ReturnType<typeof calcCoop>;
  condo: ReturnType<typeof calcCondo>;
  ami: ReturnType<typeof calcAmi>;
} | null = null;

function loadInputs(): Inputs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { hasSaved = true; return { ...DEFAULTS, ...JSON.parse(raw) }; }
  } catch (e) { /* ignore */ }
  // No Reality Check-specific save yet — pre-fill income/savings from the shared profile if present.
  const shared = loadSharedProfile();
  if (shared) {
    const accounts = Array.isArray(shared.accounts) ? (shared.accounts as Account[]) : [];
    return {
      annualIncome: num(shared.annualIncome) || DEFAULTS.annualIncome,
      otherDebts: num(shared.otherDebts) || DEFAULTS.otherDebts,
      liquidSavings: accounts.length ? weightedAssets(accounts) : DEFAULTS.liquidSavings,
      householdSize: DEFAULTS.householdSize,
    };
  }
  return { ...DEFAULTS };
}

function isSaveEnabled(): boolean {
  const el = $input('save-toggle-cb');
  return !!(el && el.checked);
}

function persist() {
  if (!isSaveEnabled()) { setText('save-state', 'Not saving'); return; }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(inputs));
    saveSharedProfile({ annualIncome: inputs.annualIncome, otherDebts: inputs.otherDebts });
    hasSaved = true;
    setText('save-state', 'Saved locally');
  } catch (e) {
    setText('save-state', 'Unable to save in this browser');
  }
}

function loadSharedAssumptions() {
  function load<T>(key: string): T | null {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  const rent = load<typeof ASMP.rent>(ASMP_RENT_KEY);
  const coop = load<typeof ASMP.coop>(ASMP_COOP_KEY);
  const condo = load<typeof ASMP.condo>(ASMP_CONDO_KEY);
  if (rent) Object.assign(ASMP.rent, rent);
  if (coop) Object.assign(ASMP.coop, coop);
  if (condo) Object.assign(ASMP.condo, condo);
}

function syncFields() {
  $input('rc-income')!.value = String(inputs.annualIncome);
  $input('rc-savings')!.value = String(inputs.liquidSavings);
  $input('rc-debts')!.value = String(inputs.otherDebts);
  $select('rc-household')!.value = String(inputs.householdSize);
}

function render() {
  const base: Base = {
    annualIncome: inputs.annualIncome,
    otherDebts: inputs.otherDebts,
    accounts: accountsFrom(inputs.liquidSavings),
  };
  const rent = calcRent(base);
  const coop = calcCoop(base);
  const condo = calcCondo(base);
  const ami = calcAmi(inputs.annualIncome, inputs.householdSize);
  lastResults = { rent, coop, condo, ami };

  $('missing-inputs')!.classList.toggle('show', !hasSaved);

  const rentEl = $('rc-rent-verdict')!;
  rentEl.textContent = rent.verdict;
  rentEl.className = 'verdict-badge verdict-' + rent.verdict.toLowerCase();
  setText('rc-rent-max', monthly(rent.maxRent));
  setText('rc-rent-why', bindingExplanation(rent.binding));

  setText('rc-coop-max', money(coop.maxPrice));
  setText('rc-coop-why', bindingExplanation(coop.binding));

  setText('rc-condo-max', money(condo.maxPrice));
  setText('rc-condo-why', bindingExplanation(condo.binding));

  setText('rc-ami-pct', ami.pct > 0 ? ami.pct.toFixed(0) + '%' : '—');
  setText('rc-ami-band', ami.bandClass.name + ' (' + ami.bandClass.short + ')');
  setText('rc-ami-bands', ami.eligibleBands.length ? ami.eligibleBands.map(b => b + '%').join(', ') : 'None at standard bands');

  // "What's holding you back?" summary
  setText('rc-holdback-rent', rent.binding);
  setText('rc-holdback-coop', coop.binding);
  setText('rc-holdback-condo', condo.binding);
}

document.addEventListener('DOMContentLoaded', () => {
  inputs = loadInputs();
  loadSharedAssumptions();
  syncFields();
  ($input('save-toggle-cb'))!.checked = hasSaved;
  setText('save-state', hasSaved ? 'Saved locally' : 'Not saving');
  render();

  wireShareButton('rc-share', () => {
    const r = lastResults;
    const incomeLabel = money(inputs.annualIncome) + '/yr';
    const text = r
      ? `My NYC Housing Reality Check (${incomeLabel} income):\n` +
        `🏙 Rent: ${monthly(r.rent.maxRent)} (${r.rent.verdict})\n` +
        `🔑 Co-op: up to ${money(r.coop.maxPrice)}\n` +
        `🏢 Condo: up to ${money(r.condo.maxPrice)}\n` +
        `🏠 Affordable housing: ${r.ami.pct.toFixed(0)}% AMI (${r.ami.bandClass.short})`
      : `My NYC Housing Reality Check (${incomeLabel} income)`;
    return { title: 'My NYC Housing Reality Check', text, url: 'https://www.nyc-affordability.com/reality-check/' };
  });

  $input('save-toggle-cb')!.addEventListener('change', e => {
    if ((e.target as HTMLInputElement).checked) persist();
    else setText('save-state', 'Not saving');
  });

  const fields: [string, (v: number) => void][] = [
    ['rc-income', v => { inputs.annualIncome = v; }],
    ['rc-savings', v => { inputs.liquidSavings = v; }],
    ['rc-debts', v => { inputs.otherDebts = v; }],
  ];
  fields.forEach(([id, setter]) => {
    $input(id)!.addEventListener('input', () => {
      setter(num($input(id)!.value));
      persist();
      render();
    });
  });
  $select('rc-household')!.addEventListener('change', () => {
    inputs.householdSize = num($select('rc-household')!.value) || DEFAULTS.householdSize;
    persist();
    render();
  });

  window.addEventListener('storage', e => {
    if (e.key === SHARED_KEY || e.key === LS_KEY || e.key === ASMP_RENT_KEY || e.key === ASMP_COOP_KEY || e.key === ASMP_CONDO_KEY) {
      loadSharedAssumptions();
      render();
    }
  });
});
