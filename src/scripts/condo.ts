import { loadSharedProfile, saveSharedProfile, SHARED_KEY, type SharedProfile } from '../lib/sharedProfile';
import { calcMortgageRecordingTax, calcPmiRate, calcPmiMonthly, calcMansionTax, bsearchMaxPrice } from '../lib/calc';

/* ============================================================
   NYC Condo Affordability Calculator — TypeScript port
   ============================================================
   NOTE on formatters: condo's original fmt$()/fmtPct()/fmtMo()/fmtShort$()
   are NOT reused from ../lib/format because their behavior differs in ways
   that matter for byte-identical output:
     - fmt$() wraps negative values in parens, e.g. "($500)", rather than
       fmtMoney's "$-500".
     - fmtPct() here takes a FRACTION (0.452) and always renders one
       decimal place ("45.2%"); the shared fmtPercent expects a WHOLE
       number percent (45.2) and rounds to an integer once n >= 10. Both
       the input convention and the rounding differ, so the local version
       is kept verbatim.
     - fmtMo() and fmtShort$() have no shared equivalent at all.
   These are kept local, same approach used for rent's fmt()/fmtPct().
   ============================================================ */

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
  mortgageRate: number;
  loanTerm: number;
  dpPct: number;
  reserveMo: number;
  maxDtiPct: number;
  commonCharges: number;
  propTaxes: number;
  hoInsurance: number;
  fcAtty: number;
  fcLender: number;
  fcAppraisal: number;
  fcRecording: number;
  fcBuilding: number;
  wcMonths: number;
  titlePricePct: number;
  titleLoanPct: number;
  targetOverride: number | null;
}

interface CondoAssumptions {
  mortgageRate?: number;
  dpPct?: number;
  commonCharges?: number;
  propTaxes?: number;
  hoInsurance?: number;
  maxDtiPct?: number;
}

/* ═══════════════════════════════════════
   STATE
   ═══════════════════════════════════════ */
const state = {
  accounts: [
    { name: 'Checking',                balance:  20000, liquidity: 100 },
    { name: 'High-Yield Savings',      balance:  80000, liquidity: 100 },
    { name: 'Brokerage / Investments', balance: 200000, liquidity: 100 },
  ] as Account[],
  targetOverride:      null as number | null,   // null = use maxPrice
  reservesEnabled:     false,
  workingCapEnabled:   false,
};

/* ═══════════════════════════════════════
   CLOSING COSTS (page-local: depends on state.workingCapEnabled)
   ═══════════════════════════════════════ */
function computeCC(price: number, dp: number, inp: Inputs) {
  const loanAmt  = price * (1 - dp);
  const fixedBase = (inp.fcAtty||0) + (inp.fcLender||0) + (inp.fcAppraisal||0)
                  + (inp.fcRecording||0) + (inp.fcBuilding||0);
  const wc = state.workingCapEnabled ? (inp.wcMonths||0) * (inp.commonCharges||0) : 0;
  const fixed   = fixedBase + wc;
  const title   = price * (inp.titlePricePct||0)/100 + loanAmt * (inp.titleLoanPct||0)/100;
  const mrt     = calcMortgageRecordingTax(loanAmt);
  const mansion = calcMansionTax(price);
  const total   = fixed + title + mrt + mansion;
  return { fixed, title, mrt, mansion, total };
}

/* ═══════════════════════════════════════
   DERIVE CONSTANTS FROM INPUT SET
   ═══════════════════════════════════════ */
function deriveConstants(inp: Inputs) {
  const weightedAssets = inp.accounts.reduce((s, a) => s + (a.balance||0) * (a.liquidity||0) / 100, 0);
  const moInc     = (inp.annualIncome||0) / 12;
  const rm        = (inp.mortgageRate||0) / 100 / 12;
  const nMo       = (inp.loanTerm||30) * 12;
  let K = 0;
  if (nMo > 0) K = rm === 0 ? 1/nMo : rm / (1 - Math.pow(1+rm, -nMo));
  const dtiMax    = (inp.maxDtiPct||0) / 100;
  const resMo     = state.reservesEnabled ? (inp.reserveMo||0) : 0;
  const carrying  = (inp.commonCharges||0) + (inp.propTaxes||0) + (inp.hoInsurance||0); // monthly carrying
  const oDebts    = inp.otherDebts||0;
  const minDp     = (inp.dpPct||0) / 100;
  // Budget for mortgage P+I after covering carrying + oDebts under DTI
  const A         = dtiMax * moInc - carrying - oDebts;
  return { weightedAssets, moInc, K, dtiMax, resMo, carrying, oDebts, minDp, A, inp };
}
type Constants = ReturnType<typeof deriveConstants>;

/* ═══════════════════════════════════════
   PRICE CEILINGS AT A GIVEN DP
   ═══════════════════════════════════════ */
function priceAtDp(c: Constants, dp: number) {
  const { weightedAssets, K, resMo, carrying, A, inp } = c;
  const PMAX = 20000000;

  // DTI ceiling — PMI increases effective monthly cost on the loan
  const effK = K + calcPmiRate(dp) / 12;
  const denom = (1 - dp) * effK;
  const pDti = (denom > 0 && A > 0) ? A / denom : (A > 0 ? Infinity : 0);

  // DP+CC ceiling — binary search: liquidity-weighted assets >= dp*P + CC(P,dp).total
  const pDpCC = bsearchMaxPrice(p => {
    const cc = computeCC(p, dp, inp);
    return weightedAssets >= dp * p + cc.total;
  }, PMAX);

  // Reserve ceiling — binary search (only when resMo > 0); includes PMI in monthly cost
  let pReserve = Infinity;
  if (resMo > 0) {
    pReserve = bsearchMaxPrice(p => {
      const loanAmt = p * (1 - dp);
      const moMtg   = loanAmt * K;
      const moPmi   = calcPmiMonthly(loanAmt, dp);
      const cc      = computeCC(p, dp, inp);
      const resReq  = resMo * (moMtg + moPmi + carrying);
      return weightedAssets >= dp * p + cc.total + resReq;
    }, PMAX);
  }

  const pCash = Math.min(pDpCC, pReserve);
  const pAch  = Math.min(pCash, isFinite(pDti) ? pDti : pCash);

  return { pDpCC, pReserve, pCash, pDti, pAch };
}

/* ═══════════════════════════════════════
   CALCULATE — main snapshot function
   ═══════════════════════════════════════ */
function calculate(inp: Inputs) {
  const c = deriveConstants(inp);
  const { weightedAssets, K, resMo, carrying, oDebts, moInc, dtiMax } = c;

  // Max price at the user's chosen dp
  const dp = c.minDp;
  const prices = priceAtDp(c, dp);
  const cashMax   = prices.pCash;
  const dtiMaxP   = isFinite(prices.pDti) ? prices.pDti : null;
  const maxPrice  = Math.max(0, prices.pAch);

  const binding =
    prices.pCash <= (dtiMaxP !== null ? dtiMaxP : Infinity)
      ? (prices.pDpCC <= prices.pReserve ? 'DP / Closing Costs' : 'Cash / Reserves')
      : 'DTI / Income';

  // Snapshot at target price
  const tgt = (inp.targetOverride !== null && isFinite(inp.targetOverride) && inp.targetOverride >= 0)
              ? inp.targetOverride : maxPrice;

  const downPmt  = tgt * dp;
  const loanAmt  = tgt * (1 - dp);
  const moMtg    = loanAmt * K;
  const moPmi    = calcPmiMonthly(loanAmt, dp);
  const cc       = computeCC(tgt, dp, inp);
  const totalAtClose = downPmt + cc.total;
  const resReq   = resMo * (moMtg + moPmi + carrying);
  const totalCash = totalAtClose + resReq;
  const dpSurplus = weightedAssets - totalAtClose;
  const surplus   = weightedAssets - totalCash;
  const pcLiquid  = weightedAssets - totalAtClose;
  const moTotal   = moMtg + moPmi + carrying;
  const pcMonths  = moTotal > 0 ? pcLiquid / moTotal : 0;
  const dtiActual = moInc > 0 ? (moTotal + oDebts) / moInc : 0;

  const cashOk = dpSurplus >= 0 && (resMo === 0 || surplus >= 0);
  const dtiOk  = dtiActual <= dtiMax;
  const resOk  = resMo === 0 || pcMonths >= resMo;

  return {
    weightedAssets, moInc, K, cc, carrying,
    cashMax, dtiMaxPrice: dtiMaxP,
    maxPrice, binding,
    tgt, downPmt, loanAmt, moMtg, moPmi,
    totalAtClose, resReq, totalCash,
    dpSurplus, surplus, pcLiquid, pcMonths,
    moTotal, dtiActual, dtiMax, resMo,
    cashOk, dtiOk, resOk,
  };
}
type CalcResult = ReturnType<typeof calculate>;

/* ═══════════════════════════════════════
   DEAL SNAPSHOT AT PRICE + DP (for optimizer/afford-target)
   ═══════════════════════════════════════ */
