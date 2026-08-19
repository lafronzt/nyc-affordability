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
  '/guides/':     { changefreq: 'weekly',  priority: 0.8, lastmod: '2026-08-04' },
  '/glossary/':   { changefreq: 'weekly',  priority: 0.7, lastmod: '2026-08-12' },
  '/income/':     { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-12' },
  '/buy/':        { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-12' },
  '/rent/prices/': { changefreq: 'monthly', priority: 0.7, lastmod: '2026-08-14' },
  '/neighborhoods/':      { changefreq: 'weekly',  priority: 0.7, lastmod: '2026-08-13' },
  '/affordability-index/': { changefreq: 'weekly', priority: 0.6, lastmod: '2026-08-13' },
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
  { pattern: /^\/buy\/\d+\/$/,    meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/rent\/\d+\/$/,   meta: { changefreq: 'monthly', priority: 0.6 } },
  { pattern: /^\/glossary\/[^/]+\/$/, meta: { changefreq: 'yearly', priority: 0.5 } },
  { pattern: /^\/neighborhoods\/[^/]+\/$/, meta: { changefreq: 'weekly', priority: 0.6 } },
];

// @astrojs/sitemap's filter only gets the final URL, not frontmatter, so draft
// guides/glossary entries (which render noindex but still get built as real
// pages) need to be excluded by slug here. Read directly off the content
// files rather than via `astro:content`, which isn't available this early in
// config loading.
function draftSlugsIn(dir) {
  let files;
  try {
    files = readdirSync(dir);
  } catch (e) {
    return new Set(); // collection directory doesn't exist yet (e.g. no content added so far)
  }
  return new Set(
    files
      .filter((f) => f.endsWith('.md'))
      .filter((f) => /^draft:\s*true\s*$/m.test(readFileSync(dir + f, 'utf-8')))
      .map((f) => f.replace(/\.md$/, ''))
  );
}
const draftGuideSlugs = draftSlugsIn(fileURLToPath(new URL('./src/content/guides/', import.meta.url)));
const draftGlossarySlugs = draftSlugsIn(fileURLToPath(new URL('./src/content/glossary/', import.meta.url)));
const draftNeighborhoodSlugs = draftSlugsIn(fileURLToPath(new URL('./src/content/neighborhoods/', import.meta.url)));

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
        const pathname = new URL(url).pathname;
        const guideSlug = pathname.match(/^\/guides\/([^/]+)\/$/)?.[1];
        if (guideSlug !== undefined) return !draftGuideSlugs.has(guideSlug);
        const glossarySlug = pathname.match(/^\/glossary\/([^/]+)\/$/)?.[1];
        if (glossarySlug !== undefined) return !draftGlossarySlugs.has(glossarySlug);
        const neighborhoodSlug = pathname.match(/^\/neighborhoods\/([^/]+)\/$/)?.[1];
        if (neighborhoodSlug !== undefined) return !draftNeighborhoodSlugs.has(neighborhoodSlug);
        return true;
      },
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const enumerated = ENUMERATED_ROUTE_META.find((r) => r.pattern.test(pathname));
        const meta = SITEMAP_PAGE_META[pathname] ?? enumerated?.meta ?? DEFAULT_PAGE_META;
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
