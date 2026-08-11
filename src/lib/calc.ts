/* ============================================================
   Shared NYC housing-purchase math.
   ============================================================
   Verified byte-identical between condo/index.html and coop/index.html
   (source of truth: condo/index.html, since this is the first calculator
   migrated) for calcMansionTax, calcPmiRate, and calcPmiMonthly — see the
   condo migration summary for the diff that confirmed this. If a future
   coop migration finds these have since drifted from condo's original
   source, that drift must be resolved explicitly rather than silently
   picking one side.

   calcMortgageRecordingTax is condo-only (co-ops are personal property,
   not subject to NYC/NYS mortgage recording tax).

   bsearchMaxPrice is a generic monotone binary-search helper — condo
   calls it `bsearchMaxPrice`, the legacy coop page has its own copy
   named `bsearchMaxP` with a default `hi` parameter. It contains no
   DTI/reserve-specific logic (that lives in the testFn callers pass in),
   so it's included here as a reusable pure helper.
   ============================================================ */

/**
 * NYC/NYS Mortgage Recording Tax (MRT) — borrower-paid estimate.
 * Applies to financed condos and real property (not co-ops).
 * Under $500,000 loan: 1.80% of loan amount.
 * $500,000+ loan:      1.925% of loan amount.
 * Source: NYC DOF / ACRIS. CEMA, lender-paid portions, and official
 * ACRIS calculation may differ — verify with closing attorney.
 */
export function calcMortgageRecordingTax(loanAmt: number): number {
  if (loanAmt <= 0) return 0;
  return loanAmt < 500000 ? loanAmt * 0.018 : loanAmt * 0.01925;
}

/**
 * PMI annual rate by down payment tier (conventional loan, avg credit ~720-740).
 * Source: Urban Institute / MGIC/Radian published rate cards.
 * Rate drops to 0 at 20%+ down; applies to loan balance per year.
 */
export function calcPmiRate(dp: number): number {
  if (dp >= 0.20) return 0;
  if (dp >= 0.15) return 0.0052; // LTV 80–85%
  if (dp >= 0.10) return 0.0070; // LTV 85–90%
  if (dp >= 0.05) return 0.0095; // LTV 90–95%
  return 0.0120;                  // LTV 95%+
}

export function calcPmiMonthly(loanAmt: number, dp: number): number {
  return loanAmt * calcPmiRate(dp) / 12;
}

/**
 * NYS Mansion Tax — buyer-paid on residential purchases >= $1,000,000.
 * Uses full-price-at-tier rate (NOT marginal brackets).
 * NYC has additional higher tiers above $2M.
 * Source: NYS Tax Dept pub1099 / NYC DOF.
 * IMPORTANT: Crossing a tier boundary raises the entire bill — watch price cliffs.
 */
export function calcMansionTax(price: number): number {
  if (price < 1000000)  return 0;
  if (price < 2000000)  return price * 0.0100;
  if (price < 3000000)  return price * 0.0125;
  if (price < 5000000)  return price * 0.0150;
  if (price < 10000000) return price * 0.0225;
  if (price < 15000000) return price * 0.0325;
  if (price < 20000000) return price * 0.0350;
  if (price < 25000000) return price * 0.0375;
  return price * 0.039;
}

/**
 * NYC Real Property Transfer Tax (RPTT) — seller-paid, 1-3 family residential
 * (incl. condos and co-ops). Consideration <= $500,000: 1.00%; > $500,000: 1.425%.
 * Source: NYC DOF RPTT. Verify with closing attorney.
 */
export function calcNycRptt(price: number): number {
  if (price <= 0) return 0;
  return price <= 500000 ? price * 0.01 : price * 0.01425;
}

/**
 * NYS Real Estate Transfer Tax — seller-paid, statewide.
 * Base: $2 per $500 of consideration (0.4%). NYC adds an additional 0.25% tax
 * on residential (1-3 family/condo/co-op) conveyances of $3,000,000 or more
 * (NY Tax Law §1402) — 0.65% combined at that tier, not 0.65% on top of the base.
 * Source: NYS Dept. of Taxation and Finance. Verify with closing attorney.
 */
export function calcNysTransferTax(price: number): number {
  if (price <= 0) return 0;
  const base = price * 0.004;
  const nycAdditional = price >= 3000000 ? price * 0.0025 : 0;
  return base + nycAdditional;
}

/**
 * Binary search for the largest `price` (up to `hi`) for which `testFn(price)`
 * is true, assuming `testFn` is monotone decreasing (true for small prices,
 * false for large ones — e.g. "can I still afford this price").
 */
export function bsearchMaxPrice(testFn: (price: number) => boolean, hi: number): number {
  if (!testFn(0)) return 0;   // not even $0 works
  if (testFn(hi))  return hi; // cap is fully affordable — return it directly
  let lo = 0;                 // invariant: testFn(lo)=true, testFn(hi)=false
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (testFn(mid)) lo = mid; else hi = mid;
    if (hi - lo < 1) break;
  }
  return lo;
}
