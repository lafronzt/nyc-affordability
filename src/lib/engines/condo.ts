import { calcMortgageRecordingTax, calcPmiRate, calcPmiMonthly, calcMansionTax, bsearchMaxPrice } from '../calc.ts';

/* ============================================================
   Condo affordability engine (pure, DOM-free)
   ============================================================
   The math behind /condo/, moved here verbatim from src/scripts/condo.ts
   so the calculator, /compare/, /reality-check/, and the build-time pages
   (via src/lib/afford.ts) all run the same code. Function bodies are the
   originals; the only change is that the page's two toggles (reserves,
   working capital), which the old code read from module-level `state`,
   are now passed in as CondoInputs.reservesEnabled / workingCapEnabled.
   ============================================================ */

export interface CondoAccount {
  name: string;
  balance: number;
  liquidity: number;
  [key: string]: unknown;
}

export interface CondoInputs {
  accounts: CondoAccount[];
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
  /** Page toggle: count post-closing reserves (off by default on /condo/). */
  reservesEnabled: boolean;
  /** Page toggle: add working-capital contribution to closing costs. */
  workingCapEnabled: boolean;
}

/* Closing costs at a price + down payment: fixed fees (+ optional working
   capital), title, NYC/NYS mortgage recording tax, and mansion tax. */
export function computeCondoClosingCosts(price: number, dp: number, inp: CondoInputs) {
  const loanAmt  = price * (1 - dp);
  const fixedBase = (inp.fcAtty||0) + (inp.fcLender||0) + (inp.fcAppraisal||0)
                  + (inp.fcRecording||0) + (inp.fcBuilding||0);
  const wc = inp.workingCapEnabled ? (inp.wcMonths||0) * (inp.commonCharges||0) : 0;
  const fixed   = fixedBase + wc;
  const title   = price * (inp.titlePricePct||0)/100 + loanAmt * (inp.titleLoanPct||0)/100;
  const mrt     = calcMortgageRecordingTax(loanAmt);
  const mansion = calcMansionTax(price);
  const total   = fixed + title + mrt + mansion;
  return { fixed, title, mrt, mansion, total };
}

export function deriveCondoConstants(inp: CondoInputs) {
  const weightedAssets = inp.accounts.reduce((s, a) => s + (a.balance||0) * (a.liquidity||0) / 100, 0);
  const moInc     = (inp.annualIncome||0) / 12;
  const rm        = (inp.mortgageRate||0) / 100 / 12;
  const nMo       = (inp.loanTerm||30) * 12;
  let K = 0;
  if (nMo > 0) K = rm === 0 ? 1/nMo : rm / (1 - Math.pow(1+rm, -nMo));
  const dtiMax    = (inp.maxDtiPct||0) / 100;
  const resMo     = inp.reservesEnabled ? (inp.reserveMo||0) : 0;
  const carrying  = (inp.commonCharges||0) + (inp.propTaxes||0) + (inp.hoInsurance||0); // monthly carrying
  const oDebts    = inp.otherDebts||0;
  const minDp     = (inp.dpPct||0) / 100;
  // Budget for mortgage P+I after covering carrying + oDebts under DTI
  const A         = dtiMax * moInc - carrying - oDebts;
  return { weightedAssets, moInc, K, dtiMax, resMo, carrying, oDebts, minDp, A, inp };
}
export type CondoConstants = ReturnType<typeof deriveCondoConstants>;

/* ═══════════════════════════════════════
   PRICE CEILINGS AT A GIVEN DP
   ═══════════════════════════════════════ */
export function condoPriceAtDp(c: CondoConstants, dp: number) {
  const { weightedAssets, K, resMo, carrying, A, inp } = c;
  const PMAX = 20000000;

  // DTI ceiling — PMI increases effective monthly cost on the loan
  const effK = K + calcPmiRate(dp) / 12;
  const denom = (1 - dp) * effK;
  const pDti = (denom > 0 && A > 0) ? A / denom : (A > 0 ? Infinity : 0);

  // DP+CC ceiling — binary search: liquidity-weighted assets >= dp*P + CC(P,dp).total
  const pDpCC = bsearchMaxPrice(p => {
    const cc = computeCondoClosingCosts(p, dp, inp);
    return weightedAssets >= dp * p + cc.total;
  }, PMAX);

  // Reserve ceiling — binary search (only when resMo > 0); includes PMI in monthly cost
  let pReserve = Infinity;
  if (resMo > 0) {
    pReserve = bsearchMaxPrice(p => {
      const loanAmt = p * (1 - dp);
      const moMtg   = loanAmt * K;
      const moPmi   = calcPmiMonthly(loanAmt, dp);
      const cc      = computeCondoClosingCosts(p, dp, inp);
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
export function calculateCondo(inp: CondoInputs) {
  const c = deriveCondoConstants(inp);
  const { weightedAssets, K, resMo, carrying, oDebts, moInc, dtiMax } = c;

  // Max price at the user's chosen dp
  const dp = c.minDp;
  const prices = condoPriceAtDp(c, dp);
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
  const cc       = computeCondoClosingCosts(tgt, dp, inp);
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
export type CondoResult = ReturnType<typeof calculateCondo>;

/* ═══════════════════════════════════════
   DEAL SNAPSHOT AT PRICE + DP (for optimizer/afford-target)
   ═══════════════════════════════════════ */
export function condoDealAtPriceDp(c: CondoConstants, price: number, dp: number) {
  const { weightedAssets, K, resMo, carrying, oDebts, moInc, inp } = c;
  const loanAmt      = price * (1 - dp);
  const moMtg        = loanAmt * K;
  const moPmi        = calcPmiMonthly(loanAmt, dp);
  const cc           = computeCondoClosingCosts(price, dp, inp);
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
