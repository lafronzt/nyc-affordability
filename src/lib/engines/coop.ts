import { calcPmiRate, calcPmiMonthly, calcMansionTax, bsearchMaxPrice } from '../calc.ts';

/* ============================================================
   Co-op affordability engine (pure, DOM-free)
   ============================================================
   The math behind /coop/, moved here verbatim from src/scripts/coop.ts so
   that every page showing a co-op number (the calculator, /compare/,
   /reality-check/, and the build-time pages via src/lib/afford.ts) runs
   the same code. Only the export names changed; the function bodies are
   the originals, including their legacy `|| 0` input handling.

   Inputs are the calculator's raw fields; defaults live in
   src/data/assumptions.ts (see coopInputsFromDefaults in ./defaults.ts).
   ============================================================ */

export interface CoopAccount {
  name: string;
  balance: number;
  liquidity: number;
  closing: boolean;
  [key: string]: unknown;
}

export interface CoopInputs {
  accounts: CoopAccount[];
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

/* Main snapshot: max price, binding constraint, and the deal at the target
   price (targetOverride, or the max price when null). */
export function calculateCoop(inp: CoopInputs) {
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
export type CoopResult = ReturnType<typeof calculateCoop>;

/* Optimizer building blocks: per-input constants, price ceilings at a given
   down payment, and the deal snapshot at a given price + down payment. */
export function deriveCoopConstants(inp: CoopInputs) {
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
export type CoopConstants = ReturnType<typeof deriveCoopConstants>;

// Price ceilings as a function of dp (0..1) — uses binary search to account for mansion tax and PMI
export function coopPriceAtDp(c: CoopConstants, dp: number) {
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
export function coopDealAtPriceDp(c: CoopConstants, price: number, dp: number) {
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
