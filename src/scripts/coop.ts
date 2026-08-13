import { loadSharedProfile, saveSharedProfile, SHARED_KEY, type SharedProfile } from '../lib/sharedProfile';
import { calcPmiRate, calcPmiMonthly, calcMansionTax, bsearchMaxPrice } from '../lib/calc';
import { wireShareButton } from '../lib/share';

/* ============================================================
   NYC Co-op Affordability Calculator — TypeScript port
   ============================================================
   Verified against src/lib/calc.ts during migration: calcMansionTax,
   calcPmiRate, and calcPmiMonthly are byte-identical to the legacy
   coop/index.html implementations (same tier tables, same formulas) —
   reused directly from ../lib/calc. calcMortgageRecordingTax does NOT
   apply to co-ops (personal property, not subject to NYC/NYS mortgage
   recording tax) and the legacy source has no such calculation, so it
   is intentionally not imported/used here.

   bsearchMaxPrice is also reused from ../lib/calc — the legacy page's
   own copy (`bsearchMaxP`) is the same monotone binary search with a
   default `hi = 50000000`; every call site below passes 50_000_000
   explicitly to preserve that default exactly.

   NOTE on formatters: coop's original fmt$()/fmtPct()/fmtMo()/fmtShort$()
   are NOT reused from ../lib/format, for the same reasons documented in
   condo.ts and rent.ts: fmt$() parenthesizes negatives ("($500)") rather
   than fmtMoney's "$-500", and fmtPct() here takes a FRACTION (0.452)
   and always renders one decimal place, unlike the shared fmtPercent's
   whole-number-percent convention. Kept page-local, verbatim.

   NOTE on a legacy naming collision: the original page has a top-level
   `function n(id) { return parseFloat($(id).value) || 0; }` DOM-read
   helper AND a local `const n = (loanTerm||30)*12` inside `calculate()`
   that shadows it for that function's scope — valid but confusing in
   JS, and not expressible the same way with TypeScript's stricter
   scoping conventions. The DOM-read helper is renamed `nv()` here
   (matching the convention already used in condo.ts/rent.ts); this is
   a pure identifier rename with no behavioral effect.

   NOTE on a preserved legacy quirk: the original `restoreInputs()` does
   NOT restore `state.targetOverride` from saved localStorage (condo's
   port fixed this bug; coop's original never had the fix). To stay
   byte-for-byte behaviorally identical to the shipped coop page, that
   omission is preserved here as-is rather than silently fixed.
   ============================================================ */

interface Account {
  name: string;
  balance: number;
  liquidity: number;
  closing: boolean;
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
  maxDTIPct: number;
  maint: number;
  fcAtty: number;
  fcBankAtty: number;
  fcCoop: number;
  fcMoveIn: number;
  fcOther: number;
  varPct: number;
  targetOverride: number | null;
}

interface CoopAssumptions {
  mortgageRate?: number;
  dpPct?: number;
  maint?: number;
  maxDTIPct?: number;
  reserveMo?: number;
}

/* ═══════════════════════════════════════
   STATE
   ═══════════════════════════════════════ */
const state = {
  accounts: [
    { name: 'Checking',                balance: 15000, liquidity: 100, closing: true },
    { name: 'High-Yield Savings',      balance: 35000, liquidity: 100, closing: true },
    { name: 'Brokerage / Investments', balance: 70000, liquidity: 80,  closing: true },
  ] as Account[],
  targetOverride: null as number | null,   // null = use maxPrice
};

/* ═══════════════════════════════════════
   LOCAL STORAGE
   ═══════════════════════════════════════ */
const LS_KEY          = 'nyc_coop_inputs';
const ASSUMPTIONS_KEY = 'nyc_shared_assumptions_coop';

function isSaveEnabled(): boolean {
  return ($('save-toggle-cb') as HTMLInputElement).checked;
}

function saveToStorage(inp?: Inputs) {
  if (!isSaveEnabled()) return;
  if (!inp) inp = readInputs();
  const data = {
    accounts: inp.accounts,
    inputs: {
      annualIncome:   inp.annualIncome,
      otherDebts:     inp.otherDebts,
      mtgRate:        inp.mortgageRate,
      loanTerm:       inp.loanTerm,
      dpPct:          inp.dpPct,
      reserveMo:      inp.reserveMo,
      maxDti:         inp.maxDTIPct,
      monthlyMaint:   inp.maint,
      fcAtty:         inp.fcAtty,
      fcBankAtty:     inp.fcBankAtty,
      fcCoop:         inp.fcCoop,
      fcMoveIn:       inp.fcMoveIn,
      fcOther:        inp.fcOther,
      varPct:         inp.varPct,
      targetOverride: state.targetOverride ?? $input('target-price')?.value ?? '',
    }
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  saveSharedProfile({ accounts: inp.accounts, annualIncome: inp.annualIncome, otherDebts: inp.otherDebts });
  saveSharedAssumptions(inp);
}

function loadFromStorage(): any {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearStorage() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
}

/* applySharedProfile is page-local: it wires the shared data into coop's own
   accounts-table DOM, including the `closing` backfill for accounts saved by
   a calculator (e.g. condo/rent) that has no `closing` concept of its own —
   matches the legacy page's `(a.liquidity || 0) === 100` heuristic. */
function applySharedProfile(shared: SharedProfile | null) {
  if (!shared) return;
  if (Array.isArray(shared.accounts) && shared.accounts.length) {
    state.accounts = (shared.accounts as Account[]).map(a => ({
      ...a,
      closing: a.closing !== undefined ? (a.closing as boolean) : (((a.liquidity as number) || 0) === 100),
    }));
    renderAccounts();
  }
  const sv = (id: string, v: unknown) => { if (v !== undefined) { const el = $input(id); if (el) el.value = String(v); } };
  sv('annual-income', shared.annualIncome);
  sv('other-debts',   shared.otherDebts);
}

/* Shared assumptions (coop-specific: rate, down payment %, maintenance, DTI,
   reserve months) — not part of the general sharedProfile schema, so this
   stays its own localStorage key, matching condo's/rent's pattern for their
   own calculator-specific assumptions. */
function loadSharedAssumptions(): { coop: CoopAssumptions } | null {
  try { const s = localStorage.getItem(ASSUMPTIONS_KEY); return s ? { coop: JSON.parse(s) } : null; } catch (e) { return null; }
}
function saveSharedAssumptions(inp: Inputs) {
  try {
    localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify({
      mortgageRate: inp.mortgageRate, dpPct: inp.dpPct, maint: inp.maint, maxDTIPct: inp.maxDTIPct, reserveMo: inp.reserveMo
    }));
  } catch (e) { /* ignore */ }
}
function applySharedAssumptions(asmp: { coop: CoopAssumptions } | null) {
  if (!asmp || !asmp.coop) return;
  const c = asmp.coop;
  const sv = (id: string, v: unknown) => { if (v != null) { const el = $input(id); if (el) el.value = String(v); } };
  sv('mtg-rate',      c.mortgageRate);
  sv('dp-pct',        c.dpPct);
  sv('reserve-mo',    c.reserveMo);
  sv('max-dti',       c.maxDTIPct);
  sv('monthly-maint', c.maint);
}

/* ═══════════════════════════════════════
   LEGACY-DOMAIN MIGRATION FRAGMENT CONSUMER
   ═══════════════════════════════════════
   Consumes the `#migrate-local-storage=<base64>` URL fragment produced by
   functions/[[path]].js's renderStorageMigrationPage() when a browser is
   redirected from the retired nyc-co-op-affordability.com domain. The
   payload is a JSON object keyed by the exact localStorage key names the
   Worker encoded (nyc_coop_inputs, nyc_shared_profile) — LS_KEY/SHARED_KEY
   here must keep matching those names exactly. Runs first thing in the
   DOMContentLoaded boot handler, before any other localStorage read, and
   clears the URL fragment via history.replaceState once consumed (or on
   failure) so a refresh doesn't re-trigger the import. */
