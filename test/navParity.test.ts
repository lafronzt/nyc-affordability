import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CALCULATORS, EXPLORE_LINKS } from '../src/lib/footerLinks.ts';

// Guards against the nav/footer drift fixed in Phase 1c: pages that build
// their own footer columns quietly dropping the Explore links, and new
// calculators not reaching the homepage grid or the primary nav.

const PAGES_DIR = fileURLToPath(new URL('../src/pages/', import.meta.url));

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return astroFiles(path);
    return name.endsWith('.astro') ? [path] : [];
  });
}

const pagesWithFooter = astroFiles(PAGES_DIR).filter((f) => readFileSync(f, 'utf8').includes('<Footer'));

test('found the pages that render a footer', () => {
  assert.ok(pagesWithFooter.length >= 25, `only ${pagesWithFooter.length} found`);
});

for (const file of pagesWithFooter) {
  const rel = file.slice(PAGES_DIR.length);
  test(`${rel}: footer includes the Explore column`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /\{\s*heading:\s*'Explore',\s*links:\s*EXPLORE_LINKS\s*\}/, `${rel} has a <Footer> without the Explore column`);
  });
}

test('Explore links include the site directory', () => {
  assert.ok(EXPLORE_LINKS.some((l) => l.href === '/explore/'));
});

test('homepage calculator grid has a card for every calculator', () => {
  const home = readFileSync(join(PAGES_DIR, 'index.astro'), 'utf8');
  for (const c of ALL_CALCULATORS) {
    assert.match(home, new RegExp(`<a class="calc-card[^"]*" href="${c.href}"`), `no homepage card for ${c.href}`);
  }
});

test('primary nav links every calculator', () => {
  const nav = readFileSync(fileURLToPath(new URL('../src/components/NavLinks.astro', import.meta.url)), 'utf8');
  const navConsts = [...nav.matchAll(/href:\s*(CALC_[A-Z_]+)\.href/g)].map((m) => m[1]);
  const footer = readFileSync(fileURLToPath(new URL('../src/lib/footerLinks.ts', import.meta.url)), 'utf8');
  const all = footer.match(/export const ALL_CALCULATORS[^=]*=\s*\[([^\]]*)\]/)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  assert.equal(all.length, ALL_CALCULATORS.length);
  for (const name of all) assert.ok(navConsts.includes(name), `NavLinks.astro is missing ${name}`);
});
