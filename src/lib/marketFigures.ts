/* ============================================================
   Cited market figures for neighborhood (and later borough) pages
   ============================================================
   One record per cited number, carrying exactly what it measures, where
   it applies, when, and who published it. Replaces the flat
   medianRent / medianSalePrice fields, which couldn't say that a "rent"
   was a broker zone shared by four neighborhoods, or that a "sale price"
   was resale one-bedrooms only.

   Pure and DOM-free: src/content.config.ts builds its zod schema from the
   enums here, the pages render with the helpers, and
   test/neighborhoodFigures.test.ts enforces the Phase 3 quality gate.
   ============================================================ */

export const METRICS = ['median-asking-rent', 'median-sale-price'] as const;
export const UNIT_SCOPES = ['all', 'studio', '1br', '2br', '3br+'] as const;
export const PROPERTY_SCOPES = ['all', 'coop', 'condo', 'coop+condo'] as const;
export const GEO_KINDS = ['neighborhood', 'broker-zone', 'borough', 'city'] as const;

export type Metric = (typeof METRICS)[number];

export interface MarketFigure {
  metric: Metric;
  value: number;
  unitScope: (typeof UNIT_SCOPES)[number];
  propertyScope: (typeof PROPERTY_SCOPES)[number];
  /** Whether the figure is for this neighborhood alone or a wider area that includes it. */
  geo: { kind: (typeof GEO_KINDS)[number]; name: string; definition?: string };
  /** Human-readable period as the source states it: 'January 2026', 'Q2 2026', '1H 2026'. */
  period: string;
  /** Plain-language description shown on the page. */
  label: string;
  source: string;
  sourceUrl: string;
}

export const firstOf = (figures: MarketFigure[], metric: Metric) => figures.find((f) => f.metric === metric);

/** Identity of a cited number: same metric, value, scope, period, and source = the same figure. */
export const figureKey = (f: MarketFigure) =>
  [f.metric, f.value, f.unitScope, f.propertyScope, f.geo.kind, f.geo.name, f.period, f.sourceUrl].join('|');

/** True when the figure covers only this page's own area (not a zone or borough it shares). */
export const isAreaSpecific = (f: MarketFigure) => f.geo.kind === 'neighborhood';

/**
 * Phase 3 quality gate: a page must have at least `min` figures that no
 * sibling page also shows. A cited figure counts if no sibling has the same
 * figure. Calculated figures count too, but only those derived from a
 * unique cited figure: each unique rent yields one (income to rent there),
 * each unique sale price yields two (income for a co-op and for a condo).
 */
export function uniqueFigureCount(own: MarketFigure[], siblings: MarketFigure[][]): { cited: number; computed: number; total: number } {
  const others = new Set(siblings.flat().map(figureKey));
  const unique = own.filter((f) => !others.has(figureKey(f)));
  const cited = unique.length;
  const computed = unique.reduce((n, f) => n + (f.metric === 'median-asking-rent' ? 1 : 2), 0);
  return { cited, computed, total: cited + computed };
}

export const QUALITY_GATE_MIN = 2;