function importMigratedLocalStorage(): boolean {
  const marker = '#migrate-local-storage=';
  if (!window.location.hash.startsWith(marker)) return false;

  let imported = false;
  try {
    const encoded = decodeURIComponent(window.location.hash.slice(marker.length));
    const payload = JSON.parse(decodeUtf8Base64(encoded));
    [LS_KEY, SHARED_KEY, ASSUMPTIONS_KEY].forEach(key => {
      if (typeof payload[key] === 'string') {
        localStorage.setItem(key, payload[key]);
        imported = true;
      }
    });
  } catch (e) {
    imported = false;
  }

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return imported;
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function restoreInputs(data: any) {
  if (!data) return;
  if (Array.isArray(data.accounts) && data.accounts.length > 0) {
    // Migrate saved accounts that predate the closing checkbox field
    state.accounts = data.accounts.map((a: any) => ({
      ...a,
      closing: a.closing !== undefined ? a.closing : (a.liquidity || 0) === 100,
    }));
  }
  const inp = data.inputs;
  if (!inp) return;
  const setVal = (id: string, val: unknown) => { const el = $input(id); if (el && val !== undefined) el.value = String(val); };
  setVal('annual-income', inp.annualIncome);
  setVal('other-debts',   inp.otherDebts);
  setVal('mtg-rate',      inp.mtgRate);
  setVal('loan-term',     inp.loanTerm);
  setVal('dp-pct',        inp.dpPct);
  setVal('reserve-mo',    inp.reserveMo);
  setVal('max-dti',       inp.maxDti);
  setVal('monthly-maint', inp.monthlyMaint);
  setVal('fc-atty',       inp.fcAtty);
  setVal('fc-bank-atty',  inp.fcBankAtty);
  setVal('fc-coop',       inp.fcCoop);
  setVal('fc-movein',     inp.fcMoveIn);
  setVal('fc-other',      inp.fcOther);
  setVal('var-pct',       inp.varPct);
  // NOTE: state.targetOverride is intentionally NOT restored here — see the
  // file-header note on this preserved legacy quirk.
}

/* ═══════════════════════════════════════
   PURE CALCULATE FUNCTION
   ═══════════════════════════════════════ */
function calculate(inp: Inputs) {
  const {
    accounts, annualIncome, otherDebts,
    mortgageRate, loanTerm, dpPct, reserveMo, maxDTIPct, maint,
    fcAtty, fcBankAtty, fcCoop, fcMoveIn, fcOther,
    varPct, targetOverride
  } = inp;

  // --- derived scalars ---
  const avail      = accounts.reduce((s, a) => s + (a.balance || 0) * (a.liquidity || 0) / 100, 0);
  const totLiquid  = accounts.reduce((s, a) => a.closing ? s + (a.balance || 0) : s, 0);
  const annInc     = annualIncome  || 0;
  const moInc      = annInc / 12;
  const oDebts     = otherDebts    || 0;
  const rateAnn    = mortgageRate  || 0;
  const rateMonthly= rateAnn / 100 / 12;
  const nMonths    = (loanTerm || 30) * 12;
  const dp         = (dpPct    || 0) / 100;
  const dtiMax     = (maxDTIPct|| 0) / 100;
  const resMo      = reserveMo || 0;
  const maintMo    = maint     || 0;
  const fixedCC    = (fcAtty||0) + (fcBankAtty||0) + (fcCoop||0) + (fcMoveIn||0) + (fcOther||0);
  const varFrac    = (varPct   || 0) / 100;

  // --- PMT factor K ---
  let K = 0;
  if (nMonths > 0) {
    if (rateMonthly === 0) {
      K = 1 / nMonths;
    } else {
      K = rateMonthly / (1 - Math.pow(1 + rateMonthly, -nMonths));
    }
  }

  // PMI effective monthly rate on the loan
  const pmiRate   = calcPmiRate(dp);
  const effK      = K + pmiRate / 12;

  // Total variable+mansion cash needed for the DP/CC pool at a given price
  const ccAtP     = (p: number) => p * varFrac + calcMansionTax(p);  // variable + mansion (both proportional to price)
  const closeAtP  = (p: number) => fixedCC + ccAtP(p) + p * dp;      // total closing cash
  const resAtP    = (p: number) => closeAtP(p) + resMo * (maintMo + p * (1 - dp) * effK); // total cash with reserves (PMI in monthly)

  // --- Reserve-constrained max price (all weighted assets cover DP+CC+reserves) ---
  // If no post-close reserve is required, this constraint does not cap price.
  const reserveMax = resMo > 0
    ? bsearchMaxPrice(p => resAtP(p) <= avail, 50000000)
    : Infinity;

  // --- DP/CC-constrained max price (only Closing?-checked accounts cover DP + closing costs) ---
  const dpCCNum = totLiquid - fixedCC;
  const dpCCMax = dpCCNum <= 0
    ? 0
    : bsearchMaxPrice(p => p * dp + ccAtP(p) <= dpCCNum, 50000000);

  // --- Effective cash ceiling is the tighter of the two constraints ---
  const cashMax = Math.min(reserveMax, isFinite(dpCCMax) ? dpCCMax : reserveMax);

  // --- DTI-constrained max price (PMI raises effective monthly loan cost) ---
  const maxMoMtg    = dtiMax * moInc - maintMo - oDebts;
  const maxLoan     = (effK > 0) ? Math.max(0, maxMoMtg) / effK : Infinity;
  const dtiMaxPrice = ((1 - dp) > 0) ? Math.max(0, maxLoan / (1 - dp)) : Infinity;

  const maxPrice = Math.min(cashMax, isFinite(dtiMaxPrice) ? dtiMaxPrice : cashMax);
  const binding  = cashMax <= (isFinite(dtiMaxPrice) ? dtiMaxPrice : Infinity)
                   ? (dpCCMax <= reserveMax ? 'DP / Closing Costs' : 'Cash / Reserves')
                   : 'DTI / Income';

  // --- Deal snapshot at target price ---
  const tgt = (targetOverride !== null && !isNaN(targetOverride) && targetOverride >= 0)
              ? targetOverride : maxPrice;

  const downPmt      = tgt * dp;
  const varCC        = tgt * varFrac;
  const mansion      = calcMansionTax(tgt);
  const totalAtClose = downPmt + fixedCC + varCC + mansion;
  const maintRes     = resMo * maintMo;
  const loanAmt      = tgt * (1 - dp);
  const moMtg        = loanAmt * K;
  const moPmi        = calcPmiMonthly(loanAmt, dp);
  const mtgRes       = resMo * (moMtg + moPmi);
  const totalCash    = totalAtClose + maintRes + mtgRes;
  const dpSurplus    = totLiquid - totalAtClose;
  const surplus      = avail - totalCash;
  const pcLiquid     = avail - totalAtClose;
  const moTotal      = moMtg + moPmi + maintMo;
  const pcMonths     = moTotal > 0 ? pcLiquid / moTotal : 0;
  const dtiActual    = moInc > 0 ? (moTotal + oDebts) / moInc : 0;

  const cashOk  = dpSurplus >= 0 && (resMo === 0 || surplus >= 0);
  const dtiOk   = dtiActual <= dtiMax;
  const resOk   = resMo === 0 || pcMonths >= resMo;

  return {
    avail, totLiquid, fixedCC,
    cashMax, dtiMaxPrice: isFinite(dtiMaxPrice) ? dtiMaxPrice : null,
    maxPrice, binding, moInc,
    tgt, downPmt, varCC, mansion, totalAtClose,
    maintRes, loanAmt, moMtg, moPmi, mtgRes,
    totalCash, dpSurplus, surplus, pcLiquid, pcMonths,
    maintMo, moTotal, dtiActual, dtiMax,
    cashOk, dtiOk, resOk, resMo
  };
}
type CalcResult = ReturnType<typeof calculate>;

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
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
  return '$' + Math.round(v);
}

/* ═══════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════ */
function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
const tx = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };

/* ═══════════════════════════════════════
   RENDER ACCOUNTS TABLE
   ═══════════════════════════════════════ */
function renderAccounts() {
  const tbody = $('acct-tbody')!;
  tbody.innerHTML = '';

  state.accounts.forEach((acct, i) => {
    const avail = (acct.balance || 0) * (acct.liquidity || 0) / 100;
    const tr = document.createElement('tr');

    // Name
    const tdName = document.createElement('td');
    const inName = document.createElement('input');
    inName.type = 'text';
    inName.value = acct.name;
    inName.addEventListener('input', e => {
      state.accounts[i].name = (e.target as HTMLInputElement).value;
      saveToStorage();  // persist name change without recalculating
    });
    tdName.appendChild(inName);

    // Balance
    const tdBal = document.createElement('td');
    const inBal = document.createElement('input');
    inBal.type = 'number'; inBal.min = '0'; inBal.step = '1000';
    inBal.value = String(acct.balance);
    inBal.addEventListener('input', e => {
      state.accounts[i].balance = parseFloat((e.target as HTMLInputElement).value) || 0;
      refreshAvailCell(i);
      onChange();
    });
    tdBal.appendChild(inBal);

    // "Closing?" checkbox
    const tdClose = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!acct.closing;
    chk.title = 'Check to count this account toward closing cash (down payment + closing costs)';
    chk.setAttribute('aria-label', `Use "${acct.name}" for closing cash`);
    chk.addEventListener('change', e => {
      state.accounts[i].closing = (e.target as HTMLInputElement).checked;
      refreshAvailCell(i);
      onChange();
    });
    tdClose.appendChild(chk);

    // Liquidity ("Reserve %")
    const tdLiq = document.createElement('td');
    const inLiq = document.createElement('input');
    inLiq.type = 'number'; inLiq.min = '0'; inLiq.max = '100'; inLiq.step = '5';
    inLiq.value = String(acct.liquidity);
    inLiq.addEventListener('input', e => {
      state.accounts[i].liquidity = parseFloat((e.target as HTMLInputElement).value) || 0;
      refreshAvailCell(i);
      onChange();
    });
    tdLiq.appendChild(inLiq);

    // "Closing Cash" column — full balance only if closing checkbox is checked
    const tdDp = document.createElement('td');
    const divDp = document.createElement('div');
    const isClosing = !!acct.closing;
    divDp.className = 'avail-cell' + (isClosing ? ' dp-ok' : ' dim');
    divDp.id = 'dp-' + i;
    if (isClosing) {
      const badge = document.createElement('span');
      badge.className = 'dp-badge';
      badge.textContent = '✓';
      divDp.appendChild(badge);
      divDp.appendChild(document.createTextNode(fmt$(acct.balance || 0)));
    } else {
      divDp.textContent = '—';
    }
    tdDp.appendChild(divDp);

    // "Reserve Value" column — balance × Reserve % (read-only calculated)
    const tdAvail = document.createElement('td');
    const divAvail = document.createElement('div');
    divAvail.className = 'avail-cell';
    divAvail.id = 'avail-' + i;
    divAvail.textContent = fmt$(avail);
    tdAvail.appendChild(divAvail);

    // Delete button (not for rows 0 and 1)
    const tdDel = document.createElement('td');
    tdDel.className = 'del-cell';
    if (i >= 2) {
      const btn = document.createElement('button');
      btn.className = 'btn-del';
      btn.textContent = '×';
      btn.title = 'Remove row';
      btn.addEventListener('click', () => {
        state.accounts.splice(i, 1);
        renderAccounts();
        onChange();
      });
      tdDel.appendChild(btn);
    }

    tr.append(tdName, tdBal, tdClose, tdLiq, tdDp, tdAvail, tdDel);
    tbody.appendChild(tr);
  });

  refreshTotals();
}

function refreshAvailCell(i: number) {
  const a = state.accounts[i];
  const elAvail = $('avail-' + i);
  if (elAvail) {
    elAvail.textContent = fmt$((a.balance || 0) * (a.liquidity || 0) / 100);
  }
  const elDp = $('dp-' + i);
  if (elDp) {
    const isClosing = !!a.closing;
    elDp.className = 'avail-cell' + (isClosing ? ' dp-ok' : ' dim');
    elDp.replaceChildren();
    if (isClosing) {
      const badge = document.createElement('span');
      badge.className = 'dp-badge';
      badge.textContent = '✓';
      elDp.appendChild(badge);
      elDp.appendChild(document.createTextNode(fmt$(a.balance || 0)));
    } else {
      elDp.textContent = '—';
    }
  }
  refreshTotals();
}

function refreshTotals() {
  const totAvail  = state.accounts.reduce((s, a) => s + (a.balance||0) * (a.liquidity||0) / 100, 0);
  const totLiquid = state.accounts.reduce((s, a) => a.closing ? s + (a.balance||0) : s, 0);
  tx('tot-avail', fmt$(totAvail));
  tx('tot-liquid', fmt$(totLiquid));
}

/* ═══════════════════════════════════════
   READ INPUTS
   ═══════════════════════════════════════ */
function nv(id: string): number { return parseFloat($input(id)!.value) || 0; }

function readInputs(): Inputs {
  return {
    accounts:     state.accounts,
    annualIncome: nv('annual-income'),
    otherDebts:   nv('other-debts'),
    mortgageRate: nv('mtg-rate'),
    loanTerm:     nv('loan-term'),
    dpPct:        nv('dp-pct'),
    reserveMo:    nv('reserve-mo'),
    maxDTIPct:    nv('max-dti'),
    maint:        nv('monthly-maint'),
    fcAtty:       nv('fc-atty'),
    fcBankAtty:   nv('fc-bank-atty'),
    fcCoop:       nv('fc-coop'),
    fcMoveIn:     nv('fc-movein'),
    fcOther:      nv('fc-other'),
    varPct:       nv('var-pct'),
    targetOverride: state.targetOverride,
  };
}

/* ═══════════════════════════════════════
   UPDATE RESULTS
   ═══════════════════════════════════════ */
