/* ============================================================
   Which pages search engines and ads should see
   ============================================================
   The pre-built number pages (/income/<n>/, /salary/<n>/, /rent/<n>/,
   /buy/<n>/) are ~90 pages from four templates where only the number
   changes. They're useful to a reader who clicks through from a hub or
   a calculator, but at that scale they read as templated filler to
   Google's thin-content and AdSense "low value content" reviews. So
   they stay published (links keep working; test/priceGrids.test.ts
   pins the URLs) but are `noindex, follow`, left out of the sitemap,
   and carry no ads. The hubs that list them stay indexed.

   NO_AD_PAGES are source files under src/pages/ that never opt in to
   ads: those number pages, plus pages with no publisher content of
   their own (contact, legal, the saved-data tool, change lists, the
   site directory). AdSense doesn't allow ads on pages like these.
   test/indexPolicy.test.ts and test/adsReady.test.ts check both lists.
   ============================================================ */

export const NOINDEX_PATH_PATTERNS: readonly RegExp[] = [
  /^\/(income|salary|rent|buy)\/\d+\/$/,
];

export const NOINDEX_ROBOTS = 'noindex, follow';

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PATH_PATTERNS.some((p) => p.test(pathname));
}

export const NO_AD_PAGES: readonly string[] = [
  'income/[amount]/index.astro',
  'salary/[amount]/index.astro',
  'rent/[price]/index.astro',
  'buy/[price]/index.astro',
  'contact/index.astro',
  'privacy/index.astro',
  'terms/index.astro',
  'my-data/index.astro',
  'explore/index.astro',
  'methodology/changelog/index.astro',
  'methodology/corrections/index.astro',
];