function dealAtPriceDp(c: Constants, price: number, dp: number) {
  const { weightedAssets, K, resMo, carrying, oDebts, moInc, inp } = c;
  const loanAmt      = price * (1 - dp);
  const moMtg        = loanAmt * K;
  const moPmi        = calcPmiMonthly(loanAmt, dp);
  const cc           = computeCC(price, dp, inp);
  const totalAtClose = price * dp + cc.total;
  const resReq       = resMo * (moMtg + moPmi + carrying);
  const totalCash    = totalAtClose + resReq;
  const dpSurplus    = weightedAssets - totalAtClose;
  const surplus      = weightedAssets - totalCash;
  const moTotal      = moMtg + moPmi + carrying;
  const dti          = moInc > 0 ? (moTotal + oDebts) / moInc : 0;
  const pcLiquid     = weightedAssets - totalAtClose;
  const pcMonths     = moTotal > 0 ? pcLiquid / moTotal : 0;
  return { loanAmt, moMtg, moPmi, cc, totalAtClose, resReq, totalCash, dpSurplus, surplus, moTotal, dti, pcLiquid, pcMonths, downPmt: price*dp };
}

/* ═══════════════════════════════════════
   OPTIMIZER — numerical grid search
   ═══════════════════════════════════════ */
function computeOptimizer(inp: Inputs): any {
  const c = deriveConstants(inp);
  const HARD_DP_MAX = Math.max(0.80, c.minDp);

  if (c.A <= 0) {
    return { ok: false, c,
      title: 'Income insufficient for these carrying costs',
      detail: 'Common charges + taxes + insurance + other debts already exceed your DTI budget. There is no down payment that qualifies you — increase income, reduce DTI limit, or find lower carrying costs.' };
  }

  // Check feasibility at minDp (fast path: is there a deal at all?)
  const minPrices = priceAtDp(c, c.minDp);
  if (minPrices.pAch <= 0 && c.weightedAssets <= 0) {
    return { ok: false, c,
      title: 'Insufficient assets',
      detail: 'Your liquidity-weighted assets do not cover the minimum closing costs. Add assets, increase Liquidity %, or reduce closing costs.' };
  }

  // Grid search: 201 points from minDp to HARD_DP_MAX
  const N = 201;
  let dpOptimal = c.minDp;
  let bestPAch  = -Infinity;
  const dpSamples: any[] = [];
  for (let i = 0; i < N; i++) {
    const dp = c.minDp + (HARD_DP_MAX - c.minDp) * (i / (N - 1));
    const p  = priceAtDp(c, dp);
    dpSamples.push({ dp, ...p });
    if (p.pAch > bestPAch) { bestPAch = p.pAch; dpOptimal = dp; }
  }

  const optPrices  = priceAtDp(c, dpOptimal);
  const pMaxTrue   = Math.max(0, optPrices.pAch);
  const basePrices = priceAtDp(c, c.minDp);
  const pStandard  = Math.max(0, basePrices.pAch);
  const gain       = pMaxTrue - pStandard;

  const eps      = 1;
  const baseBind = basePrices.pCash <= basePrices.pDti - eps ? 'cash'
                 : basePrices.pDti  <= basePrices.pCash - eps ? 'dti' : 'both';

  return {
    ok: true, c, dpOptimal, dpSamples,
    pMaxTrue, pStandard, gain,
    baseBind, optPrices, basePrices,
    HARD_DP_MAX,
    clampedAt: dpOptimal >= HARD_DP_MAX - 1e-6 ? 'max' : null,
  };
}

// Sensitivity: re-run optimizer with one input changed
function runSensitivity(baseInp: Inputs, basePrice: number) {
  const tweaks: { label: string; mod: (i: Inputs) => Inputs }[] = [
    { label: '+$25k more cash',   mod: i => addCash(i, 25000) },
    { label: '+$50k more cash',   mod: i => addCash(i, 50000) },
    { label: '+$10k/yr income',   mod: i => ({ ...i, annualIncome: (i.annualIncome||0) + 10000 }) },
    { label: '+$25k/yr income',   mod: i => ({ ...i, annualIncome: (i.annualIncome||0) + 25000 }) },
    { label: 'DTI → 45%',         mod: i => ({ ...i, maxDtiPct: 45 }) },
    { label: 'Rate → 5.5%',       mod: i => ({ ...i, mortgageRate: 5.5 }) },
  ];
  return tweaks.map(t => {
    const modified = t.mod(baseInp);
    const opt = computeOptimizer(modified);
    const newPrice = opt.ok ? opt.pMaxTrue : 0;
    return { label: t.label, newPrice, delta: newPrice - basePrice, ok: opt.ok };
  });
}

function addCash(inp: Inputs, amount: number): Inputs {
  const accounts = inp.accounts.concat([{ name: '__sens', balance: amount, liquidity: 100 }]);
  return { ...inp, accounts };
}

/* ═══════════════════════════════════════
   FORMATTING
   ═══════════════════════════════════════ */
function fmt$(n: number): string {
  const r = Math.round(n);
  const s = '$' + Math.abs(r).toLocaleString('en-US');
  return r < 0 ? '(' + s + ')' : s;
}
function fmtPct(frac: number): string { return (frac * 100).toFixed(1) + '%'; }
function fmtMo(n: number): string     { return n.toFixed(1) + ' mo'; }
function fmtShort$(v: number): string {
  if (v >= 1e6) return '$' + (v/1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + Math.round(v/1e3) + 'k';
  return '$' + Math.round(v);
}

/* ═══════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════ */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
const tx = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };

/* ═══════════════════════════════════════
   ACCOUNTS TABLE
   ═══════════════════════════════════════ */
function renderAccounts() {
  const tbody = $('acct-tbody')!;
  tbody.innerHTML = '';
  state.accounts.forEach((acct, i) => {
    const avail = (acct.balance||0) * (acct.liquidity||0) / 100;
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    const inName = document.createElement('input'); inName.type = 'text'; inName.value = acct.name;
    inName.addEventListener('input', e => { state.accounts[i].name = (e.target as HTMLInputElement).value; saveToStorage(); });
    tdName.appendChild(inName);

    const tdBal = document.createElement('td');
    const inBal = document.createElement('input'); inBal.type = 'number'; inBal.min = '0'; inBal.step = '1000'; inBal.value = String(acct.balance);
    inBal.addEventListener('input', e => { state.accounts[i].balance = parseFloat((e.target as HTMLInputElement).value)||0; refreshAvailCell(i); onChange(); });
    tdBal.appendChild(inBal);

    const tdLiq = document.createElement('td');
    const inLiq = document.createElement('input'); inLiq.type = 'number'; inLiq.min = '0'; inLiq.max = '100'; inLiq.step = '5'; inLiq.value = String(acct.liquidity);
    inLiq.addEventListener('input', e => { state.accounts[i].liquidity = parseFloat((e.target as HTMLInputElement).value)||0; refreshAvailCell(i); onChange(); });
    tdLiq.appendChild(inLiq);

    const tdDp = document.createElement('td');
    const divDp = document.createElement('div');
    const hasDpValue = avail > 0;
    divDp.className = 'avail-cell' + (hasDpValue ? '' : ' dim');
    divDp.id = 'dp-' + i;
    divDp.textContent = hasDpValue ? fmt$(avail) : '—';
    tdDp.appendChild(divDp);

    const tdAvail = document.createElement('td');
    const divAvail = document.createElement('div');
    divAvail.className = 'avail-cell'; divAvail.id = 'avail-' + i; divAvail.textContent = fmt$(avail);
    tdAvail.appendChild(divAvail);

    const tdDel = document.createElement('td'); tdDel.className = 'del-cell';
    if (i >= 2) {
      const btn = document.createElement('button'); btn.className = 'btn-del'; btn.textContent = '×'; btn.title = 'Remove row';
      btn.addEventListener('click', () => { state.accounts.splice(i, 1); renderAccounts(); onChange(); });
      tdDel.appendChild(btn);
    }
    tr.append(tdName, tdBal, tdLiq, tdDp, tdAvail, tdDel);
    tbody.appendChild(tr);
  });
  refreshTotals();
}

function refreshAvailCell(i: number) {
  const a = state.accounts[i];
  const el = $('avail-' + i);
  if (el) el.textContent = fmt$((a.balance||0)*(a.liquidity||0)/100);
  const elDp = $('dp-' + i);
  if (elDp) {
    const dpValue = (a.balance||0)*(a.liquidity||0)/100;
    const hasDpValue = dpValue > 0;
    elDp.className = 'avail-cell'+(hasDpValue?'':' dim');
    elDp.textContent = hasDpValue ? fmt$(dpValue) : '—';
  }
  refreshTotals();
}

function refreshTotals() {
  const totA = state.accounts.reduce((s,a) => s+(a.balance||0)*(a.liquidity||0)/100, 0);
  const totL = totA;
  tx('tot-avail', fmt$(totA));
  tx('tot-liquid', fmt$(totL));
}

/* ═══════════════════════════════════════
   READ INPUTS
   ═══════════════════════════════════════ */
function nv(id: string): number { return parseFloat($input(id)!.value)||0; }