function updateResults(r: CalcResult) {
  // Hero
  const heroEl = $('hero-price')!;
  heroEl.textContent = fmt$(r.maxPrice);
  heroEl.className   = 'hero-price' + (r.maxPrice === 0 ? ' zero' : '');
  tx('hero-binding', r.binding);

  // Warning if max price is 0
  const warnEl = $('hero-warn') as HTMLElement;
  if (r.maxPrice === 0) {
    warnEl.style.display = 'block';
    if (r.moInc > 0 && r.dtiMax * r.moInc <= r.maintMo) {
      warnEl.textContent = 'Maintenance alone exceeds your DTI limit. Increase income, reduce DTI limit, or find a lower-maintenance building.';
    } else {
      warnEl.textContent = 'Not enough assets or income to qualify at current inputs. Try adjusting down payment %, reserve months, or closing costs.';
    }
  } else {
    warnEl.style.display = 'none';
  }

  // Fixed CC total
  tx('fc-total-display', fmt$(r.fixedCC));

  // Monthly income display
  $input('monthly-income')!.value = String(Math.round(r.moInc));

  // Reserve month labels
  tx('s-res-mo1', String(r.resMo));
  tx('s-res-mo2', String(r.resMo));

  // Target price input — track maxPrice when no override; otherwise mirror the override
  // (skip if user is currently typing in this field)
  const tgtIn = $input('target-price')!;
  if (document.activeElement !== tgtIn) {
    if (state.targetOverride === null) {
      tgtIn.value = String(Math.round(r.maxPrice));
    } else if (isFinite(state.targetOverride)) {
      tgtIn.value = String(Math.round(state.targetOverride));
    }
  }

  // Cash Waterfall
  tx('s-dp',         fmt$(r.downPmt));
  tx('s-fcc',        fmt$(r.fixedCC));
  tx('s-vcc',        fmt$(r.varCC));
  const mansionRow = $('mansion-snap-row') as HTMLElement;
  if (r.mansion > 0) {
    mansionRow.style.display = '';
    mansionRow.classList.add('mansion-row');
    tx('s-mansion', fmt$(r.mansion));
  } else {
    mansionRow.style.display = 'none';
  }
  tx('s-atclose',    fmt$(r.totalAtClose));
  tx('s-dp-avail',   fmt$(r.totLiquid));
  tx('s-maint-res',  fmt$(r.maintRes));
  tx('s-mtg-res',    fmt$(r.mtgRes));
  tx('s-total-cash', fmt$(r.totalCash));
  tx('s-avail',      fmt$(r.avail));

  const dpSurplusEl = $('s-dp-surplus')!;
  dpSurplusEl.textContent = fmt$(r.dpSurplus);
  dpSurplusEl.className = 'sr-val ' + (r.dpSurplus >= 0 ? 'pos' : 'neg');

  const surplusEl = $('s-surplus')!;
  surplusEl.textContent = fmt$(r.surplus);
  surplusEl.className = 'sr-val ' + (r.surplus >= 0 ? 'pos' : 'neg');

  tx('s-pc-liquid', fmt$(r.pcLiquid));

  const moEl = $('s-pc-months')!;
  moEl.textContent = fmtMo(r.pcMonths);
  moEl.className = 'sr-val ' + (r.resOk ? '' : 'neg');

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
  tx('s-maint',        fmt$(r.maintMo));
  tx('s-monthly-total', fmt$(r.moTotal));

  const dtiEl = $('s-dti')!;
  dtiEl.textContent = fmtPct(r.dtiActual) + '  (max ' + fmtPct(r.dtiMax) + ')';
  dtiEl.className = 'sr-val ' + (r.dtiOk ? '' : 'neg');

  // Feasibility pills
  const dpOk = r.dpSurplus >= 0;
  const cashPillOk = r.cashOk;
  setPill('pill-cash', 'pd-cash', cashPillOk,
    cashPillOk
      ? fmt$(Math.min(r.dpSurplus, r.surplus)) + ' surplus'
      : dpOk
        ? 'Reserves SHORT by ' + fmt$(Math.abs(r.surplus))
        : 'DP/CC SHORT by ' + fmt$(Math.abs(r.dpSurplus)));

  setPill('pill-dti', 'pd-dti', r.dtiOk,
    r.dtiOk
      ? fmtPct(r.dtiActual) + ' (max ' + fmtPct(r.dtiMax) + ')'
      : fmtPct(r.dtiActual) + ' — OVER max ' + fmtPct(r.dtiMax));

  setPill('pill-res', 'pd-res', r.resOk,
    r.resOk
      ? r.pcMonths.toFixed(1) + ' months post-close'
      : r.pcMonths.toFixed(1) + ' months (need ' + r.resMo + ')');
}

function setPill(pillId: string, detailId: string, ok: boolean, detail: string) {
  const pill = $(pillId);
  if (!pill) return;
  pill.className = 'pill ' + (ok ? 'ok' : 'fail');
  pill.querySelector('.p-icon')!.textContent = ok ? '✓' : '✗';
  tx(detailId, detail);
}

/* ═══════════════════════════════════════
   OPTIMIZER MATH
   ═══════════════════════════════════════ */
// Derived constants from input set, reused by optimizer + chart
function deriveConstants(inp: Inputs) {
  const avail = inp.accounts.reduce((s, a) => s + (a.balance || 0) * (a.liquidity || 0) / 100, 0);
  const totLiquid = inp.accounts.reduce((s, a) => a.closing ? s + (a.balance || 0) : s, 0);
  const moInc = (inp.annualIncome || 0) / 12;
  const rateMonthly = (inp.mortgageRate || 0) / 100 / 12;
  const nMonths = (inp.loanTerm || 30) * 12;
  const dtiMax = (inp.maxDTIPct || 0) / 100;
  const resMo = inp.reserveMo || 0;
  const maintMo = inp.maint || 0;
  const oDebts = inp.otherDebts || 0;
  const fixedCC = (inp.fcAtty||0)+(inp.fcBankAtty||0)+(inp.fcCoop||0)+(inp.fcMoveIn||0)+(inp.fcOther||0);
  const varFrac = (inp.varPct || 0) / 100;
  const minDp = (inp.dpPct || 0) / 100;

  let K = 0;
  if (nMonths > 0) {
    K = (rateMonthly === 0) ? 1 / nMonths
        : rateMonthly / (1 - Math.pow(1 + rateMonthly, -nMonths));
  }

  const A = dtiMax * moInc - maintMo - oDebts;             // monthly mortgage budget
  const B = avail - fixedCC - resMo * maintMo;             // reserve cash budget
  const dpCCNum = totLiquid - fixedCC;                     // DP+CC cash budget (Closing?-checked only)

  return { avail, totLiquid, moInc, dtiMax, resMo, maintMo, oDebts, fixedCC, varFrac, minDp, K, A, B, dpCCNum };
}
type Constants = ReturnType<typeof deriveConstants>;

// Price ceilings as a function of dp (0..1) — uses binary search to account for mansion tax and PMI
function priceAtDp(c: Constants, dp: number) {
  const pmiRate = calcPmiRate(dp);
  const effK    = c.K + pmiRate / 12;

  // Reserve constraint: avail covers DP + fixedCC + varCC + mansion + reserves (PMI in monthly)
  const pRes = c.resMo > 0
    ? bsearchMaxPrice(p => p * dp + c.fixedCC + p * c.varFrac + calcMansionTax(p) + c.resMo * (c.maintMo + p * (1 - dp) * effK) <= c.avail, 50000000)
    : Infinity;

  // DP/CC constraint: only Closing?-checked accounts cover DP + variable CC + mansion
  let pDpCC: number;
  if (c.dpCCNum <= 0) {
    pDpCC = 0;
  } else {
    pDpCC = bsearchMaxPrice(p => p * dp + p * c.varFrac + calcMansionTax(p) <= c.dpCCNum, 50000000);
  }

  // Effective cash ceiling: tighter of reserve and DP/CC constraints
  const pCash = isFinite(pDpCC) ? Math.min(pRes, pDpCC) : pRes;

  // DTI ceiling uses effective K (P+I + PMI per dollar of loan)
  const denomDti = (1 - dp) * effK;
  const pDti = (denomDti > 0 && c.A > 0) ? c.A / denomDti : (c.A > 0 ? Infinity : 0);
  const pAch = Math.min(pCash, isFinite(pDti) ? pDti : pCash);
  return { pCash, pDti, pAch };
}

// Full deal snapshot at a given price + dp
function dealAtPriceDp(c: Constants, price: number, dp: number) {
  const downPmt      = price * dp;
  const loanAmt      = price * (1 - dp);
  const moMtg        = loanAmt * c.K;
  const moPmi        = calcPmiMonthly(loanAmt, dp);
  const varCC        = price * c.varFrac;
  const mansion      = calcMansionTax(price);
  const totalAtClose = downPmt + c.fixedCC + varCC + mansion;
  const maintRes     = c.resMo * c.maintMo;
  const mtgRes       = c.resMo * (moMtg + moPmi);
  const totalCash    = totalAtClose + maintRes + mtgRes;
  const dpSurplus    = c.totLiquid - totalAtClose;
  const surplus      = c.avail - totalCash;
  const moTotal      = moMtg + moPmi + c.maintMo;
  const dti          = c.moInc > 0 ? (moTotal + c.oDebts) / c.moInc : 0;
  const pcLiquid     = c.avail - totalAtClose;
  const pcMonths     = moTotal > 0 ? pcLiquid / moTotal : 0;
  return { downPmt, loanAmt, moMtg, moPmi, varCC, mansion, totalAtClose, maintRes, mtgRes, totalCash, dpSurplus, surplus, moTotal, dti, pcLiquid, pcMonths };
}

