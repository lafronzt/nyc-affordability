import type { MarketFigure } from '../lib/marketFigures.ts';

/* ============================================================
   Borough hub pages (/manhattan/, /brooklyn/, /queens/)
   ============================================================
   Borough-wide cited figures, same MarketFigure shape as the
   neighborhood collection. A hub ships only when it passes the Phase 3
   quality gate against the other hubs (test/boroughHubs.test.ts), so the
   Bronx and Staten Island have no hub until a stable, dated source
   publishes borough-wide figures for them. A missing rent or sale figure
   renders as "Not yet tracked", never a stand-in from a smaller area.

   Every figure here was checked against the cited PDF (2026-10-03).
   ============================================================ */

export type BoroughSlug = 'manhattan' | 'brooklyn' | 'queens' | 'bronx' | 'staten-island';

export const BOROUGH_LABELS: Record<BoroughSlug, string> = {
  manhattan: 'Manhattan',
  brooklyn: 'Brooklyn',
  queens: 'Queens',
  bronx: 'The Bronx',
  'staten-island': 'Staten Island',
};

export interface BoroughHub {
  slug: BoroughSlug;
  name: string;
  intro: string;
  metaDescription: string;
  /** Page content last checked. */
  updated: string;
  figures: MarketFigure[];
  /** Plain-language notes on what the figures cover, shown under the stat cards. */
  notes: string[];
  sources: { label: string; url: string }[];
}

const ELLIMAN_RENTALS_JAN_2026 = {
  label: 'Elliman Report: Manhattan, Brooklyn & Queens Rentals, January 2026 (Miller Samuel)',
  url: 'https://millersamuel.com/wp-content/uploads/2026/02/Rental-01_2026.pdf',
};
const BHS_MANHATTAN_2Q_2026 = {
  label: 'Brown Harris Stevens: Manhattan Apartment Market Report, Q2 2026',
  url: 'https://bhs-content.ion3.io/2026/07/Manhattan_2Q26_MR.pdf',
};
const CORCORAN_BK_RENTALS_AUG_2026 = {
  label: 'Corcoran: Brooklyn Rental Market Report, August 2026',
  url: 'https://inhabit.corcoran.com/wp-content/uploads/2026/09/corcoran-final-august-2026-brooklyn-rental-market-report.pdf',
};
const CORCORAN_BK_SALES_2Q_2026 = {
  label: 'Corcoran: Brooklyn Market Report, 2Q 2026',
  url: 'https://inhabit.corcoran.com/wp-content/uploads/2026/09/Brooklyn_2Q2026.pdf',
};
const ELLIMAN_QUEENS_SALES_4Q_2025 = {
  label: 'Elliman Report: Queens Sales, Q4 2025 (Miller Samuel)',
  url: 'https://millersamuel.com/wp-content/uploads/2026/01/Queens-Q4_2025.pdf',
};

const fig = (f: Omit<MarketFigure, 'source' | 'sourceUrl'>, src: { label: string; url: string }): MarketFigure =>
  ({ ...f, source: src.label, sourceUrl: src.url });