function readInputs(): Inputs {
  return {
    accounts:      state.accounts,
    annualIncome:  nv('annual-income'),
    otherDebts:    nv('other-debts'),
    mortgageRate:  nv('mtg-rate'),
    loanTerm:      nv('loan-term'),
    dpPct:         nv('dp-pct'),
    reserveMo:     nv('reserve-mo'),
    maxDtiPct:     nv('max-dti'),
    commonCharges: nv('common-charges'),
    propTaxes:     nv('prop-taxes'),
    hoInsurance:   nv('ho-insurance'),
    fcAtty:        nv('fc-atty'),
    fcLender:      nv('fc-lender'),
    fcAppraisal:   nv('fc-appraisal'),
    fcRecording:   nv('fc-recording'),
    fcBuilding:    nv('fc-building'),
    wcMonths:      nv('wc-months'),
    titlePricePct: nv('title-price-pct'),
    titleLoanPct:  nv('title-loan-pct'),
    targetOverride: state.targetOverride,
  };
}

/* ═══════════════════════════════════════
   UPDATE RESULTS (Standard view)
   ═══════════════════════════════════════ */
function updateResults(r: CalcResult) {
  // Hero
  const heroEl = $('hero-price')!;
  heroEl.textContent = fmt$(r.maxPrice);
  heroEl.className   = 'hero-price' + (r.maxPrice === 0 ? ' zero' : '');
  tx('hero-binding', r.binding);

  const warnEl = $('hero-warn') as HTMLElement;
  if (r.maxPrice === 0) {
    warnEl.style.display = 'block';
    if (r.moInc > 0 && r.dtiMax * r.moInc <= r.carrying) {
      warnEl.textContent = 'Carrying costs alone (common charges + taxes + insurance) exceed your DTI limit. Increase income or reduce monthly costs.';
    } else {
      warnEl.textContent = 'Not enough assets or income to qualify at current inputs. Try adjusting down payment %, reserve months, or closing costs.';
    }
  } else {
    warnEl.style.display = 'none';
  }

  // Mansion tax row — highlight when > 0
  const mansionRow = $('mansion-snap-row') as HTMLElement;
  if (r.cc.mansion > 0) {
    mansionRow.classList.add('mansion-row');
    mansionRow.style.display = '';
  } else {
    mansionRow.classList.remove('mansion-row');
    mansionRow.style.display = 'none';
  }

  // Reserves section visibility
  const reservesSnap = $('reserves-snap') as HTMLElement;
  const pillResWrap  = $('pill-res-wrap') as HTMLElement;
  reservesSnap.style.display = state.reservesEnabled ? '' : 'none';
  pillResWrap.style.display  = state.reservesEnabled ? '' : 'none';

  // Fixed CC total in inputs panel
  const baseFixed = (nv('fc-atty')) + (nv('fc-lender')) + (nv('fc-appraisal')) + (nv('fc-recording')) + (nv('fc-building'));
  const wc = state.workingCapEnabled ? (nv('wc-months')) * (nv('common-charges')) : 0;
  tx('fc-fixed-total-display', fmt$(baseFixed + wc));

  // Monthly income display
  $input('monthly-income')!.value = String(Math.round(r.moInc));

  // Target price sync
  const tgtIn = $input('target-price')!;
  if (document.activeElement !== tgtIn) {
    if (state.targetOverride === null) tgtIn.value = String(Math.round(r.maxPrice));
    else if (isFinite(state.targetOverride)) tgtIn.value = String(Math.round(state.targetOverride));
  }

  // Reserve month labels
  tx('s-res-mo1', String(r.resMo));

  // Cash Waterfall
  tx('s-dp',      fmt$(r.downPmt));
  tx('s-fcc',     fmt$(r.cc.fixed));
  tx('s-title',   fmt$(r.cc.title));
  tx('s-mrt',     fmt$(r.cc.mrt));
  tx('s-mansion', fmt$(r.cc.mansion));
  tx('s-atclose', fmt$(r.totalAtClose));
  tx('s-dp-avail', fmt$(r.weightedAssets));

  const dpSurplusEl = $('s-dp-surplus')!;
  dpSurplusEl.textContent = fmt$(r.dpSurplus);
  dpSurplusEl.className = 'sr-val ' + (r.dpSurplus >= 0 ? 'pos' : 'neg');

  if (state.reservesEnabled) {
    tx('s-res-req',    fmt$(r.resReq));
    tx('s-total-cash', fmt$(r.totalCash));
    tx('s-avail',      fmt$(r.weightedAssets));
    const surplusEl = $('s-surplus')!;
    surplusEl.textContent = fmt$(r.surplus);
    surplusEl.className = 'sr-val ' + (r.surplus >= 0 ? 'pos' : 'neg');
    tx('s-pc-liquid', fmt$(r.pcLiquid));
    const moEl = $('s-pc-months')!;
    moEl.textContent = fmtMo(r.pcMonths);
    moEl.className = 'sr-val ' + (r.resOk ? '' : 'neg');
  }

  // PMI row — show when dp < 20%
  const pmiRow = $('pmi-snap-row') as HTMLElement;
  if (r.moPmi > 0) {
    pmiRow.style.display = '';
    tx('s-pmi', fmt$(r.moPmi));
  } else {
    pmiRow.style.display = 'none';
  }

  // Monthly costs
  tx('s-mtg',          fmt$(r.moMtg));
  tx('s-common',       fmt$(r.carrying - (nv('prop-taxes')) - (nv('ho-insurance'))));
  tx('s-taxes',        fmt$(nv('prop-taxes')));
  tx('s-insur',        fmt$(nv('ho-insurance')));
  tx('s-monthly-total', fmt$(r.moTotal));

  const dtiEl = $('s-dti')!;
  dtiEl.textContent = fmtPct(r.dtiActual) + '  (max ' + fmtPct(r.dtiMax) + ')';
  dtiEl.className = 'sr-val ' + (r.dtiOk ? '' : 'neg');

  // Feasibility pills
  const dpOk = r.dpSurplus >= 0;
  setPill('pill-cash', 'pd-cash', r.cashOk,
    r.cashOk
      ? fmt$(r.dpSurplus) + ' surplus'
      : dpOk ? 'Reserves SHORT by ' + fmt$(Math.abs(r.surplus))
              : 'DP/CC SHORT by ' + fmt$(Math.abs(r.dpSurplus)));
  setPill('pill-dti', 'pd-dti', r.dtiOk,
    r.dtiOk ? fmtPct(r.dtiActual) + ' (max ' + fmtPct(r.dtiMax) + ')'
            : fmtPct(r.dtiActual) + ' — OVER max ' + fmtPct(r.dtiMax));
  if (state.reservesEnabled) {
    setPill('pill-res', 'pd-res', r.resOk,
      r.resOk ? r.pcMonths.toFixed(1) + ' months post-close'
              : r.pcMonths.toFixed(1) + ' months (need ' + r.resMo + ')');
  }
}

function setPill(pillId: string, detailId: string, ok: boolean, detail: string) {
  const pill = $(pillId);
  if (!pill) return;
  pill.className = 'pill ' + (ok ? 'ok' : 'fail');
  pill.querySelector('.p-icon')!.textContent = ok ? '✓' : '✗';
  tx(detailId, detail);
}

/* ═══════════════════════════════════════
   OPTIMIZER CHART (Canvas 2D)
   ═══════════════════════════════════════ */
