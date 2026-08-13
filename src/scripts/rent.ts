import { loadSharedProfile, saveSharedProfile, SHARED_KEY, type SharedProfile } from '../lib/sharedProfile';
import { wireShareButton } from '../lib/share';

/* ============================================================
   NYC Rent Affordability Finder — TypeScript port
   ============================================================
   NOTE on formatters: rent's original fmt()/fmtPct() are NOT reused
   from ../lib/format because their behavior differs from the shared
   fmtMoney/fmtPercent in ways that matter for byte-identical output:
     - fmt() returns '—' for non-finite values; fmtMoney does not guard
       against Infinity/NaN.
     - fmtPct() always renders one decimal place (e.g. "45.2%"); the
       shared fmtPercent rounds to a whole number once n >= 10 (e.g.
       "45%"). These are different roundings, not just a signature
       mismatch, so the local versions are kept here verbatim.
   ============================================================ */

const LS_KEY = 'nyc_rent_inputs';
const ASSUMPTIONS_KEY = 'nyc_shared_assumptions_rent';

interface Account {
  name: string;
  balance: number;
  liquidity: number;
  [key: string]: unknown;
}

interface Inputs {
  accounts: Account[];
  annualIncome: number;
  otherDebts: number;
  incomeMult: number;
  dtiEnabled: boolean;
  dtiPct: number;
  guarantorEnabled: boolean;
  guarantorMult: number;
  secDepositMonths: number;
  appFee: number;
  buildingFee: number;
  utilitySetup: number;
  petFee: number;
  brokerType: string;
  brokerFeePct: number;
  brokerFeeMonths: number;
  brokerFlat: number;
  rentersInsurance: number;
  reserveMonths: number;
}

interface CalcResult {
  weightedAssets: number;
  maxRent: number;
  maxRent_cash: number;
  maxRent_income: number;
  maxRent_mult: number;
  maxRent_dti: number;
  binding: string;
  fixedMovein: number;
  fixedReserve: number;
  bMult: number;
  bFixed: number;
}

interface Snapshot {
  firstMonth: number;
  secDeposit: number;
  brokerFee: number;
  totalAtSigning: number;
  reserveBuffer: number;
  totalCashNeeded: number;
  moveInSurplus: number;
  reserveSurplus: number;
  moInc: number;
  monthlyTotal: number;
  rentBurden: number;
  totalDTI: number;
}

interface RentAssumptions {
  incomeMult?: number;
  rentersInsurance?: number;
  reserveMonths?: number;
}

const DEFAULTS = {
  accounts: [
    { name: 'Checking', balance: 15000, liquidity: 100 },
    { name: 'High-Yield Savings', balance: 35000, liquidity: 100 },
    { name: 'Brokerage', balance: 20000, liquidity: 80 },
  ] as Account[],
  annualIncome: 75000,
  otherDebts: 0,
  incomeMult: 40,
  dtiEnabled: false,
  dtiPct: 35,
  guarantorEnabled: false,
  guarantorMult: 80,
  secDepositMonths: 1,
  appFee: 20,
  buildingFee: 500,
  utilitySetup: 250,
  petFee: 0,
  brokerType: 'none',
  brokerFeePct: 15,
  brokerFeeMonths: 1,
  brokerFlat: 3000,
  rentersInsurance: 15,
  reserveMonths: 2,
};

/* ── state ── */
const state = {
  accounts: DEFAULTS.accounts.map(a => ({ ...a })) as Account[],
  targetOverride: null as number | null,
  aftTarget: null as number | null,
  activeTab: 'standard',
  analysisRendered: false,
  affordRendered: false,
  affordRafId: null as number | null,
};

