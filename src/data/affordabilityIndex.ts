/* ============================================================
   NYC Affordability Index — versioned monthly snapshots.
   ============================================================
   HONEST SCOPING NOTE (read before adding a snapshot): this is a static
   site with no backend, no database, and no scheduled job — "monthly
   updated" cannot be an automatic feature here. Each entry below is added
   by a human (or a scheduled agent session) editing this file and
   redeploying. There is no mechanism enforcing a monthly cadence; the
   page must not claim more freshness than what's actually in this array.

   FIELD SCOPING: `medianCoopPrice` and `medianRent` are independently
   sourced and are NOT guaranteed to be from the same month — each entry
   carries its own per-field source and as-of date rather than pretending
   a single unified "snapshot moment," because in practice the best
   verifiable source for each metric updates on its own schedule. See each
   field's own `asOf`/`source`/`url`.

   `medianCondoPrice` is intentionally omitted from the first entry — a
   stable, directly-verifiable CITYWIDE (not Manhattan-only) condo median
   from a dated source could not be confirmed at the time this was built
   (StreetEasy blocks automated fetches; a candidate Baruch/Zicklin PDF
   source had an unrelated TLS certificate issue). Add it once a real
   source is confirmed — do not fill in a placeholder or estimated figure.
   ============================================================ */

export interface IndexMetric {
  value: number;
  asOf: string; // e.g. "2026-03" or "2025 Q1"
  source: string;
  url: string;
}

export interface IndexSnapshot {
  /** The month this entry was published to the site (YYYY-MM) — distinct from each metric's own `asOf`. */
  publishedMonth: string;
  medianRent: IndexMetric; // citywide
  medianCoopPrice: IndexMetric; // citywide
  medianCondoPrice: IndexMetric | null; // not yet tracked — see file header
}

export const AFFORDABILITY_INDEX: IndexSnapshot[] = [
  {
    publishedMonth: '2026-08',
    medianRent: {
      value: 3995,
      asOf: 'March 2026',
      source: 'StreetEasy Market Reports',
      url: 'https://streeteasy.com/research/market-reports',
    },
    medianCoopPrice: {
      // The source table states $505,917 exactly — used verbatim rather than the
      // ~$506K rounding used elsewhere on the site (src/pages/coop/index.astro),
      // since this page's whole premise is showing the real number, not a tidy one.
      value: 505917,
      asOf: 'Q1 2025',
      source: 'StreetEasy / Baruch College (Zicklin School) NYC Housing Market Trends',
      url: 'https://zicklin.baruch.cuny.edu/wp-content/uploads/sites/10/2025/06/NYC-Housing-Market-Trends_2025Q1.pdf',
    },
    medianCondoPrice: null,
  },
];