function drawOptimizerChart(canvas: HTMLCanvasElement, opt: any, hoverDp: number | null) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.max(1, window.devicePixelRatio||1);
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;
  if (canvas.width !== Math.round(cssW*dpr) || canvas.height !== Math.round(cssH*dpr)) {
    canvas.width = Math.round(cssW*dpr); canvas.height = Math.round(cssH*dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!opt.ok) return;
  const c = opt.c;
  const xMin = Math.max(0, c.minDp);
  const xMax = opt.HARD_DP_MAX;
  const samples = opt.dpSamples.filter((s: any) => s.dp >= xMin - 1e-9 && s.dp <= xMax + 1e-9);

  let yMaxRaw = 0;
  samples.forEach((s: any) => {
    if (isFinite(s.pCash)) yMaxRaw = Math.max(yMaxRaw, s.pCash);
    if (isFinite(s.pDti))  yMaxRaw = Math.max(yMaxRaw, s.pDti);
  });
  yMaxRaw = Math.min(yMaxRaw, opt.pStandard * 8 + 1e6);
  if (yMaxRaw <= 0) yMaxRaw = 1;
  const yMax = niceRound(yMaxRaw * 1.08);

  const padL = 56, padR = 14, padT = 14, padB = 30;
  const plotW = cssW - padL - padR, plotH = cssH - padT - padB;
  const xToPx = (dp: number) => padL + ((dp - xMin)/(xMax - xMin)) * plotW;
  const pxToDp = (px: number) => xMin + ((px - padL)/plotW) * (xMax - xMin);
  const yToPx = (price: number) => padT + plotH - (price/yMax) * plotH;

  // Zone tints
  const splitSample = samples.reduce((best: any, s: any) => (s.pAch > best.pAch ? s : best), samples[0]);
  const splitDp = splitSample ? clamp(splitSample.dp, xMin, xMax) : (xMin + xMax) / 2;
  ctx.fillStyle = 'rgba(37,99,235,0.045)';
  ctx.fillRect(padL, padT, xToPx(splitDp) - padL, plotH);
  ctx.fillStyle = 'rgba(245,158,11,0.05)';
  ctx.fillRect(xToPx(splitDp), padT, padL + plotW - xToPx(splitDp), plotH);

  // Y gridlines
  ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af'; ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (i/4);
    const v = yMax * (1 - i/4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillText(fmtShort$(v), padL - 6, y);
  }

  // X axis
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xTicks = niceTicks(xMin, xMax, 6);
  xTicks.forEach(tickDp => {
    const x = xToPx(tickDp);
    ctx.strokeStyle = '#f3f4f6'; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.fillText((tickDp*100).toFixed(0) + '%', x, padT + plotH + 5);
  });
  ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('Down Payment %', padL + plotW/2, cssH - 10);
  ctx.save(); ctx.translate(14, padT + plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('Affordable Price', 0, 0); ctx.restore();

  // Achievable polygon fill
  ctx.fillStyle = 'rgba(22,163,74,0.10)';
  ctx.beginPath(); ctx.moveTo(xToPx(samples[0].dp), yToPx(0));
  samples.forEach((s: any) => ctx.lineTo(xToPx(s.dp), yToPx(Math.max(0, s.pAch))));
  ctx.lineTo(xToPx(samples[samples.length-1].dp), yToPx(0)); ctx.closePath(); ctx.fill();

  // DTI line (blue)
  ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.beginPath();
  samples.forEach((s: any, i: number) => { const y = yToPx(Math.min(yMax, isFinite(s.pDti) ? s.pDti : yMax)); i===0 ? ctx.moveTo(xToPx(s.dp), y) : ctx.lineTo(xToPx(s.dp), y); }); ctx.stroke();

  // Cash line (orange)
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.beginPath();
  samples.forEach((s: any, i: number) => { const y = yToPx(Math.min(yMax, Math.max(0, s.pCash))); i===0 ? ctx.moveTo(xToPx(s.dp), y) : ctx.lineTo(xToPx(s.dp), y); }); ctx.stroke();

  // Achievable line (dark green)
  ctx.strokeStyle = '#15803d'; ctx.lineWidth = 2.4; ctx.beginPath();
  samples.forEach((s: any, i: number) => { const y = yToPx(Math.max(0, s.pAch)); i===0 ? ctx.moveTo(xToPx(s.dp), y) : ctx.lineTo(xToPx(s.dp), y); }); ctx.stroke();

  // Red dashed at minDp
  ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xToPx(c.minDp), padT); ctx.lineTo(xToPx(c.minDp), padT + plotH); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#dc2626'; ctx.font = '9.5px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Min DP', xToPx(c.minDp) + 4, padT + 2);

  // Crosshairs at optimum
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(245,158,11,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue)); ctx.lineTo(padL, yToPx(opt.pMaxTrue));
  ctx.moveTo(xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue)); ctx.lineTo(xToPx(opt.dpOptimal), padT + plotH);
  ctx.stroke(); ctx.restore();

  // Gray dot at basic; gold dot at optimum
  drawDot(ctx, xToPx(c.minDp), yToPx(opt.pStandard), 5, '#9ca3af', '#4b5563');
  drawDot(ctx, xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue), 6.5, '#f59e0b', '#92400e');

  // Annotation
  ctx.fillStyle = '#92400e'; ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  const annoTxt = 'True Max: ' + fmt$(opt.pMaxTrue) + ' at ' + (opt.dpOptimal*100).toFixed(1) + '% down';
  const annoW = ctx.measureText(annoTxt).width;
  let annoX = xToPx(opt.dpOptimal) + 9;
  if (annoX + annoW > padL + plotW - 4) annoX = xToPx(opt.dpOptimal) - annoW - 9;
  ctx.fillText(annoTxt, annoX, yToPx(opt.pMaxTrue) - 8);

  if (opt.gain > 1000 && Math.abs(xToPx(c.minDp) - xToPx(opt.dpOptimal)) > 8) {
    drawArrow(ctx, xToPx(c.minDp), yToPx(opt.pStandard), xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue), '#6b7280');
    ctx.fillStyle = '#374151'; ctx.font = '10.5px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const midX = (xToPx(c.minDp) + xToPx(opt.dpOptimal)) / 2;
    const midY = (yToPx(opt.pStandard) + yToPx(opt.pMaxTrue)) / 2 - 6;
    ctx.fillText('+' + fmt$(opt.gain), midX, midY);
  }

  // Hover crosshair
  if (typeof hoverDp === 'number' && hoverDp >= xMin && hoverDp <= xMax) {
    const hx = xToPx(hoverDp);
    ctx.save(); ctx.strokeStyle = 'rgba(31,41,55,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH); ctx.stroke(); ctx.restore();
  }

  (canvas as any)._chartState = { padL, padR, padT, padB, plotW, plotH, xMin, xMax, yMax, xToPx, pxToDp, yToPx, samples };
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke();
}
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([]);
  const ang = Math.atan2(y2-y1, x2-x1), ah = 6;
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-ah*Math.cos(ang-0.4), y2-ah*Math.sin(ang-0.4));
  ctx.lineTo(x2-ah*Math.cos(ang+0.4), y2-ah*Math.sin(ang+0.4));
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function niceRound(v: number): number {
  if (v<=0) return 1;
  const exp = Math.floor(Math.log10(v)), base = Math.pow(10, exp), m = v/base;
  let nice; if(m<=1)nice=1; else if(m<=2)nice=2; else if(m<=2.5)nice=2.5; else if(m<=5)nice=5; else nice=10;
  return nice * base;
}
function niceTicks(min: number, max: number, count: number): number[] {
  const step = niceRound((max-min)/Math.max(1,count)), start = Math.ceil(min/step)*step;
  const out: number[] = [];
  for(let v=start; v<=max+1e-9; v+=step) out.push(+v.toFixed(4));
  return out;
}

/* ═══════════════════════════════════════
   OPTIMIZER VIEW RENDER
   ═══════════════════════════════════════ */
const optState: { sliderDp: number | null; hoverDp: number | null; lastOpt: any; lastInp: Inputs | null } =
  { sliderDp: null, hoverDp: null, lastOpt: null, lastInp: null };

function renderOptimizerView(inp: Inputs) {
  const opt = computeOptimizer(inp);
  optState.lastOpt = opt; optState.lastInp = inp;

  const notice = $('opt-notice') as HTMLElement, content = $('opt-content') as HTMLElement;
  if (!opt.ok) {
    notice.hidden = false; content.hidden = true;
    tx('opt-notice-title', opt.title); tx('opt-notice-detail', opt.detail);
    return;
  }
  notice.hidden = true; content.hidden = false;
  const c = opt.c;

  tx('opt-hero-price', fmt$(opt.pMaxTrue));
  tx('opt-hero-dp',    (opt.dpOptimal*100).toFixed(1) + '%');
  tx('opt-hero-dpamt', fmt$(opt.pMaxTrue * opt.dpOptimal));
  tx('opt-hero-basic', fmt$(opt.pStandard));
  const gainEl = $('opt-hero-gain')!;
  if (opt.gain > 0) { tx('opt-hero-delta', '+' + fmt$(opt.gain)); gainEl.classList.remove('zero'); }
  else { tx('opt-hero-delta', fmt$(0)); gainEl.classList.add('zero'); }

  // Slider
  const sl = $input('opt-slider')!;
  const slMinPct = c.minDp * 100;
  const slMaxPct = Math.max(slMinPct, opt.HARD_DP_MAX * 100);
  sl.min = slMinPct.toFixed(2); sl.max = slMaxPct.toFixed(2); sl.step = '0.1';
  sl.disabled = (slMaxPct <= slMinPct);
  const slMin = slMinPct/100, slMax = slMaxPct/100;
  let curDp: number;
  if (optState.sliderDp !== null && optState.sliderDp >= slMin && optState.sliderDp <= slMax) curDp = optState.sliderDp;
  else { curDp = clamp(opt.dpOptimal, slMin, slMax); optState.sliderDp = curDp; }
  curDp = clamp(curDp, slMin, slMax);
  sl.value = (curDp*100).toFixed(1);
  updateSliderReadout(curDp);

  // Comparison table
  const basicDeal = dealAtPriceDp(c, opt.pStandard, c.minDp);
  const optDeal   = dealAtPriceDp(c, opt.pMaxTrue,  opt.dpOptimal);
  tx('opt-comp-basic-dp', '(' + (c.minDp*100).toFixed(1) + '% down)');
  tx('opt-comp-opt-dp',   '(' + (opt.dpOptimal*100).toFixed(1) + '% down)');
  tx('cmp-b-price', fmt$(opt.pStandard));    tx('cmp-o-price', fmt$(opt.pMaxTrue));
  tx('cmp-b-dp',    fmt$(basicDeal.downPmt)); tx('cmp-o-dp',   fmt$(optDeal.downPmt));
  tx('cmp-b-loan',  fmt$(basicDeal.loanAmt)); tx('cmp-o-loan', fmt$(optDeal.loanAmt));
  tx('cmp-b-mtg',   fmt$(basicDeal.moMtg));  tx('cmp-o-mtg',  fmt$(optDeal.moMtg));
  tx('cmp-b-mtot',  fmt$(basicDeal.moTotal)); tx('cmp-o-mtot', fmt$(optDeal.moTotal));
  tx('cmp-b-dti',   fmtPct(basicDeal.dti));  tx('cmp-o-dti',  fmtPct(optDeal.dti));
  tx('cmp-b-cash',  fmt$(basicDeal.totalAtClose)); tx('cmp-o-cash', fmt$(optDeal.totalAtClose));
  tx('cmp-b-surp',  fmt$(basicDeal.dpSurplus));    tx('cmp-o-surp', fmt$(optDeal.dpSurplus));
  const resRow = $('cmp-res-row') as HTMLElement;
  if (resRow) resRow.style.display = state.reservesEnabled ? '' : 'none';
  if (state.reservesEnabled) {
    tx('cmp-b-res', basicDeal.pcMonths.toFixed(1) + ' mo'); tx('cmp-o-res', optDeal.pcMonths.toFixed(1) + ' mo');
  }

  // Explainer
  const expl = $('opt-explainer')!;
  expl.classList.remove('warn', 'ok');
  if (opt.clampedAt === 'max') {
    expl.classList.add('warn');
    expl.innerHTML = 'The math wants more than 80% down. Clamped to 80% — consult a mortgage broker since most lenders cap LTV at this level for condo financing.';
  } else if (opt.baseBind === 'cash' || opt.gain < 1000) {
    if (Math.abs(opt.gain) < 1000) {
      expl.classList.add('ok');
      expl.innerHTML = '<strong>Already near-optimal.</strong> Both constraints bind close to simultaneously at ' + (c.minDp*100).toFixed(1) + '% down. No down-payment adjustment materially changes the price.';
    } else {
      expl.innerHTML = '<strong>Cash-limited.</strong> Your cash runs out before income does. Putting more down would only reduce reserves — it does not unlock a higher price. Your maximum is <strong>' + fmt$(opt.pStandard) + '</strong> at ' + (c.minDp*100).toFixed(1) + '% down.';
    }
  } else {
    const unusedCash = Math.max(0, basicDeal.dpSurplus);
    expl.innerHTML = '<strong>DTI-limited with surplus cash.</strong> At ' + (c.minDp*100).toFixed(1) + '% down your income caps you at <strong>' + fmt$(opt.pStandard) + '</strong>, but you have <strong>' + fmt$(unusedCash) + '</strong> in unused cash. Putting <strong>' + (opt.dpOptimal*100).toFixed(1) + '% down</strong> shrinks the loan enough to qualify for <strong>' + fmt$(opt.pMaxTrue) + '</strong> — your true ceiling.';
  }

  // Sensitivity
  const sensRows = runSensitivity(inp, opt.pMaxTrue);
  const tbody = $('opt-sens-tbody')!; tbody.innerHTML = '';
  sensRows.forEach(row => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = row.label;
    const td2 = document.createElement('td'); td2.className = 'r'; td2.textContent = row.ok ? fmt$(row.newPrice) : '—';
    const td3 = document.createElement('td'); td3.className = 'r ' + (row.delta > 1 ? 'delta-pos' : row.delta < -1 ? 'delta-neg' : 'delta-zero');
    td3.textContent = row.ok ? (row.delta >= 0 ? '+' : '') + fmt$(row.delta) : '—';
    tr.append(td1, td2, td3); tbody.appendChild(tr);
  });

  drawOptimizerChart($('opt-chart') as HTMLCanvasElement, opt, optState.hoverDp);
}

