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
  '/about/':      { changefreq: 'yearly',  priority: 0.5, lastmod: '2026-08-02' },
  '/privacy/':    { changefreq: 'yearly',  priority: 0.4, lastmod: '2026-08-02' },
};
const DEFAULT_PAGE_META = { changefreq: 'monthly', priority: 0.7 };

export default defineConfig({
  site: 'https://www.nyc-affordability.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const meta = SITEMAP_PAGE_META[pathname] ?? DEFAULT_PAGE_META;
        return { ...item, ...meta };
      },
    }),
  ],
});
