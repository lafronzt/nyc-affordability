import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Per-page metadata for the generated sitemap (matches the hand-maintained
// sitemap.xml this replaces). Keyed by pathname; falls back to sane defaults
// for any page added without an entry here.
const SITEMAP_PAGE_META = {
  '/':            { changefreq: 'monthly', priority: 1.0, lastmod: '2026-05-02' },
  '/coop/':       { changefreq: 'monthly', priority: 0.9, lastmod: '2026-05-19' },
  '/condo/':      { changefreq: 'monthly', priority: 0.9, lastmod: '2026-05-19' },
  '/rent/':       { changefreq: 'monthly', priority: 0.9, lastmod: '2026-05-03' },
  '/affordable/': { changefreq: 'monthly', priority: 0.9, lastmod: '2026-05-02' },
  '/compare/':    { changefreq: 'monthly', priority: 0.8, lastmod: '2026-05-03' },
  '/reality-check/': { changefreq: 'monthly', priority: 0.8, lastmod: '2026-08-13' },
  '/sell/':       { changefreq: 'monthly', priority: 0.9, lastmod: '2026-08-11' },
  '/required-salary/': { changefreq: 'monthly', priority: 0.8, lastmod: '2026-09-17' },
  '/afford-more/': { changefreq: 'monthly', priority: 0.8, lastmod: '2026-10-02' },
  '/guides/':     { changefreq: 'weekly',  priority: 0.8, lastmod: '2026-08-04' },
  '/glossary/':   { changefreq: 'weekly',  priority: 0.7, lastmod: '2026-08-12' },
  '/income/':     { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-12' },
  '/salary/':     { changefreq: 'monthly', priority: 0.7, lastmod: '2026-09-17' },
  '/buy/':        { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-12' },
  '/rent/prices/': { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-14' },
  '/neighborhoods/':      { changefreq: 'weekly',  priority: 0.7, lastmod: '2026-08-13' },
  '/affordability-index/': { changefreq: 'weekly', priority: 0.6, lastmod: '2026-08-13' },
  // No hand-set lastmod: it's derived from the newest content entry (see serialize()).
  '/explore/':   { changefreq: 'weekly',  priority: 0.5 },
  '/methodology/':         { changefreq: 'monthly', priority: 0.5, lastmod: '2026-10-02' },
  '/methodology/sources/': { changefreq: 'monthly', priority: 0.5, lastmod: '2026-10-02' },
  '/about/':      { changefreq: 'yearly',  priority: 0.5, lastmod: '2026-08-02' },
  '/contact/':    { changefreq: 'yearly',  priority: 0.4, lastmod: '2026-08-11' },
  '/privacy/':    { changefreq: 'yearly',  priority: 0.4, lastmod: '2026-08-02' },
  '/terms/':      { changefreq: 'yearly',  priority: 0.4, lastmod: '2026-08-11' },
};
const DEFAULT_PAGE_META = { changefreq: 'monthly', priority: 0.7 };
// Enumerated-parameter routes (income/[amount]/, buy/[price]/) get a shared
// meta block by pattern rather than a hand-listed entry per generated value,
// since that list grows every time an amount/price is added.
const ENUMERATED_ROUTE_META = [
  { pattern: /^\/income\/\d+\/$/, meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/salary\/\d+\/$/, meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/buy\/\d+\/$/,    meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/rent\/\d+\/$/,   meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/glossary\/[^/]+\/$/, meta: { changefreq: 'yearly', priority: 0.5 } },
  { pattern: /^\/neighborhoods\/[^/]+\/$/, meta: { changefreq: 'weekly', priority: 0.6 } },
];

// @astrojs/sitemap's filter/serialize only get the final URL, not frontmatter,
// so the content collections' frontmatter is read directly off disk here
// (`astro:content` isn't available this early in config loading). Two things
// come out of it:
//   - draft slugs, which render noindex but still get built as real pages and
//     need to be excluded from the sitemap;
//   - each published entry's own `updated` date, used as its <lastmod> so the
//     sitemap reports when the content actually changed instead of omitting
//     it (or inventing one).
function readCollection(dir) {
  let files;
  try {
    files = readdirSync(dir);
  } catch (e) {
    return { drafts: new Set(), updated: new Map() }; // collection directory doesn't exist yet
  }
  const drafts = new Set();
  const updated = new Map();
  for (const f of files.filter((f) => f.endsWith('.md'))) {
    const slug = f.replace(/\.md$/, '');
    const src = readFileSync(dir + f, 'utf-8');
    if (/^draft:\s*true\s*$/m.test(src)) {
      drafts.add(slug);
      continue;
    }
    const date = src.match(/^updated:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m)?.[1];
    if (date) updated.set(slug, date);
  }
  return { drafts, updated };
}
const COLLECTIONS = Object.fromEntries(
  ['guides', 'glossary', 'neighborhoods'].map((name) => [
    name,
    readCollection(fileURLToPath(new URL(`./src/content/${name}/`, import.meta.url))),
  ])
);
// A collection hub (/guides/ etc.) lists its entries, so it changes whenever
// one is added or edited: its lastmod is the newest entry date, or the
// hand-set SITEMAP_PAGE_META date if that's later.
function latest(...dates) {
  return dates.filter(Boolean).sort().at(-1);
}

export default defineConfig({
  site: 'https://www.nyc-affordability.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      filter: (url) => {
        const match = new URL(url).pathname.match(/^\/(guides|glossary|neighborhoods)\/([^/]+)\/$/);
        return !match || !COLLECTIONS[match[1]].drafts.has(match[2]);
      },
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const enumerated = ENUMERATED_ROUTE_META.find((r) => r.pattern.test(pathname));
        const meta = { ...(SITEMAP_PAGE_META[pathname] ?? enumerated?.meta ?? DEFAULT_PAGE_META) };
        const entry = pathname.match(/^\/(guides|glossary|neighborhoods)\/([^/]+)\/$/);
        const hub = pathname.match(/^\/(guides|glossary|neighborhoods)\/$/);
        if (entry) {
          const date = COLLECTIONS[entry[1]].updated.get(entry[2]);
          if (date) meta.lastmod = date;
        } else if (hub) {
          meta.lastmod = latest(meta.lastmod, ...COLLECTIONS[hub[1]].updated.values());
        } else if (pathname === '/explore/') {
          // The site directory lists every collection entry, so it changes when any of them does.
          meta.lastmod = latest(...Object.values(COLLECTIONS).flatMap((c) => [...c.updated.values()]));
        }
        return { ...item, ...meta };
      },
    }),
  ],
  vite: {
    resolve: {
      // Vite 8's native tsconfig-paths resolver can't follow "extends" specifiers
      // that resolve through a package's `exports` map (e.g. astro/tsconfigs/base),
      // which breaks `astro sync`. Disabling it is a no-op here since this project's
      // tsconfig doesn't use path aliases. Remove once upstream fixes this.
      tsconfigPaths: false,
    },
    build: {
      rollupOptions: {
        // Same underlying bug, hit a second time by Rolldown's own tsconfig
        // auto-detection during the production bundle step. Remove once upstream fixes this.
        tsconfig: false,
      },
    },
  },
});