function computeOptimizer(inp: Inputs): any {
  const c = deriveConstants(inp);
  // Lender / co-op LTV cap. If the user's board minimum is already at or above
  // 80%, expand the cap so the upper clamp can't pull dpOptimal back below minDp.
  const HARD_DP_MAX = Math.max(0.80, c.minDp);

  // Infeasibility checks
  if (c.A <= 0) {
    return { ok: false, reason: 'A_NEG', c,
      title: 'Income insufficient for this maintenance level',
      detail: 'Maintenance plus existing debts already exceed your DTI budget. There is no down payment that lets you qualify — increase income, reduce DTI limit, or pick a building with lower maintenance.' };
  }
  if ((c.resMo > 0 && c.B <= 0) || c.dpCCNum <= 0) {
    return { ok: false, reason: 'B_NEG', c,
      title: 'Insufficient assets',
      detail: c.dpCCNum <= 0
        ? 'Your closing-eligible assets do not cover the fixed closing costs. Check more accounts as Closing? or reduce closing costs.'
        : 'After fixed closing costs and the maintenance reserve, no cash remains for a down payment. Increase liquid assets, lower the reserve months, or reduce closing costs.' };
  }

  // Unclamped intersection of the reserve curve (pRes) and DTI curve.
  // Computed for each PMI tier (effK = K + pmiRate/12) since the curves shift between tiers.
  // The plain-K version is the no-PMI zone baseline; tier versions cover dp < 20%.
  const PMI_TIER_RATES = [0, 0.0052, 0.0070, 0.0095, 0.0120]; // 0 = no PMI (dp>=0.20)
  const pmiTierCandidates: number[] = [];
  for (const rate of PMI_TIER_RATES) {
    const eK = c.K + rate / 12;
    const num = eK * c.B - c.A * (c.varFrac + c.resMo * eK);
    const den = c.A * (1 - c.resMo * eK) + eK * c.B;
    if (c.resMo > 0 && den !== 0) pmiTierCandidates.push(num / den);
    const dpCCDen = c.A + c.dpCCNum * eK;
    if (dpCCDen !== 0) pmiTierCandidates.push((c.dpCCNum * eK - c.A * c.varFrac) / dpCCDen);
  }
  // Baseline no-PMI analytical candidates (kept for dpUnclamped tracking below)
  const baseNum = c.K * c.B - c.A * (c.varFrac + c.resMo * c.K);
  const baseDen = c.A * (1 - c.resMo * c.K) + c.K * c.B;
  const dpAnalytical = c.resMo > 0 && baseDen !== 0 ? baseNum / baseDen : c.minDp;
  const dpCCDen2 = c.A + c.dpCCNum * c.K;
  const dpDpCC = (dpCCDen2 !== 0) ? (c.dpCCNum * c.K - c.A * c.varFrac) / dpCCDen2 : c.minDp;

  const dpHardMax = Math.max(HARD_DP_MAX, c.minDp);

  // Mansion tax creates price cliffs at tier boundaries; PMI creates a kink at dp=0.20 where the
  // rate drops to 0. Evaluate dp candidates derived from each price boundary so the optimizer
  // doesn't miss these kinks.
  const MANSION_KINKS = [1000000, 2000000, 3000000, 5000000, 10000000, 15000000, 20000000, 25000000];
  const kinkCandidates: number[] = [];
  const denom = 1 - c.resMo * c.K;
  for (const P of MANSION_KINKS) {
    const m = calcMansionTax(P);
    if (c.resMo > 0 && denom !== 0 && P > 0) {
      kinkCandidates.push((c.avail - c.fixedCC - m - c.resMo * c.maintMo - P * (c.varFrac + c.resMo * c.K)) / (P * denom));
    }
    if (P > 0) {
      kinkCandidates.push((c.dpCCNum - m) / P - c.varFrac);
    }
  }

  // Evaluate both candidate dp values and the minDp; pick the one yielding highest pAch.
  // Store pAch for each clamped candidate to avoid redundant calls later.
  // PMI creates a kink at each tier boundary (0.20, 0.15, 0.10, 0.05) where the effective K
  // changes. Include both the exact boundary and an epsilon-below value to sample both sides.
  const PMI_DP_KINKS = [0.20, 0.20 - 1e-6, 0.15, 0.15 - 1e-6, 0.10, 0.10 - 1e-6, 0.05, 0.05 - 1e-6];
  const candidates = [dpAnalytical, dpDpCC, c.minDp, ...kinkCandidates, ...PMI_DP_KINKS, ...pmiTierCandidates];
  let dpOptimal = c.minDp;
  let bestPAch  = -Infinity;
  const candidatePAch: Record<number, { dpClamped: number; pAch: number }> = {};
  for (const dpCand of candidates) {
    const dpClamped = Math.max(c.minDp, Math.min(dpHardMax, dpCand));
    const pAch = priceAtDp(c, dpClamped).pAch;
    candidatePAch[dpCand] = { dpClamped, pAch };
    if (pAch > bestPAch) { bestPAch = pAch; dpOptimal = dpClamped; }
  }
  // Clamping status: check whether the selected optimal dp was clamped
  const clampedAt = dpOptimal === c.minDp && (dpAnalytical < c.minDp || dpDpCC < c.minDp) ? 'min'
    : dpOptimal === dpHardMax ? 'max'
    : null;
  // dpUnclamped: pick the analytical candidate with the higher unclamped pAch (used for chart annotation)
  const dpUnclamped = candidatePAch[dpAnalytical].pAch >= candidatePAch[dpDpCC].pAch ? dpAnalytical : dpDpCC;

  // True max price
  const optPrices = priceAtDp(c, dpOptimal);
  const pMaxTrue = Math.max(0, optPrices.pAch);

  // "Basic" baseline at min_dp_required
  const basePrices = priceAtDp(c, c.minDp);
  const pStandard = Math.max(0, basePrices.pAch);

  const gain = pMaxTrue - pStandard;

  // Determine which constraint binds at minDp (for explainer)
  // pCash < pDti ⇒ cash is binding (more dp hurts); pDti < pCash ⇒ DTI binding (more dp helps)
  const eps = 1; // dollars
  const baseBind = (basePrices.pCash <= basePrices.pDti - eps) ? 'cash'
                  : (basePrices.pDti <= basePrices.pCash - eps) ? 'dti'
                  : 'both';

  return {
    ok: true, c,
    dpUnclamped, dpOptimal, clampedAt,
    pMaxTrue, pStandard, gain,
    baseBind,
    optPrices, basePrices,
    HARD_DP_MAX
  };
}

// Sensitivity: re-run optimizer with one input changed
function runSensitivity(baseInp: Inputs, basePrice: number) {
  const tweaks: { label: string; mod: (i: Inputs) => Inputs }[] = [
    { label: '+$25k more cash',   mod: i => addCash(i, 25000) },
    { label: '+$50k more cash',   mod: i => addCash(i, 50000) },
    { label: '+$10k/yr income',   mod: i => ({ ...i, annualIncome: (i.annualIncome||0) + 10000 }) },
    { label: '+$25k/yr income',   mod: i => ({ ...i, annualIncome: (i.annualIncome||0) + 25000 }) },
    { label: 'DTI limit → 30%',   mod: i => ({ ...i, maxDTIPct: 30 }) },
    { label: 'Reserves → 12 months', mod: i => ({ ...i, reserveMo: 12 }) },
  ];
  return tweaks.map(t => {
    const modified = t.mod(baseInp);
    const opt = computeOptimizer(modified);
    const newPrice = opt.ok ? opt.pMaxTrue : 0;
    return { label: t.label, newPrice, delta: newPrice - basePrice, ok: opt.ok };
  });
}

function addCash(inp: Inputs, amount: number): Inputs {
  const accounts = inp.accounts.concat([{ name: '__sensitivity', balance: amount, liquidity: 100, closing: true }]);
  return { ...inp, accounts };
}

/* ═══════════════════════════════════════
   OPTIMIZER CHART (Canvas 2D)
   ═══════════════════════════════════════ */
function drawOptimizerChart(canvas: HTMLCanvasElement, opt: any, hoverDp: number | null) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

  // Resize backing store for crisp rendering
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!opt.ok) return;
  const c = opt.c;
  const HARD_DP_MAX = opt.HARD_DP_MAX;

  // Plot range: from minDp to min(80%, max where achievable > 0). Compute samples first.
  const xMin = Math.max(0, Math.min(c.minDp, HARD_DP_MAX - 0.01));
  const xMax = HARD_DP_MAX;
  const N = 121;
  const samples: any[] = [];
  let yMaxRaw = 0;
  for (let i = 0; i < N; i++) {
    const dp = xMin + (xMax - xMin) * (i / (N - 1));
    const p = priceAtDp(c, dp);
    samples.push({ dp, ...p });
    if (isFinite(p.pCash)) yMaxRaw = Math.max(yMaxRaw, p.pCash);
    if (isFinite(p.pDti))  yMaxRaw = Math.max(yMaxRaw, p.pDti);
  }
  // Cap pDti for plotting if it explodes near dp=1 (it won't here since xMax=0.8, but be safe)
  yMaxRaw = Math.min(yMaxRaw, opt.pStandard * 8 + 1e6);
  if (yMaxRaw <= 0) yMaxRaw = 1;
  const yMax = niceRound(yMaxRaw * 1.08);

  // Layout
  const padL = 56, padR = 14, padT = 14, padB = 30;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const xToPx = (dp: number) => padL + ((dp - xMin) / (xMax - xMin)) * plotW;
  const pxToDp = (px: number) => xMin + ((px - padL) / plotW) * (xMax - xMin);
  const yToPx = (price: number) => padT + plotH - (price / yMax) * plotH;

  // Zone tints — left of intersection: DTI-constrained (faint blue); right: cash-constrained (faint orange)
  const splitDp = clamp(opt.dpUnclamped, xMin, xMax);
  // Actually: at low dp, pDti is low so DTI binds. At high dp, pCash drops so cash binds.
  // Left of intersection = DTI-binding (blue tint). Right = cash-binding (orange tint).
  ctx.fillStyle = 'rgba(37,99,235,0.045)';
  ctx.fillRect(padL, padT, xToPx(splitDp) - padL, plotH);
  ctx.fillStyle = 'rgba(245,158,11,0.05)';
  ctx.fillRect(xToPx(splitDp), padT, padL + plotW - xToPx(splitDp), plotH);

  // Y gridlines (5 lines) + labels
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (i / 4);
    const v = yMax * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(fmtShort$(v), padL - 6, y);
  }

  // X axis labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xTicks = niceTicks(xMin, xMax, 6);
  xTicks.forEach(tickDp => {
    const x = xToPx(tickDp);
    ctx.strokeStyle = '#f3f4f6';
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.fillText((tickDp * 100).toFixed(0) + '%', x, padT + plotH + 5);
  });

  // Axis labels
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Down Payment %', padL + plotW / 2, cssH - 10);

  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Affordable Price', 0, 0);
  ctx.restore();

  // Build achievable polygon for fill
  ctx.fillStyle = 'rgba(22,163,74,0.10)';
  ctx.beginPath();
  ctx.moveTo(xToPx(samples[0].dp), yToPx(0));
  samples.forEach(s => ctx.lineTo(xToPx(s.dp), yToPx(Math.max(0, s.pAch))));
  ctx.lineTo(xToPx(samples[samples.length - 1].dp), yToPx(0));
  ctx.closePath();
  ctx.fill();

  // DTI line (blue)
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const y = yToPx(Math.min(yMax, isFinite(s.pDti) ? s.pDti : yMax));
    if (i === 0) ctx.moveTo(xToPx(s.dp), y); else ctx.lineTo(xToPx(s.dp), y);
  });
  ctx.stroke();

  // Cash line (orange)
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const y = yToPx(Math.min(yMax, Math.max(0, s.pCash)));
    if (i === 0) ctx.moveTo(xToPx(s.dp), y); else ctx.lineTo(xToPx(s.dp), y);
  });
  ctx.stroke();

  // Achievable line (bold dark green)
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const y = yToPx(Math.max(0, s.pAch));
    if (i === 0) ctx.moveTo(xToPx(s.dp), y); else ctx.lineTo(xToPx(s.dp), y);
  });
  ctx.stroke();

  // Red dashed vertical at min_dp_required
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xToPx(c.minDp), padT);
  ctx.lineTo(xToPx(c.minDp), padT + plotH);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#dc2626';
  ctx.font = '9.5px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Board min', xToPx(c.minDp) + 4, padT + 2);

  // Crosshairs from the gold dot
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(245,158,11,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue));
  ctx.lineTo(padL, yToPx(opt.pMaxTrue));
  ctx.moveTo(xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue));
  ctx.lineTo(xToPx(opt.dpOptimal), padT + plotH);
  ctx.stroke();
  ctx.restore();

  // Gray dot at basic calc
  drawDot(ctx, xToPx(c.minDp), yToPx(opt.pStandard), 5, '#9ca3af', '#4b5563');

  // Gold dot at optimum (drawn last so it's on top)
  drawDot(ctx, xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue), 6.5, '#f59e0b', '#92400e');

  // Annotation text near the gold dot
  ctx.fillStyle = '#92400e';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const goldX = xToPx(opt.dpOptimal);
  const goldY = yToPx(opt.pMaxTrue);
  const annoTxt = 'True Max: ' + fmt$(opt.pMaxTrue) + ' at ' + (opt.dpOptimal * 100).toFixed(1) + '% down';
  // Place annotation to the left if too close to right edge
  const annoW = ctx.measureText(annoTxt).width;
  let annoX = goldX + 9;
  if (annoX + annoW > padL + plotW - 4) annoX = goldX - annoW - 9;
  ctx.fillText(annoTxt, annoX, goldY - 8);

  // Arrow basic → optimum (only if there's a meaningful gain)
  if (opt.gain > 1000 && Math.abs(xToPx(c.minDp) - xToPx(opt.dpOptimal)) > 8) {
    drawArrow(ctx, xToPx(c.minDp), yToPx(opt.pStandard), xToPx(opt.dpOptimal), yToPx(opt.pMaxTrue), '#6b7280');
    ctx.fillStyle = '#374151';
    ctx.font = '10.5px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const midX = (xToPx(c.minDp) + xToPx(opt.dpOptimal)) / 2;
    const midY = (yToPx(opt.pStandard) + yToPx(opt.pMaxTrue)) / 2 - 6;
    ctx.fillText('+' + fmt$(opt.gain), midX, midY);
  }

  // Hover crosshair
  if (typeof hoverDp === 'number' && hoverDp >= xMin && hoverDp <= xMax) {
    const hx = xToPx(hoverDp);
    ctx.save();
    ctx.strokeStyle = 'rgba(31,41,55,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH);
    ctx.stroke();
    ctx.restore();
  }

  // Stash for hover lookup
  (canvas as any)._chartState = {
    padL, padR, padT, padB, plotW, plotH, xMin, xMax, yMax,
    xToPx, pxToDp, yToPx, samples
  };
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Arrowhead
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ah = 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(ang - 0.4), y2 - ah * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - ah * Math.cos(ang + 0.4), y2 - ah * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function niceRound(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const m = v / base;
  let nice;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 2.5) nice = 2.5;
  else if (m <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}
function niceTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  const step = niceRound(range / Math.max(1, count));
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}

/* ═══════════════════════════════════════
   OPTIMIZER VIEW RENDER
   ═══════════════════════════════════════ */
const optState: { sliderDp: number | null; hoverDp: number | null; lastOpt: any; lastInp: Inputs | null } =
  { sliderDp: null, hoverDp: null, lastOpt: null, lastInp: null };

function renderOptimizerView(inp: Inputs) {
  const opt = computeOptimizer(inp);
  optState.lastOpt = opt;
  optState.lastInp = inp;

  const notice = $('opt-notice') as HTMLElement;
  const content = $('opt-content') as HTMLElement;

  if (!opt.ok) {
    notice.hidden = false;
    content.hidden = true;
    tx('opt-notice-title', opt.title);
    tx('opt-notice-detail', opt.detail);
    return;
  }
  notice.hidden = true;
  content.hidden = false;

  const c = opt.c;

  // Hero
  tx('opt-hero-price', fmt$(opt.pMaxTrue));
  tx('opt-hero-dp', (opt.dpOptimal * 100).toFixed(1) + '%');
  tx('opt-hero-dpamt', fmt$(opt.pMaxTrue * opt.dpOptimal));
  tx('opt-hero-basic', fmt$(opt.pStandard));
  const gainEl = $('opt-hero-gain')!;
  if (opt.gain > 0) {
    tx('opt-hero-delta', '+' + fmt$(opt.gain));
    gainEl.classList.remove('zero');
  } else {
    tx('opt-hero-delta', fmt$(0));
    gainEl.classList.add('zero');
  }

  // Slider — initialize to optimal dp on first render or if out of range
  const sl = $input('opt-slider')!;
  const xMin = Math.max(0, Math.min(c.minDp, opt.HARD_DP_MAX - 0.01));
  const xMax = opt.HARD_DP_MAX;
  // Slider goes from minDp to 60% (per spec); never let max < min if minDp > 60%.
  const slMinPct = xMin * 100;
  const slMaxPct = Math.max(slMinPct, Math.min(60, xMax * 100));
  sl.min = slMinPct.toFixed(2);
  sl.max = slMaxPct.toFixed(2);
  sl.step = '0.1';
  sl.disabled = (slMaxPct <= slMinPct);
  const sliderMin = slMinPct / 100;
  const sliderMax = slMaxPct / 100;
  // Keep prior slider position if within the actual slider range; else default to optimal
  let curDp: number;
  if (optState.sliderDp !== null && optState.sliderDp >= sliderMin && optState.sliderDp <= sliderMax) {
    curDp = optState.sliderDp;
  } else {
    curDp = clamp(opt.dpOptimal, sliderMin, sliderMax);
    optState.sliderDp = curDp;
  }
  curDp = clamp(curDp, sliderMin, sliderMax);
  sl.value = (curDp * 100).toFixed(1);
  updateSliderReadout(curDp);

  // Comparison table
  const basicDeal = dealAtPriceDp(c, opt.pStandard, c.minDp);
  const optDeal   = dealAtPriceDp(c, opt.pMaxTrue, opt.dpOptimal);
  tx('opt-comp-basic-dp', '(' + (c.minDp * 100).toFixed(1) + '% down)');
  tx('opt-comp-opt-dp',   '(' + (opt.dpOptimal * 100).toFixed(1) + '% down)');
  tx('cmp-b-price', fmt$(opt.pStandard));         tx('cmp-o-price', fmt$(opt.pMaxTrue));
  tx('cmp-b-dp',    fmt$(basicDeal.downPmt));     tx('cmp-o-dp',    fmt$(optDeal.downPmt));
  tx('cmp-b-loan',  fmt$(basicDeal.loanAmt));     tx('cmp-o-loan',  fmt$(optDeal.loanAmt));
  tx('cmp-b-mtg',   fmt$(basicDeal.moMtg));       tx('cmp-o-mtg',   fmt$(optDeal.moMtg));
  tx('cmp-b-mtot',  fmt$(basicDeal.moTotal));     tx('cmp-o-mtot',  fmt$(optDeal.moTotal));
  tx('cmp-b-dti',   fmtPct(basicDeal.dti));       tx('cmp-o-dti',   fmtPct(optDeal.dti));
  tx('cmp-b-cash',  fmt$(basicDeal.totalCash));   tx('cmp-o-cash',  fmt$(optDeal.totalCash));
  tx('cmp-b-surp',  fmt$(basicDeal.surplus));     tx('cmp-o-surp',  fmt$(optDeal.surplus));
  tx('cmp-b-res',   basicDeal.pcMonths.toFixed(1) + ' mo'); tx('cmp-o-res', optDeal.pcMonths.toFixed(1) + ' mo');

  // Explainer
  const expl = $('opt-explainer')!;
  expl.classList.remove('warn', 'ok');
  if (opt.clampedAt === 'max') {
    expl.classList.add('warn');
    expl.innerHTML = 'The math wants <strong>' + (opt.dpUnclamped * 100).toFixed(1) +
      '%</strong> down, which exceeds 80%. Clamped to 80% — at this level you should consult a mortgage broker, since most NYC co-op lenders cap loans at this LTV.';
  } else if (opt.clampedAt === 'min' || opt.baseBind === 'cash') {
    expl.innerHTML = '<strong>Cash-limited.</strong> Your cash runs out before income does. Putting more down would just shrink your reserves — it does not unlock a higher price. Your maximum is the standard calculation: <strong>' + fmt$(opt.pStandard) + '</strong> at ' + (c.minDp * 100).toFixed(1) + '% down.';
  } else if (opt.baseBind === 'both' || opt.gain < 1000) {
    expl.classList.add('ok');
    expl.innerHTML = '<strong>Already optimal.</strong> Both constraints bind simultaneously at ' + (c.minDp * 100).toFixed(1) + '% down. You are already at the ceiling — no down-payment adjustment buys more price.';
  } else {
    // DTI-limited with surplus — the interesting case
    const unusedCash = Math.max(0, basicDeal.surplus);
    expl.innerHTML = '<strong>DTI-limited with surplus cash.</strong> At ' + (c.minDp * 100).toFixed(1) +
      '% down your income caps you at <strong>' + fmt$(opt.pStandard) + '</strong>, but you have <strong>' + fmt$(unusedCash) +
      '</strong> in unused cash sitting on the table. Putting <strong>' + (opt.dpOptimal * 100).toFixed(1) +
      '% down</strong> shrinks the loan enough to qualify for <strong>' + fmt$(opt.pMaxTrue) + '</strong> — your true ceiling.';
  }

  // Sensitivity
  const sensRows = runSensitivity(inp, opt.pMaxTrue);
  const tbody = $('opt-sens-tbody')!;
  tbody.innerHTML = '';
  sensRows.forEach(row => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = row.label;
    const td2 = document.createElement('td');
    td2.className = 'r';
    td2.textContent = row.ok ? fmt$(row.newPrice) : '—';
    const td3 = document.createElement('td');
    td3.className = 'r ' + (row.delta > 1 ? 'delta-pos' : row.delta < -1 ? 'delta-neg' : 'delta-zero');
    td3.textContent = row.ok ? (row.delta >= 0 ? '+' : '') + fmt$(row.delta) : '—';
    tr.append(td1, td2, td3);
    tbody.appendChild(tr);
  });

  // Chart
  drawOptimizerChart($('opt-chart') as HTMLCanvasElement, opt, optState.hoverDp);
}

function updateSliderReadout(dp: number) {
  const opt = optState.lastOpt;
  if (!opt || !opt.ok) return;
  const c = opt.c;
  tx('opt-slider-val', (dp * 100).toFixed(1) + '%');
  const p = priceAtDp(c, dp);
  const price = Math.max(0, p.pAch);
  const deal = dealAtPriceDp(c, price, dp);
  const binding = (p.pCash <= p.pDti - 1) ? 'Cash' : (p.pDti <= p.pCash - 1) ? 'DTI' : 'Both';
  tx('opt-m-price', fmt$(price));
  const bindEl = $('opt-m-bind')!;
  bindEl.textContent = binding;
  bindEl.className = 'mval ' + (binding === 'Cash' ? 'bind-cash' : binding === 'DTI' ? 'bind-dti' : '');
  tx('opt-m-monthly', fmt$(deal.moTotal));
  tx('opt-m-dti', fmtPct(deal.dti));
  tx('opt-m-dpamt', fmt$(deal.downPmt));
  tx('opt-m-surplus', fmt$(deal.surplus));
}