/* ── DOM helpers ── */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return '—';
  return n.toFixed(1) + '%';
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function escHtml(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── accounts rendering ── */
function renderAccounts() {
  const tbody = $('acct-tbody')!;
  tbody.innerHTML = '';
  state.accounts.forEach((acct, i) => {
    const tr = document.createElement('tr');
    const moveInValue = acct.balance * acct.liquidity / 100;
    tr.innerHTML = `
      <td><input type="text" value="${escHtml(acct.name)}" data-i="${i}" data-f="name" aria-label="Account name"></td>
      <td><input type="number" value="${acct.balance}" data-i="${i}" data-f="balance" min="0" step="1000" style="width:90px" aria-label="Balance"></td>
      <td><input type="number" value="${acct.liquidity}" data-i="${i}" data-f="liquidity" min="0" max="100" step="5" style="width:60px" aria-label="Liquidity percent"></td>
      <td><div class="avail-cell${moveInValue > 0 ? '' : ' dim'}" id="mi-${i}">${moveInValue > 0 ? fmt(moveInValue) : '—'}</div></td>
      <td><div class="avail-cell" id="res-${i}">${fmt(moveInValue)}</div></td>
      <td class="del-cell">${i >= 2 ? `<button class="btn-del" data-i="${i}" type="button" aria-label="Delete row ${i + 1}">&times;</button>` : ''}</td>
    `;
    tbody.appendChild(tr);
  });
  refreshTotals();
}

function refreshAvailCell(i: number) {
  const acct = state.accounts[i];
  const miEl = $(`mi-${i}`);
  const resEl = $(`res-${i}`);
  if (miEl) {
    const moveInValue = acct.balance * acct.liquidity / 100;
    if (moveInValue > 0) {
      miEl.textContent = fmt(moveInValue);
      miEl.classList.remove('dim');
    } else {
      miEl.textContent = '—';
      miEl.classList.add('dim');
    }
  }
  if (resEl) resEl.textContent = fmt(acct.balance * acct.liquidity / 100);
}

function refreshTotals() {
  let liq = 0, res = 0;
  state.accounts.forEach(a => {
    const weighted = a.balance * a.liquidity / 100;
    liq += weighted;
    res += weighted;
  });
  $('tot-liquid')!.textContent = fmt(liq);
  $('tot-reserve')!.textContent = fmt(res);
}

/* ── read inputs ── */
function readInputs(): Inputs {
  const v = (n: string) => parseFloat(n) || 0;
  const annualIncome = v($input('annual-income')!.value);
  return {
    accounts: state.accounts,
    annualIncome,
    otherDebts: v($input('other-debts')!.value),
    incomeMult: v($input('income-mult')!.value) || 40,
    dtiEnabled: $input('dti-enabled')!.checked,
    dtiPct: v($input('dti-pct')!.value) || 35,
    guarantorEnabled: $input('guarantor-enabled')!.checked,
    guarantorMult: v($input('guarantor-mult')!.value) || 80,
    secDepositMonths: v($select('sec-deposit')!.value),
    appFee: v($input('app-fee')!.value),
    buildingFee: v($input('building-fee')!.value),
    utilitySetup: v($input('utility-setup')!.value),
    petFee: v($input('pet-fee')!.value),
    brokerType: $select('broker-type')!.value,
    brokerFeePct: v($input('broker-pct')!.value),
    brokerFeeMonths: v($input('broker-months-val')!.value),
    brokerFlat: v($input('broker-flat-val')!.value),
    rentersInsurance: v($input('renters-insurance')!.value),
    reserveMonths: v($select('reserve-months')!.value),
  };
}

/* ── broker fee computation ── */
function computeBrokerFee(rent: number, inp: Inputs): number {
  switch (inp.brokerType) {
    case 'pct_annual': return rent * 12 * inp.brokerFeePct / 100;
    case 'months': return rent * inp.brokerFeeMonths;
    case 'flat': return inp.brokerFlat;
    default: return 0;
  }
}

function brokerMult(inp: Inputs): number {
  switch (inp.brokerType) {
    case 'pct_annual': return 12 * inp.brokerFeePct / 100;
    case 'months': return inp.brokerFeeMonths;
    default: return 0;
  }
}

function brokerFixed(inp: Inputs): number {
  return inp.brokerType === 'flat' ? inp.brokerFlat : 0;
}

/* ── core calculation ── */
function calculate(inp: Inputs): CalcResult {
  let weightedAssets = 0;
  inp.accounts.forEach(a => {
    const weighted = a.balance * a.liquidity / 100;
    weightedAssets += weighted;
  });

  const moInc = inp.annualIncome / 12;
  const bMult = brokerMult(inp);
  const bFixed = brokerFixed(inp);

  const fixedMovein = inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee + bFixed;
  const fixedReserve = inp.reserveMonths * (inp.rentersInsurance + inp.otherDebts);

  // Move-in and reserve buffer use liquidity-weighted account values.
  const moveinCoeff = 1 + inp.secDepositMonths + bMult;
  const maxRent_movein = moveinCoeff > 0
    ? Math.max(0, (weightedAssets - fixedMovein) / moveinCoeff)
    : Infinity;
  const maxRent_reserve = inp.reserveMonths > 0
    ? Math.max(0, (weightedAssets - fixedReserve) / inp.reserveMonths)
    : Infinity;
  const maxRent_cash = Math.min(maxRent_movein, maxRent_reserve);

  const maxRent_mult = inp.annualIncome / inp.incomeMult;
  const maxRent_dti = inp.dtiEnabled
    ? Math.max(0, moInc * inp.dtiPct / 100 - inp.rentersInsurance - inp.otherDebts)
    : Infinity;
  const maxRent_income = Math.max(0, Math.min(maxRent_mult, maxRent_dti));

  const maxRent = Math.min(maxRent_income, maxRent_cash);

  let binding: string;
  if (maxRent_cash <= maxRent_income) {
    binding = 'Cash / Move-In';
  } else if (inp.dtiEnabled && isFinite(maxRent_dti) && maxRent_dti <= maxRent_mult) {
    binding = 'Income (Rent-Burden)';
  } else {
    binding = `Income (${inp.incomeMult}× rule)`;
  }

  return {
    weightedAssets,
    maxRent, maxRent_cash, maxRent_income, maxRent_mult, maxRent_dti,
    binding, fixedMovein, fixedReserve, bMult, bFixed,
  };
}

/* ── snapshot at a given target rent ── */
function snapshot(tgt: number, inp: Inputs, calc: CalcResult): Snapshot {
  const firstMonth = tgt;
  const secDeposit = tgt * inp.secDepositMonths;
  const brokerFee = computeBrokerFee(tgt, inp);
  const totalAtSigning = tgt + secDeposit + brokerFee + inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee;
  const reserveBuffer = inp.reserveMonths * (tgt + inp.rentersInsurance + inp.otherDebts);
  const totalCashNeeded = totalAtSigning + reserveBuffer;
  const moveInSurplus = calc.weightedAssets - totalAtSigning;
  const reserveSurplus = calc.weightedAssets - totalCashNeeded;
  const moInc = inp.annualIncome / 12;
  const monthlyTotal = tgt + inp.rentersInsurance + inp.otherDebts;
  const rentBurden = moInc > 0 ? tgt / moInc * 100 : 0;
  const totalDTI = moInc > 0 ? monthlyTotal / moInc * 100 : 0;
  return {
    firstMonth, secDeposit, brokerFee, totalAtSigning, reserveBuffer, totalCashNeeded,
    moveInSurplus, reserveSurplus, moInc, monthlyTotal, rentBurden, totalDTI,
  };
}

let lastCalc: CalcResult | null = null;

/* ── update all results ── */
function updateResults() {
  const inp = readInputs();
  const calc = calculate(inp);
  lastCalc = calc;

  // monthly income display
  $input('monthly-income')!.value = String(Math.round(inp.annualIncome / 12));

  // hero
  const maxR = calc.maxRent;
  const heroPriceEl = $('hero-price')!;
  heroPriceEl.textContent = fmt(maxR);
  heroPriceEl.classList.toggle('zero', maxR <= 0);
  $('hero-binding-val')!.textContent = calc.binding;

  // warn if target > max
  const tgtInput = parseFloat($input('target-rent')!.value);
  const tgt = isFinite(tgtInput) && tgtInput > 0 ? tgtInput : maxR;
  const warnEl = $('hero-warn') as HTMLElement;
  if (tgtInput > 0 && tgtInput > maxR) {
    warnEl.textContent = `⚠ Target $${Math.round(tgtInput).toLocaleString()} exceeds your max of $${Math.round(maxR).toLocaleString()}`;
    warnEl.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
    warnEl.textContent = '';
  }

  if (state.activeTab === 'standard') {
    renderStandardTab(inp, calc, tgt);
  } else if (state.activeTab === 'analysis') {
    renderAnalysisTab(inp, calc);
  } else if (state.activeTab === 'afford') {
    scheduleAffordRender(inp, calc);
  }

  // save
  if (isSaveEnabled()) saveToStorage(inp);
}

function renderStandardTab(inp: Inputs, calc: CalcResult, tgt: number) {
  const sn = snapshot(tgt, inp, calc);

  // snap values
  $('s-first-month')!.textContent = fmt(sn.firstMonth);
  $('s-sec-deposit')!.textContent = fmt(sn.secDeposit);
  $('s-broker-fee')!.textContent = fmt(sn.brokerFee);
  $('s-app-fee')!.textContent = fmt(inp.appFee);
  $('s-building-fee')!.textContent = fmt(inp.buildingFee);
  $('s-utility-setup')!.textContent = fmt(inp.utilitySetup);
  $('s-pet-fee')!.textContent = fmt(inp.petFee);
  $('s-total-signing')!.textContent = fmt(sn.totalAtSigning);
  $('s-movein-avail')!.textContent = fmt(calc.weightedAssets);
  setSurplus('s-movein-surplus', sn.moveInSurplus);

  $('s-reserve-months-lbl')!.textContent = String(inp.reserveMonths);
  $('s-reserve-buffer')!.textContent = fmt(sn.reserveBuffer);
  $('s-total-cash')!.textContent = fmt(sn.totalCashNeeded);
  $('s-reserve-avail')!.textContent = fmt(calc.weightedAssets);
  setSurplus('s-reserve-surplus', sn.reserveSurplus);

  $('s-monthly-rent')!.textContent = fmt(tgt);
  $('s-renters-ins')!.textContent = fmt(inp.rentersInsurance);
  $('s-other-debts-mo')!.textContent = fmt(inp.otherDebts);
  $('s-monthly-total')!.textContent = fmt(sn.monthlyTotal);
  $('s-rent-burden')!.textContent = fmtPct(sn.rentBurden);
  $('s-total-dti')!.textContent = fmtPct(sn.totalDTI);

  // pills
  setPill('pill-cash', 'pd-cash',
    calc.weightedAssets >= sn.totalAtSigning && calc.weightedAssets >= sn.totalCashNeeded,
    `${fmt(calc.weightedAssets)} weighted, ${fmt(sn.totalCashNeeded)} needed`);

  const multOk = tgt <= calc.maxRent_mult;
  setPill('pill-mult', 'pd-mult', multOk,
    `${fmt(inp.annualIncome)} / ${inp.incomeMult} = ${fmt(calc.maxRent_mult)} max`);

  const dtiEl = $('pill-dti') as HTMLElement;
  if (!inp.dtiEnabled) {
    dtiEl.style.display = 'none';
  } else {
    dtiEl.style.display = '';
    const dtiOk = tgt <= calc.maxRent_dti;
    setPill('pill-dti', 'pd-dti', dtiOk,
      `${fmtPct(sn.totalDTI)} total DTI (limit ${inp.dtiPct}%)`);
  }
}

function setSurplus(id: string, val: number) {
  const el = $(id)!;
  el.textContent = val >= 0 ? fmt(val) : `(${fmt(Math.abs(val))})`;
  el.className = 'sr-val ' + (val >= 0 ? 'pos' : 'neg');
}

function setPill(pillId: string, detailId: string, ok: boolean, detail: string) {
  const pill = $(pillId)!;
  pill.className = 'pill ' + (ok ? 'ok' : 'fail');
  pill.querySelector('.p-icon')!.textContent = ok ? '✓' : '✗';
  $(detailId)!.textContent = detail;
}

/* ── Analysis Tab ── */
function renderAnalysisTab(inp: Inputs, calc: CalcResult) {
  $('anl-income-max')!.textContent = fmt(calc.maxRent_income);
  $('anl-cash-max')!.textContent = fmt(calc.maxRent_cash);
  $('anl-binding')!.textContent = calc.binding;

  // Broker scenarios
  const brokerScens: { label: string; type: string; pct?: number; months?: number }[] = [
    { label: 'No broker fee', type: 'none' },
    { label: '15% annual (~1.8 mo)', type: 'pct_annual', pct: 15 },
    { label: '1 month', type: 'months', months: 1 },
    { label: '1.5 months', type: 'months', months: 1.5 },
    { label: '2 months', type: 'months', months: 2 },
  ];
  const brokerTbody = $('broker-scen-tbody')!;
  brokerTbody.innerHTML = '';
  const curBType = inp.brokerType;

  brokerScens.forEach(s => {
    const modInp: Inputs = Object.assign({}, inp, {
      brokerType: s.type,
      brokerFeePct: s.pct !== undefined ? s.pct : inp.brokerFeePct,
      brokerFeeMonths: s.months !== undefined ? s.months : inp.brokerFeeMonths,
    });
    const modCalc = calculate(modInp);
    const isCur = (s.type === 'none' && curBType === 'none') ||
      (s.type === 'pct_annual' && curBType === 'pct_annual' && inp.brokerFeePct === s.pct) ||
      (s.type === 'months' && curBType === 'months' && inp.brokerFeeMonths === s.months);
    const tr = document.createElement('tr');
    if (isCur) tr.className = 'cur';
    const feeLabel = s.type === 'none' ? '$0' :
      s.type === 'pct_annual' ? `${s.pct}% annual` :
        `${s.months} mo`;
    tr.innerHTML = `<td>${escHtml(s.label)}</td><td>${feeLabel}</td><td>${fmt(modCalc.maxRent_cash)}</td>`;
    brokerTbody.appendChild(tr);
  });

  // Reserve scenarios
  const resTbody = $('reserve-scen-tbody')!;
  resTbody.innerHTML = '';
  [0, 1, 2, 3, 6].forEach(rm => {
    const modInp: Inputs = Object.assign({}, inp, { reserveMonths: rm });
    const modCalc = calculate(modInp);
    const cashNeeded = modCalc.maxRent_cash * (1 + modInp.secDepositMonths + brokerMult(modInp) + rm) + modCalc.fixedMovein + rm * (modInp.rentersInsurance + modInp.otherDebts);
    const tr = document.createElement('tr');
    if (rm === inp.reserveMonths) tr.className = 'cur';
    tr.innerHTML = `<td>${rm === 0 ? 'None' : rm + ' month' + (rm > 1 ? 's' : '')}</td><td>${fmt(cashNeeded)}</td><td>${fmt(modCalc.maxRent_cash)}</td>`;
    resTbody.appendChild(tr);
  });

  // Income multiplier sensitivity
  const multTbody = $('mult-scen-tbody')!;
  multTbody.innerHTML = '';
  [35, 40, 45, 50].forEach(mult => {
    const modInp: Inputs = Object.assign({}, inp, { incomeMult: mult });
    const modCalc = calculate(modInp);
    const delta = modCalc.maxRent_mult - calc.maxRent_mult;
    const tr = document.createElement('tr');
    if (mult === inp.incomeMult) tr.className = 'cur';
    const deltaStr = delta === 0 ? '<span class="delta-zero">—</span>' :
      `<span class="${delta > 0 ? 'delta-pos' : 'delta-neg'}">${delta > 0 ? '+' : ''}${fmt(delta)}</span>`;
    tr.innerHTML = `<td>${mult}×</td><td>${fmt(modCalc.maxRent_mult)}</td><td>${deltaStr}</td>`;
    multTbody.appendChild(tr);
  });

  // DTI sensitivity
  const dtiSection = $('dti-scen-section') as HTMLElement;
  if (inp.dtiEnabled) {
    dtiSection.hidden = false;
    const dtiTbody = $('dti-scen-tbody')!;
    dtiTbody.innerHTML = '';
    [30, 33, 35, 40].forEach(pct => {
      const modInp: Inputs = Object.assign({}, inp, { dtiPct: pct });
      const modCalc = calculate(modInp);
      const delta = modCalc.maxRent_dti - calc.maxRent_dti;
      const tr = document.createElement('tr');
      if (pct === inp.dtiPct) tr.className = 'cur';
      const deltaStr = delta === 0 ? '<span class="delta-zero">—</span>' :
        `<span class="${delta > 0 ? 'delta-pos' : 'delta-neg'}">${delta > 0 ? '+' : ''}${fmt(delta)}</span>`;
      tr.innerHTML = `<td>${pct}%</td><td>${fmt(modCalc.maxRent_dti)}</td><td>${deltaStr}</td>`;
      dtiTbody.appendChild(tr);
    });
  } else {
    dtiSection.hidden = true;
  }

  state.analysisRendered = true;
}

/* ── Afford Target Tab ── */
function scheduleAffordRender(inp: Inputs, calc: CalcResult) {
  if (state.affordRafId) cancelAnimationFrame(state.affordRafId);
  state.affordRafId = requestAnimationFrame(() => {
    renderAffordTargetView(inp, calc);
    state.affordRafId = null;
  });
}

function renderAffordTargetView(inp: Inputs, calc: CalcResult) {
  const tgtInput = parseFloat($input('aft-target-rent')!.value);
  const T = isFinite(tgtInput) && tgtInput > 0 ? tgtInput : null;

  if (T === null) {
    ($('aft-prompt') as HTMLElement).hidden = false;
    ($('aft-success') as HTMLElement).hidden = true;
    ($('aft-analysis') as HTMLElement).hidden = true;
    return;
  }

  ($('aft-prompt') as HTMLElement).hidden = true;
  $('aft-sum-target')!.textContent = fmt(T);
  $('aft-sum-max')!.textContent = fmt(calc.maxRent);
  const gap = T - calc.maxRent;
  $('aft-sum-gap')!.textContent = gap > 0 ? fmt(gap) : '$0';
  $('aft-sum-gap')!.className = 'aft-sum-val' + (gap > 0 ? ' neg' : '');

  if (calc.maxRent >= T) {
    ($('aft-success') as HTMLElement).hidden = false;
    ($('aft-analysis') as HTMLElement).hidden = true;
    $('aft-success')!.className = 'aft-success';
    $('aft-ok-icon')!.textContent = '✅';
    $('aft-success-title')!.textContent = 'You qualify!';
    $('aft-success-sub')!.textContent = `Your max of ${fmt(calc.maxRent)}/mo exceeds the target of ${fmt(T)}/mo.`;
    return;
  }

  ($('aft-success') as HTMLElement).hidden = false;
  ($('aft-analysis') as HTMLElement).hidden = false;
  $('aft-success')!.className = 'aft-negative';
  $('aft-ok-icon')!.textContent = '❌';
  $('aft-success-title')!.textContent = 'Not yet — here\'s what to do';
  $('aft-success-sub')!.textContent = `Gap: ${fmt(gap)}/mo. See levers below.`;

  // Income lever
  const incGapMult = Math.max(0, T * inp.incomeMult - inp.annualIncome);
  const incGapDTI = inp.dtiEnabled
    ? Math.max(0, (T + inp.rentersInsurance + inp.otherDebts) * 12 / (inp.dtiPct / 100) - inp.annualIncome)
    : 0;
  const incGap = Math.max(incGapMult, incGapDTI);
  const needIncome = inp.annualIncome + incGap;

  if (incGap <= 0) {
    $('lev-inc-big')!.textContent = 'Already met';
    $('lev-inc-big')!.className = 'lever-big ok';
    $('lev-inc-sub')!.textContent = `Income qualifies at ${fmt(T)}/mo target.`;
    $('lev-inc-badge')!.textContent = '✓ OK';
    $('lev-inc-badge')!.className = 'lbadge ok';
  } else {
    $('lev-inc-big')!.textContent = fmt(needIncome) + '/yr';
    $('lev-inc-big')!.className = 'lever-big neg';
    $('lev-inc-sub')!.textContent = `Need ${fmt(incGap)} more annual income (currently ${fmt(inp.annualIncome)}).`;
    $('lev-inc-badge')!.textContent = '+' + fmt(incGap) + '/yr';
    $('lev-inc-badge')!.className = 'lbadge warn';
  }

  // Cash lever
  const bM = brokerMult(inp);
  const bF = brokerFixed(inp);
  const fixedMI = inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee + bF;
  const fixedRes = inp.reserveMonths * (inp.rentersInsurance + inp.otherDebts);
  const rCoeff = 1 + inp.secDepositMonths + bM + inp.reserveMonths;
  const cashNeeded = T * rCoeff + fixedMI + fixedRes;
  const cashGap = Math.max(0, cashNeeded - calc.weightedAssets);

  if (cashGap <= 0) {
    $('lev-cash-big')!.textContent = 'Already met';
    $('lev-cash-big')!.className = 'lever-big ok';
    $('lev-cash-sub')!.textContent = `${fmt(calc.weightedAssets)} in liquidity-weighted savings covers the ${fmt(cashNeeded)} needed.`;
    $('lev-cash-badge')!.textContent = '✓ OK';
    $('lev-cash-badge')!.className = 'lbadge ok';
    ($('lev-cash-extra') as HTMLElement).hidden = true;
  } else {
    const needCash = calc.weightedAssets + cashGap;
    $('lev-cash-big')!.textContent = fmt(needCash);
    $('lev-cash-big')!.className = 'lever-big neg';
    $('lev-cash-sub')!.textContent = `Need ${fmt(cashGap)} more in liquidity-weighted savings.`;
    $('lev-cash-badge')!.textContent = '+' + fmt(cashGap);
    $('lev-cash-badge')!.className = 'lbadge warn';
    const savingsPerMo = 500;
    const mos = Math.ceil(cashGap / savingsPerMo);
    ($('lev-cash-extra') as HTMLElement).hidden = false;
    $('lev-cash-months')!.textContent = `≈ ${mos} months at $${savingsPerMo.toLocaleString()}/mo savings`;
    $('aft-savings-rate')!.textContent = '';
  }

  // Guarantor lever
  const guarRow = $('lev-guar-row') as HTMLElement;
  if (inp.guarantorEnabled) {
    guarRow.hidden = false;
    const guarNeed = T * inp.guarantorMult;
    $('lev-guar-big')!.textContent = fmt(guarNeed) + '/yr';
    $('lev-guar-big')!.className = 'lever-big';
    $('lev-guar-sub')!.textContent = `Guarantor needs ${fmt(guarNeed)}/yr gross income (${inp.guarantorMult}× rule).`;
    $('lev-guar-badge')!.textContent = 'Need: ' + fmt(guarNeed) + '/yr';
  } else {
    guarRow.hidden = true;
  }

  // Broker lever table
  const brokerTbody = $('lev-broker-tbody')!;
  brokerTbody.innerHTML = '';
  const brokerScens2: { label: string; type: string; pct?: number; months?: number }[] = [
    { label: 'No broker fee', type: 'none' },
    { label: '15% annual', type: 'pct_annual', pct: 15 },
    { label: '1 month', type: 'months', months: 1 },
    { label: '1.5 months', type: 'months', months: 1.5 },
  ];
  const curFee = computeBrokerFee(T, inp);
  brokerScens2.forEach(s => {
    const modInp: Inputs = Object.assign({}, inp, {
      brokerType: s.type,
      brokerFeePct: s.pct !== undefined ? s.pct : inp.brokerFeePct,
      brokerFeeMonths: s.months !== undefined ? s.months : inp.brokerFeeMonths,
    });
    const modCalc = calculate(modInp);
    const scenFee = computeBrokerFee(T, modInp);
    const saved = curFee - scenFee;
    const tr = document.createElement('tr');
    const isCur = s.type === inp.brokerType;
    if (isCur) tr.className = 'cur';
    tr.innerHTML = `<td>${escHtml(s.label)}</td>
      <td class="${saved > 0 ? 'val-pos' : ''}">${saved > 0 ? '+' + fmt(saved) : '—'}</td>
      <td>${fmt(modCalc.maxRent_cash)}</td>`;
    brokerTbody.appendChild(tr);
  });

  // Reserve lever note
  const rl = $('reserve-lever-note')!;
  if (inp.reserveMonths > 0) {
    const modInp0: Inputs = Object.assign({}, inp, { reserveMonths: 0 });
    const calc0 = calculate(modInp0);
    rl.textContent = `Reducing reserve to 0 months raises cash max to ${fmt(calc0.maxRent_cash)}.`;
  } else {
    rl.textContent = '';
  }

  // Gap grid (cash steps × income steps)
  const cashSteps = [0, 25000, 50000, 100000];
  const incomeSteps = [0, 10000, 25000, 50000];
  const tbl = $('aft-gap-grid')!;
  tbl.innerHTML = '';
  // Header row
  const hRow = document.createElement('tr');
  hRow.innerHTML = '<th class="corner">+Income ↓ / +Cash →</th>' +
    cashSteps.map(c => `<th>+${c === 0 ? '$0' : '$' + (c / 1000).toFixed(0) + 'k'} cash</th>`).join('');
  tbl.appendChild(hRow);
  incomeSteps.forEach(inc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th class="row-h">+${inc === 0 ? '$0' : '$' + (inc / 1000).toFixed(0) + 'k'} income</th>`;
    cashSteps.forEach(cash => {
      const modInp: Inputs = Object.assign({}, inp, {
        annualIncome: inp.annualIncome + inc,
        accounts: inp.accounts.map((a, idx) => idx === 0
          ? { ...a, balance: a.balance + cash }
          : { ...a }),
      });
      const modCalc = calculate(modInp);
      const modMax = modCalc.maxRent;
      const diff = modMax - T;
      let cls = 'cell-red';
      if (diff >= 0) cls = 'cell-green';
      else if (Math.abs(diff) <= T * 0.05) cls = 'cell-yellow';
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = fmt(modMax);
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });

  state.affordRendered = true;
}

/* ── tab switching ── */
function activateTab(tabName: string) {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabs.forEach(t => {
    const isActive = (t as HTMLElement).dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  panels.forEach(p => {
    (p as HTMLElement).hidden = p.id !== 'view-' + tabName;
  });

  state.activeTab = tabName;

  // Lazy render
  const inp = readInputs();
  const calc = calculate(inp);
  if (tabName === 'analysis') {
    renderAnalysisTab(inp, calc);
  } else if (tabName === 'afford') {
    scheduleAffordRender(inp, calc);
  } else {
    const tgtInput = parseFloat($input('target-rent')!.value);
    const tgt = isFinite(tgtInput) && tgtInput > 0 ? tgtInput : calc.maxRent;
    renderStandardTab(inp, calc, tgt);
  }
}

/* ── collapsible cards ── */
function initCollapsibleCards() {
  for (let i = 1; i <= 6; i++) {
    const titleEl = $(`card-title-${i}`);
    const bodyEl = $(`card-body-${i}`);
    if (!titleEl || !bodyEl) continue;
    titleEl.addEventListener('click', () => {
      const isOpen = !bodyEl.classList.contains('collapsed');
      if (isOpen) {
        bodyEl.classList.add('collapsed');
        titleEl.setAttribute('aria-expanded', 'false');
        titleEl.querySelector('.card-chev')!.classList.add('open');
      } else {
        bodyEl.classList.remove('collapsed');
        titleEl.setAttribute('aria-expanded', 'true');
        titleEl.querySelector('.card-chev')!.classList.remove('open');
      }
    });
  }
}

/* ── collapsible info sections ── */
function initInfoSections() {
  ([['how-btn', 'how-body'], ['assump-btn', 'assump-body']] as const).forEach(([btnId, bodyId]) => {
    const btn = $(btnId)!;
    const body = $(bodyId)!;
    btn.addEventListener('click', () => {
      const open = body.classList.contains('open');
      body.classList.toggle('open', !open);
      btn.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
}

/* ── broker type visibility ── */
function updateBrokerRows() {
  const t = $select('broker-type')!.value;
  ($('broker-pct-row') as HTMLElement).hidden = (t !== 'pct_annual');
  ($('broker-months-row') as HTMLElement).hidden = (t !== 'months');
  ($('broker-flat-row') as HTMLElement).hidden = (t !== 'flat');
}

/* ── localStorage: page-scoped input persistence ── */
function isSaveEnabled() { return ($('save-toggle-cb') as HTMLInputElement).checked; }

function saveToStorage(inp: Inputs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      accounts: inp.accounts,
      annualIncome: inp.annualIncome,
      otherDebts: inp.otherDebts,
      incomeMult: inp.incomeMult,
      dtiEnabled: inp.dtiEnabled,
      dtiPct: inp.dtiPct,
      guarantorEnabled: inp.guarantorEnabled,
      guarantorMult: inp.guarantorMult,
      secDepositMonths: inp.secDepositMonths,
      appFee: inp.appFee,
      buildingFee: inp.buildingFee,
      utilitySetup: inp.utilitySetup,
      petFee: inp.petFee,
      brokerType: inp.brokerType,
      brokerFeePct: inp.brokerFeePct,
      brokerFeeMonths: inp.brokerFeeMonths,
      brokerFlat: inp.brokerFlat,
      rentersInsurance: inp.rentersInsurance,
      reserveMonths: inp.reserveMonths,
    }));
  } catch (e) { /* storage full or disabled */ }
  saveSharedProfile({ accounts: inp.accounts, annualIncome: inp.annualIncome, otherDebts: inp.otherDebts });
  saveSharedAssumptions(inp);
}

function loadFromStorage(): any {
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function clearStorage() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
}

function restoreInputs(data: any) {
  if (data.accounts && Array.isArray(data.accounts) && data.accounts.length) {
    state.accounts = data.accounts.map((a: Account) => ({ ...a }));
    renderAccounts();
  }
  const setV = (id: string, val: unknown) => { const el = $input(id) || $select(id); if (el && val !== undefined) (el as HTMLInputElement | HTMLSelectElement).value = String(val); };
  const setC = (id: string, val: unknown) => { const el = $input(id); if (el && val !== undefined) el.checked = Boolean(val); };
  setV('annual-income', data.annualIncome);
  setV('other-debts', data.otherDebts);
  setV('income-mult', data.incomeMult);
  setC('dti-enabled', data.dtiEnabled);
  setV('dti-pct', data.dtiPct);
  setC('guarantor-enabled', data.guarantorEnabled);
  setV('guarantor-mult', data.guarantorMult);
  setV('sec-deposit', data.secDepositMonths);
  setV('app-fee', data.appFee);
  setV('building-fee', data.buildingFee);
  setV('utility-setup', data.utilitySetup);
  setV('pet-fee', data.petFee);
  setV('broker-type', data.brokerType);
  setV('broker-pct', data.brokerFeePct);
  setV('broker-months-val', data.brokerFeeMonths);
  setV('broker-flat-val', data.brokerFlat);
  setV('renters-insurance', data.rentersInsurance);
  setV('reserve-months', data.reserveMonths);
  // show/hide conditional rows
  ($('dti-row') as HTMLElement).hidden = !data.dtiEnabled;
  ($('guarantor-row') as HTMLElement).hidden = !data.guarantorEnabled;
  updateBrokerRows();
}

/* ── shared financial profile (accounts/income/debts, shared across calculators) ──
   applySharedProfile is page-local: it wires the shared data into rent's own
   accounts-table DOM and derives `liquidity` for accounts that came from a
   calculator (like the co-op calculator) that doesn't have that field. */
function applySharedProfile(shared: SharedProfile | null) {
  if (!shared) return;
  if (Array.isArray(shared.accounts) && shared.accounts.length) {
    state.accounts = (shared.accounts as any[]).map(a => ({
      ...a,
      liquidity: a.liquidity !== undefined
        ? a.liquidity
        : (a.closing ? 100 : (a.reserve || 0)),
    }));
    renderAccounts();
  }
  const sv = (id: string, v: unknown) => { if (v !== undefined) { const el = $input(id); if (el) el.value = String(v); } };
  sv('annual-income', shared.annualIncome);
  sv('other-debts', shared.otherDebts);
}

/* ── shared assumptions (rent-specific: income multiplier, renters insurance,
   reserve months) — not part of the general sharedProfile schema, so this stays
   its own localStorage key rather than living in lib/sharedProfile. ── */
function loadSharedAssumptions(): { rent: RentAssumptions } | null {
  try {
    const s = localStorage.getItem(ASSUMPTIONS_KEY);
    return s ? { rent: JSON.parse(s) } : null;
  } catch (e) { return null; }
}

function saveSharedAssumptions(inp: Inputs) {
  try {
    localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify({
      incomeMult: inp.incomeMult, rentersInsurance: inp.rentersInsurance, reserveMonths: inp.reserveMonths,
    }));
  } catch (e) { /* ignore */ }
}

function applySharedAssumptions(asmp: { rent: RentAssumptions } | null) {
  if (!asmp || !asmp.rent) return;
  const r = asmp.rent;
  const sv = (id: string, v: unknown) => { if (v != null) { const el = $input(id) || $select(id); if (el) (el as HTMLInputElement | HTMLSelectElement).value = String(v); } };
  sv('income-mult', r.incomeMult);
  sv('renters-insurance', r.rentersInsurance);
  // Only apply reserve-months if it matches a valid select option
  const validReserve = [0, 1, 2, 3, 6];
  if (r.reserveMonths != null && validReserve.includes(Number(r.reserveMonths))) {
    sv('reserve-months', r.reserveMonths);
  }
}

/* ── onChange ── */
function onChange() {
  state.analysisRendered = false;
  state.affordRendered = false;
  updateResults();
}

/* ── DOMContentLoaded boot ── */
document.addEventListener('DOMContentLoaded', () => {

  // Render default accounts
  renderAccounts();

  // Restore saved data if available
  const saved = loadFromStorage();
  if (saved) {
    ($('save-toggle-cb') as HTMLInputElement).checked = true;
    restoreInputs(saved);
  }
  // Apply shared financial profile (accounts/income/debts from any calculator with save on)
  applySharedProfile(loadSharedProfile());
  // Apply shared assumptions (overrides defaults with values set on any calculator)
  applySharedAssumptions(loadSharedAssumptions());

  // Cross-tab sync: when another calculator saves, update accounts/income/debts here
  window.addEventListener('storage', e => {
    if (e.key === SHARED_KEY) {
      applySharedProfile(loadSharedProfile());
      onChange();
    } else if (e.key === ASSUMPTIONS_KEY) {
      applySharedAssumptions(loadSharedAssumptions());
      onChange();
    }
  });

  // Initial compute
  updateResults();

  // Save toggle
  $('save-toggle-cb')!.addEventListener('change', () => {
    if (isSaveEnabled()) {
      saveToStorage(readInputs());
    } else {
      clearStorage();
    }
  });

  // Account table events (delegated)
  $('acct-tbody')!.addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    const i = parseInt(el.dataset.i || '', 10);
    const f = el.dataset.f;
    if (isNaN(i) || !f) return;
    if (f === 'name') {
      state.accounts[i].name = el.value;
    } else if (f === 'balance') {
      state.accounts[i].balance = parseFloat(el.value) || 0;
      refreshAvailCell(i);
      refreshTotals();
    } else if (f === 'liquidity') {
      state.accounts[i].liquidity = clamp(parseFloat(el.value) || 0, 0, 100);
      refreshAvailCell(i);
      refreshTotals();
    }
    onChange();
  });

  $('acct-tbody')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.btn-del') as HTMLElement | null;
    if (!btn) return;
    const i = parseInt(btn.dataset.i || '', 10);
    if (isNaN(i) || i < 2) return;
    state.accounts.splice(i, 1);
    renderAccounts();
    onChange();
  });

  $('btn-add-acct')!.addEventListener('click', () => {
    state.accounts.push({ name: 'Account', balance: 0, liquidity: 100 });
    renderAccounts();
    onChange();
  });

  // All other inputs
  const inputIds = [
    'annual-income', 'other-debts', 'income-mult', 'dti-pct', 'guarantor-mult',
    'sec-deposit', 'app-fee', 'building-fee', 'utility-setup', 'pet-fee',
    'broker-type', 'broker-pct', 'broker-months-val', 'broker-flat-val',
    'renters-insurance', 'reserve-months',
  ];
  inputIds.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', onChange);
  });
  ['annual-income', 'other-debts', 'income-mult', 'dti-pct', 'guarantor-mult',
    'app-fee', 'building-fee', 'utility-setup', 'pet-fee',
    'broker-pct', 'broker-months-val', 'broker-flat-val', 'renters-insurance'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', onChange);
  });

  // Broker type visibility
  $('broker-type')!.addEventListener('change', () => {
    updateBrokerRows();
    onChange();
  });

  // DTI toggle
  $('dti-enabled')!.addEventListener('change', () => {
    ($('dti-row') as HTMLElement).hidden = !($input('dti-enabled')!.checked);
    onChange();
  });

  // Guarantor toggle
  $('guarantor-enabled')!.addEventListener('change', () => {
    ($('guarantor-row') as HTMLElement).hidden = !($input('guarantor-enabled')!.checked);
    onChange();
  });

  // Target rent
  $('target-rent')!.addEventListener('input', () => {
    const v = parseFloat($input('target-rent')!.value);
    state.targetOverride = (isFinite(v) && v > 0) ? v : null;
    updateResults();
  });
  $('btn-reset-tgt')!.addEventListener('click', () => {
    $input('target-rent')!.value = '';
    state.targetOverride = null;
    updateResults();
  });

  // Borough presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = parseFloat((btn as HTMLElement).dataset.preset || '0');
      $input('target-rent')!.value = String(preset);
      state.targetOverride = preset;
      updateResults();
    });
  });

  // Afford target rent
  $('aft-target-rent')!.addEventListener('input', () => {
    const v = parseFloat($input('aft-target-rent')!.value);
    state.aftTarget = (isFinite(v) && v > 0) ? v : null;
    if (state.activeTab === 'afford') {
      const inp = readInputs();
      const calc = calculate(inp);
      scheduleAffordRender(inp, calc);
    }
  });
  $('btn-aft-reset')!.addEventListener('click', () => {
    $input('aft-target-rent')!.value = '';
    state.aftTarget = null;
    if (state.activeTab === 'afford') {
      const inp = readInputs();
      const calc = calculate(inp);
      scheduleAffordRender(inp, calc);
    }
  });

  // Tabs
  const tabBtns = document.querySelectorAll('[role="tab"]');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab((btn as HTMLElement).dataset.tab!));
    btn.addEventListener('keydown', e => {
      const evt = e as KeyboardEvent;
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const idx = tabs.indexOf(evt.target as Element);
      let next = idx;
      if (evt.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (evt.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else if (evt.key === 'Home') next = 0;
      else if (evt.key === 'End') next = tabs.length - 1;
      else return;
      evt.preventDefault();
      (tabs[next] as HTMLElement).focus();
      activateTab((tabs[next] as HTMLElement).dataset.tab!);
    });
  });

  // Collapsible cards & info sections
  initCollapsibleCards();
  initInfoSections();

  // Broker rows initial state
  updateBrokerRows();

  // Share result
  wireShareButton('rent-share', () => {
    const c = lastCalc;
    const text = c
      ? `My NYC max affordable rent: ${fmt(c.maxRent)}/mo (${c.binding})`
      : 'My NYC rent affordability result';
    return { title: 'My NYC Rent Affordability', text, url: 'https://www.nyc-affordability.com/rent/' };
  });
});