export const BOROUGH_HUBS: BoroughHub[] = [
  {
    slug: 'manhattan',
    name: 'Manhattan',
    intro: 'The densest and most expensive borough, from the Financial District to Inwood: mostly co-ops and condos, with the city\'s largest share of doorman and new-development buildings.',
    metaDescription: 'Manhattan median rent and median apartment price, the income it takes to afford each, and Manhattan neighborhood pages, from cited, dated market reports.',
    updated: '2026-10-03',
    figures: [
      fig({
        metric: 'median-rent', value: 4695, unitScope: 'all', propertyScope: 'all',
        geo: { kind: 'borough', name: 'Manhattan' }, period: 'January 2026',
        label: 'Median rent on new leases, all unit sizes',
      }, ELLIMAN_RENTALS_JAN_2026),
      fig({
        metric: 'median-sale-price', value: 1290000, unitScope: 'all', propertyScope: 'coop+condo',
        geo: { kind: 'borough', name: 'Manhattan' }, period: 'Q2 2026',
        label: 'Median apartment sale price, co-ops and condos (resale and new development)',
      }, BHS_MANHATTAN_2Q_2026),
    ],
    notes: [
      'The rent is Elliman\'s median rental price for new leases signed in January 2026, excluding renewals. Doorman buildings ran higher ($5,433) and non-doorman lower ($3,850) in the same report.',
      'The sale price is Brown Harris Stevens\' median for all Manhattan apartments sold in the second quarter of 2026, resale and new development together. BHS calls it the second-highest median on record.',
    ],
    sources: [ELLIMAN_RENTALS_JAN_2026, BHS_MANHATTAN_2Q_2026],
  },
  {
    slug: 'brooklyn',
    name: 'Brooklyn',
    intro: 'The most populous borough, from waterfront towers in Williamsburg and Dumbo to brownstone Park Slope and Bed-Stuy and the rowhouse blocks of south Brooklyn.',
    metaDescription: 'Brooklyn median rent and median co-op/condo price, the income it takes to afford each, and Brooklyn neighborhood pages, from cited, dated market reports.',
    updated: '2026-10-03',
    figures: [
      fig({
        metric: 'median-rent', value: 4368, unitScope: 'all', propertyScope: 'all',
        geo: { kind: 'borough', name: 'Brooklyn' }, period: 'August 2026',
        label: 'Median rent on leases signed, all unit sizes',
      }, CORCORAN_BK_RENTALS_AUG_2026),
      fig({
        metric: 'median-sale-price', value: 895000, unitScope: 'all', propertyScope: 'coop+condo',
        geo: { kind: 'borough', name: 'Brooklyn' }, period: '2Q 2026',
        label: 'Median sale price, co-ops and condos incl. new development (reported as $895K)',
      }, CORCORAN_BK_SALES_2Q_2026),
    ],
    notes: [
      'The rent is Corcoran\'s August 2026 median for leases reported signed in Brooklyn, a record for the borough per the report. Corcoran bases it on last asking prices, and notes it may include furnished or short-term rentals.',
      'The sale price is Corcoran\'s second-quarter 2026 median across Brooklyn co-ops and condos, resale and new development. It doesn\'t include 1-3 family townhouses, a big part of Brooklyn\'s housing.',
    ],
    sources: [CORCORAN_BK_RENTALS_AUG_2026, CORCORAN_BK_SALES_2Q_2026],
  },
  {
    slug: 'queens',
    name: 'Queens',
    intro: 'The largest borough by area, from Long Island City\'s towers and Astoria\'s walk-ups to the co-op corridors of Forest Hills, Jackson Heights, and Bayside.',
    metaDescription: 'Queens median sale price, the income it takes to afford it, and Queens neighborhood pages, from a cited, dated market report.',
    updated: '2026-10-03',
    figures: [
      fig({
        metric: 'median-sale-price', value: 739053, unitScope: 'all', propertyScope: 'all',
        geo: { kind: 'borough', name: 'Queens' }, period: 'Q4 2025',
        label: 'Median sale price, co-ops, condos, and 1-3 family homes',
      }, ELLIMAN_QUEENS_SALES_4Q_2025),
      fig({
        metric: 'median-sale-price', value: 339750, unitScope: 'all', propertyScope: 'coop',
        geo: { kind: 'borough', name: 'Queens' }, period: 'Q4 2025',
        label: 'Median sale price, co-ops',
      }, ELLIMAN_QUEENS_SALES_4Q_2025),
      fig({
        metric: 'median-sale-price', value: 680000, unitScope: 'all', propertyScope: 'condo',
        geo: { kind: 'borough', name: 'Queens' }, period: 'Q4 2025',
        label: 'Median sale price, condos',
      }, ELLIMAN_QUEENS_SALES_4Q_2025),
    ],
    notes: [
      'We haven\'t found a borough-wide Queens rent figure from a stable, dated report. Elliman\'s monthly rental report covers only Northwest Queens (Long Island City, Astoria, Sunnyside, and Woodside); see the Astoria and Long Island City pages for that figure.',
      'The first sale price is Elliman\'s fourth-quarter 2025 median across all Queens co-ops, condos, and 1-3 family homes. The mix matters: in the same report the co-op median was $339,750, the condo median $680,000, and the 1-3 family median $910,000, so the blended figure describes none of them. The co-op and condo income rows below use their own medians.',
    ],
    sources: [ELLIMAN_QUEENS_SALES_4Q_2025],
  },
];
