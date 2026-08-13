import { loadSharedProfile, saveSharedProfile, SHARED_KEY } from '../lib/sharedProfile';

/* ============================================================
   NYC Housing Affordability Comparison Dashboard — TypeScript port
   ============================================================
   NOTE: this page does not import ../lib/calc.ts. It re-derives comparable
   rent / co-op / condo numbers purely from the shared profile plus each
   calculator's own saved assumptions (read from their localStorage keys
   below) — it never does its own tax/PMI lookups against another
   calculator's live state. The mortgage-math helpers below (pmtFactor,
   calcMortgageRecordingTax, calcMansionTax, bsearchMaxPrice) are page-local
   duplicates of the same formulas the rent/co-op/condo calculators use —
   this matches the original page's own self-contained implementation,
   which never imported another page's script either.

   NOTE on formatters: money()/monthly()/pct() are NOT reused from
   ../lib/format because their behavior differs in ways that matter for
   byte-identical output:
     - money() returns '-' (a hyphen) for non-finite values; fmtMoney has
       no such guard and would throw/format garbage on Infinity/NaN.
     - pct() takes a FRACTION (0.452) and always renders one decimal place
       ("45.2%"); the shared fmtPercent expects a WHOLE-number percent
       (45.2) and rounds to an integer once n >= 10. Both the input
       convention and the rounding differ, so the local versions are kept
       here verbatim — same approach used for rent's and condo's own
       page-local formatters.
   ============================================================ */

const ASMP_RENT_KEY = 'nyc_shared_assumptions_rent';
const ASMP_COOP_KEY = 'nyc_shared_assumptions_coop';
const ASMP_CONDO_KEY = 'nyc_shared_assumptions_condo';

interface Account {
  name: string;
  balance: number;
  liquidity: number;
  closing: boolean;
  [key: string]: unknown;
}

interface ProfileState {
  annualIncome: number;
  otherDebts: number;
  accounts: Account[];
}

interface RentAssumptions {
  incomeMult: number;
  rentersInsurance: number;
  reserveMonths: number;
}
interface CoopAssumptions {
  mortgageRate: number;
  dpPct: number;
  maint: number;
  maxDTIPct: number;
  reserveMo: number;
}
interface CondoAssumptions {
  mortgageRate: number;
  dpPct: number;
  commonCharges: number;
  propTaxes: number;
  hoInsurance: number;
  maxDtiPct: number;
}

interface SharedAssumptions {
  rent: RentAssumptions | null;
  coop: CoopAssumptions | null;
  condo: CondoAssumptions | null;
}

interface CommonResult {
  cashRequired: number;
  monthlyTotal: number;
  dti: number;
  reserve: number;
  binding: string;
}
interface RentResult extends CommonResult { maxRent: number; }
interface CoopResult extends CommonResult { maxPrice: number; }
interface CondoResult extends CommonResult { maxPrice: number; }

interface BaseInputs {
  annualIncome: number;
  otherDebts: number;
  accounts: Account[];
}

const SAMPLE_PROFILE: ProfileState = {
  annualIncome: 150000,
  otherDebts: 0,
  accounts: [
    { name: 'Checking', balance: 15000, liquidity: 100, closing: true },
    { name: 'High-Yield Savings', balance: 35000, liquidity: 100, closing: true },
    { name: 'Brokerage / Investments', balance: 70000, liquidity: 80, closing: true },
  ],
};

/* ── DOM helpers ── */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }

function money(n: number): string { return isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '-'; }
function monthly(n: number): string { return isFinite(n) ? money(n) + '/mo' : '-'; }
function pct(n: number): string { return isFinite(n) ? (n * 100).toFixed(1) + '%' : '-'; }
function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0; }
function escHtml(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── profile loading (adapted to read via lib/sharedProfile instead of a raw
   localStorage.getItem/JSON.parse pair) ── */
function loadProfile(): { profile: ProfileState; isSample: boolean } {
  const raw = loadSharedProfile();
  return raw ? { profile: raw as unknown as ProfileState, isSample: false } : { profile: SAMPLE_PROFILE, isSample: true };
}

function normalizeAccounts(accounts: unknown): Account[] {
  const list = (Array.isArray(accounts) && accounts.length ? accounts : SAMPLE_PROFILE.accounts) as any[];
  return list.map(a => {
    const balance = num(a.balance);
    const liquidity = a.liquidity !== undefined ? num(a.liquidity) : (a.closing ? 100 : (a.reserve !== undefined ? num(a.reserve) : 0));
    const closing = a.closing !== undefined ? !!a.closing : liquidity >= 100;
    return { name: a.name || 'Account', balance, liquidity, closing };
  });
}

function profileInputs(profile: any): ProfileState {
  return {
    annualIncome: num(profile.annualIncome),
    otherDebts: num(profile.otherDebts),
    accounts: normalizeAccounts(profile.accounts),
  };
}

let loaded = loadProfile();
let profileState: ProfileState = profileInputs(loaded.profile);
let hasSavedProfile = !loaded.isSample;
let saveEnabled = hasSavedProfile;

function isSaveEnabled(): boolean {
  const el = $input('save-toggle-cb');
  return !!(el && el.checked);
}

function setText(id: string, value: string) {
  const el = $(id);
  if (el) el.textContent = value;
}

/* Persists the full profileState via the shared helper's merge-patch. Since
   profileState always fully determines annualIncome/otherDebts/accounts (the
   entire shape lib/sharedProfile's SharedProfile schema tracks for this page),
   passing it as the patch has the same effect as the original page's direct
   localStorage.setItem(SHARED_KEY, JSON.stringify(profileState)) overwrite. */
function persistProfile() {
  if (!isSaveEnabled()) {
    setText('save-state', 'Not saving');
    return;
  }
  try {
    saveSharedProfile(profileState);
    hasSavedProfile = true;
    $('missing-profile')?.classList.remove('show');
    setText('save-state', 'Saved locally');
  } catch (e) {
    setText('save-state', 'Unable to save in this browser');
  }
}

/* ── shared assumptions (rent/coop/condo-specific — each calculator owns its
   own localStorage key; not part of the general sharedProfile schema, so this
   stays its own read/write path here rather than living in lib/sharedProfile,
   matching the pattern already used by rent.ts and condo.ts for their own
   assumptions). ── */
function loadSharedAssumptions(): SharedAssumptions | null {
  function load<T>(key: string): T | null {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  const rent = load<RentAssumptions>(ASMP_RENT_KEY);
  const coop = load<CoopAssumptions>(ASMP_COOP_KEY);
  const condo = load<CondoAssumptions>(ASMP_CONDO_KEY);
  return (rent || coop || condo) ? { rent, coop, condo } : null;
}

function saveSharedAssumptions() {
  if (!isSaveEnabled()) return;
  try { localStorage.setItem(ASMP_RENT_KEY, JSON.stringify(ASMP.rent)); } catch (e) { /* ignore */ }
  try { localStorage.setItem(ASMP_COOP_KEY, JSON.stringify(ASMP.coop)); } catch (e) { /* ignore */ }
  try { localStorage.setItem(ASMP_CONDO_KEY, JSON.stringify(ASMP.condo)); } catch (e) { /* ignore */ }
}

function applySharedAssumptions(asmp: SharedAssumptions | null) {
  if (!asmp) return;
  if (asmp.rent) Object.assign(ASMP.rent, asmp.rent);
  if (asmp.coop) Object.assign(ASMP.coop, asmp.coop);
  if (asmp.condo) Object.assign(ASMP.condo, asmp.condo);
  const sv = (id: string, v: unknown) => {
    if (v == null) return;
    const el = $input(id) || $select(id);
    if (el) el.value = String(v);
  };
  sv('a-rent-mult', ASMP.rent.incomeMult);
  sv('a-rent-insurance', ASMP.rent.rentersInsurance);
  sv('a-rent-reserve', ASMP.rent.reserveMonths);
  sv('a-coop-dp', ASMP.coop.dpPct);
  sv('a-coop-rate', ASMP.coop.mortgageRate);
  sv('a-coop-maint', ASMP.coop.maint);
  sv('a-coop-dti', ASMP.coop.maxDTIPct);
  sv('a-coop-reserve', ASMP.coop.reserveMo);
  sv('a-condo-dp', ASMP.condo.dpPct);
  sv('a-condo-rate', ASMP.condo.mortgageRate);
  sv('a-condo-cc', ASMP.condo.commonCharges);
  sv('a-condo-tax', ASMP.condo.propTaxes);
  sv('a-condo-ins', ASMP.condo.hoInsurance);
  sv('a-condo-dti', ASMP.condo.maxDtiPct);
}

/* ── account editor (renders the Profile section's account table) ──
   Rows are rebuilt via innerHTML/createElement each call — the page CSS
   marks the selectors reaching into #profile-acct-tbody's rows :global()
   for exactly this reason. */
function renderAccountEditor() {
  const tbody = $('profile-acct-tbody')!;
  tbody.innerHTML = '';
  profileState.accounts.forEach((acct, i) => {
    const weighted = acct.balance * acct.liquidity / 100;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escHtml(acct.name)}" data-i="${i}" data-f="name" aria-label="Account name"></td>
      <td class="num"><input type="number" value="${acct.balance}" min="0" step="1000" data-i="${i}" data-f="balance" aria-label="Account balance"></td>
      <td class="num"><input type="number" value="${acct.liquidity}" min="0" max="100" step="5" data-i="${i}" data-f="liquidity" aria-label="Liquidity percent"></td>
      <td><input type="checkbox" ${acct.closing ? 'checked' : ''} data-i="${i}" data-f="closing" aria-label="Available for closing"></td>
      <td class="num">${money(weighted)}</td>
      <td class="num">${profileState.accounts.length > 1 ? `<button class="btn-del" type="button" data-i="${i}" aria-label="Delete account">&times;</button>` : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function syncEditorFields() {
  $input('edit-income')!.value = String(profileState.annualIncome);
  $input('edit-debts')!.value = String(profileState.otherDebts);
  renderAccountEditor();
}

function updateFromEditor(save = true) {
  profileState.annualIncome = num($input('edit-income')!.value);
  profileState.otherDebts = num($input('edit-debts')!.value);
  if (save) persistProfile();
  render();
}

/* ── shared math helpers ── */
function pmtFactor(ratePct: number, years: number): number {
  const rm = ratePct / 100 / 12;
  const n = years * 12;
  if (n <= 0) return 0;
  return rm === 0 ? 1 / n : rm / (1 - Math.pow(1 + rm, -n));
}

function weightedAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + a.balance * a.liquidity / 100, 0);
}

function closingAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + (a.closing ? a.balance : 0), 0);
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

const ASMP = {
  rent: { incomeMult: 40, rentersInsurance: 15, reserveMonths: 2 } as RentAssumptions,
  coop: { mortgageRate: 6.25, dpPct: 20, maint: 1200, maxDTIPct: 28, reserveMo: 12 } as CoopAssumptions,
  condo: { mortgageRate: 6.30, dpPct: 20, commonCharges: 1000, propTaxes: 1250, hoInsurance: 75, maxDtiPct: 43 } as CondoAssumptions,
};

/* ── "What if...?" scenario sliders — purely ephemeral display-time deltas,
   never written to profileState or ASMP and never persisted (even with Save
   on), so they can't be mistaken for the user's real saved numbers. Applied
   only inside render() by adjusting the `base` passed to calcRent/calcCoop/
   calcCondo and by overriding the mortgage rate via calcCoop/calcCondo's
   optional second parameter — the real ASMP.coop/condo.mortgageRate (and
   the Adjust Assumptions panel that edits them) are never mutated. ── */
const WHATIF = { salaryDelta: 0, savingsDelta: 0, rateDelta: 0 };

function calcRent(base: BaseInputs): RentResult {
  const inp = {
    ...base,
    incomeMult: ASMP.rent.incomeMult,
    dtiEnabled: false,
    dtiPct: 35,
    secDepositMonths: 1,
    appFee: 20,
    buildingFee: 500,
    utilitySetup: 250,
    petFee: 0,
    brokerType: 'none',
    brokerFeePct: 15,
    brokerFeeMonths: 1,
    brokerFlat: 3000,
    rentersInsurance: ASMP.rent.rentersInsurance,
    reserveMonths: ASMP.rent.reserveMonths,
  };
  const assets = weightedAssets(inp.accounts);
  const moInc = inp.annualIncome / 12;
  const fixedMovein = inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee;
  const fixedReserve = inp.reserveMonths * (inp.rentersInsurance + inp.otherDebts);
  const maxMovein = Math.max(0, (assets - fixedMovein) / (1 + inp.secDepositMonths));
  const maxReserve = inp.reserveMonths > 0
    ? Math.max(0, (assets - fixedReserve) / inp.reserveMonths)
    : Infinity;
  const cashMax = Math.min(maxMovein, maxReserve);
  const incomeMax = inp.annualIncome / inp.incomeMult;
  const maxRent = Math.min(cashMax, incomeMax);
  const binding = cashMax <= incomeMax ? 'Cash / Move-In' : `Income (${inp.incomeMult}× rule)`;
  const cashRequired = maxRent + (maxRent * inp.secDepositMonths) + fixedMovein + inp.reserveMonths * (maxRent + inp.rentersInsurance + inp.otherDebts);
  const monthlyTotal = maxRent + inp.rentersInsurance;
  const dti = moInc > 0 ? (monthlyTotal + inp.otherDebts) / moInc : 0;
  const reserve = inp.reserveMonths * (maxRent + inp.rentersInsurance + inp.otherDebts);
  return { maxRent, cashRequired, monthlyTotal, dti, reserve, binding };
}

function calcCoop(base: BaseInputs, rateOverride?: number): CoopResult {
  const inp = {
    ...base,
    mortgageRate: rateOverride ?? ASMP.coop.mortgageRate,
    loanTerm: 30,
    dpPct: ASMP.coop.dpPct,
    reserveMo: ASMP.coop.reserveMo,
    maxDTIPct: ASMP.coop.maxDTIPct,
    maint: ASMP.coop.maint,
    fcAtty: 4000,
    fcBankAtty: 1500,
    fcCoop: 750,
    fcMoveIn: 1000,
    fcOther: 800,
    varPct: 0.5,
  };
  const avail = weightedAssets(inp.accounts);
  const totLiquid = closingAssets(inp.accounts);
  const moInc = inp.annualIncome / 12;
  const K = pmtFactor(inp.mortgageRate, inp.loanTerm);
  const dp = inp.dpPct / 100;
  const dtiMax = inp.maxDTIPct / 100;
  const fixedCC = inp.fcAtty + inp.fcBankAtty + inp.fcCoop + inp.fcMoveIn + inp.fcOther;
  const varFrac = inp.varPct / 100;
  const ccAtP = (p: number) => p * varFrac + calcMansionTax(p);
  const reserveMax = inp.reserveMo > 0
    ? bsearchMaxPrice(p => p * dp + fixedCC + ccAtP(p) + inp.reserveMo * (inp.maint + p * (1 - dp) * K) <= avail, 50000000)
    : Infinity;
  const dpCCBudget = totLiquid - fixedCC;
  const dpCCMax = dpCCBudget <= 0 ? 0 : bsearchMaxPrice(p => p * dp + ccAtP(p) <= dpCCBudget, 50000000);
  const cashMax = Math.min(reserveMax, dpCCMax);
  const maxMoMtg = dtiMax * moInc - inp.maint - inp.otherDebts;
  const maxLoan = K > 0 ? Math.max(0, maxMoMtg) / K : Infinity;
  const dtiMaxPrice = (1 - dp) > 0 ? Math.max(0, maxLoan / (1 - dp)) : Infinity;
  const maxPrice = Math.min(cashMax, dtiMaxPrice);
  const binding = cashMax <= dtiMaxPrice ? (dpCCMax <= reserveMax ? 'DP / Closing Costs' : 'Cash / Reserves') : 'DTI / Income';
  const mansion = calcMansionTax(maxPrice);
  const downPmt = maxPrice * dp;
  const loanAmt = maxPrice * (1 - dp);
  const moMtg = loanAmt * K;
  const totalAtClose = downPmt + fixedCC + maxPrice * varFrac + mansion;
  const reserve = inp.reserveMo * (moMtg + inp.maint);
  const cashRequired = totalAtClose + reserve;
  const monthlyTotal = moMtg + inp.maint;
  const dti = moInc > 0 ? (monthlyTotal + inp.otherDebts) / moInc : 0;
  return { maxPrice, cashRequired, monthlyTotal, dti, reserve, binding };
}

function calcCondo(base: BaseInputs, rateOverride?: number): CondoResult {
  const inp = {
    ...base,
    mortgageRate: rateOverride ?? ASMP.condo.mortgageRate,
    loanTerm: 30,
    dpPct: ASMP.condo.dpPct,
    reserveMo: 6,
    reservesEnabled: false,
    maxDtiPct: ASMP.condo.maxDtiPct,
    commonCharges: ASMP.condo.commonCharges,
    propTaxes: ASMP.condo.propTaxes,
    hoInsurance: ASMP.condo.hoInsurance,
    fcAtty: 5000,
    fcLender: 3500,
    fcAppraisal: 1000,
    fcRecording: 750,
    fcBuilding: 1500,
    wcMonths: 2,
    workingCapEnabled: false,
    titlePricePct: 0.45,
    titleLoanPct: 0.10,
  };
  const assets = weightedAssets(inp.accounts);
  const moInc = inp.annualIncome / 12;
  const K = pmtFactor(inp.mortgageRate, inp.loanTerm);
  const dp = inp.dpPct / 100;
  const dtiMax = inp.maxDtiPct / 100;
  const carrying = inp.commonCharges + inp.propTaxes + inp.hoInsurance;
  const resMo = inp.reservesEnabled ? inp.reserveMo : 0;
  const A = dtiMax * moInc - carrying - inp.otherDebts;
  const dtiDenom = (1 - dp) * K;
  const pDti = dtiDenom > 0 && A > 0 ? A / dtiDenom : (A > 0 ? Infinity : 0);
  const computeCC = (price: number) => {
    const loan = price * (1 - dp);
    const fixed = inp.fcAtty + inp.fcLender + inp.fcAppraisal + inp.fcRecording + inp.fcBuilding;
    const title = price * inp.titlePricePct / 100 + loan * inp.titleLoanPct / 100;
    return fixed + title + calcMortgageRecordingTax(loan) + calcMansionTax(price);
  };
  const pDpCC = bsearchMaxPrice(p => assets >= dp * p + computeCC(p), 20000000);
  const pReserve = resMo > 0
    ? bsearchMaxPrice(p => assets >= dp * p + computeCC(p) + resMo * (p * (1 - dp) * K + carrying), 20000000)
    : Infinity;
  const pCash = Math.min(pDpCC, pReserve);
  const maxPrice = Math.max(0, Math.min(pCash, isFinite(pDti) ? pDti : pCash));
  const binding = pCash <= (isFinite(pDti) ? pDti : Infinity)
    ? (pDpCC <= pReserve ? 'DP / Closing Costs' : 'Cash / Reserves')
    : 'DTI / Income';
  const loanAmt = maxPrice * (1 - dp);
  const moMtg = loanAmt * K;
  const cc = computeCC(maxPrice);
  const reserve = resMo * (moMtg + carrying);
  const cashRequired = maxPrice * dp + cc + reserve;
  const monthlyTotal = moMtg + carrying;
  const dti = moInc > 0 ? (monthlyTotal + inp.otherDebts) / moInc : 0;
  return { maxPrice, cashRequired, monthlyTotal, dti, reserve, binding };
}

function render() {
  const whatIfActive = WHATIF.salaryDelta !== 0 || WHATIF.savingsDelta !== 0 || WHATIF.rateDelta !== 0;
  const accounts = normalizeAccounts(profileState.accounts);
  const base: BaseInputs = {
    annualIncome: profileState.annualIncome + WHATIF.salaryDelta,
    otherDebts: profileState.otherDebts,
    accounts: WHATIF.savingsDelta !== 0
      ? [...accounts, { name: 'What-if savings', balance: WHATIF.savingsDelta, liquidity: 100, closing: true }]
      : accounts,
  };
  const rent = calcRent(base);
  const coop = calcCoop(base, ASMP.coop.mortgageRate + WHATIF.rateDelta);
  const condo = calcCondo(base, ASMP.condo.mortgageRate + WHATIF.rateDelta);
  const cash = weightedAssets(base.accounts);

  $('whatif-banner')?.classList.toggle('show', whatIfActive);

  $('missing-profile')!.classList.toggle('show', !hasSavedProfile);
  setText('profile-income', money(base.annualIncome));
  setText('profile-debts', monthly(base.otherDebts));
  setText('profile-cash', money(cash));
  setText('profile-accounts', String(base.accounts.length));

  setText('rent-max', monthly(rent.maxRent));
  setText('coop-max', money(coop.maxPrice));
  setText('condo-max', money(condo.maxPrice));

  const results: [string, CommonResult][] = [
    ['rent', rent], ['coop', coop], ['condo', condo],
  ];
  results.forEach(([key, r]) => {
    setText(`${key}-cash`, money(r.cashRequired));
    setText(`${key}-monthly`, monthly(r.monthlyTotal));
    setText(`${key}-dti`, pct(r.dti));
    setText(`${key}-binding`, r.binding);
    setText(`t-${key}-cash`, money(r.cashRequired));
    setText(`t-${key}-monthly`, monthly(r.monthlyTotal));
    setText(`t-${key}-dti`, pct(r.dti));
    setText(`t-${key}-reserve`, r.reserve > 0 ? money(r.reserve) : 'Not required');
    setText(`t-${key}-binding`, r.binding);
  });

  setText('t-rent-max-rent', monthly(rent.maxRent));
  setText('t-coop-max-price', money(coop.maxPrice));
  setText('t-condo-max-price', money(condo.maxPrice));
}

/* ── DOMContentLoaded boot ── */
document.addEventListener('DOMContentLoaded', () => {
  syncEditorFields();
  ($input('save-toggle-cb'))!.checked = saveEnabled;
  setText('save-state', saveEnabled ? 'Saved locally' : 'Not saving');
  applySharedAssumptions(loadSharedAssumptions());
  render();

  $input('save-toggle-cb')!.addEventListener('change', e => {
    saveEnabled = (e.target as HTMLInputElement).checked;
    if (saveEnabled) {
      persistProfile();
      saveSharedAssumptions();
    } else {
      setText('save-state', 'Not saving');
    }
  });

  $input('edit-income')!.addEventListener('input', () => updateFromEditor());
  $input('edit-debts')!.addEventListener('input', () => updateFromEditor());

  $('profile-acct-tbody')!.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') return;
    const i = Number(target.dataset.i);
    const field = target.dataset.f;
    if (!Number.isInteger(i) || !field || !profileState.accounts[i]) return;
    (profileState.accounts[i] as any)[field] = field === 'name' ? target.value : num(target.value);
    if (field === 'name') { persistProfile(); return; }
    const acct = profileState.accounts[i];
    const weightedCell = target.closest('tr')?.children[4] as HTMLElement | undefined;
    if (weightedCell) weightedCell.textContent = money(acct.balance * acct.liquidity / 100);
    persistProfile();
    render();
  });

  $('profile-acct-tbody')!.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    const i = Number(target.dataset.i);
    if (!Number.isInteger(i) || target.dataset.f !== 'closing' || !profileState.accounts[i]) return;
    profileState.accounts[i].closing = target.checked;
    persistProfile();
    render();
  });

  $('profile-acct-tbody')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.btn-del') as HTMLElement | null;
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (!Number.isInteger(i) || profileState.accounts.length <= 1) return;
    profileState.accounts.splice(i, 1);
    persistProfile();
    renderAccountEditor();
    render();
  });

  $('add-account')!.addEventListener('click', () => {
    profileState.accounts.push({ name: 'New Account', balance: 0, liquidity: 100, closing: true });
    persistProfile();
    renderAccountEditor();
    render();
  });

  // Assumption input handlers
  const asmpFields: [string, (v: number) => void][] = [
    ['a-rent-mult', v => { ASMP.rent.incomeMult = v; }],
    ['a-rent-insurance', v => { ASMP.rent.rentersInsurance = v; }],
    ['a-rent-reserve', v => { ASMP.rent.reserveMonths = v; }],
    ['a-coop-dp', v => { ASMP.coop.dpPct = v; }],
    ['a-coop-rate', v => { ASMP.coop.mortgageRate = v; }],
    ['a-coop-maint', v => { ASMP.coop.maint = v; }],
    ['a-coop-dti', v => { ASMP.coop.maxDTIPct = v; }],
    ['a-coop-reserve', v => { ASMP.coop.reserveMo = v; }],
    ['a-condo-dp', v => { ASMP.condo.dpPct = v; }],
    ['a-condo-rate', v => { ASMP.condo.mortgageRate = v; }],
    ['a-condo-cc', v => { ASMP.condo.commonCharges = v; }],
    ['a-condo-tax', v => { ASMP.condo.propTaxes = v; }],
    ['a-condo-ins', v => { ASMP.condo.hoInsurance = v; }],
    ['a-condo-dti', v => { ASMP.condo.maxDtiPct = v; }],
  ];
  asmpFields.forEach(([id, setter]) => {
    const el = $input(id) || $select(id);
    if (el) el.addEventListener('input', () => { setter(num(el.value)); saveSharedAssumptions(); render(); });
  });

  // "What if...?" sliders — ephemeral, never persisted (see WHATIF's own comment above).
  const whatIfSliders: [string, string, (v: number) => void][] = [
    ['whatif-salary', 'whatif-salary-val', v => { WHATIF.salaryDelta = v; }],
    ['whatif-savings', 'whatif-savings-val', v => { WHATIF.savingsDelta = v; }],
    ['whatif-rate', 'whatif-rate-val', v => { WHATIF.rateDelta = v; }],
  ];
  whatIfSliders.forEach(([id, valId]) => {
    const el = $input(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const setter = whatIfSliders.find(([sid]) => sid === id)![2];
      setter(num(el.value));
      const label = id === 'whatif-rate'
        ? (num(el.value) === 0 ? '+0.00%' : (num(el.value) > 0 ? '+' : '') + num(el.value).toFixed(2) + '%')
        : (num(el.value) === 0 ? '+$0' : (num(el.value) > 0 ? '+' : '') + money(num(el.value)));
      setText(valId, label);
      render();
    });
  });
  $('whatif-reset')?.addEventListener('click', () => {
    WHATIF.salaryDelta = 0; WHATIF.savingsDelta = 0; WHATIF.rateDelta = 0;
    ($input('whatif-salary'))!.value = '0';
    ($input('whatif-savings'))!.value = '0';
    ($input('whatif-rate'))!.value = '0';
    setText('whatif-salary-val', '+$0');
    setText('whatif-savings-val', '+$0');
    setText('whatif-rate-val', '+0.00%');
    render();
  });

  window.addEventListener('storage', e => {
    if (e.key === SHARED_KEY) {
      loaded = loadProfile();
      profileState = profileInputs(loaded.profile);
      hasSavedProfile = !loaded.isSample;
      // Preserve the user's current Save toggle — don't override it on cross-tab updates
      syncEditorFields();
      render();
    } else if (e.key === ASMP_RENT_KEY || e.key === ASMP_COOP_KEY || e.key === ASMP_CONDO_KEY) {
      applySharedAssumptions(loadSharedAssumptions());
      render();
    }
  });
});
