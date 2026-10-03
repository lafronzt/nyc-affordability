/* ============================================================
   NYC Area Median Income (AMI), 2026: the 100% AMI row by household size.
   Source: NYC HPD, "2026 New York City Area AMI" chart, which HPD and
   Housing Connect use for eligibility (HPD credits HUD as the source) —
   https://www.nyc.gov/site/hpd/services-and-information/area-median-income.page
   Other bands on HPD's chart (30%, 80%, 120%, 165%...) are this row scaled.
   This replaces an earlier table that was about 22% lower than HPD's chart
   and labeled as HUD's New York HMFA figures; test/amiTable.test.ts pins the
   HPD values.
   ============================================================
   Shared by the client-side affordable-housing calculator
   (src/scripts/affordable.ts), the Reality Check, and the build-time
   pages, so every page uses the same figures. Its source and update
   date are listed on /methodology/sources/ (src/data/sourceTables.ts).
   ============================================================ */
export const AMI_BASE: Record<number, number> = {
  1: 118800,
  2: 135700,
  3: 152700,
  4: 169600,
  5: 183200,
  6: 196800,
  7: 210400,
  8: 223900,
};

export const AMI_SOURCE_URL = 'https://www.nyc.gov/site/hpd/services-and-information/area-median-income.page';

export interface BandClass {
  name: string;
  short: string;
  code: string;
}

export function getBandClass(pct: number): BandClass {
  if (pct <= 30) return { name: 'Extremely Low Income', short: 'ELI', code: 'eli' };
  if (pct <= 50) return { name: 'Very Low Income', short: 'VLI', code: 'vli' };
  if (pct <= 80) return { name: 'Low Income', short: 'LI', code: 'li' };
  if (pct <= 120) return { name: 'Moderate Income', short: 'MOD', code: 'mod' };
  if (pct <= 165) return { name: 'Middle Income', short: 'MI', code: 'mi' };
  return { name: 'Above AMI', short: '>AMI', code: 'above' };
}

export function amiPercent(income: number, hhSize: number): number {
  const hh100 = AMI_BASE[hhSize] || AMI_BASE[Math.min(Math.max(hhSize, 1), 8)];
  return hh100 > 0 ? (income / hh100) * 100 : 0;
}
