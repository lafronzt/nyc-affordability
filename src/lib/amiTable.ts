/* ============================================================
   HUD FY2026 Income Limits — New York, NY HUD Metro FMR Area (HMFA).
   Source: U.S. Dept. of Housing and Urban Development, FY2026 Income
   Limits Documentation System — https://www.huduser.gov/portal/datasets/il.html
   (select New York, NY HUD Metro FMR Area). Also cited in
   src/content/guides/nyc-ami-housing-connect-explained.md.
   ============================================================
   Shared by the client-side affordable-housing calculator
   (src/scripts/affordable.ts), the Reality Check, and the build-time
   pages, so every page uses the same HUD figures. Its source and update
   date are listed on /methodology/sources/ (src/data/sourceTables.ts).
   ============================================================ */
export const AMI_BASE: Record<number, number> = {
  1: 97000,
  2: 110850,
  3: 124700,
  4: 138550,
  5: 149650,
  6: 160700,
  7: 171800,
  8: 182900,
};

export const AMI_SOURCE_URL = 'https://www.huduser.gov/portal/datasets/il.html';

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
