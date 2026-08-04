// @astrojs/sitemap always writes sitemap-index.xml + sitemap-0.xml (it has no
// option to output a bare sitemap.xml). This site has one chunk, so after
// build we collapse that single chunk down to the plain /sitemap.xml URL
// that robots.txt and the previously-submitted Search Console sitemap use.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const chunkPath = `${distDir}sitemap-0.xml`;
const indexPath = `${distDir}sitemap-index.xml`;
const secondChunkPath = `${distDir}sitemap-1.xml`;
const outPath = `${distDir}sitemap.xml`;

if (existsSync(secondChunkPath)) {
  throw new Error(
    'sitemap has more than one chunk (sitemap-1.xml exists) — ' +
    'scripts/rename-sitemap.mjs only collapses a single chunk to sitemap.xml. ' +
    'Update this script (or the entryLimit in astro.config.mjs) before shipping.'
  );
}

const xml = await readFile(chunkPath, 'utf8');
await writeFile(outPath, xml);
await rm(chunkPath);
await rm(indexPath);
