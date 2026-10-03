import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { uniqueFigureCount, figureKey, QUALITY_GATE_MIN, type MarketFigure } from '../src/lib/marketFigures.ts';

// Phase 3 quality gate and citation rules for neighborhood pages. A page
// ships only if it has at least two figures (cited, or calculated from a
// cited one) that no sibling page also shows, and every cited figure must
// name a stable, dated source that the page's Sources list includes.

interface Hood { slug: string; draft: boolean; borough: string; figures: MarketFigure[]; sources: { label: string; url: string }[] }

const dir = fileURLToPath(new URL('../src/content/neighborhoods/', import.meta.url));
const hoods: Hood[] = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
  const fm = yaml.load(readFileSync(dir + f, 'utf8').split(/^---\s*$/m)[1]) as Record<string, unknown>;
  return { slug: f.replace(/\.md$/, ''), draft: fm.draft === true, borough: fm.borough as string, figures: fm.figures as MarketFigure[], sources: fm.sources as Hood['sources'] };
});
const published = hoods.filter((h) => !h.draft);

test('found the neighborhood pages', () => {
  assert.ok(published.length >= 5);
});

for (const h of published) {
  test(`${h.slug}: passes the quality gate (>= ${QUALITY_GATE_MIN} figures no sibling shows)`, () => {
    const siblings = published.filter((o) => o.slug !== h.slug).map((o) => o.figures);
    const { total, cited } = uniqueFigureCount(h.figures, siblings);
    assert.ok(total >= QUALITY_GATE_MIN, `${h.slug} has ${total} unique figures (${cited} cited)`);
  });

  test(`${h.slug}: every figure cites a source listed on the page, with a period`, () => {
    const urls = new Set(h.sources.map((s) => s.url));
    for (const f of h.figures) {
      assert.ok(urls.has(f.sourceUrl), `${f.sourceUrl} is not in ${h.slug}'s sources`);
      assert.match(f.period, /\b20\d\d\b/, `${h.slug}: period "${f.period}" has no year`);
      assert.ok(f.label.trim() && f.source.trim());
    }
  });

  test(`${h.slug}: a wider-area figure says which area it covers`, () => {
    for (const f of h.figures) if (f.geo.kind !== 'neighborhood') assert.ok(f.geo.name.trim(), `${h.slug}: unnamed ${f.geo.kind}`);
  });
}

test('the gate counts a figure shared by two pages for neither', () => {
  const shared = { metric: 'median-rent', value: 3_754, unitScope: 'all', propertyScope: 'all', geo: { kind: 'broker-zone', name: 'Zone' }, period: 'January 2026', label: 'x', source: 's', sourceUrl: 'https://example.com/a' } as MarketFigure;
  const own = { ...shared, metric: 'median-sale-price', value: 700_000, geo: { kind: 'neighborhood', name: 'A' } } as MarketFigure;
  assert.deepEqual(uniqueFigureCount([shared, own], [[shared]]), { cited: 1, computed: 2, total: 3 });
  assert.deepEqual(uniqueFigureCount([shared], [[shared]]), { cited: 0, computed: 0, total: 0 });
  assert.notEqual(figureKey(shared), figureKey({ ...shared, period: 'February 2026' }));
});
