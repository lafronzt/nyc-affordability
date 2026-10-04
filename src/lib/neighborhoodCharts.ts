/* ============================================================
   Chart data for /neighborhoods/: cited rents vs calculated income
   ============================================================
   Pure and DOM-free. Rows use the same figure-selection rule and the same
   engines as the /data/income-needed download (incomeBasis), so the chart,
   the area pages and the download always agree.

   What gets charted, and what doesn't:
   - Cited rents share one axis (all are monthly rents on leases signed),
     but each row says whether it's an average or a median and whether the
     figure covers a wider zone than the neighborhood.
   - Sale prices are NOT charted: sources measure different things (all
     apartments vs one-bedrooms only, one neighborhood vs a submarket), so
     bars side by side would invite a comparison the data can't support.
     They're in the table view with their scope.
   - Income needed is calculated, so it gets a different chart form (dots
     on an income axis) as well as a "Calculated" label.
   ============================================================ */

import type { MarketFigure } from './marketFigures.ts';
import { incomeBasis, type AreaFigures } from './dataExport.ts';
import { requiredIncomeForRent, requiredIncomeForPrice } from './afford.ts';

export interface ChartRow {
  slug: string;
  name: string;
  rent: MarketFigure;
  /** Short qualifier shown with the name: "avg" or "median", plus "zone" when shared. */
  rentQualifier: string;
  coopBasis: MarketFigure;
  condoBasis: MarketFigure;
  income: { rent: number; coop: number; condo: number };
}

const scopeNote = (f: MarketFigure) => [
  f.unitScope !== 'all' ? (f.unitScope === '1br' ? 'one-bedrooms only' : `${f.unitScope} only`) : null,
  f.geo.kind !== 'neighborhood' ? `covers ${f.geo.name}` : null,
].filter(Boolean).join('; ');

export const describeFigure = (f: MarketFigure): string => {
  const what = f.metric === 'average-rent' ? 'Average rent on leases signed'
    : f.metric === 'median-rent' ? 'Median rent on new leases' : 'Median sale price';
  const scope = scopeNote(f);
  return `${what}, ${f.period}${scope ? ` (${scope})` : ''}. ${f.source}.`;
};

export function chartRows(hoods: AreaFigures[]): ChartRow[] {
  const rows: ChartRow[] = [];
  for (const h of hoods) {
    const b = incomeBasis(h.figures);
    if (!b.rent || !b.coop || !b.condo) continue;
    rows.push({
      slug: h.slug,
      name: h.name,
      rent: b.rent,
      rentQualifier: [b.rent.metric === 'average-rent' ? 'avg' : 'median', b.rent.geo.kind !== 'neighborhood' ? 'zone' : null].filter(Boolean).join(' · '),
      coopBasis: b.coop,
      condoBasis: b.condo,
      income: {
        rent: Math.round(requiredIncomeForRent({ targetRent: b.rent.value }).annualIncomeNeeded),
        coop: Math.round(requiredIncomeForPrice({ targetPrice: b.coop.value, propertyType: 'coop' }).annualIncomeNeeded),
        condo: Math.round(requiredIncomeForPrice({ targetPrice: b.condo.value, propertyType: 'condo' }).annualIncomeNeeded),
      },
    });
  }
  // Same row order in both charts: highest cited rent first, then name.
  return rows.sort((a, b) => b.rent.value - a.rent.value || a.name.localeCompare(b.name));
}

/**
 * Clean axis ticks from 0: the 1/2/2.5/5 x 10^n step that covers `max` in
 * 3-6 intervals with the least empty space past the max (ties go to fewer
 * ticks). `count` is the preferred number of intervals.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const mag = 10 ** Math.floor(Math.log10(max / count));
  const candidates = [mag / 10, mag, mag * 10].flatMap((m) => [1, 2, 2.5, 5].map((k) => k * m));
  let best: { step: number; n: number; waste: number } | null = null;
  for (const step of candidates) {
    const n = Math.ceil(max / step - 1e-9);
    if (n < 3 || n > 6) continue;
    const waste = n * step - max;
    if (!best || waste < best.waste - 1e-9 || (Math.abs(waste - best.waste) < 1e-9 && Math.abs(n - count) < Math.abs(best.n - count))) best = { step, n, waste };
  }
  const { step, n } = best ?? { step: max / count, n: count };
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step));
}

/** $950, $4.4K, $250K, $1.3M: for axis ticks and tight labels. */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
  if (a >= 1e6) return `$${trim(n / 1e6)}M`;
  if (a >= 1e4) return `$${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
