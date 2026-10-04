/* ============================================================
   What New Yorkers earn and pay: Census ACS, 2024 1-year
   ============================================================
   Survey estimates of residents, not market data: what households
   actually earn and actually pay in rent (every lease, including
   rent-stabilized ones, renewals, and long tenancies), not what a new
   lease asks. That gap is the point: the cited market rents on this site
   are what you'd sign today; these are what neighbors pay on average.

   Source: U.S. Census Bureau, American Community Survey 2024 1-year
   estimates, table-based summary files. Values are copied verbatim from
   the files (test/fixtures/acs-2024-nyc.txt holds the source lines;
   test/censusAcs.test.ts re-parses them and checks every number here).
   Each estimate carries its 90% margin of error (MOE) from the same file.

   Updating: the 2025 1-year files publish in the fall. Download the five
   tables below for the new year, replace the fixture, and the test lists
   every value that changed.
   ============================================================ */

export const ACS_YEAR = 2024;
export const ACS_PERIOD = '2024 (ACS 1-year estimates)';
export const ACS_SOURCE = 'U.S. Census Bureau, American Community Survey 2024 1-Year Estimates';
export const ACS_FILES_URL = 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/1YRData/';

/** The tables used, with the data.census.gov page a reader can open. */
export const ACS_TABLES = {
  B19013: { title: 'Median household income', url: 'https://data.census.gov/table/ACSDT1Y2024.B19013' },
  B25064: { title: 'Median gross rent (rent plus utilities)', url: 'https://data.census.gov/table/ACSDT1Y2024.B25064' },
  B25070: { title: 'Gross rent as a percentage of household income', url: 'https://data.census.gov/table/ACSDT1Y2024.B25070' },
  B25119: { title: 'Median household income by tenure (owner / renter)', url: 'https://data.census.gov/table/ACSDT1Y2024.B25119' },
  B25003: { title: 'Tenure (owner- vs renter-occupied homes)', url: 'https://data.census.gov/table/ACSDT1Y2024.B25003' },
} as const;

export interface Estimate {
  value: number;
  /** 90% margin of error, as published. */
  moe: number;
}

export interface AcsArea {
  geoId: string;
  name: string;
  /** Borough slug, or 'nyc' for the whole city. */
  slug: 'nyc' | 'bronx' | 'brooklyn' | 'manhattan' | 'queens' | 'staten-island';
  medianHouseholdIncome: Estimate;
  /** Median gross rent: contract rent plus utilities, across all renter households. */
  medianGrossRent: Estimate;
  renterMedianIncome: Estimate;
  ownerMedianIncome: Estimate;
  /** B25003 household counts. */
  households: { total: number; owner: number; renter: number };
  /** B25070 renter household counts by gross rent as a share of income. */
  rentShare: { total: number; pct30to35: number; pct35to40: number; pct40to50: number; pct50plus: number; notComputed: number };
}