function updateSliderReadout(dp: number) {
  const opt = optState.lastOpt;
  if (!opt || !opt.ok) return;
  const c = opt.c;
  tx('opt-slider-val', (dp*100).toFixed(1) + '%');
  const p = priceAtDp(c, dp);
  const price = Math.max(0, p.pAch);
  const deal = dealAtPriceDp(c, price, dp);
  const binding = (p.pCash <= p.pDti - 1) ? 'Cash' : (p.pDti <= p.pCash - 1) ? 'DTI' : 'Both';
  tx('opt-m-price', fmt$(price));
  const bindEl = $('opt-m-bind')!; bindEl.textContent = binding;
  bindEl.className = 'mval ' + (binding === 'Cash' ? 'bind-cash' : binding === 'DTI' ? 'bind-dti' : '');
  tx('opt-m-monthly', fmt$(deal.moTotal));
  tx('opt-m-dti', fmtPct(deal.dti));
  tx('opt-m-dpamt', fmt$(deal.downPmt));
  tx('opt-m-surplus', fmt$(deal.dpSurplus));
}

/* ═══════════════════════════════════════
   AFFORD-TARGET MATH
   ═══════════════════════════════════════ */
function computeAffordTarget(inp: Inputs): any {
  const c = deriveConstants(inp);
  const target = (typeof inp.targetOverride === 'number' && isFinite(inp.targetOverride) && inp.targetOverride >= 0)
                 ? inp.targetOverride : null;

  const basePrices = priceAtDp(c, c.minDp);
  const standardMax = Math.max(0, basePrices.pAch);
  const opt = computeOptimizer(inp);
  const optMax = opt.ok ? opt.pMaxTrue : 0;

  if (target === null) return { state: 'no-target', c, standardMax, optMax };

  // Check feasibility at target with minDp
  const loanAtT     = target * (1 - c.minDp);
  const moMtgAtT    = loanAtT * c.K;
  const moPmiAtT    = calcPmiMonthly(loanAtT, c.minDp);
  const ccAtT       = computeCC(target, c.minDp, inp);
  const totalAtCloseT = target * c.minDp + ccAtT.total;
  const resReqAtT   = c.resMo * (moMtgAtT + moPmiAtT + c.carrying);

  const dpCCGap  = Math.max(0, totalAtCloseT - c.weightedAssets);
  const resGap   = c.resMo > 0 ? Math.max(0, totalAtCloseT + resReqAtT - c.weightedAssets) : 0;
  const cashGap  = Math.max(dpCCGap, resGap);

  const incomeNeededMo  = c.dtiMax > 0 ? (moMtgAtT + moPmiAtT + c.carrying + c.oDebts) / c.dtiMax : Infinity;
  const incomeNeededAnn = incomeNeededMo * 12;
  const incomeGap       = Math.max(0, incomeNeededAnn - (inp.annualIncome||0));

  const cashOk   = cashGap <= 0.5;
  const incomeOk = incomeGap <= 0.5;

  if (cashOk && incomeOk) {
    return { state: 'feasible', c, target, standardMax, optMax, cashOk, incomeOk };
  }

  // DP feasibility range at target price
  const HARD_DP_MAX = Math.max(0.80, c.minDp);

  let dpForDti: number;
  if (c.A <= 0) { dpForDti = Infinity; }
  else if (target <= 0 || c.K <= 0) { dpForDti = 0; }
  else {
    const dp20 = 1 - c.A / (target * c.K);
    if (dp20 >= 0.20) {
      dpForDti = dp20;
    } else {
      // dp20 < 0.20 → dp=0.20 satisfies DTI; check if a lower dp (in a PMI tier) also works.
      // Tiers ordered from highest dp to lowest dp; check both lo and hi bounds so a solution
      // that falls above the tier's upper bound returns exactly hi (the PMI-drop boundary).
      // If the loop exhausts without breaking, all tiers pass → DTI satisfied at any dp → 0.
      const PMI_TIERS: [number, number, number][] = [[0.15, 0.20, 0.0052], [0.10, 0.15, 0.0070], [0.05, 0.10, 0.0095], [0, 0.05, 0.0120]];
      dpForDti = 0; // loop-exhaustion fallback: DTI satisfied at every dp, so minimum is 0
      for (const [lo, hi, rate] of PMI_TIERS) {
        const effK = c.K + rate / 12;
        const dpTier = 1 - c.A / (target * effK);
        if (dpTier >= hi) { dpForDti = hi; break; } // whole tier fails; minimum is hi
        if (dpTier >= lo) { dpForDti = dpTier; break; } // solution within this tier
        // dpTier < lo: entire tier satisfied, continue to lower tier
      }
    }
  }

  // Cash ceiling dp: binary search max dp such that weighted assets cover dp*target + cc(target,dp)
  let dpForCash: number;
  {
    let lo = 0, hi = HARD_DP_MAX;
    const feasAtDp = (dp: number) => {
      const cc = computeCC(target, dp, inp);
      return c.weightedAssets >= dp * target + cc.total;
    };
    if (!feasAtDp(0)) { dpForCash = -Infinity; }
    else if (feasAtDp(hi)) { dpForCash = hi; }
    else {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (feasAtDp(mid)) lo = mid; else hi = mid;
        if (hi - lo < 0.0001) break;
      }
      dpForCash = lo;
    }
  }

  const dpLo = Math.max(c.minDp, isFinite(dpForDti) ? dpForDti : Infinity);
  const dpHi = Math.min(HARD_DP_MAX, isFinite(dpForCash) ? dpForCash : 0);

  let dpOutcome: string;
  if (!isFinite(dpForDti) || dpForDti > HARD_DP_MAX) dpOutcome = 'B';
  else if (dpHi < dpLo) dpOutcome = 'B';
  else if (dpForDti < c.minDp) dpOutcome = 'C';
  else dpOutcome = 'A';

  // Lever 4: max common charges (PMI reduces DTI budget available for common charges)
  const maintDtiMax  = c.dtiMax * c.moInc - moMtgAtT - moPmiAtT - (inp.propTaxes||0) - (inp.hoInsurance||0) - c.oDebts;
  const maxCC        = Math.max(0, maintDtiMax);
  const ccGap        = Math.max(0, (inp.commonCharges||0) - maxCC);

  // Lever 5: rate needed
  const currentRate  = inp.mortgageRate||0;
  const rateFloor    = Math.min(2.0, currentRate);
  let rateNeeded: number | null;
  if (optMax >= target) { rateNeeded = currentRate; }
  else if (currentRate <= rateFloor + 1e-9) { rateNeeded = null; }
  else {
    const startRate = Math.min(currentRate, 12);
    let foundAt: number | null = null;
    for (let r = startRate; r >= rateFloor - 1e-9; r -= 0.125) {
      const o = computeOptimizer({ ...inp, mortgageRate: +r.toFixed(3) });
      if (o.ok && o.pMaxTrue >= target) { foundAt = +r.toFixed(3); break; }
    }
    rateNeeded = foundAt;
  }

  // Combined grid
  const cashSteps   = [0, 25000, 50000, 100000];
  const incomeSteps = [0, 10000, 25000, 50000];
  const grid = cashSteps.map(dCash => incomeSteps.map(dInc => {
    const mod: Inputs = { ...inp, annualIncome: (inp.annualIncome||0) + dInc,
      accounts: dCash > 0 ? inp.accounts.concat([{ name:'__s', balance: dCash, liquidity: 100 }]) : inp.accounts };
    const o = computeOptimizer(mod);
    const newMax = o.ok ? o.pMaxTrue : 0;
    const gap = target - newMax;
    const cls = newMax >= target ? 'green' : gap / target <= 0.05 ? 'yellow' : 'red';
    return { newMax, gap, cls };
  }));

  return {
    state: 'analysis', c, target, standardMax, optMax,
    cashOk, incomeOk, cashGap, incomeGap, incomeNeededAnn,
    dpForDti, dpForCash, dpLo, dpHi, dpOutcome, HARD_DP_MAX,
    maxCC, ccGap, maintDtiMax,
    rateNeeded, currentRate, rateFloor,
    grid, cashSteps, incomeSteps,
  };
}

