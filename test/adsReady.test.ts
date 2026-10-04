import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADS_ENABLED } from '../src/lib/adsConfig.ts';

// Ads are off until AdSense approves the site. When they go on, it's one
// flag (src/lib/adsConfig.ts); these checks keep every page ready for it.

const PAGES = fileURLToPath(new URL('../src/pages/', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const astro = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? astro(p) : n.endsWith('.astro') ? [p] : [];
});
const layouts = astro(PAGES).filter((f) => readFileSync(f, 'utf8').includes('<BaseLayout'));

test('found the pages', () => assert.ok(layouts.length >= 30, `only ${layouts.length}`));

for (const f of layouts) {
  const rel = f.slice(PAGES.length);
  test(`${rel}: opts in to ads (BaseLayout \`ads\` prop) and has an ad slot`, () => {
    const src = readFileSync(f, 'utf8');
    const tag = src.slice(src.indexOf('<BaseLayout'), src.indexOf('>', src.indexOf('<BaseLayout')));
    assert.match(tag, /\n\s*ads\s*\n/, `${rel} renders <BaseLayout> without \`ads\``);
    assert.match(src, /<AdSlot\b/, `${rel} has no <AdSlot>`);
  });
}

test('ads.txt lists the AdSense publisher ID the pages use', () => {
  const client = readFileSync(join(ROOT, 'src/lib/adSlots.ts'), 'utf8').match(/ca-pub-(\d+)/)?.[1];
  assert.ok(client, 'no ca-pub ID in src/lib/adSlots.ts');
  assert.match(readFileSync(join(ROOT, 'public/ads.txt'), 'utf8'), new RegExp(`google\\.com, pub-${client}, DIRECT`));
});

test('the flag is a plain boolean (flip it to turn ads on)', () => {
  assert.equal(typeof ADS_ENABLED, 'boolean');
});
