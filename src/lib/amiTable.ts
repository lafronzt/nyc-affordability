/* ============================================================
   HUD FY2026 Income Limits — New York, NY HUD Metro FMR Area (HMFA).
   Source: U.S. Dept. of Housing and Urban Development, FY2026 Income
   Limits Documentation System — https://www.huduser.gov/portal/datasets/il.html
   (select New York, NY HUD Metro FMR Area). Also cited in
   src/content/guides/nyc-ami-housing-connect-explained.md.
   ============================================================
   This is the one shared data table in the codebase (as opposed to
   formula logic, which is deliberately duplicated per script/page — see
   src/lib/afford.ts's header). It's centralized here because both the
   client-side affordable-housing calculator (src/scripts/affordable.ts)
   and the build-time salary/price pages need the same literal numbers,
   and a data table has no "which version is authoritative" ambiguity
   the way duplicated formula code can.
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
