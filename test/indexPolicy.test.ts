import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNoindexPath, NO_AD_PAGES } from '../src/lib/indexPolicy.ts';

// AdSense rejected the site for "low value content". These checks keep the
// fixes in place: templated number pages out of the index and sitemap, no
// ads on pages without content of their own, and no draft stubs built.

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGES = join(ROOT, 'src/pages/');
const read = (rel: string) => readFileSync(join(PAGES, rel), 'utf8');
const layoutTag = (src: string) => src.slice(src.indexOf('<BaseLayout'), src.indexOf('>', src.indexOf('<BaseLayout')));

const TEMPLATED = ['income/[amount]/index.astro', 'salary/[amount]/index.astro', 'rent/[price]/index.astro', 'buy/[price]/index.astro'];

test('number pages are noindex, everything else stays indexable', () => {
  for (const p of ['/income/100000/', '/salary/35000/', '/rent/3000/', '/buy/750000/']) assert.ok(isNoindexPath(p), p);
  for (const p of ['/', '/income/', '/salary/', '/rent/', '/rent/prices/', '/buy/', '/guides/nyc-40x-rent-rule/', '/coop/']) {
    assert.ok(!isNoindexPath(p), p);
  }
});

for (const rel of TEMPLATED) {
  test(`${rel}: renders noindex and is on the no-ads list`, () => {
    assert.match(layoutTag(read(rel)), /robots=\{NOINDEX_ROBOTS\}/);
    assert.ok(NO_AD_PAGES.includes(rel));
  });
}

for (const rel of NO_AD_PAGES) {
  test(`${rel}: no ads`, () => {
    const src = read(rel);
    assert.doesNotMatch(layoutTag(src), /\n\s*ads\s*\n/, 'opts in to ads');
    assert.doesNotMatch(src, /<AdSlot\b/, 'renders an <AdSlot>');
  });
}

test('the sitemap filter drops noindex paths', () => {
  const config = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf8');
  assert.match(config, /isNoindexPath\(/);
});

for (const c of ['guides', 'glossary', 'neighborhoods']) {
  test(`${c}/[slug].astro: drafts are not built for production`, () => {
    const src = read(`${c}/[slug].astro`);
    const paths = src.slice(src.indexOf('getStaticPaths'), src.indexOf('}));', src.indexOf('getStaticPaths')));
    assert.match(paths, /import\.meta\.env\.DEV \|\| !data\.draft/);
  });
}

test('no placeholder or scaffold entries in content collections', () => {
  for (const c of ['guides', 'glossary', 'neighborhoods']) {
    const dir = join(ROOT, 'src/content', c);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), /placeholder (guide|intro|body)|scaffold test/i, `${c}/${f}`);
    }
  }
});
