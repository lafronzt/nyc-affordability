/* ============================================================
   Shared numeric grids for the income/rent/buy landing-page
   families (/income/[amount]/, /rent/[price]/, /buy/[price]/,
   plus their hub pages). Single source of truth so each amount/
   price only has to be listed once — see astro.config.mjs's
   ENUMERATED_ROUTE_META for the matching sitemap pattern per
   family, which does not need updating when these arrays change.
   ============================================================ */

/** Housing pages (/income/[amount]/): what an income affords. Starts at
    $50K; below that the 40x rule caps rent near $1,000-$1,200 and the
    useful answer is affordable housing (/affordable/), not a price page. */
export const INCOME_AMOUNTS = [
  50000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 100000, 110000,
  120000, 125000, 130000, 140000, 150000, 175000, 200000, 225000, 250000,
  300000, 350000, 400000, 500000,
] as const;

/** Take-home pages (/salary/[amount]/): every income amount plus lower
    salaries, where take-home pay is still the question even if the housing
    page wouldn't say much. Always a superset of INCOME_AMOUNTS
    (test/priceGrids.test.ts), so each income page has a salary page. */
export const SALARY_AMOUNTS = [35000, 40000, 45000, ...INCOME_AMOUNTS] as const;

export const RENT_PRICES = [
  1500, 2000, 2250, 2500, 2750, 3000, 3250, 3500, 3750, 4000, 4500, 5000,
  5500, 6000, 6500, 7000, 7500, 8000, 10000,
] as const;

export const BUY_PRICES = [
  300000, 350000, 400000, 450000, 500000, 550000, 600000, 650000, 700000,
  750000, 800000, 900000, 1000000, 1100000, 1250000, 1500000, 1750000,
  2000000, 2500000, 3000000,
] as const;