/* ═══════════════════════════════════════
   AFFORD-TARGET RENDER
   ═══════════════════════════════════════ */
function renderAffordTargetView(inp: Inputs) {
  const r = computeAffordTarget(inp);
  const promptEl  = $('aft-prompt') as HTMLElement, successEl = $('aft-success') as HTMLElement, analysisEl = $('aft-analysis') as HTMLElement;

  const tIn = $input('aft-target-price')!;
  if (document.activeElement !== tIn) {
    if (inp.targetOverride !== null && isFinite(inp.targetOverride)) tIn.value = String(Math.round(inp.targetOverride));
    else tIn.value = '';
  }

  if (r.state === 'no-target') { promptEl.hidden = false; successEl.hidden = true; analysisEl.hidden = true; return; }
  if (r.state === 'feasible')  { promptEl.hidden = true; successEl.hidden = false; analysisEl.hidden = true;
    tx('aft-success-title', '✓ You already qualify for ' + fmt$(r.target));
    tx('aft-success-sub', 'At ' + (r.c.minDp*100).toFixed(0) + '% down with current income, assets, and rate, both DTI and cash constraints are satisfied.'); return; }

  promptEl.hidden = true; successEl.hidden = true; analysisEl.hidden = false;
  const c = r.c;
  tx('aft-sum-target', fmt$(r.target)); tx('aft-sum-max', fmt$(r.standardMax));
  tx('aft-sum-gap', fmt$(r.target - r.standardMax));

  renderCashLever(r, c); renderIncomeLever(r); renderDpLever(r, c);
  renderCCLever(r, c); renderGapGrid(r); renderRateLever(r);
}

function renderCashLever(r: any, c: any) {
  const big = $('lev-cash-big')!, sub = $('lev-cash-sub')!, badge = $('lev-cash-badge')!, extra = $('lev-cash-extra') as HTMLElement;
  if (r.cashOk) {
    badge.textContent = 'OK'; badge.className = 'badge ok';
    big.textContent = fmt$(0); big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your assets already cover the cash side at ' + (c.minDp*100).toFixed(0) + '% down. The gap is on the income side.';
    extra.style.display = 'none';
  } else {
    badge.textContent = r.incomeOk ? 'NEEDED' : 'PARTIAL'; badge.className = 'badge ' + (r.incomeOk ? 'info' : 'warn');
    big.textContent = fmt$(r.cashGap); big.className = 'aft-lever-big neg';
    sub.innerHTML = r.incomeOk ? 'Add this much in liquidity-weighted assets and you qualify — DTI is already fine.' : 'Cash alone won\'t solve it — income is also short.';
    extra.style.display = '';
    const rate = parseFloat(($input('aft-savings-rate')!).value)||0;
    if (rate > 0) { const mo = Math.ceil(r.cashGap / rate); tx('lev-cash-months', mo + ' months' + (mo >= 12 ? ' (~' + (mo/12).toFixed(1) + ' yrs)' : '')); }
    else tx('lev-cash-months', '—');
  }
}

function renderIncomeLever(r: any) {
  const big = $('lev-inc-big')!, sub = $('lev-inc-sub')!, badge = $('lev-inc-badge')!;
  if (r.incomeOk) {
    badge.textContent = 'OK'; badge.className = 'badge ok';
    big.textContent = fmt$(0) + '/yr'; big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your income already passes the DTI test at this price.';
  } else {
    badge.textContent = r.cashOk ? 'NEEDED' : 'PARTIAL'; badge.className = 'badge ' + (r.cashOk ? 'info' : 'warn');
    big.textContent = '+' + fmt$(r.incomeGap) + '/yr'; big.className = 'aft-lever-big neg';
    sub.innerHTML = r.cashOk ? 'You\'d need this much more annual income to pass DTI — your assets already cover the cash side.'
      : 'Income is short and so is cash. Both need to move (or use the dp lever).';
  }
}

function renderDpLever(r: any, c: any) {
  const sub = $('lev-dp-sub')!, badge = $('lev-dp-badge')!;
  const zone = $('lev-dp-zone') as HTMLElement, mkMin = $('lev-dp-mk-min') as HTMLElement, mkDti = $('lev-dp-mk-dti') as HTMLElement, mkCash = $('lev-dp-mk-cash') as HTMLElement;
  const HARD = r.HARD_DP_MAX;
  const pct = (v: number) => clamp(v/HARD, 0, 1) * 100;
  mkMin.style.left = pct(c.minDp) + '%';

  if (r.dpOutcome === 'A') {
    badge.textContent = '✓ FEASIBLE'; badge.className = 'badge ok';
    sub.innerHTML = 'You can afford <strong>' + fmt$(r.target) + '</strong> at any down between <strong>' + (r.dpLo*100).toFixed(1) + '%</strong> and <strong>' + (r.dpHi*100).toFixed(1) + '%</strong>. Lower end uses less cash; higher end leaves more monthly headroom.';
    zone.hidden = false; zone.classList.remove('fail');
    zone.style.left = pct(r.dpLo) + '%'; zone.style.width = (pct(r.dpHi) - pct(r.dpLo)) + '%';
    mkDti.hidden = false; mkDti.style.left = pct(r.dpForDti) + '%';
    mkCash.hidden = false; mkCash.style.left = pct(Math.min(r.dpForCash, HARD)) + '%';
  } else if (r.dpOutcome === 'C') {
    badge.textContent = 'CASH ONLY'; badge.className = 'badge warn';
    sub.innerHTML = 'DTI is satisfied at ' + (c.minDp*100).toFixed(1) + '% down — only cash is short. Cash ceiling: <strong>' + (Math.min(r.dpForCash, HARD)*100).toFixed(1) + '%</strong> down.';
    zone.hidden = true; mkDti.hidden = true; mkCash.hidden = false; mkCash.style.left = pct(Math.min(r.dpForCash, HARD)) + '%';
  } else {
    badge.textContent = '✗ NO DP WORKS'; badge.className = 'badge warn';
    const dtiFinite = isFinite(r.dpForDti), cashFinite = isFinite(r.dpForCash);
    if (!dtiFinite) sub.innerHTML = 'Income can\'t cover the carrying costs at <strong>' + fmt$(r.target) + '</strong> at any down payment. Boost income or lower carrying costs.';
    else if (!cashFinite || r.dpForCash < 0) sub.innerHTML = 'Your liquidity-weighted assets don\'t cover closing costs at <strong>' + fmt$(r.target) + '</strong>. Add assets, increase Liquidity %, or reduce closing costs.';
    else sub.innerHTML = 'No down payment resolves this — DTI floor: <strong>' + (r.dpForDti*100).toFixed(1) + '%</strong> · Cash ceiling: <strong>' + (Math.max(0, r.dpForCash)*100).toFixed(1) + '%</strong>. DTI floor sits above the cash ceiling.';
    if (dtiFinite && cashFinite && r.dpForDti > Math.max(0, r.dpForCash)) {
      const lo = Math.min(HARD, Math.max(0, r.dpForCash)), hi = Math.min(HARD, r.dpForDti);
      zone.hidden = false; zone.classList.add('fail');
      zone.style.left = pct(lo) + '%'; zone.style.width = Math.max(2, pct(hi) - pct(lo)) + '%';
    } else zone.hidden = true;
    mkDti.hidden = !dtiFinite; if (!mkDti.hidden) mkDti.style.left = pct(Math.min(r.dpForDti, HARD)) + '%';
    mkCash.hidden = !(cashFinite && r.dpForCash >= 0); if (!mkCash.hidden) mkCash.style.left = pct(Math.min(r.dpForCash, HARD)) + '%';
  }
}

