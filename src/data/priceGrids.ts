/* ============================================================
   Shared numeric grids for the income/rent/buy landing-page
   families (/income/[amount]/, /rent/[price]/, /buy/[price]/,
   plus their hub pages). Single source of truth so each amount/
   price only has to be listed once — see astro.config.mjs's
   ENUMERATED_ROUTE_META for the matching sitemap pattern per
   family, which does not need updating when these arrays change.
   ============================================================ */

export const INCOME_AMOUNTS = [
  50000, 60000, 75000, 80000, 90000, 100000, 120000, 125000, 150000, 175000,
  200000, 225000, 250000, 300000, 350000, 400000, 500000,
] as const;

export const RENT_PRICES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7500] as const;

export const BUY_PRICES = [
  300000, 400000, 500000, 600000, 750000, 800000, 900000, 1000000, 1100000,
  1250000, 1500000, 2000000, 3000000,
] as const;
