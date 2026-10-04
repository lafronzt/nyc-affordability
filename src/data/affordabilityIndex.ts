/* ============================================================
   NYC Affordability Index — versioned monthly snapshots.
   ============================================================
   HONEST SCOPING NOTE (read before adding a snapshot): this is a static
   site with no backend or database. The scheduled workflows in
   .github/workflows/ cover the mortgage rate and HPD's AMI chart only;
   nothing watches these figures, because their sources publish reports
   (and StreetEasy blocks automated requests). Each entry below is added
   by a person editing this file. Nothing enforces a monthly cadence; the
   page must not claim more freshness than what's actually in this array.

   This array IS the index history (append-only, oldest first): the page
   and the /data/affordability-index download both read every entry.
   Cite dated reports (a quarterly PDF, a monthly market report), never a
   live dashboard whose number changes under the same URL.

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
