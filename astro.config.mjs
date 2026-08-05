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
  '/guides/':     { changefreq: 'weekly',  priority: 0.8, lastmod: '2026-08-04' },
  '/about/':      { changefreq: 'yearly',  priority: 0.5, lastmod: '2026-08-02' },
  '/privacy/':    { changefreq: 'yearly',  priority: 0.4, lastmod: '2026-08-02' },
};
const DEFAULT_PAGE_META = { changefreq: 'monthly', priority: 0.7 };

// @astrojs/sitemap's filter only gets the final URL, not frontmatter, so draft
// guides (which render noindex but still get built as real pages) need to be
// excluded by slug here. Read directly off the content files rather than via
// `astro:content`, which isn't available this early in config loading.
const guidesDir = fileURLToPath(new URL('./src/content/guides/', import.meta.url));
const draftGuideSlugs = new Set(
  readdirSync(guidesDir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /^draft:\s*true\s*$/m.test(readFileSync(guidesDir + f, 'utf-8')))
    .map((f) => f.replace(/\.md$/, ''))
);

export default defineConfig({
  site: 'https://www.nyc-affordability.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      filter: (url) => {
        const pathname = new URL(url).pathname;
        const slug = pathname.match(/^\/guides\/([^/]+)\/$/)?.[1];
        return slug === undefined || !draftGuideSlugs.has(slug);
      },
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const meta = SITEMAP_PAGE_META[pathname] ?? DEFAULT_PAGE_META;
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
