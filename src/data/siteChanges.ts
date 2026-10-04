/* ============================================================
   Public changelog and corrections
   ============================================================
   What changed on the site that could change a number someone relied on,
   newest first. Rendered by /methodology/changelog/ (everything) and
   /methodology/corrections/ (kind 'correction' only).

   This is the reader-facing record. change-log.md in the repo root is
   the detailed engineering log; every "Fix:" entry there must have a
   correction here (test/siteChanges.test.ts checks via `logHeading`).

   Rules:
   - Only what's verifiable from the PR or the engineering log. No
     "improved accuracy" without saying what moved and by how much.
   - Corrections say what was wrong, what's right now, and who saw the
     wrong number. They stay listed after they're fixed.
   - `affects` are site paths (trailing slash) that showed the number.
   ============================================================ */

export type ChangeKind = 'correction' | 'data' | 'method' | 'feature';

export interface SiteChange {
  date: string; // YYYY-MM-DD, the day it merged to main (UTC)
  kind: ChangeKind;
  title: string;
  summary: string;
  affects: string[];
  pr: number | null;
  /** Corrections only: what readers saw, and what's right. */
  wrong?: string;
  right?: string;
  /** The matching heading in change-log.md, when there is one. */
  logHeading?: string;
}

export const SITE_CHANGES: SiteChange[] = [
  {
    date: '2026-10-04',
    kind: 'data',
    title: 'Default renter\'s insurance $15 → $18 a month',
    summary: 'ValuePenguin\'s September 2026 survey puts the average for New York City at $18 a month (for $30,000 of belongings and $100,000 of liability). The old $15 default cited a page that no longer exists. Move-in cash on /rent/ rises by $6 (two months of reserve), and the rent vs buy example shifts by about $500 over 30 years.',
    affects: ['/rent/', '/compare/', '/rent-vs-buy/', '/guides/rent-vs-buy-nyc/'],
    pr: null,
  },
  {
    date: '2026-10-04',
    kind: 'data',
    title: 'Default mortgage rate 6.95% → 7.28%',
    summary: 'Freddie Mac\'s weekly survey put the 30-year fixed at 7.28% as of October 1, 2026. Every calculator and pre-built page now starts from that rate, and guide worked examples were recomputed at it. Higher rates lower what income supports.',
    affects: ['/coop/', '/condo/', '/compare/', '/buy/', '/income/', '/neighborhoods/', '/affordability-index/'],
    pr: 93,
    logHeading: '2026-10-04: Data: default mortgage rate 6.95% → 7.28% (PMMS, week of October 1, 2026)',
  },
  {
    date: '2026-10-04',
    kind: 'method',
    title: 'Scheduled checks for new official data',
    summary: 'Automated checks now watch Freddie Mac\'s rate weekly and HPD\'s AMI chart monthly, and open a proposed update when either changes. A person reviews every update before it reaches the site; nothing changes on its own.',
    affects: ['/data/'],
    pr: 90,
  },
  {
    date: '2026-10-04',
    kind: 'correction',
    title: 'Renters were charged a $500 move-in fee by default',
    summary: 'The rent calculator and cost-to-move tool added a $500 building move-in fee to every lease signing. New York law bars landlords from charging that fee; it\'s a co-op or condo board charge.',
    wrong: 'Lease-signing cash on /rent/, /cost-to-move/, and every /rent/<price>/ page included a $500 "building / move-in admin fee".',
    right: 'The fee defaults to $0 for renters (RPL §238-a(1)(a), added by the HSTPA in 2019), and is only for renting a unit in a co-op or condo building. Lease-signing totals dropped by $500. Co-op and condo buyers still pay their building\'s move-in deposit or fees.',
    affects: ['/rent/', '/cost-to-move/'],
    pr: 88,
    logHeading: '2026-10-03: Move-in fee applies to co-op and condo buildings only',
  },
  {
    date: '2026-10-03',
    kind: 'correction',
    title: 'NY State 6.85% bracket ended too high for single and head-of-household filers',
    summary: 'The Required Salary calculator reused the married-filing-jointly threshold for single and head-of-household filers.',
    wrong: 'NY State\'s 6.85% bracket ran to $2,155,350 for every filing status, so income between about $1.08M and $2.16M (single) was taxed at 6.85% instead of 9.65%.',
    right: 'The bracket ends at $1,077,550 for single filers and $1,616,450 for head of household, per the 2026 IT-2105-I worksheets. Only results above about $1.08M of income changed.',
    affects: ['/required-salary/'],
    pr: 85,
    logHeading: '2026-10-03: Fix: NY State 6.85% bracket threshold for single and head-of-household filers',
  },
  {
    date: '2026-10-03',
    kind: 'correction',
    title: 'AMI figures didn\'t match HPD\'s 2026 chart',
    summary: 'The income limits behind affordable-housing eligibility were labeled as the figures HPD uses, but were about 22% lower than HPD\'s published 2026 chart.',
    wrong: '100% AMI for 3 people was $124,700 (4 people: $138,550), so households were shown at a higher AMI percentage than HPD would assign. A 3-person household earning $150,000 showed 120% AMI.',
    right: 'The table now matches HPD\'s 2026 New York City Area AMI chart: $152,700 for 3 people and $169,600 for 4. That household is at 98% AMI. Bands, eligibility, and max rents per band moved with it.',
    affects: ['/affordable/', '/reality-check/', '/guides/nyc-ami-housing-connect-explained/'],
    pr: 84,
    logHeading: '2026-10-03: Fix: AMI table now matches HPD\'s 2026 chart',
  },
  {
    date: '2026-10-02',
    kind: 'correction',
    title: 'Compare and Reality Check skipped PMI below 20% down',
    summary: 'The comparison dashboard and Reality Check had their own copy of the buying math, which left out private mortgage insurance.',
    wrong: 'Below 20% down, /compare/ and /reality-check/ overstated what you could buy. With the default profile at 10% down: co-op $386,066 and condo $511,957.',
    right: 'Both now run the calculators\' own engine, PMI included: $354,800 and $470,495 for that profile, matching /coop/ and /condo/. At 20% down or more, nothing changed.',
    affects: ['/compare/', '/reality-check/'],
    pr: 62,
  },
  {
    date: '2026-10-02',
    kind: 'correction',
    title: 'Pre-built co-op cash estimates were $1,800 low',
    summary: 'The income and price pages summed three of the co-op calculator\'s five fixed closing fees.',
    wrong: 'Co-op closing costs and cash needed on every /buy/<price>/ and /income/<amount>/ page left out the $1,000 move-in deposit and $800 of other fixed fees. /buy/500000/ showed $154,923 of total cash.',
    right: 'They now include all five fees, matching /coop/: /buy/500000/ shows $156,723. Condo figures were unaffected.',
    affects: ['/buy/', '/income/'],
    pr: 61,
  },
  {
    date: '2026-10-02',
    kind: 'correction',
    title: 'The 0.25% tax on $3M+ sales was called a city tax',
    summary: 'Wording only; the math was right.',
    wrong: '/sell/ and the seller closing-costs guide described the extra 0.25% on NYC residential sales of $3M or more as a city tax.',
    right: 'It\'s a New York State "additional base tax" (NY Tax Law §1402(a)(2)). The amounts didn\'t change.',
    affects: ['/sell/', '/guides/nyc-seller-closing-costs-explained/'],
    pr: 61,
  },
  {
    date: '2026-10-02',
    kind: 'method',
    title: 'One shared engine for every co-op, condo, and rent figure',
    summary: 'The calculators, Compare, Reality Check, and the pre-built income, price, and neighborhood pages now run the same code with the same defaults, so the same inputs give the same answer everywhere. Each default records its source and basis on the sources page.',
    affects: ['/methodology/sources/'],
    pr: 62,
  },
  {
    date: '2026-09-23',
    kind: 'data',
    title: 'Default mortgage rate updated to 6.95%',
    summary: 'The starting mortgage rate on the co-op, condo, and comparison tools moved to 6.95%, and four new guides were added.',
    affects: ['/coop/', '/condo/', '/compare/'],
    pr: 58,
  },
  {
    date: '2026-08-13',
    kind: 'correction',
    title: 'Condo cash estimates left out the mortgage recording tax',
    summary: 'The pre-built price pages computed condo closing costs without New York\'s mortgage recording tax, which the condo calculator already charged.',
    wrong: 'Estimated cash needed on /buy/<price>/ pages was low by about 1.8% to 1.925% of the condo loan amount.',
    right: 'The tax is included, using the same function as /condo/. Co-ops don\'t pay it, so their figures didn\'t change.',
    affects: ['/buy/'],
    pr: 42,
  },
  {
    date: '2026-08-05',
    kind: 'data',
    title: 'AMI figures updated to the 2026 income limits',
    summary: 'Affordable-housing income limits were updated for 2026. (These figures were later found not to match HPD\'s chart; see the October 3 correction.)',
    affects: ['/affordable/'],
    pr: 33,
  },
];

export const CORRECTIONS = SITE_CHANGES.filter((c) => c.kind === 'correction');

export const KIND_LABEL: Record<ChangeKind, string> = {
  correction: 'Correction',
  data: 'Data update',
  method: 'Method',
  feature: 'New',
};

export const prUrl = (n: number) => `https://github.com/lafronzt/nyc-affordability/pull/${n}`;

/** Stable anchor for an entry, from its date and title. */
export const changeId = (c: SiteChange) =>
  `${c.date}-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '')}`;

/** Corrections that changed a figure shown on this path. */
export const correctionsFor = (path: string) => CORRECTIONS.filter((c) => c.affects.includes(path));
