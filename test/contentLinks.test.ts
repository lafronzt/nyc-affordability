import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_CALCULATORS, CALCULATOR_PATHS } from '../src/lib/footerLinks.ts';

// Cross-links between guides, glossary terms, neighborhoods, and calculators.
// The page templates silently drop a related slug that doesn't resolve, so a
// typo would just make a link disappear; these tests make it fail instead.

type Collection = 'guides' | 'glossary' | 'neighborhoods';

interface Entry { slug: string; draft: boolean; fm: string }

function readCollection(name: Collection): Entry[] {
  const dir = fileURLToPath(new URL(`../src/content/${name}/`, import.meta.url));
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const src = readFileSync(dir + f, 'utf8');
    const fm = src.split(/^---\s*$/m)[1] ?? '';
    return { slug: f.replace(/\.md$/, ''), draft: /^draft:\s*true\s*$/m.test(fm), fm };
  });
}

/** A top-level YAML string list, block style (`key:\n  - a`) or inline (`key: [a, b]`). */
function list(fm: string, key: string): string[] {
  const inline = fm.match(new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const block = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s.*\\n?)+)`, 'm'));
  if (!block) return [];
  return block[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-'))
    .map((l) => l.slice(1).trim().replace(/^["']|["']$/g, ''));
}

const C = {
  guides: readCollection('guides'),
  glossary: readCollection('glossary'),
  neighborhoods: readCollection('neighborhoods'),
};
const published = (c: Collection) => C[c].filter((e) => !e.draft);
const publishedSlugs = (c: Collection) => new Set(published(c).map((e) => e.slug));

test('CALCULATOR_PATHS matches ALL_CALCULATORS', () => {
  assert.deepEqual([...CALCULATOR_PATHS].sort(), ALL_CALCULATORS.map((c) => c.href).sort());
});

for (const coll of ['guides', 'glossary', 'neighborhoods'] as const) {
  test(`${coll}: every relatedGuides / relatedTerms slug is a published entry`, () => {
    for (const e of published(coll)) {
      for (const g of list(e.fm, 'relatedGuides')) assert.ok(publishedSlugs('guides').has(g), `${coll}/${e.slug} → guide "${g}"`);
      for (const t of list(e.fm, 'relatedTerms')) assert.ok(publishedSlugs('glossary').has(t), `${coll}/${e.slug} → term "${t}"`);
    }
  });
}

test('every published guide and glossary term is a related link from at least one other entry', () => {
  const inbound = { guides: new Set<string>(), glossary: new Set<string>() };
  for (const coll of ['guides', 'glossary', 'neighborhoods'] as const) {
    for (const e of published(coll)) {
      list(e.fm, 'relatedGuides').filter((s) => s !== e.slug).forEach((s) => inbound.guides.add(s));
      list(e.fm, 'relatedTerms').filter((s) => s !== e.slug).forEach((s) => inbound.glossary.add(s));
    }
  }
  for (const coll of ['guides', 'glossary'] as const) {
    const orphans = [...publishedSlugs(coll)].filter((s) => !inbound[coll].has(s));
    assert.deepEqual(orphans, [], `${coll} with no inbound related link`);
  }
});

test('every published glossary term names at least one calculator that computes it', () => {
  for (const e of published('glossary')) {
    const calcs = list(e.fm, 'relatedCalculators');
    assert.ok(calcs.length > 0, `glossary/${e.slug} has no relatedCalculators`);
    for (const c of calcs) assert.ok((CALCULATOR_PATHS as readonly string[]).includes(c), `glossary/${e.slug} → "${c}"`);
  }
});

test("every published guide's CTA points at a calculator", () => {
  for (const e of published('guides')) {
    const href = e.fm.match(/^cta:[\s\S]*?^\s+href:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
    assert.ok(href && (CALCULATOR_PATHS as readonly string[]).includes(href), `guides/${e.slug} CTA → ${href}`);
  }
});
