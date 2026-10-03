import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOROUGH_HUBS } from '../src/data/boroughs.ts';
import { uniqueFigureCount, QUALITY_GATE_MIN } from '../src/lib/marketFigures.ts';
import { navHrefs } from '../src/lib/navGroups.ts';

// Borough hubs (/manhattan/, /brooklyn/, /queens/): same honesty rules and
// quality gate as neighborhood pages. A hub is listed only when it has at
// least two figures (cited, or calculated from a cited one) that no other
// hub shows; a missing figure renders as "Not yet tracked".

test('found the hub page template and at least three hubs', () => {
  assert.ok(existsSync(fileURLToPath(new URL('../src/pages/[borough]/index.astro', import.meta.url))));
  assert.ok(BOROUGH_HUBS.length >= 3);
  assert.equal(new Set(BOROUGH_HUBS.map((h) => h.slug)).size, BOROUGH_HUBS.length);
});

for (const hub of BOROUGH_HUBS) {
  test(`${hub.slug}: passes the quality gate`, () => {
    const others = BOROUGH_HUBS.filter((h) => h !== hub).map((h) => h.figures);
    const { total } = uniqueFigureCount(hub.figures, others);
    assert.ok(total >= QUALITY_GATE_MIN, `${hub.slug}: ${total} unique figures`);
  });

  test(`${hub.slug}: every figure is borough-wide, dated, and sourced on the page`, () => {
    const urls = new Set(hub.sources.map((s) => s.url));
    for (const f of hub.figures) {
      assert.equal(f.geo.kind, 'borough', `${hub.slug}: ${f.label} is not a borough-wide figure`);
      assert.equal(f.geo.name, hub.name);
      assert.ok(urls.has(f.sourceUrl), `${f.sourceUrl} not in ${hub.slug} sources`);
      assert.match(f.period, /\b20\d\d\b/);
      assert.match(f.sourceUrl, /^https:\/\//);
    }
    assert.ok(hub.notes.length > 0, `${hub.slug} needs notes explaining what its figures cover`);
  });

  test(`${hub.slug}: reachable from the primary nav`, () => {
    assert.ok(navHrefs().includes(`/${hub.slug}/`));
  });
}
