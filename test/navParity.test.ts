import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CALCULATORS, EXPLORE_LINKS, METHODOLOGY_LINK } from '../src/lib/footerLinks.ts';
import { NAV, navHrefs } from '../src/lib/navGroups.ts';

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

test('primary nav reaches every calculator', () => {
  const hrefs = navHrefs();
  for (const c of ALL_CALCULATORS) assert.ok(hrefs.includes(c.href!), `primary nav is missing ${c.href}`);
});

test('primary nav reaches the guides, glossary, methodology, and site directory', () => {
  const hrefs = navHrefs();
  for (const h of ['/guides/', '/glossary/', METHODOLOGY_LINK.href!, '/explore/']) assert.ok(hrefs.includes(h), `primary nav is missing ${h}`);
});

test('every nav group has an id, an intro, and at least one link; links are internal with trailing slashes', () => {
  const ids = new Set<string>();
  for (const e of NAV) {
    const links = e.kind === 'link' ? [e] : [...e.tools, ...e.reading];
    if (e.kind === 'group') {
      assert.ok(e.id && !ids.has(e.id), `duplicate or empty group id ${e.id}`);
      ids.add(e.id);
      assert.ok(e.intro && links.length, `group ${e.id} is empty`);
    }
    for (const l of links) assert.match(l.href, /^\/([a-z0-9-]+\/)*$/, l.href);
  }
});

test('NavLinks renders from navGroups', () => {
  const nav = readFileSync(fileURLToPath(new URL('../src/components/NavLinks.astro', import.meta.url)), 'utf8');
  assert.match(nav, /import \{ NAV[^}]*\} from '\.\.\/lib\/navGroups'/);
});

test('each page appears in only one nav group, so one group is marked current', () => {
  const seen = new Map<string, string>();
  for (const e of NAV) {
    if (e.kind !== 'group') continue;
    for (const l of [...e.tools, ...e.reading]) {
      assert.ok(!seen.has(l.href), `${l.href} is in both ${seen.get(l.href)} and ${e.id}`);
      seen.set(l.href, e.id);
    }
  }
});