function renderCCLever(r: any, c: any) {
  const big = $('lev-cc-big')!, sub = $('lev-cc-sub')!, badge = $('lev-cc-badge')!;
  if (r.ccGap <= 0) {
    badge.textContent = 'OK'; badge.className = 'badge ok';
    big.textContent = '≤ ' + fmt$(r.maxCC) + '/mo'; big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your common charges estimate fits at <strong>' + fmt$(r.target) + '</strong> — max common charges allowed (DTI) is <strong>' + fmt$(r.maxCC) + '/mo</strong>.';
  } else {
    badge.textContent = 'TOO HIGH'; badge.className = 'badge warn';
    big.textContent = '≤ ' + fmt$(r.maxCC) + '/mo'; big.className = 'aft-lever-big neg';
    sub.innerHTML = 'At <strong>' + fmt$(r.target) + '</strong> you need common charges ≤ <strong>' + fmt$(r.maxCC) + '/mo</strong>. Your current estimate is <strong>' + fmt$(r.ccGap) + '/mo too high</strong>.';
  }
}

function renderGapGrid(r: any) {
  const tbl = $('aft-gap-grid')!; tbl.innerHTML = '';
  const thead = document.createElement('thead'), trh = document.createElement('tr');
  const corner = document.createElement('th'); corner.className = 'corner'; corner.textContent = '↓ cash · income →'; trh.appendChild(corner);
  r.incomeSteps.forEach((d: number) => { const th = document.createElement('th'); th.textContent = d===0 ? '+$0/yr' : '+' + fmtShort$(d) + '/yr'; trh.appendChild(th); });
  thead.appendChild(trh); tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  r.cashSteps.forEach((dCash: number, i: number) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.className = 'row-h'; th.textContent = dCash===0 ? '+$0' : '+' + fmtShort$(dCash); tr.appendChild(th);
    r.grid[i].forEach((cell: any) => {
      const td = document.createElement('td'); td.className = 'cell-' + cell.cls;
      td.textContent = cell.cls === 'green' ? '✓' : '−' + fmtShort$(Math.abs(cell.gap));
      td.title = cell.cls === 'green' ? 'Reaches ' + fmt$(cell.newMax) : 'New max: ' + fmt$(cell.newMax) + ' · still short ' + fmt$(cell.gap);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

function renderRateLever(r: any) {
  const txt = $('lev-rate-text')!;
  if (r.rateNeeded === null) txt.innerHTML = '⚠ Even at <strong>' + r.rateFloor.toFixed(2) + '%</strong>, this price doesn\'t pencil out — rate alone can\'t close the gap. Use the cash, income, or common-charges levers.';
  else if (r.rateNeeded >= r.currentRate - 1e-6) txt.innerHTML = '✓ This price <strong>works at current rates</strong> (' + r.currentRate.toFixed(2) + '%) — the down-payment lever (Lever 3) gets you there.';
  else txt.innerHTML = 'Rates would need to drop to <strong>' + r.rateNeeded.toFixed(2) + '%</strong> for this price to work at your current income and assets (current: <strong>' + r.currentRate.toFixed(2) + '%</strong>).';
}

/* ═══════════════════════════════════════
   LOCAL STORAGE
   ═══════════════════════════════════════ */
const LS_KEY          = 'nyc_condo_inputs';
const ASSUMPTIONS_KEY = 'nyc_shared_assumptions_condo';
function isSaveEnabled() { return ($('save-toggle-cb') as HTMLInputElement).checked; }

/* applySharedProfile is page-local: it wires the shared data into condo's own
   accounts-table DOM. Unlike rent's version, condo's own accounts already carry
   a native `liquidity` field, so no closing/reserve-based default is needed. */
function applySharedProfile(shared: SharedProfile | null) {
  if (!shared) return;
  if (Array.isArray(shared.accounts) && shared.accounts.length) {
    state.accounts = (shared.accounts as Account[]).map(a => ({ ...a }));
    renderAccounts();
  }
  const sv = (id: string, v: unknown) => { if (v !== undefined) { const el = $input(id); if (el) el.value = String(v); } };
  sv('annual-income', shared.annualIncome);
  sv('other-debts',   shared.otherDebts);
}

/* Shared assumptions (condo-specific: rate, down payment %, common charges, taxes,
   insurance, DTI) — not part of the general sharedProfile schema, so this stays its
   own localStorage key rather than living in lib/sharedProfile, matching rent's
   pattern for its own rent-specific assumptions. */
function loadSharedAssumptions(): { condo: CondoAssumptions } | null {
  try { const s = localStorage.getItem(ASSUMPTIONS_KEY); return s ? { condo: JSON.parse(s) } : null; } catch(e) { return null; }
}
function saveSharedAssumptions(inp: Inputs) {
  try {
    localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify({
      mortgageRate: inp.mortgageRate, dpPct: inp.dpPct, commonCharges: inp.commonCharges,
      propTaxes: inp.propTaxes, hoInsurance: inp.hoInsurance, maxDtiPct: inp.maxDtiPct
    }));
  } catch(e) { /* ignore */ }
}
function applySharedAssumptions(asmp: { condo: CondoAssumptions } | null) {
  if (!asmp || !asmp.condo) return;
  const c = asmp.condo;
  const sv = (id: string, v: unknown) => { if (v != null) { const el = $input(id); if (el) el.value = String(v); } };
  sv('mtg-rate',       c.mortgageRate);
  sv('dp-pct',         c.dpPct);
  sv('common-charges', c.commonCharges);
  sv('prop-taxes',     c.propTaxes);
  sv('ho-insurance',   c.hoInsurance);
  sv('max-dti',        c.maxDtiPct);
}

function saveToStorage(inp?: Inputs) {
  if (!isSaveEnabled()) return;
  if (!inp) inp = readInputs();
  const data = {
    accounts: inp.accounts,
    reservesEnabled: state.reservesEnabled,
    workingCapEnabled: state.workingCapEnabled,
    inputs: {
      annualIncome: inp.annualIncome, otherDebts: inp.otherDebts,
      mtgRate: inp.mortgageRate, loanTerm: inp.loanTerm, dpPct: inp.dpPct,
      reserveMo: inp.reserveMo, maxDtiPct: inp.maxDtiPct,
      commonCharges: inp.commonCharges, propTaxes: inp.propTaxes, hoInsurance: inp.hoInsurance,
      fcAtty: inp.fcAtty, fcLender: inp.fcLender, fcAppraisal: inp.fcAppraisal,
      fcRecording: inp.fcRecording, fcBuilding: inp.fcBuilding, wcMonths: inp.wcMonths,
      titlePricePct: inp.titlePricePct, titleLoanPct: inp.titleLoanPct,
      targetOverride: state.targetOverride ?? '',
    }
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) { /* ignore */ }
  saveSharedProfile({ accounts: inp.accounts, annualIncome: inp.annualIncome, otherDebts: inp.otherDebts });
  saveSharedAssumptions(inp);
}
function loadFromStorage(): any {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch(e) { return null; }
}
function clearStorage() { try { localStorage.removeItem(LS_KEY); } catch(e) { /* ignore */ } }

function restoreInputs(data: any) {
  if (!data) return;
  if (Array.isArray(data.accounts) && data.accounts.length > 0) state.accounts = data.accounts;
  if (data.reservesEnabled !== undefined) {
    state.reservesEnabled = !!data.reservesEnabled;
    ($('reserves-enabled') as HTMLInputElement).checked = state.reservesEnabled;
    ($('reserve-mo-row') as HTMLElement).style.display = state.reservesEnabled ? '' : 'none';
    ($('reserves-snap') as HTMLElement).style.display  = state.reservesEnabled ? '' : 'none';
    ($('pill-res-wrap') as HTMLElement).style.display  = state.reservesEnabled ? '' : 'none';
  }
  if (data.workingCapEnabled !== undefined) {
    state.workingCapEnabled = !!data.workingCapEnabled;
    ($('wc-enabled') as HTMLInputElement).checked = state.workingCapEnabled;
    ($('wc-months-row') as HTMLElement).style.display = state.workingCapEnabled ? '' : 'none';
  }
  const inp = data.inputs; if (!inp) return;
  const sv = (id: string, val: unknown) => { const el = $input(id); if (el && val !== undefined && val !== null) el.value = String(val); };
  sv('annual-income', inp.annualIncome); sv('other-debts', inp.otherDebts);
  sv('mtg-rate', inp.mtgRate); sv('loan-term', inp.loanTerm); sv('dp-pct', inp.dpPct);
  sv('reserve-mo', inp.reserveMo); sv('max-dti', inp.maxDtiPct);
  sv('common-charges', inp.commonCharges); sv('prop-taxes', inp.propTaxes); sv('ho-insurance', inp.hoInsurance);
  sv('fc-atty', inp.fcAtty); sv('fc-lender', inp.fcLender); sv('fc-appraisal', inp.fcAppraisal);
  sv('fc-recording', inp.fcRecording); sv('fc-building', inp.fcBuilding); sv('wc-months', inp.wcMonths);
  sv('title-price-pct', inp.titlePricePct); sv('title-loan-pct', inp.titleLoanPct);
  // Restore targetOverride (bug fix: was missing in co-op version)
  if (inp.targetOverride !== undefined && inp.targetOverride !== null && inp.targetOverride !== '') {
    const v = parseFloat(inp.targetOverride);
    if (!isNaN(v)) { state.targetOverride = v; }
  }
}

/* ═══════════════════════════════════════
   DEFERRED RENDERS (skip while hidden)
   ═══════════════════════════════════════ */
let aftRenderPending = false, aftRenderInp: Inputs | null = null;
function scheduleAffordRender(inp: Inputs) {
  aftRenderInp = inp;
  const view = $('view-afford') as HTMLElement | null;
  if (!view || view.hidden) return;
  if (aftRenderPending) return;
  aftRenderPending = true;
  requestAnimationFrame(() => { aftRenderPending = false; if (!(view.hidden) && aftRenderInp) renderAffordTargetView(aftRenderInp); });
}
let optRenderPending = false, optRenderInp: Inputs | null = null;
function scheduleOptimizerRender(inp: Inputs) {
  optRenderInp = inp;
  const view = $('view-optimizer') as HTMLElement | null;
  if (!view || view.hidden) return;
  if (optRenderPending) return;
  optRenderPending = true;
  requestAnimationFrame(() => { optRenderPending = false; if (!(view.hidden) && optRenderInp) renderOptimizerView(optRenderInp); });
}

function onChange() {
  const inp = readInputs();
  const r   = calculate(inp);
  updateResults(r);
  scheduleOptimizerRender(inp);
  scheduleAffordRender(inp);
  saveToStorage(inp);
}

/* ═══════════════════════════════════════
   BOOT
   ═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Restore saved state
  const saved = loadFromStorage();
  if (saved) { ($('save-toggle-cb') as HTMLInputElement).checked = true; restoreInputs(saved); }
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

  ($('save-toggle-cb') as HTMLInputElement).addEventListener('change', e => (e.target as HTMLInputElement).checked ? saveToStorage() : clearStorage());

  // Reserves toggle
  ($('reserves-enabled') as HTMLInputElement).addEventListener('change', e => {
    state.reservesEnabled = (e.target as HTMLInputElement).checked;
    ($('reserve-mo-row') as HTMLElement).style.display = state.reservesEnabled ? '' : 'none';
    ($('reserves-snap') as HTMLElement).style.display  = state.reservesEnabled ? '' : 'none';
    ($('pill-res-wrap') as HTMLElement).style.display  = state.reservesEnabled ? '' : 'none';
    onChange();
  });

  // Working-capital toggle
  ($('wc-enabled') as HTMLInputElement).addEventListener('change', e => {
    state.workingCapEnabled = (e.target as HTMLInputElement).checked;
    ($('wc-months-row') as HTMLElement).style.display = state.workingCapEnabled ? '' : 'none';
    onChange();
  });

  // Accounts table
  renderAccounts();
  $('btn-add-acct')!.addEventListener('click', () => {
    state.accounts.push({ name: 'New Account', balance: 0, liquidity: 100 });
    renderAccounts(); onChange();
  });

  // Scalar inputs
  [
    'annual-income','other-debts','mtg-rate','loan-term','dp-pct',
    'reserve-mo','max-dti','common-charges','prop-taxes','ho-insurance',
    'fc-atty','fc-lender','fc-appraisal','fc-recording','fc-building',
    'wc-months','title-price-pct','title-loan-pct'
  ].forEach(id => { const el = $(id); if (el) el.addEventListener('input', onChange); });

  // Target price override
  function onTargetInput(rawVal: string) {
    const v = parseFloat(rawVal);
    state.targetOverride = (rawVal === '' || isNaN(v)) ? null : v;
    onChange();
  }
  $input('target-price')!.addEventListener('input', e => onTargetInput((e.target as HTMLInputElement).value));
  $input('aft-target-price')!.addEventListener('input', e => onTargetInput((e.target as HTMLInputElement).value));
  $('btn-reset-tgt')!.addEventListener('click', () => { state.targetOverride = null; onChange(); });

  $input('aft-savings-rate')!.addEventListener('input', () => renderAffordTargetView(readInputs()));

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab-btn')) as HTMLElement[];
  const views: Record<string, HTMLElement> = {
    standard: $('view-standard') as HTMLElement,
    optimizer: $('view-optimizer') as HTMLElement,
    afford: $('view-afford') as HTMLElement,
  };

  function activateTab(btn: HTMLElement, moveFocus?: boolean) {
    const which = btn.dataset.tab!;
    tabs.forEach(b => {
      const active = b.dataset.tab === which;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
      if (active && moveFocus) b.focus();
    });
    Object.entries(views).forEach(([k, el]) => { el.hidden = (k !== which); });
    if (which === 'optimizer') {
      if (optState.lastOpt) drawOptimizerChart($('opt-chart') as HTMLCanvasElement, optState.lastOpt, optState.hoverDp);
      if (optRenderInp) renderOptimizerView(optRenderInp);
    } else if (which === 'afford') {
      renderAffordTargetView(readInputs());
    }
  }

  tabs.forEach(btn => { btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1'); });
  tabs.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn));
    btn.addEventListener('keydown', e => {
      const idx = tabs.indexOf(btn);
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (idx+1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (idx-1+tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next !== null) { e.preventDefault(); activateTab(tabs[next], true); }
    });
  });

  // Optimizer slider
  $input('opt-slider')!.addEventListener('input', e => {
    const dp = parseFloat((e.target as HTMLInputElement).value)/100;
    optState.sliderDp = dp; updateSliderReadout(dp);
  });

  // Optimizer chart hover
  const chart = $('opt-chart') as HTMLCanvasElement, tip = $('opt-chart-tip') as HTMLElement;
  let chartHoverRect: DOMRect | null = null;
  const refreshChartRect = () => { chartHoverRect = chart.getBoundingClientRect(); };
  const invalidateChartRect = () => { chartHoverRect = null; };
  window.addEventListener('resize', invalidateChartRect);
  window.addEventListener('scroll', invalidateChartRect, true);
  let hoverFramePending = false, pendingHover: any = null;
  function scheduleHoverFrame() {
    if (hoverFramePending) return;
    hoverFramePending = true;
    requestAnimationFrame(() => {
      hoverFramePending = false;
      const ev = pendingHover; pendingHover = null;
      if (ev === 'leave') { tip.style.display = 'none'; optState.hoverDp = null; if (optState.lastOpt) drawOptimizerChart(chart, optState.lastOpt, null); }
      else if (ev) renderHover(ev.clientX, ev.clientY);
    });
  }
  function renderHover(clientX: number, clientY: number) {
    const cs = (chart as any)._chartState;
    if (!cs || !optState.lastOpt || !optState.lastOpt.ok) return;
    const rect = chartHoverRect || (refreshChartRect(), chartHoverRect)!;
    const x = clientX - rect.left;
    if (x < cs.padL || x > cs.padL + cs.plotW) { tip.style.display = 'none'; optState.hoverDp = null; drawOptimizerChart(chart, optState.lastOpt, null); return; }
    const dp = clamp(cs.pxToDp(x), cs.xMin, cs.xMax);
    optState.hoverDp = dp;
    const p = priceAtDp(optState.lastOpt.c, dp);
    tip.innerHTML = '<b>' + (dp*100).toFixed(1) + '% down</b><br>Achievable: ' + fmt$(Math.max(0, p.pAch)) + '<br>DTI ceiling: ' + (isFinite(p.pDti) ? fmt$(p.pDti) : '—') + '<br>Cash ceiling: ' + fmt$(Math.max(0, p.pCash));
    tip.style.display = 'block';
    const tRect = tip.getBoundingClientRect();
    let tipX = x + 12; if (tipX + tRect.width > rect.width - 4) tipX = x - tRect.width - 12;
    let tipY = (clientY - rect.top) - tRect.height - 8; if (tipY < 4) tipY = (clientY - rect.top) + 14;
    tip.style.left = tipX + 'px'; tip.style.top = tipY + 'px';
    drawOptimizerChart(chart, optState.lastOpt, dp);
  }
  function queueHover(cx: number, cy: number) { pendingHover = {clientX: cx, clientY: cy}; scheduleHoverFrame(); }
  function queueLeave() { pendingHover = 'leave'; scheduleHoverFrame(); }
  chart.addEventListener('mouseenter', refreshChartRect);
  chart.addEventListener('mousemove', e => queueHover(e.clientX, e.clientY));
  chart.addEventListener('mouseleave', queueLeave);
  chart.addEventListener('touchstart', e => { if (e.touches.length) { e.preventDefault(); refreshChartRect(); queueHover(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  chart.addEventListener('touchmove', e => { if (e.touches.length) { e.preventDefault(); queueHover(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  chart.addEventListener('touchend', queueLeave);

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { if (optState.lastOpt && !(($('view-optimizer') as HTMLElement).hidden)) drawOptimizerChart(chart, optState.lastOpt, optState.hoverDp); });
  });

  // Collapsible settings cards
  for (let i = 1; i <= 5; i++) {
    const titleEl = $(`card-title-${i}`);
    const bodyEl  = $(`card-body-${i}`);
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

  // Collapsible
  $('how-btn')!.addEventListener('click', () => { $('how-btn')!.classList.toggle('open'); $('how-body')!.classList.toggle('open'); });

  // Initial render
  onChange();
});
