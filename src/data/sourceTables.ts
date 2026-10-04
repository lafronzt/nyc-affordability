/* ============================================================
   Rate tables and rules that live in code (not single defaults)
   ============================================================
   src/data/assumptions.ts covers the editable defaults. This file
   describes the larger tables the engines apply — tax brackets, tax
   tiers, income limits — so /methodology/sources/ can list where each
   one comes from and when it was last checked. The numbers themselves
   stay in the module named by `codePath` and are covered by tests.

   Same honesty rules as assumptions.ts: `lastVerified` is only set
   where a check date is actually recorded (a code comment or the
   commit that updated the table from its source); otherwise null.
   ============================================================ */

import type { AssumptionBasis } from './assumptions.ts';

export interface SourceTable {
  name: string;
  basis: AssumptionBasis;
  /** Which year or edition of the source the table reflects. */
  vintage: string;
  sourceOrg: string;
  sourceUrl: string | null;
  lastVerified: string | null;
  /** Where the numbers live, for anyone checking the code. */
  codePath: string;
  usedBy: string[];
  notes?: string;
}

export const SOURCE_TABLES: SourceTable[] = [
  {
    name: 'Federal income tax brackets, standard deduction, FICA wage base',
    basis: 'law',
    vintage: 'Tax year 2026',
    sourceOrg: 'IRS (Rev. Proc. 2025-32 and 2026 COLA notices)',
    sourceUrl: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
    lastVerified: '2026-09-17',
    codePath: 'src/lib/salaryTaxConstants2026.ts',
    usedBy: ['/required-salary/', '/salary/'],
  },
  {
    name: 'New York State income tax brackets',
    basis: 'law',
    vintage: 'Tax year 2026 (FY2026 budget rate cut)',
    sourceOrg: 'NYS Dept. of Taxation and Finance (NYS-50-T-NYS)',
    sourceUrl: 'https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf',
    lastVerified: '2026-09-23',
    codePath: 'src/lib/salaryTaxConstants2026.ts',
    usedBy: ['/required-salary/', '/salary/'],
  },
  {
    name: 'NYC resident income tax brackets',
    basis: 'law',
    vintage: 'Tax year 2026 (fixed thresholds, unchanged for many years)',
    sourceOrg: 'NYS Dept. of Taxation and Finance (IT-201 instructions)',
    sourceUrl: null,
    lastVerified: '2026-09-17',
    codePath: 'src/lib/salaryTaxConstants2026.ts',
    usedBy: ['/required-salary/', '/salary/'],
  },
  {
    name: 'NYC Area Median Income, 100% AMI by household size (1-8)',
    basis: 'official-data',
    vintage: '2026',
    sourceOrg: 'NYC HPD, 2026 New York City Area AMI chart (HUD-derived)',
    sourceUrl: 'https://www.nyc.gov/site/hpd/services-and-information/area-median-income.page',
    lastVerified: '2026-10-03',
    codePath: 'src/lib/amiTable.ts',
    usedBy: ['/affordable/', '/reality-check/'],
    notes: 'Checked against HPD\'s published 2026 chart on 2026-10-03; the earlier table was about 22% lower than HPD\'s figures.',
  },
  {
    name: 'Mansion tax tiers ($1M to $25M+, whole-price, not marginal)',
    basis: 'law',
    vintage: '1% base tier; NYC supplemental tiers above $2M since July 1, 2019',
    sourceOrg: 'NYS Dept. of Taxation and Finance (TSB-M-19(1)R)',
    sourceUrl: 'https://www.tax.ny.gov/pdf/memos/real_estate/m19-1r.pdf',
    lastVerified: '2026-10-04',
    codePath: 'src/lib/calc.ts (calcMansionTax)',
    usedBy: ['/coop/', '/condo/', '/buy/', '/compare/', '/reality-check/'],
  },
  {
    name: 'Mortgage recording tax (borrower share: 1.80% under a $500K loan, 1.925% at $500K+)',
    basis: 'law',
    vintage: 'Current NYC/NYS rates',
    sourceOrg: 'NYC Dept. of Finance',
    sourceUrl: 'https://www.nyc.gov/site/finance/property/property-recording-property-related-documents.page',
    lastVerified: null,
    codePath: 'src/lib/calc.ts (calcMortgageRecordingTax)',
    usedBy: ['/condo/', '/buy/', '/compare/', '/reality-check/'],
    notes: 'Applies to condos and houses, not co-ops (co-op loans are personal property).',
  },
  {
    name: 'NYC Real Property Transfer Tax (1.00% up to $500K, 1.425% above)',
    basis: 'law',
    vintage: 'Current NYC rates',
    sourceOrg: 'NYC Dept. of Finance',
    sourceUrl: 'https://www.nyc.gov/site/finance/property/property-real-property-transfer-tax-rptt.page',
    lastVerified: null,
    codePath: 'src/lib/calc.ts (calcNycRptt)',
    usedBy: ['/sell/'],
  },
  {
    name: 'NYS transfer tax (0.4%, plus the 0.25% additional base tax on NYC residential sales of $3M+)',
    basis: 'law',
    vintage: 'Additional base tax in effect since July 1, 2019',
    sourceOrg: 'NYS Dept. of Taxation and Finance (TSB-M-19(1)R; Tax Law §1402)',
    sourceUrl: 'https://www.tax.ny.gov/pdf/memos/real_estate/m19-1r.pdf',
    lastVerified: null,
    codePath: 'src/lib/calc.ts (calcNysTransferTax)',
    usedBy: ['/sell/'],
    notes: 'Attribution of the 0.25% as a state tax (not a city tax) was corrected on 2026-10-02.',
  },
  {
    name: 'PMI rate tiers by down payment (0.52% to 1.20% of the loan per year below 20% down)',
    basis: 'market-survey',
    vintage: 'Typical conventional pricing, ~720-740 credit',
    sourceOrg: 'Urban Institute; MGIC and Radian published rate cards',
    sourceUrl: null,
    lastVerified: null,
    codePath: 'src/lib/calc.ts (calcPmiRate)',
    usedBy: ['/coop/', '/condo/', '/compare/', '/reality-check/', '/buy/'],
  },
];