/* ═══════════════════════════════════════
   AFFORD-TARGET MATH
   ═══════════════════════════════════════ */
function computeAffordTarget(inp: Inputs): any {
  const c = deriveConstants(inp);
  // Accept any non-negative finite value as a "set" target — matches calculate()'s rule.
  const target = (typeof inp.targetOverride === 'number' && isFinite(inp.targetOverride) && inp.targetOverride >= 0)
                 ? inp.targetOverride : null;

  // Standard max at min_dp_required (basic)
  const basePrices = priceAtDp(c, c.minDp);
  const standardMax = Math.max(0, basePrices.pAch);

  // Optimizer max (used to know if dp adjustment alone clears it)
  const opt = computeOptimizer(inp);
  const optMax = (opt.ok ? opt.pMaxTrue : 0);

  if (target === null) return { state: 'no-target', c, standardMax, optMax };

  // At dp = min_dp_required and target price:
  const mansion        = calcMansionTax(target);
  const pmiRateAtMin   = calcPmiRate(c.minDp);
  const effKAtMin      = c.K + pmiRateAtMin / 12;
  const loanAtTarget   = target * (1 - c.minDp);
  const mortAtTarget   = loanAtTarget * c.K;
  const pmiAtTarget    = calcPmiMonthly(loanAtTarget, c.minDp);
  const cashNeededAtT  = target * (c.minDp + c.varFrac + c.resMo * (1 - c.minDp) * effKAtMin) + c.fixedCC + mansion + c.resMo * c.maintMo;
  const resGap         = c.resMo > 0 ? Math.max(0, cashNeededAtT - c.avail) : 0;
  // DP/CC gap: only Closing?-checked accounts can cover DP + closing costs
  const dpCCNeededAtT  = target * (c.minDp + c.varFrac) + c.fixedCC + mansion;
  const dpCCGap        = Math.max(0, dpCCNeededAtT - c.totLiquid);
  const cashGap        = Math.max(resGap, dpCCGap);

  const incomeNeededMo  = c.dtiMax > 0 ? (mortAtTarget + pmiAtTarget + c.maintMo + c.oDebts) / c.dtiMax : Infinity;
  const incomeNeededAnn = incomeNeededMo * 12;
  const incomeGap       = Math.max(0, incomeNeededAnn - (inp.annualIncome || 0));

  const cashOk   = cashGap <= 0.5;
  const incomeOk = incomeGap <= 0.5;
  const feasible = cashOk && incomeOk;

  if (feasible) {
    return {
      state: 'feasible', c, target, standardMax, optMax,
      cashOk, incomeOk, mortAtTarget, cashNeededAtT,
    };
  }

  // -- Lever 3: dp feasibility range at target_price --
  // dp_for_dti: minimum dp such that DTI is satisfied (PMI-aware: effective K shifts at each tier)
  let dpForDti: number;
  if (c.A <= 0) {
    dpForDti = Infinity;
  } else if (target <= 0 || c.K <= 0) {
    dpForDti = 0;
  } else {
    // Try no-PMI zone first (dp >= 0.20 uses plain K)
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
  // dp_for_cash: maximum dp such that cash covers everything (both reserve and DP/CC constraints)
  // Reserve requirement includes PMI, so effective K varies by dp tier — solve piecewise.
  let dpForCash: number;
  let dpForCashReserve: number;
  if (c.resMo === 0 || c.B <= 0 || target <= 0) {
    dpForCashReserve = c.resMo === 0 ? Infinity : -Infinity;
  } else {
    // Try no-PMI zone (dp >= 0.20) first, then each PMI tier from highest dp down
    const CASH_TIERS: [number, number][] = [[0.20, 0], [0.15, 0.0052], [0.10, 0.0070], [0.05, 0.0095], [0, 0.0120]];
    dpForCashReserve = -Infinity;
    for (const [lo, rate] of CASH_TIERS) {
      const eK = c.K + rate / 12;
      const cd = 1 - c.resMo * eK;
      if (cd <= 0) continue;
      const dp = ((c.B - mansion) / target - c.varFrac - c.resMo * eK) / cd;
      if (dp >= lo) { dpForCashReserve = dp; break; }
    }
  }
  // DP/CC constraint: dp * target + varFrac*target + fixedCC + mansion ≤ totLiquid
  const dpForCashDpCC = (target > 0 && c.dpCCNum > 0)
    ? ((c.dpCCNum - mansion) / target - c.varFrac)
    : -Infinity;
  dpForCash = Math.min(
    isFinite(dpForCashReserve) ? dpForCashReserve : Infinity,
    isFinite(dpForCashDpCC)    ? dpForCashDpCC    : Infinity
  );
  if (!isFinite(dpForCash)) dpForCash = -Infinity;

  const HARD_DP_MAX = 0.80;
  const dpForCashCapped = Math.min(dpForCash, HARD_DP_MAX);

  const dpLo = Math.max(c.minDp, isFinite(dpForDti) ? dpForDti : Infinity);
  const dpHi = Math.min(HARD_DP_MAX, isFinite(dpForCashCapped) ? dpForCashCapped : 0);

  let dpOutcome: string;
  if (!isFinite(dpForDti) || dpForDti > HARD_DP_MAX) {
    dpOutcome = 'B';                 // no dp value works (income can't satisfy DTI at any dp)
  } else if (dpHi < dpLo) {
    dpOutcome = 'B';                 // no feasible dp within board/cash bounds
  } else if (dpForDti < c.minDp) {
    dpOutcome = 'C';                 // DTI fine at min, only cash matters
  } else {
    dpOutcome = 'A';                 // dpForDti >= c.minDp and dpHi >= dpLo: feasible range [dpLo, dpHi]
  }

  // -- Lever 4: max maintenance at target & current dp/income --
  const maintDtiMax  = c.dtiMax * c.moInc - mortAtTarget - c.oDebts;
  const maintCashMax = c.resMo > 0
    ? (c.avail - target * (c.minDp + c.varFrac + c.resMo * (1 - c.minDp) * c.K) - c.fixedCC) / c.resMo
    : Infinity;
  const maxMaintenance = Math.min(maintDtiMax, maintCashMax);
  const maintGap = Math.max(0, c.maintMo - maxMaintenance);

  // -- Lever 5: rate needed --
  // Sentinel meanings:
  //   rateNeeded === currentRate → already works at current rate (via dp lever)
  //   rateNeeded < currentRate   → rates would need to fall to this value
  //   rateNeeded === null        → even at the floor (rateFloor), the gap remains
  const currentRate = inp.mortgageRate || 0;
  // Floor: 2% by default, but never above currentRate (so we always do at least one
  // probe at currentRate when currentRate is already below 2%).
  const rateFloor = Math.min(2.0, currentRate);
  let rateNeeded: number | null;
  if (optMax >= target) {
    rateNeeded = currentRate;
  } else if (currentRate <= rateFloor + 1e-9) {
    // Already at or below the floor — no room to search.
    rateNeeded = null;
  } else {
    const startRate = Math.min(currentRate, 12);
    let foundAt: number | null = null;
    for (let r = startRate; r >= rateFloor - 1e-9; r -= 0.125) {
      const o = computeOptimizer({ ...inp, mortgageRate: +r.toFixed(3) });
      if (o.ok && o.pMaxTrue >= target) {
        foundAt = +r.toFixed(3);
        break;
      }
    }
    rateNeeded = foundAt;
  }

  // -- Combined gap grid (cash × income) --
  const cashSteps   = [0, 25000, 50000, 100000];
  const incomeSteps = [0, 10000, 25000, 50000];
  const grid = cashSteps.map(dCash => incomeSteps.map(dInc => {
    const modified: Inputs = {
      ...inp,
      annualIncome: (inp.annualIncome || 0) + dInc,
      accounts: dCash > 0
        ? inp.accounts.concat([{ name: '__sens', balance: dCash, liquidity: 100, closing: true }])
        : inp.accounts,
    };
    const o = computeOptimizer(modified);
    const newMax = (o.ok ? o.pMaxTrue : 0);
    const gap = target - newMax;
    let cls: string;
    if (newMax >= target) cls = 'green';
    else if (gap / target <= 0.05) cls = 'yellow';
    else cls = 'red';
    return { newMax, gap, cls };
  }));

  return {
    state: 'analysis', c, target, standardMax, optMax,
    cashOk, incomeOk,
    cashGap, cashNeededAtT, incomeGap, incomeNeededAnn,
    mortAtTarget,
    dpForDti, dpForCash, dpForCashCapped, dpLo, dpHi, dpOutcome, HARD_DP_MAX,
    maxMaintenance, maintGap, maintDtiMax, maintCashMax,
    rateNeeded, currentRate, rateFloor,
    grid, cashSteps, incomeSteps,
  };
}

/* ═══════════════════════════════════════
   AFFORD-TARGET RENDER
   ═══════════════════════════════════════ */
function renderAffordTargetView(inp: Inputs) {
  const r = computeAffordTarget(inp);
  const promptEl   = $('aft-prompt') as HTMLElement;
  const successEl  = $('aft-success') as HTMLElement;
  const analysisEl = $('aft-analysis') as HTMLElement;

  // Sync target input value.
  // When no override is active leave the field blank so the placeholder and
  // the "no-target" prompt state are consistent with each other.
  const tIn = $input('aft-target-price')!;
  if (document.activeElement !== tIn) {
    if (inp.targetOverride !== null && isFinite(inp.targetOverride)) {
      tIn.value = String(Math.round(inp.targetOverride));
    } else {
      tIn.value = '';
    }
  }

  if (r.state === 'no-target') {
    promptEl.hidden = false;
    successEl.hidden = true;
    analysisEl.hidden = true;
    return;
  }

  if (r.state === 'feasible') {
    promptEl.hidden = true;
    successEl.hidden = false;
    analysisEl.hidden = true;
    tx('aft-success-title', '✓ You already qualify for ' + fmt$(r.target));
    tx('aft-success-sub', 'At ' + (r.c.minDp * 100).toFixed(0) + '% down with current income, assets, and rate, both DTI and cash constraints are satisfied.');
    return;
  }

  // state === 'analysis'
  promptEl.hidden = true;
  successEl.hidden = true;
  analysisEl.hidden = false;
  const c = r.c;

  // Summary
  tx('aft-sum-target', fmt$(r.target));
  tx('aft-sum-max',    fmt$(r.standardMax));
  tx('aft-sum-gap',    fmt$(r.target - r.standardMax));

  renderCashLever(r, c);
  renderIncomeLever(r);
  renderDpLever(r, c);
  renderMaintLever(r, c);
  renderGapGrid(r);
  renderRateLever(r);
}

function renderCashLever(r: any, c: any) {
  const big   = $('lev-cash-big')!;
  const sub   = $('lev-cash-sub')!;
  const badge = $('lev-cash-badge')!;
  const extra = $('lev-cash-extra') as HTMLElement;

  if (r.cashOk) {
    badge.textContent = 'OK';
    badge.className = 'badge ok';
    big.textContent = fmt$(0);
    big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your assets already cover the cash side at ' + (c.minDp * 100).toFixed(0) + '% down. The gap here is on the income side.';
    extra.style.display = 'none';
  } else {
    badge.textContent = r.incomeOk ? 'NEEDED' : 'PARTIAL';
    badge.className = 'badge ' + (r.incomeOk ? 'info' : 'warn');
    big.textContent = fmt$(r.cashGap);
    big.className = 'aft-lever-big neg';
    sub.innerHTML = r.incomeOk
      ? 'Add this much in liquid assets and you qualify at ' + (c.minDp * 100).toFixed(0) + '% down — DTI is already fine.'
      : 'Cash alone won\'t solve it — income is also short. You\'d need both.';
    extra.style.display = '';
    // Months-to-save
    const rate = parseFloat(($input('aft-savings-rate') as HTMLInputElement).value) || 0;
    if (rate > 0) {
      const months = Math.ceil(r.cashGap / rate);
      const yrs = months / 12;
      tx('lev-cash-months', months + ' months' + (yrs >= 1 ? ' (~' + yrs.toFixed(1) + ' yrs)' : ''));
    } else {
      tx('lev-cash-months', '—');
    }
  }
}

function renderIncomeLever(r: any) {
  const big   = $('lev-inc-big')!;
  const sub   = $('lev-inc-sub')!;
  const badge = $('lev-inc-badge')!;

  if (r.incomeOk) {
    badge.textContent = 'OK';
    badge.className = 'badge ok';
    big.textContent = fmt$(0) + '/yr';
    big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your income already passes the DTI test at this price. The gap here is on the cash side.';
  } else {
    badge.textContent = r.cashOk ? 'NEEDED' : 'PARTIAL';
    badge.className = 'badge ' + (r.cashOk ? 'info' : 'warn');
    big.textContent = '+' + fmt$(r.incomeGap) + '/yr';
    big.className = 'aft-lever-big neg';
    sub.innerHTML = r.cashOk
      ? 'You\'d need this much more annual income — your assets already cover the cash side.'
      : 'Income is short and so is cash. Both need to move (or use the dp lever).';
  }
}

function renderDpLever(r: any, c: any) {
  const sub   = $('lev-dp-sub')!;
  const badge = $('lev-dp-badge')!;
  const zone  = $('lev-dp-zone') as HTMLElement;
  const mkMin = $('lev-dp-mk-min') as HTMLElement;
  const mkDti = $('lev-dp-mk-dti') as HTMLElement;
  const mkCash = $('lev-dp-mk-cash') as HTMLElement;

  // Bar maps 0% .. 80% → 0% .. 100%
  const HARD = r.HARD_DP_MAX;
  const pct = (v: number) => clamp(v / HARD, 0, 1) * 100;

  mkMin.style.left = pct(c.minDp) + '%';

  if (r.dpOutcome === 'A') {
    badge.textContent = '✓ FEASIBLE';
    badge.className = 'badge ok';
    const lo = r.dpLo;
    const hi = r.dpHi;
    sub.innerHTML = 'You can afford <strong>' + fmt$(r.target) + '</strong> at any down between <strong>' +
      (lo * 100).toFixed(1) + '%</strong> (' + fmt$(r.target * lo) + ') and <strong>' +
      (hi * 100).toFixed(1) + '%</strong> (' + fmt$(r.target * hi) + '). Lower end uses less cash; higher end leaves more monthly headroom.';
    zone.hidden = false;
    zone.classList.remove('fail');
    zone.style.left  = pct(lo) + '%';
    zone.style.width = (pct(hi) - pct(lo)) + '%';
    mkDti.hidden = false;  mkDti.style.left  = pct(r.dpForDti) + '%';
    mkCash.hidden = false; mkCash.style.left = pct(Math.min(r.dpForCash, HARD)) + '%';
  } else if (r.dpOutcome === 'C') {
    badge.textContent = 'CASH ONLY';
    badge.className = 'badge warn';
    sub.innerHTML = 'DTI is already satisfied at <strong>' + (c.minDp * 100).toFixed(1) +
      '%</strong> down — only cash is short. See Lever 1 above. The cash ceiling is at <strong>' +
      (Math.min(r.dpForCash, HARD) * 100).toFixed(1) + '%</strong> down.';
    zone.hidden = true;
    mkDti.hidden = true;
    mkCash.hidden = false; mkCash.style.left = pct(Math.min(r.dpForCash, HARD)) + '%';
  } else {
    // B — no dp value satisfies both constraints
    badge.textContent = '✗ NO DP WORKS';
    badge.className = 'badge warn';
    const dtiFinite  = isFinite(r.dpForDti);
    const cashFinite = isFinite(r.dpForCash);

    if (!dtiFinite) {
      sub.innerHTML = 'Income can\'t cover the carrying costs at <strong>' + fmt$(r.target) +
        '</strong> at any down payment — even 100% cash purchase fails the DTI test on maintenance + debts. Try Lever 4 (lower maintenance) or boost income.';
    } else if (!cashFinite) {
      sub.innerHTML = 'After fixed closing costs and the maintenance reserve, no cash budget remains for a down payment at <strong>' +
        fmt$(r.target) + '</strong>. Add liquid assets, reduce reserve months, or lower closing costs before any dp lever can help.';
    } else if (r.dpForCashCapped < c.minDp) {
      sub.innerHTML = 'Your cash only covers up to <strong>' + (Math.max(0, r.dpForCash) * 100).toFixed(1) +
        '%</strong> down at <strong>' + fmt$(r.target) + '</strong> — below the board minimum of <strong>' +
        (c.minDp * 100).toFixed(1) + '%</strong>. Add cash (Lever 1) or aim lower.';
    } else {
      sub.innerHTML = 'No down payment resolves this — you need more cash, more income, or both. ' +
        'DTI floor: <strong>' + (r.dpForDti * 100).toFixed(1) + '%</strong> · ' +
        'Cash ceiling: <strong>' + (Math.max(0, Math.min(r.dpForCash, HARD)) * 100).toFixed(1) + '%</strong>. ' +
        'The DTI floor sits above the cash ceiling — that gap is your combined shortfall.';
    }

    // Range bar: only draw the no-fly zone when both ceilings are finite AND
    // the DTI floor sits above the cash ceiling (the canonical B case).
    if (dtiFinite && cashFinite && r.dpForDti > Math.max(0, r.dpForCash)) {
      const lo = Math.min(HARD, Math.max(0, r.dpForCash));
      const hi = Math.min(HARD, r.dpForDti);
      zone.hidden = false;
      zone.classList.add('fail');
      zone.style.left  = pct(lo) + '%';
      zone.style.width = Math.max(2, pct(hi) - pct(lo)) + '%';
    } else {
      zone.hidden = true;
    }

    mkDti.hidden = !dtiFinite;
    if (!mkDti.hidden) mkDti.style.left = pct(Math.min(r.dpForDti, HARD)) + '%';
    mkCash.hidden = !cashFinite;
    if (!mkCash.hidden) mkCash.style.left = pct(Math.min(Math.max(0, r.dpForCash), HARD)) + '%';
  }
}

function renderMaintLever(r: any, c: any) {
  const big   = $('lev-maint-big')!;
  const sub   = $('lev-maint-sub')!;
  const badge = $('lev-maint-badge')!;

  if (r.maxMaintenance < 0 || !isFinite(r.maxMaintenance)) {
    badge.textContent = 'IMPOSSIBLE';
    badge.className = 'badge warn';
    big.textContent = '—';
    big.className = 'aft-lever-big neg';
    sub.innerHTML = 'No maintenance level gets you to <strong>' + fmt$(r.target) +
      '</strong> at current income, assets, and dp. Other levers must move first.';
    return;
  }

  const bindLabel = (r.maintCashMax < r.maintDtiMax) ? 'cash-bound' : 'income-bound';
  if (r.maintGap <= 0) {
    badge.textContent = 'OK';
    badge.className = 'badge ok';
    big.textContent = fmt$(r.maxMaintenance) + '/mo';
    big.className = 'aft-lever-big ok';
    sub.innerHTML = '✓ Your maintenance estimate (<strong>' + fmt$(c.maintMo) +
      '/mo</strong>) fits — the ceiling at this price is <strong>' + fmt$(r.maxMaintenance) +
      '/mo</strong> (' + bindLabel + ').';
  } else {
    badge.textContent = 'TOO HIGH';
    badge.className = 'badge warn';
    big.textContent = '≤ ' + fmt$(r.maxMaintenance) + '/mo';
    big.className = 'aft-lever-big neg';
    sub.innerHTML = 'At <strong>' + fmt$(r.target) +
      '</strong> you need a building with maintenance ≤ <strong>' + fmt$(r.maxMaintenance) +
      '/mo</strong>. Your current assumption (' + fmt$(c.maintMo) + '/mo) is <strong>' +
      fmt$(r.maintGap) + '/mo too high</strong> (' + bindLabel + ').';
  }
}

function renderGapGrid(r: any) {
  const tbl = $('aft-gap-grid')!;
  tbl.innerHTML = '';

  // Header row
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner';
  corner.textContent = '↓ cash · income →';
  trh.appendChild(corner);
  r.incomeSteps.forEach((d: number) => {
    const th = document.createElement('th');
    th.textContent = d === 0 ? '+$0/yr' : '+' + fmtShort$(d) + '/yr';
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  r.cashSteps.forEach((dCash: number, i: number) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'row-h';
    th.textContent = dCash === 0 ? '+$0' : '+' + fmtShort$(dCash);
    tr.appendChild(th);

    r.grid[i].forEach((cell: any) => {
      const td = document.createElement('td');
      td.className = 'cell-' + cell.cls;
      td.textContent = cell.cls === 'green' ? '✓' : '−' + fmtShort$(Math.abs(cell.gap));
      td.title = cell.cls === 'green'
        ? 'Reaches ' + fmt$(cell.newMax) + ' (≥ target)'
        : 'New max: ' + fmt$(cell.newMax) + ' · still short ' + fmt$(cell.gap);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

function renderRateLever(r: any) {
  const txt = $('lev-rate-text')!;
  if (r.rateNeeded === null) {
    txt.innerHTML = '⚠ Even at <strong>' + r.rateFloor.toFixed(2) +
      '%</strong>, this price doesn\'t pencil out at your current income and assets — rate alone can\'t close the gap. Use the cash, income, or maintenance levers.';
  } else if (r.rateNeeded >= r.currentRate - 1e-6) {
    txt.innerHTML = '✓ This price <strong>works at current rates</strong> (' + r.currentRate.toFixed(2) +
      '%) — the down-payment lever (Lever 3) gets you there. No rate change needed.';
  } else {
    txt.innerHTML = 'Rates would need to drop to <strong>' + r.rateNeeded.toFixed(2) +
      '%</strong> for this price to work at your current income and assets ' +
      '(current rate: <strong>' + r.currentRate.toFixed(2) + '%</strong>).';
  }
}

/* ═══════════════════════════════════════
   MAIN onChange — runs on every input event
   ═══════════════════════════════════════ */
// The afford-target view runs ~50 optimizer evaluations (rate sweep + 4×4 grid)
// per render. Skip it entirely when its tab is hidden, and coalesce rapid
// keystrokes into one render per animation frame when visible.
let aftRenderPending = false;
let aftRenderInp: Inputs | null = null;
function scheduleAffordRender(inp: Inputs) {
  aftRenderInp = inp;
  const view = $('view-afford') as HTMLElement | null;
  if (!view || view.hidden) return;          // skip work entirely while hidden
  if (aftRenderPending) return;
  aftRenderPending = true;
  requestAnimationFrame(() => {
    aftRenderPending = false;
    if (!(($('view-afford') as HTMLElement).hidden) && aftRenderInp) {
      renderAffordTargetView(aftRenderInp);
    }
  });
}

// The optimizer view runs multiple computeOptimizer() evaluations per render
// (sensitivity table, slider, chart). Skip it entirely when its tab is hidden,
// and coalesce rapid keystrokes into one render per animation frame when visible.
let optRenderPending = false;
let optRenderInp: Inputs | null = null;
function scheduleOptimizerRender(inp: Inputs) {
  optRenderInp = inp;
  const view = $('view-optimizer') as HTMLElement | null;
  if (!view || view.hidden) return;          // skip work entirely while hidden
  if (optRenderPending) return;
  optRenderPending = true;
  requestAnimationFrame(() => {
    optRenderPending = false;
    if (!(($('view-optimizer') as HTMLElement).hidden) && optRenderInp) {
      renderOptimizerView(optRenderInp);
    }
  });
}

let lastResult: CalcResult | null = null;

function onChange() {
  const inp = readInputs();
  const r = calculate(inp);
  lastResult = r;
  updateResults(r);
  scheduleOptimizerRender(inp);
  scheduleAffordRender(inp);
  saveToStorage(inp);
}

/* ═══════════════════════════════════════
   BOOT
   ═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  importMigratedLocalStorage();

  // Restore saved inputs if the user previously enabled saving
  const saved = loadFromStorage();
  if (saved != null) {
    ($('save-toggle-cb') as HTMLInputElement).checked = true;
    restoreInputs(saved);   // sets state.accounts + scalar DOM values
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

  // Toggle: enable saves immediately, or clear storage when turned off
  ($('save-toggle-cb') as HTMLInputElement).addEventListener('change', e => {
    if ((e.target as HTMLInputElement).checked) {
      saveToStorage();
    } else {
      clearStorage();
    }
  });

  // Accounts table
  renderAccounts();
  $('btn-add-acct')!.addEventListener('click', () => {
    state.accounts.push({ name: 'New Account', balance: 0, liquidity: 100, closing: false });
    renderAccounts();
    onChange();
  });

  // All scalar inputs
  [
    'annual-income','other-debts','mtg-rate','loan-term','dp-pct',
    'reserve-mo','max-dti','monthly-maint',
    'fc-atty','fc-bank-atty','fc-coop','fc-movein','fc-other','var-pct'
  ].forEach(id => { const el = $(id); if (el) el.addEventListener('input', onChange); });

  // Target price override — both inputs (standard view + afford view) share state.targetOverride
  function onTargetInput(rawVal: string) {
    const v = parseFloat(rawVal);
    state.targetOverride = (rawVal === '' || isNaN(v)) ? null : v;
    onChange();
  }
  $input('target-price')!.addEventListener('input', e => onTargetInput((e.target as HTMLInputElement).value));
  $input('aft-target-price')!.addEventListener('input', e => onTargetInput((e.target as HTMLInputElement).value));

  $('btn-reset-tgt')!.addEventListener('click', () => {
    state.targetOverride = null;
    onChange();
  });

  // Savings rate input (Lever 1) — re-render afford view only
  $input('aft-savings-rate')!.addEventListener('input', () => {
    renderAffordTargetView(readInputs());
  });

  // ───── Tabs ─────
  // Use an Array so we can look up neighbours for keyboard navigation.
  const tabs = Array.from(document.querySelectorAll('.tab-btn')) as HTMLElement[];
  const views: Record<string, HTMLElement> = {
    standard:  $('view-standard') as HTMLElement,
    optimizer: $('view-optimizer') as HTMLElement,
    afford:    $('view-afford') as HTMLElement,
  };

  function activateTab(btn: HTMLElement, moveFocus = false) {
    const which = btn.dataset.tab!;
    tabs.forEach(b => {
      const active = b.dataset.tab === which;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      // Roving tabindex: only the active tab is in the tab order
      b.setAttribute('tabindex', active ? '0' : '-1');
      if (active && moveFocus) b.focus();
    });
    Object.entries(views).forEach(([k, el]) => { el.hidden = (k !== which); });
    if (which === 'optimizer') {
      // Redraw chart now that the canvas is visible (had 0 width while hidden)
      if (optState.lastOpt) drawOptimizerChart($('opt-chart') as HTMLCanvasElement, optState.lastOpt, optState.hoverDp);
      // Render the optimizer view if it hasn't been rendered yet (was skipped while hidden)
      if (optRenderInp) renderOptimizerView(optRenderInp);
    } else if (which === 'afford') {
      // Render now that the view is visible (we skip rendering while hidden for perf)
      renderAffordTargetView(readInputs());
    }
  }

  // Set initial roving tabindex on page load
  tabs.forEach(btn => {
    btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
  });

  tabs.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn));

    // WAI-ARIA keyboard interaction for tab widget
    btn.addEventListener('keydown', e => {
      const idx = tabs.indexOf(btn);
      let nextTabIndex: number | null = null;
      if (e.key === 'ArrowRight') {
        nextTabIndex = (idx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextTabIndex = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        nextTabIndex = 0;
      } else if (e.key === 'End') {
        nextTabIndex = tabs.length - 1;
      }
      if (nextTabIndex !== null) {
        e.preventDefault();
        activateTab(tabs[nextTabIndex], true);
      }
    });
  });

  // ───── Optimizer slider ─────
  const optSlider = $input('opt-slider')!;
  optSlider.addEventListener('input', e => {
    const dp = parseFloat((e.target as HTMLInputElement).value) / 100;
    optState.sliderDp = dp;
    updateSliderReadout(dp);
  });

  // ───── Optimizer chart hover/touch ─────
  const chart = $('opt-chart') as HTMLCanvasElement;
  const tip = $('opt-chart-tip') as HTMLElement;

  // Cache the chart's bounding rect for the duration of a hover session;
  // invalidate on layout-changing events. getBoundingClientRect forces layout,
  // so we must NOT call it on every mousemove.
  let chartHoverRect: DOMRect | null = null;
  const refreshChartRect = () => { chartHoverRect = chart.getBoundingClientRect(); };
  const invalidateChartRect = () => { chartHoverRect = null; };
  window.addEventListener('resize', invalidateChartRect);
  window.addEventListener('scroll', invalidateChartRect, true);

  // Coalesce hover redraws to one per animation frame.
  let hoverFramePending = false;
  let pendingHover: any = null;       // { clientX, clientY } or 'leave'
  function scheduleHoverFrame() {
    if (hoverFramePending) return;
    hoverFramePending = true;
    requestAnimationFrame(() => {
      hoverFramePending = false;
      const ev = pendingHover;
      pendingHover = null;
      if (ev === 'leave') {
        tip.style.display = 'none';
        optState.hoverDp = null;
        if (optState.lastOpt) drawOptimizerChart(chart, optState.lastOpt, null);
      } else if (ev) {
        renderHover(ev.clientX, ev.clientY);
      }
    });
  }

  function renderHover(clientX: number, clientY: number) {
    const cs = (chart as any)._chartState;
    if (!cs || !optState.lastOpt || !optState.lastOpt.ok) return;
    const rect = chartHoverRect || (refreshChartRect(), chartHoverRect)!;
    const x = clientX - rect.left;
    if (x < cs.padL || x > cs.padL + cs.plotW) {
      tip.style.display = 'none';
      optState.hoverDp = null;
      drawOptimizerChart(chart, optState.lastOpt, null);
      return;
    }
    const dp = clamp(cs.pxToDp(x), cs.xMin, cs.xMax);
    optState.hoverDp = dp;
    const c = optState.lastOpt.c;
    const p = priceAtDp(c, dp);
    tip.innerHTML =
      '<b>' + (dp * 100).toFixed(1) + '% down</b><br>' +
      'Achievable: ' + fmt$(Math.max(0, p.pAch)) + '<br>' +
      'DTI ceiling: ' + (isFinite(p.pDti) ? fmt$(p.pDti) : '—') + '<br>' +
      'Cash ceiling: ' + fmt$(Math.max(0, p.pCash));
    tip.style.display = 'block';
    const tRect = tip.getBoundingClientRect();
    let tipX = x + 12;
    if (tipX + tRect.width > rect.width - 4) tipX = x - tRect.width - 12;
    let tipY = (clientY - rect.top) - tRect.height - 8;
    if (tipY < 4) tipY = (clientY - rect.top) + 14;
    tip.style.left = tipX + 'px';
    tip.style.top  = tipY + 'px';
    drawOptimizerChart(chart, optState.lastOpt, dp);
  }

  function queueHover(clientX: number, clientY: number) {
    pendingHover = { clientX, clientY };
    scheduleHoverFrame();
  }
  function queueLeave() {
    pendingHover = 'leave';
    scheduleHoverFrame();
  }

  chart.addEventListener('mouseenter', refreshChartRect);
  chart.addEventListener('mousemove', e => queueHover(e.clientX, e.clientY));
  chart.addEventListener('mouseleave', queueLeave);
  chart.addEventListener('touchstart', e => {
    if (e.touches.length) {
      e.preventDefault();
      refreshChartRect();
      queueHover(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });
  chart.addEventListener('touchmove', e => {
    if (e.touches.length) {
      e.preventDefault();
      queueHover(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });
  chart.addEventListener('touchend', queueLeave);

  // ───── Redraw chart on resize ─────
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (optState.lastOpt && !(($('view-optimizer') as HTMLElement).hidden)) {
        drawOptimizerChart(chart, optState.lastOpt, optState.hoverDp);
      }
    });
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
  const howBtn  = $('how-btn')!;
  const howBody = $('how-body')!;
  howBtn.addEventListener('click', () => {
    howBtn.classList.toggle('open');
    howBody.classList.toggle('open');
  });

  // Share result
  wireShareButton('coop-share', () => {
    const r = lastResult;
    const text = r
      ? `My NYC co-op max purchase price: ${fmt$(r.maxPrice)} (${r.binding} bound)`
      : 'My NYC co-op affordability result';
    return { title: 'My NYC Co-op Affordability', text, url: 'https://www.nyc-affordability.com/coop/' };
  });

  // Initial render
  onChange();
});