export const ACS_AREAS: AcsArea[] = [
  {
    geoId: '1600000US3651000', name: 'New York City', slug: 'nyc',
    medianHouseholdIncome: { value: 81228, moe: 908 },
    medianGrossRent: { value: 1811, moe: 12 },
    renterMedianIncome: { value: 64866, moe: 1685 },
    ownerMedianIncome: { value: 121443, moe: 2736 },
    households: { total: 3379651, owner: 1104351, renter: 2275300 },
    rentShare: { total: 2275300, pct30to35: 189126, pct35to40: 124482, pct40to50: 178136, pct50plus: 622867, notComputed: 114150 },
  },
  {
    geoId: '0500000US36005', name: 'The Bronx', slug: 'bronx',
    medianHouseholdIncome: { value: 46040, moe: 1815 },
    medianGrossRent: { value: 1456, moe: 28 },
    renterMedianIncome: { value: 38493, moe: 2959 },
    ownerMedianIncome: { value: 98463, moe: 4398 },
    households: { total: 540217, owner: 106264, renter: 433953 },
    rentShare: { total: 433953, pct30to35: 33340, pct35to40: 26545, pct40to50: 38363, pct50plus: 151158, notComputed: 26272 },
  },
  {
    geoId: '0500000US36047', name: 'Brooklyn', slug: 'brooklyn',
    medianHouseholdIncome: { value: 81027, moe: 1355 },
    medianGrossRent: { value: 1837, moe: 22 },
    renterMedianIncome: { value: 67718, moe: 2915 },
    ownerMedianIncome: { value: 126663, moe: 7091 },
    households: { total: 986603, owner: 287231, renter: 699372 },
    rentShare: { total: 699372, pct30to35: 54314, pct35to40: 34929, pct40to50: 50529, pct50plus: 191169, notComputed: 29803 },
  },
  {
    geoId: '0500000US36061', name: 'Manhattan', slug: 'manhattan',
    medianHouseholdIncome: { value: 106403, moe: 5169 },
    medianGrossRent: { value: 2212, moe: 60 },
    renterMedianIncome: { value: 90138, moe: 3864 },
    ownerMedianIncome: { value: 205827, moe: 11055 },
    households: { total: 807083, owner: 206186, renter: 600897 },
    rentShare: { total: 600897, pct30to35: 52477, pct35to40: 29372, pct40to50: 44382, pct50plus: 138275, notComputed: 28561 },
  },
  {
    geoId: '0500000US36081', name: 'Queens', slug: 'queens',
    medianHouseholdIncome: { value: 85273, moe: 1898 },
    medianGrossRent: { value: 1914, moe: 25 },
    renterMedianIncome: { value: 71370, moe: 1712 },
    ownerMedianIncome: { value: 105125, moe: 4725 },
    households: { total: 873479, owner: 388097, renter: 485382 },
    rentShare: { total: 485382, pct30to35: 43335, pct35to40: 29909, pct40to50: 40065, pct50plus: 128653, notComputed: 25535 },
  },
  {
    geoId: '0500000US36085', name: 'Staten Island', slug: 'staten-island',
    medianHouseholdIncome: { value: 97911, moe: 4702 },
    medianGrossRent: { value: 1718, moe: 67 },
    renterMedianIncome: { value: 64678, moe: 13013 },
    ownerMedianIncome: { value: 114386, moe: 6286 },
    households: { total: 172269, owner: 116573, renter: 55696 },
    rentShare: { total: 55696, pct30to35: 5660, pct35to40: 3727, pct40to50: 4797, pct50plus: 13612, notComputed: 3979 },
  },
];

export const acsArea = (slug: AcsArea['slug']) => ACS_AREAS.find((a) => a.slug === slug);

/**
 * Share of renter households paying at least 30% (or 50%) of income in
 * gross rent. HUD calls 30%+ "cost-burdened" and 50%+ "severely". The
 * denominator excludes households the Census couldn't compute a ratio for
 * (no income, or no cash rent), the same way HUD and the Census report it.
 */
export function rentBurden(a: AcsArea): { atLeast30: number; atLeast50: number } {
  const r = a.rentShare;
  const computed = r.total - r.notComputed;
  return {
    atLeast30: (r.pct30to35 + r.pct35to40 + r.pct40to50 + r.pct50plus) / computed,
    atLeast50: r.pct50plus / computed,
  };
}

export const renterShare = (a: AcsArea) => a.households.renter / a.households.total;

/** A margin of error over 10% of the estimate gets flagged on the page. */
export const isWide = (e: Estimate) => e.moe / e.value > 0.1;

/** "about 1.8 times" / "about 62% of" / "about the same as": an income against a median. */
export function relativeTo(amount: number, median: number): string {
  const r = amount / median;
  if (Math.abs(r - 1) < 0.05) return 'about the same as';
  if (r < 1) return `about ${Math.round(r * 100)}% of`;
  return `about ${(Math.round(r * 10) / 10).toFixed(1).replace(/\.0$/, '')} times`;
}
